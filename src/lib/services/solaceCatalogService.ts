/**
 * solaceCatalogService — Thực đơn quán SOLACE: danh mục, món, tuỳ chọn (option) & ảnh món.
 * Tiền (price/extra_price) là BIGINT đồng VND. ID app sinh (prefix).
 */
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { logActivity } from '@/lib/services/auditService';
import { uploadBufferAsMedia, getMediaBuffer, softDeleteMedia } from '@/lib/services/mediaService';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Ghi audit cho thao tác quán SOLACE (không chặn luồng nếu lỗi). */
function audit(action: string, details: string, actor?: string | null): void {
  void logActivity({ action, details, performedBy: actor ?? 'System' }).catch(() => {});
}

// ─── Kiểu dữ liệu ────────────────────────────────────────────────────────────
export interface SolaceCategory {
  id: string; name: string; sort_order: number; is_active: boolean; created_at: string;
}
export interface SolaceProduct {
  id: string; code: string | null; category_id: string | null; name: string;
  description: string | null; price: number; track_recipe: boolean; has_image: boolean;
  is_active: boolean; sort_order: number; sold_count: number;
  category_name?: string | null;
  /** Giá vốn ước tính theo công thức × giá vốn TB × (1+hao) — chỉ ở listProducts. */
  cost?: number;
}
export interface SolaceOptionValue {
  id: string; group_id: string; name: string; extra_price: number; sort_order: number; is_active: boolean;
}
export interface SolaceOptionGroup {
  id: string; name: string; selection_type: 'single' | 'multi'; is_required: boolean;
  sort_order: number; is_active: boolean; values?: SolaceOptionValue[];
}

// ─── DANH MỤC ────────────────────────────────────────────────────────────────
export async function listCategories(includeInactive = false): Promise<SolaceCategory[]> {
  return query<SolaceCategory>(
    `SELECT id, name, sort_order, is_active, created_at
       FROM solace_categories
      ${includeInactive ? '' : 'WHERE is_active = TRUE'}
      ORDER BY sort_order ASC, name ASC`
  );
}

export async function createCategory(name: string, sortOrder = 0, actor?: string | null): Promise<SolaceCategory> {
  const id = genId('scat');
  await execute(
    `INSERT INTO solace_categories (id, name, sort_order) VALUES ($1, $2, $3)`,
    [id, name.trim(), sortOrder]
  );
  audit('solace_category_created', `Tạo danh mục Solace: ${name.trim()}`, actor);
  return (await queryOne<SolaceCategory>(`SELECT id, name, sort_order, is_active, created_at FROM solace_categories WHERE id = $1`, [id]))!;
}

export async function updateCategory(
  id: string, patch: Partial<Pick<SolaceCategory, 'name' | 'sort_order' | 'is_active'>>, actor?: string | null
): Promise<void> {
  await execute(
    `UPDATE solace_categories
        SET name = COALESCE($2, name),
            sort_order = COALESCE($3, sort_order),
            is_active = COALESCE($4, is_active)
      WHERE id = $1`,
    [id, patch.name ?? null, patch.sort_order ?? null, patch.is_active ?? null]
  );
  audit('solace_category_updated', `Sửa danh mục Solace (${id})`, actor);
}

export async function deleteCategory(id: string, actor?: string | null): Promise<void> {
  await execute(`DELETE FROM solace_categories WHERE id = $1`, [id]);
  audit('solace_category_deleted', `Xoá danh mục Solace (${id})`, actor);
}

// ─── MÓN ─────────────────────────────────────────────────────────────────────
export async function listProducts(includeInactive = false): Promise<SolaceProduct[]> {
  return query<SolaceProduct>(
    `SELECT p.id, p.code, p.category_id, p.name, p.description, p.price, p.track_recipe,
            p.has_image, p.is_active, p.sort_order, p.sold_count, c.name AS category_name,
            COALESCE((
              SELECT SUM(r.qty * (1 + r.wastage_pct / 100.0) * i.avg_cost)
                FROM solace_recipe_items r
                JOIN solace_ingredients i ON i.id = r.ingredient_id
               WHERE r.product_id = p.id
            ), 0)::bigint AS cost
       FROM solace_products p
       LEFT JOIN solace_categories c ON c.id = p.category_id
      ${includeInactive ? '' : 'WHERE p.is_active = TRUE'}
      ORDER BY p.sort_order ASC, p.name ASC`
  );
}

export async function getProduct(id: string): Promise<SolaceProduct | null> {
  return queryOne<SolaceProduct>(
    `SELECT p.id, p.code, p.category_id, p.name, p.description, p.price, p.track_recipe,
            p.has_image, p.is_active, p.sort_order, p.sold_count, c.name AS category_name
       FROM solace_products p
       LEFT JOIN solace_categories c ON c.id = p.category_id
      WHERE p.id = $1`,
    [id]
  );
}

export interface ProductInput {
  code?: string | null; category_id?: string | null; name: string; description?: string | null;
  price: number; track_recipe?: boolean; is_active?: boolean; sort_order?: number;
}

export async function createProduct(input: ProductInput, actor?: string | null): Promise<SolaceProduct> {
  const id = genId('sprd');
  await execute(
    `INSERT INTO solace_products (id, code, category_id, name, description, price, track_recipe, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, input.code?.trim() || null, input.category_id ?? null, input.name.trim(),
     input.description ?? null, Math.round(input.price) || 0,
     input.track_recipe ?? true, input.is_active ?? true, input.sort_order ?? 0]
  );
  audit('solace_product_created', `Tạo món: ${input.name.trim()} — giá ${Math.round(input.price) || 0}đ`, actor);
  return (await getProduct(id))!;
}

export async function updateProduct(id: string, input: Partial<ProductInput>, actor?: string | null): Promise<void> {
  // Ghi vết đổi giá (nhạy cảm) — đọc giá cũ trước khi cập nhật.
  if (input.price != null) {
    const before = await queryOne<{ name: string; price: number }>(
      `SELECT name, price FROM solace_products WHERE id = $1`, [id]
    );
    if (before && Math.round(input.price) !== Number(before.price)) {
      audit('solace_product_price_changed',
        `Đổi giá món "${before.name}": ${before.price}đ → ${Math.round(input.price)}đ`, actor);
    }
  }
  await execute(
    `UPDATE solace_products
        SET code = COALESCE($2, code),
            category_id = $3,
            name = COALESCE($4, name),
            description = $5,
            price = COALESCE($6, price),
            track_recipe = COALESCE($7, track_recipe),
            is_active = COALESCE($8, is_active),
            sort_order = COALESCE($9, sort_order),
            updated_at = NOW()
      WHERE id = $1`,
    [id, input.code?.trim() || null, input.category_id ?? null, input.name?.trim() ?? null,
     input.description ?? null, input.price != null ? Math.round(input.price) : null,
     input.track_recipe ?? null, input.is_active ?? null, input.sort_order ?? null]
  );
}

export async function deleteProduct(id: string, actor?: string | null): Promise<void> {
  const before = await queryOne<{ name: string }>(`SELECT name FROM solace_products WHERE id = $1`, [id]);
  await execute(`DELETE FROM solace_products WHERE id = $1`, [id]);
  audit('solace_product_deleted', `Xoá món: ${before?.name ?? id}`, actor);
}

// ─── ẢNH MÓN (MinIO dual-write, fallback BYTEA) ──────────────────────────────
export async function setProductImage(
  productId: string,
  mime: string,
  content: Buffer,
  uploaderId?: string | null
): Promise<void> {
  const media = await uploadBufferAsMedia({
    buffer: content,
    mimeType: mime,
    scope: 'solace_product_images',
    originalName: productId,
    uploaderId: uploaderId ?? null,
    sourceId: productId,
    visibility: 'public',
  });

  if (media) {
    // UPSERT 1-record-1-món: soft-delete media cũ (best-effort) trước khi trỏ media_id mới.
    const old = await queryOne<{ media_id: string | null }>(
      `SELECT media_id FROM solace_product_images WHERE product_id = $1`, [productId]
    );
    if (old?.media_id) await softDeleteMedia(old.media_id).catch(() => {});
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO solace_product_images (product_id, mime_type, content, media_id, updated_at)
         VALUES ($1, $2, NULL, $3, NOW())
         ON CONFLICT (product_id) DO UPDATE SET mime_type = EXCLUDED.mime_type, content = NULL, media_id = EXCLUDED.media_id, updated_at = NOW()`,
        [productId, mime, media.id]
      );
      await client.query(`UPDATE solace_products SET has_image = TRUE, updated_at = NOW() WHERE id = $1`, [productId]);
    });
    return;
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO solace_product_images (product_id, mime_type, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (product_id) DO UPDATE SET mime_type = EXCLUDED.mime_type, content = EXCLUDED.content, updated_at = NOW()`,
      [productId, mime, content]
    );
    await client.query(`UPDATE solace_products SET has_image = TRUE, updated_at = NOW() WHERE id = $1`, [productId]);
  });
}

export async function getProductImage(productId: string): Promise<{ mime_type: string; content: Buffer } | null> {
  const row = await queryOne<{ mime_type: string; content: Buffer | null; media_id: string | null }>(
    `SELECT mime_type, content, media_id FROM solace_product_images WHERE product_id = $1`, [productId]
  );
  if (!row) return null;
  // Dual-read: media_id (MinIO) trước, fallback BYTEA cũ.
  if (row.media_id) {
    const m = await getMediaBuffer(row.media_id);
    if (m) return { mime_type: m.mimeType || row.mime_type, content: m.buffer };
  }
  if (!row.content) return null;
  return { mime_type: row.mime_type, content: row.content };
}

export async function removeProductImage(productId: string): Promise<void> {
  const old = await queryOne<{ media_id: string | null }>(
    `SELECT media_id FROM solace_product_images WHERE product_id = $1`, [productId]
  );
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM solace_product_images WHERE product_id = $1`, [productId]);
    await client.query(`UPDATE solace_products SET has_image = FALSE, updated_at = NOW() WHERE id = $1`, [productId]);
  });
  if (old?.media_id) await softDeleteMedia(old.media_id).catch(() => {});
}

// ─── TUỲ CHỌN (OPTION GROUPS / VALUES) ───────────────────────────────────────
export async function listOptionGroups(includeInactive = false): Promise<SolaceOptionGroup[]> {
  const groups = await query<SolaceOptionGroup>(
    `SELECT id, name, selection_type, is_required, sort_order, is_active
       FROM solace_option_groups
      ${includeInactive ? '' : 'WHERE is_active = TRUE'}
      ORDER BY sort_order ASC, name ASC`
  );
  if (groups.length === 0) return [];
  const values = await query<SolaceOptionValue>(
    `SELECT id, group_id, name, extra_price, sort_order, is_active
       FROM solace_option_values
      WHERE group_id = ANY($1) ${includeInactive ? '' : 'AND is_active = TRUE'}
      ORDER BY sort_order ASC, name ASC`,
    [groups.map(g => g.id)]
  );
  for (const g of groups) g.values = values.filter(v => v.group_id === g.id);
  return groups;
}

export async function createOptionGroup(
  input: { name: string; selection_type?: 'single' | 'multi'; is_required?: boolean; sort_order?: number }
): Promise<SolaceOptionGroup> {
  const id = genId('sopt');
  await execute(
    `INSERT INTO solace_option_groups (id, name, selection_type, is_required, sort_order)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.name.trim(), input.selection_type ?? 'single', input.is_required ?? false, input.sort_order ?? 0]
  );
  return (await queryOne<SolaceOptionGroup>(
    `SELECT id, name, selection_type, is_required, sort_order, is_active FROM solace_option_groups WHERE id = $1`, [id]
  ))!;
}

export async function updateOptionGroup(
  id: string, patch: Partial<{ name: string; selection_type: 'single' | 'multi'; is_required: boolean; sort_order: number; is_active: boolean }>
): Promise<void> {
  await execute(
    `UPDATE solace_option_groups
        SET name = COALESCE($2, name), selection_type = COALESCE($3, selection_type),
            is_required = COALESCE($4, is_required), sort_order = COALESCE($5, sort_order),
            is_active = COALESCE($6, is_active)
      WHERE id = $1`,
    [id, patch.name ?? null, patch.selection_type ?? null, patch.is_required ?? null, patch.sort_order ?? null, patch.is_active ?? null]
  );
}

export async function deleteOptionGroup(id: string): Promise<void> {
  await execute(`DELETE FROM solace_option_groups WHERE id = $1`, [id]);
}

export async function addOptionValue(
  groupId: string, input: { name: string; extra_price?: number; sort_order?: number }
): Promise<SolaceOptionValue> {
  const id = genId('soval');
  await execute(
    `INSERT INTO solace_option_values (id, group_id, name, extra_price, sort_order)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, groupId, input.name.trim(), Math.round(input.extra_price ?? 0), input.sort_order ?? 0]
  );
  return (await queryOne<SolaceOptionValue>(
    `SELECT id, group_id, name, extra_price, sort_order, is_active FROM solace_option_values WHERE id = $1`, [id]
  ))!;
}

export async function updateOptionValue(
  id: string, patch: Partial<{ name: string; extra_price: number; sort_order: number; is_active: boolean }>
): Promise<void> {
  await execute(
    `UPDATE solace_option_values
        SET name = COALESCE($2, name), extra_price = COALESCE($3, extra_price),
            sort_order = COALESCE($4, sort_order), is_active = COALESCE($5, is_active)
      WHERE id = $1`,
    [id, patch.name ?? null, patch.extra_price != null ? Math.round(patch.extra_price) : null, patch.sort_order ?? null, patch.is_active ?? null]
  );
}

export async function deleteOptionValue(id: string): Promise<void> {
  await execute(`DELETE FROM solace_option_values WHERE id = $1`, [id]);
}

// ─── GẮN NHÓM TUỲ CHỌN VÀO MÓN ───────────────────────────────────────────────
export async function getProductOptionGroupIds(productId: string): Promise<string[]> {
  const rows = await query<{ group_id: string }>(
    `SELECT group_id FROM solace_product_options WHERE product_id = $1 ORDER BY sort_order ASC`, [productId]
  );
  return rows.map(r => r.group_id);
}

/** Thực đơn cho POS/khách: danh mục + món đang bán, mỗi món kèm nhóm tuỳ chọn (đang bật) + cờ còn hàng. */
export async function getPosMenu(): Promise<{
  categories: SolaceCategory[];
  products: (SolaceProduct & { optionGroups: SolaceOptionGroup[]; available: boolean })[];
}> {
  const [categories, products, groups, links, depleted] = await Promise.all([
    listCategories(false),
    listProducts(false),
    listOptionGroups(false),
    query<{ product_id: string; group_id: string; sort_order: number }>(
      `SELECT product_id, group_id, sort_order FROM solace_product_options ORDER BY sort_order ASC`),
    // Món có công thức mà 1 nguyên liệu không đủ cho 1 phần → tạm hết.
    query<{ product_id: string }>(
      `SELECT DISTINCT r.product_id
         FROM solace_recipe_items r
         JOIN solace_ingredients i ON i.id = r.ingredient_id
        WHERE i.stock_qty < r.qty * (1 + r.wastage_pct / 100.0)`),
  ]);
  const gMap = new Map(groups.map(g => [g.id, g]));
  const out = new Set(depleted.map(d => d.product_id));
  const withOpts = products.map(p => ({
    ...p,
    optionGroups: links.filter(l => l.product_id === p.id).map(l => gMap.get(l.group_id)).filter(Boolean) as SolaceOptionGroup[],
    available: p.track_recipe ? !out.has(p.id) : true,
  }));
  return { categories, products: withOpts };
}

export async function setProductOptionGroups(productId: string, groupIds: string[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM solace_product_options WHERE product_id = $1`, [productId]);
    for (let i = 0; i < groupIds.length; i++) {
      await client.query(
        `INSERT INTO solace_product_options (product_id, group_id, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (product_id, group_id) DO NOTHING`,
        [productId, groupIds[i], i]
      );
    }
  });
}
