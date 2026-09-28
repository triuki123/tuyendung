/**
 * solaceInventoryService — Kho nguyên liệu, công thức (BOM) & biến động kho.
 * Tồn (stock_qty) NUMERIC; giá vốn (avg_cost/unit_cost) BIGINT đồng VND.
 * Mọi thay đổi tồn đi qua recordMovement (transaction-safe, ghi balance_after).
 */
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { logActivity } from '@/lib/services/auditService';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function audit(action: string, details: string, actor?: string | null): void {
  void logActivity({ action, details, performedBy: actor ?? 'System' }).catch(() => {});
}

export interface SolaceIngredient {
  id: string; code: string | null; name: string; unit: string;
  stock_qty: number; min_qty: number; avg_cost: number; is_active: boolean;
  /** Đơn vị mua (vd "kg"); rỗng = mua theo đơn vị gốc. */
  purchase_unit: string | null;
  /** Số đơn vị gốc trong 1 đơn vị mua (vd 1kg = 1000g → 1000). */
  purchase_factor: number;
}
export interface RecipeItem {
  id: string; product_id: string; ingredient_id: string; qty: number; wastage_pct: number;
  ingredient_name?: string; unit?: string;
}
export interface StockMovement {
  id: string; ingredient_id: string; type: string; qty: number; unit_cost: number;
  balance_after: number; reason: string | null; ref_type: string | null; ref_id: string | null;
  note: string | null; performed_by: string | null; created_at: string;
  ingredient_name?: string;
}

// ─── NGUYÊN LIỆU ─────────────────────────────────────────────────────────────
const ING_COLS = `id, code, name, unit, stock_qty, min_qty, avg_cost, is_active, purchase_unit, purchase_factor`;

export async function listIngredients(includeInactive = false): Promise<SolaceIngredient[]> {
  return query<SolaceIngredient>(
    `SELECT ${ING_COLS}
       FROM solace_ingredients
      ${includeInactive ? '' : 'WHERE is_active = TRUE'}
      ORDER BY name ASC`
  );
}

export async function getIngredient(id: string): Promise<SolaceIngredient | null> {
  return queryOne<SolaceIngredient>(`SELECT ${ING_COLS} FROM solace_ingredients WHERE id = $1`, [id]);
}

export interface IngredientInput {
  code?: string | null; name: string; unit?: string; min_qty?: number; avg_cost?: number;
  is_active?: boolean; purchase_unit?: string | null; purchase_factor?: number;
}

export async function createIngredient(input: IngredientInput, actor?: string | null): Promise<SolaceIngredient> {
  const id = genId('sing');
  await execute(
    `INSERT INTO solace_ingredients (id, code, name, unit, min_qty, avg_cost, is_active, purchase_unit, purchase_factor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, input.code?.trim() || null, input.name.trim(), input.unit?.trim() || 'g',
     input.min_qty ?? 0, Math.round(input.avg_cost ?? 0), input.is_active ?? true,
     input.purchase_unit?.trim() || null, input.purchase_factor && input.purchase_factor > 0 ? input.purchase_factor : 1]
  );
  audit('solace_ingredient_created', `Tạo nguyên liệu: ${input.name.trim()}`, actor);
  return (await getIngredient(id))!;
}

export async function updateIngredient(id: string, input: Partial<IngredientInput>, actor?: string | null): Promise<void> {
  await execute(
    `UPDATE solace_ingredients
        SET code = COALESCE($2, code), name = COALESCE($3, name), unit = COALESCE($4, unit),
            min_qty = COALESCE($5, min_qty), avg_cost = COALESCE($6, avg_cost),
            is_active = COALESCE($7, is_active),
            purchase_unit = $8,
            purchase_factor = COALESCE($9, purchase_factor),
            updated_at = NOW()
      WHERE id = $1`,
    [id, input.code?.trim() || null, input.name?.trim() ?? null, input.unit?.trim() ?? null,
     input.min_qty ?? null, input.avg_cost != null ? Math.round(input.avg_cost) : null, input.is_active ?? null,
     input.purchase_unit?.trim() || null, input.purchase_factor && input.purchase_factor > 0 ? input.purchase_factor : null]
  );
  audit('solace_ingredient_updated', `Sửa nguyên liệu (${id})`, actor);
}

export async function deleteIngredient(id: string, actor?: string | null): Promise<void> {
  const before = await queryOne<{ name: string }>(`SELECT name FROM solace_ingredients WHERE id = $1`, [id]);
  await execute(`DELETE FROM solace_ingredients WHERE id = $1`, [id]);
  audit('solace_ingredient_deleted', `Xoá nguyên liệu: ${before?.name ?? id}`, actor);
}

/** Nguyên liệu tồn dưới ngưỡng cảnh báo. */
export async function listLowStock(): Promise<SolaceIngredient[]> {
  return query<SolaceIngredient>(
    `SELECT id, code, name, unit, stock_qty, min_qty, avg_cost, is_active
       FROM solace_ingredients
      WHERE is_active = TRUE AND min_qty > 0 AND stock_qty <= min_qty
      ORDER BY (stock_qty - min_qty) ASC`
  );
}

// ─── BIẾN ĐỘNG KHO ───────────────────────────────────────────────────────────
export interface MovementInput {
  ingredientId: string;
  type: 'in' | 'out' | 'adjust' | 'waste';
  qty: number;             // dương = tăng tồn, âm = giảm tồn
  unitCost?: number;       // giá vốn/đơn vị (nhập kho) — cập nhật avg_cost
  reason?: string | null;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  performedBy?: string | null;
}

/**
 * Ghi 1 biến động kho + cập nhật tồn nguyên liệu (transaction + FOR UPDATE).
 * Nhập kho có unitCost → cập nhật avg_cost theo bình quân gia quyền.
 * Dùng client truyền vào để gộp nhiều biến động trong 1 giao dịch (vd bán hàng).
 */
export async function recordMovement(input: MovementInput, externalClient?: import('pg').PoolClient): Promise<StockMovement> {
  const run = async (client: import('pg').PoolClient): Promise<StockMovement> => {
    const cur = await client.query<{ stock_qty: string; avg_cost: string }>(
      `SELECT stock_qty, avg_cost FROM solace_ingredients WHERE id = $1 FOR UPDATE`,
      [input.ingredientId]
    );
    if (cur.rowCount === 0) throw new Error('Nguyên liệu không tồn tại');
    const oldQty = Number(cur.rows[0].stock_qty);
    const oldCost = Number(cur.rows[0].avg_cost);
    const newQty = oldQty + input.qty;

    // Bình quân gia quyền khi nhập kho (qty > 0 và có unitCost)
    let newAvg = oldCost;
    if (input.type === 'in' && input.qty > 0 && input.unitCost != null) {
      const totalVal = oldQty * oldCost + input.qty * input.unitCost;
      newAvg = newQty > 0 ? Math.round(totalVal / newQty) : input.unitCost;
    }

    const id = genId('smov');
    await client.query(
      `INSERT INTO solace_stock_movements
         (id, ingredient_id, type, qty, unit_cost, balance_after, reason, ref_type, ref_id, note, performed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, input.ingredientId, input.type, input.qty, Math.round(input.unitCost ?? oldCost),
       newQty, input.reason ?? null, input.refType ?? null, input.refId ?? null, input.note ?? null, input.performedBy ?? null]
    );
    await client.query(
      `UPDATE solace_ingredients SET stock_qty = $2, avg_cost = $3, updated_at = NOW() WHERE id = $1`,
      [input.ingredientId, newQty, newAvg]
    );
    return {
      id, ingredient_id: input.ingredientId, type: input.type, qty: input.qty,
      unit_cost: Math.round(input.unitCost ?? oldCost), balance_after: newQty,
      reason: input.reason ?? null, ref_type: input.refType ?? null, ref_id: input.refId ?? null,
      note: input.note ?? null, performed_by: input.performedBy ?? null, created_at: new Date().toISOString(),
    };
  };
  return externalClient ? run(externalClient) : withTransaction(run);
}

export async function listMovements(ingredientId: string, limit = 50): Promise<StockMovement[]> {
  return query<StockMovement>(
    `SELECT m.*, i.name AS ingredient_name
       FROM solace_stock_movements m
       JOIN solace_ingredients i ON i.id = m.ingredient_id
      WHERE m.ingredient_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2`,
    [ingredientId, limit]
  );
}

// ─── CÔNG THỨC (BOM) ─────────────────────────────────────────────────────────
export async function getRecipe(productId: string): Promise<RecipeItem[]> {
  return query<RecipeItem>(
    `SELECT r.id, r.product_id, r.ingredient_id, r.qty, r.wastage_pct,
            i.name AS ingredient_name, i.unit
       FROM solace_recipe_items r
       JOIN solace_ingredients i ON i.id = r.ingredient_id
      WHERE r.product_id = $1
      ORDER BY i.name ASC`,
    [productId]
  );
}

export interface RecipeItemInput { ingredient_id: string; qty: number; wastage_pct?: number; }

/** Thay toàn bộ công thức của 1 món. */
export async function setRecipe(productId: string, items: RecipeItemInput[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM solace_recipe_items WHERE product_id = $1`, [productId]);
    for (const it of items) {
      if (!it.ingredient_id || !(it.qty > 0)) continue;
      await client.query(
        `INSERT INTO solace_recipe_items (id, product_id, ingredient_id, qty, wastage_pct)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (product_id, ingredient_id)
         DO UPDATE SET qty = EXCLUDED.qty, wastage_pct = EXCLUDED.wastage_pct`,
        [genId('srec'), productId, it.ingredient_id, it.qty, it.wastage_pct ?? 0]
      );
    }
  });
}

// ─── CÔNG THỨC THEO TÙY CHỌN (OPTION VALUE) ──────────────────────────────────
export interface OptionRecipeItem {
  id: string; option_value_id: string; ingredient_id: string; qty: number; wastage_pct: number;
  ingredient_name?: string; unit?: string;
}

/** Định mức cộng thêm của 1 option value (vd "thêm đường"). */
export async function getOptionRecipe(optionValueId: string): Promise<OptionRecipeItem[]> {
  return query<OptionRecipeItem>(
    `SELECT r.id, r.option_value_id, r.ingredient_id, r.qty, r.wastage_pct,
            i.name AS ingredient_name, i.unit
       FROM solace_option_recipe_items r
       JOIN solace_ingredients i ON i.id = r.ingredient_id
      WHERE r.option_value_id = $1
      ORDER BY i.name ASC`,
    [optionValueId]
  );
}

/** Định mức cộng thêm cho NHIỀU option value cùng lúc (dùng khi tính trừ kho đơn). */
export async function getOptionRecipesForValues(optionValueIds: string[]): Promise<OptionRecipeItem[]> {
  if (optionValueIds.length === 0) return [];
  return query<OptionRecipeItem>(
    `SELECT id, option_value_id, ingredient_id, qty, wastage_pct
       FROM solace_option_recipe_items
      WHERE option_value_id = ANY($1)`,
    [optionValueIds]
  );
}

/** Thay toàn bộ định mức của 1 option value. */
export async function setOptionRecipe(optionValueId: string, items: RecipeItemInput[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM solace_option_recipe_items WHERE option_value_id = $1`, [optionValueId]);
    for (const it of items) {
      if (!it.ingredient_id || !(it.qty > 0)) continue;
      await client.query(
        `INSERT INTO solace_option_recipe_items (id, option_value_id, ingredient_id, qty, wastage_pct)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (option_value_id, ingredient_id)
         DO UPDATE SET qty = EXCLUDED.qty, wastage_pct = EXCLUDED.wastage_pct`,
        [genId('sopr'), optionValueId, it.ingredient_id, it.qty, it.wastage_pct ?? 0]
      );
    }
  });
}
