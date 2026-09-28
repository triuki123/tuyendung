/**
 * Đợt xuất kho + KIỂM ĐẾM BẰNG QUÉT SKU/BARCODE (mig 295).
 *
 * Luồng: tạo đợt (draft) → thêm dòng hàng dự kiến → bấm "Bắt đầu kiểm đếm" (counting)
 * → quét từng thùng/đơn vị (mỗi lần quét ghi log + cộng qty_counted) → "Chốt & xuất kho"
 * (shipped): kiểm tồn đủ rồi ghi ship_out vào sổ kho theo SỐ ĐÃ ĐẾM.
 * Log quét giữ nguyên làm bằng chứng đối chiếu khi lệch số.
 */
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { findItemByCode, getItemStock } from '@/lib/services/warehouseInventoryService';
import { nextCode } from '@/lib/services/warehouseProductionService';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function listShipments(warehouseId: string, status?: string): Promise<any[]> {
  return query(
    `SELECT sh.*, u.name AS created_by_name,
            o.code AS order_code,
            (SELECT COUNT(*)::int FROM warehouse_shipment_lines l WHERE l.shipment_id = sh.id) AS line_count,
            (SELECT COALESCE(SUM(l.qty_planned), 0) FROM warehouse_shipment_lines l WHERE l.shipment_id = sh.id) AS total_planned,
            (SELECT COALESCE(SUM(l.qty_counted), 0) FROM warehouse_shipment_lines l WHERE l.shipment_id = sh.id) AS total_counted
     FROM warehouse_shipments sh
     LEFT JOIN users u ON u.id = sh.created_by
     LEFT JOIN warehouse_orders o ON o.id = sh.order_id
     WHERE sh.warehouse_id = $1 ${status ? 'AND sh.status = $2' : ''}
     ORDER BY sh.created_at DESC LIMIT 200`,
    status ? [warehouseId, status] : [warehouseId]
  );
}

export async function getShipment(id: string): Promise<any | null> {
  const sh = await queryOne<any>(`SELECT * FROM warehouse_shipments WHERE id = $1`, [id]);
  if (!sh) return null;
  const lines = await query(
    `SELECT l.*, i.sku, i.barcode, i.name, i.unit, i.units_per_carton
     FROM warehouse_shipment_lines l
     JOIN warehouse_items i ON i.id = l.item_id
     WHERE l.shipment_id = $1 ORDER BY i.name`,
    [id]
  );
  const scans = await query(
    `SELECT s.*, i.name AS item_name, u.name AS scanned_by_name
     FROM warehouse_shipment_scans s
     JOIN warehouse_items i ON i.id = s.item_id
     LEFT JOIN users u ON u.id = s.scanned_by
     WHERE s.shipment_id = $1 ORDER BY s.created_at DESC LIMIT 50`,
    [id]
  );
  return { ...sh, lines, scans };
}

export async function createShipment(input: {
  warehouseId: string; customer?: string | null; note?: string | null;
  lines: { itemId: string; qtyPlanned: number }[]; createdBy: string;
}): Promise<{ ok: boolean; error?: string; shipment?: any }> {
  const valid = input.lines.filter((l) => l.itemId && Number.isFinite(l.qtyPlanned) && l.qtyPlanned > 0);
  if (valid.length === 0) return { ok: false, error: 'Đợt xuất cần ít nhất 1 dòng hàng' };
  const code = await nextCode(input.warehouseId, 'XK', 'warehouse_shipments');
  return withTransaction(async (client) => {
    const shId = newId('wsh');
    const { rows } = await client.query(
      `INSERT INTO warehouse_shipments (id, warehouse_id, code, customer, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::uuid) RETURNING *`,
      [shId, input.warehouseId, code, input.customer ?? null, input.note ?? null, input.createdBy]
    );
    for (const l of valid) {
      await client.query(
        `INSERT INTO warehouse_shipment_lines (id, shipment_id, item_id, qty_planned)
         VALUES ($1,$2,$3,$4) ON CONFLICT (shipment_id, item_id) DO UPDATE SET qty_planned = $4`,
        [newId('wsl'), shId, l.itemId, l.qtyPlanned]
      );
    }
    return { ok: true, shipment: rows[0] };
  });
}

export async function setShipmentStatus(
  id: string, status: 'counting' | 'cancelled'
): Promise<{ ok: boolean; error?: string }> {
  const n = await execute(
    `UPDATE warehouse_shipments SET status = $2
     WHERE id = $1 AND status IN ('draft', 'counting')`,
    [id, status]
  );
  return n > 0 ? { ok: true } : { ok: false, error: 'Đợt đã xuất hoặc đã hủy' };
}

/**
 * Xoá hẳn 1 đợt xuất (kèm dòng hàng + log quét, CASCADE).
 * CHẶN đợt đã 'shipped': nó đã ghi ship_out giảm tồn vào sổ kho — xoá là mất dấu vết
 * lần xuất (dòng sổ bị SET NULL, không còn biết xuất theo đợt nào). Muốn hoàn hàng đã
 * xuất phải NHẬP TRẢ (kiểm kê tăng) chứ không xoá đợt.
 */
export async function deleteShipment(id: string): Promise<{ ok: boolean; error?: string }> {
  const sh = await queryOne<{ status: string; code: string }>(
    `SELECT status, code FROM warehouse_shipments WHERE id = $1`, [id]
  );
  if (!sh) return { ok: false, error: 'Không tìm thấy đợt xuất' };
  if (sh.status === 'shipped') {
    return { ok: false, error: `Đợt ${sh.code} đã xuất kho — không xoá được (sổ kho đã ghi giảm tồn). Nhập trả nếu muốn hoàn hàng.` };
  }
  await execute(`DELETE FROM warehouse_shipments WHERE id = $1`, [id]);
  return { ok: true };
}

/**
 * QUÉT 1 MÃ trong màn kiểm đếm: tìm item theo barcode/SKU, cộng qty_counted
 * (+units_per_carton nếu quét thùng, +1 nếu quét lẻ), ghi log quét.
 * Mã không thuộc đợt → báo lỗi rõ ràng (chặn xuất nhầm hàng).
 */
export async function scanShipmentCode(input: {
  shipmentId: string; code: string; scannedBy: string;
  /** true = quét thùng (mặc định); false = đếm lẻ 1 đơn vị */
  carton?: boolean;
}): Promise<{ ok: boolean; error?: string; line?: any; added?: number }> {
  const sh = await queryOne<any>(`SELECT * FROM warehouse_shipments WHERE id = $1`, [input.shipmentId]);
  if (!sh) return { ok: false, error: 'Không tìm thấy đợt xuất' };
  if (sh.status !== 'counting') return { ok: false, error: 'Đợt chưa ở trạng thái kiểm đếm' };

  const item = await findItemByCode(sh.warehouse_id, input.code);
  if (!item) return { ok: false, error: `Không nhận ra mã "${input.code}" — kiểm tra tem hàng` };

  const line = await queryOne<any>(
    `SELECT * FROM warehouse_shipment_lines WHERE shipment_id = $1 AND item_id = $2`,
    [input.shipmentId, item.id]
  );
  if (!line) return { ok: false, error: `"${item.name}" KHÔNG có trong đợt xuất này — dừng lại kiểm tra!` };

  const added = input.carton !== false && item.units_per_carton
    ? Number(item.units_per_carton)
    : 1;

  if (Number(line.qty_counted) + added > Number(line.qty_planned)) {
    return {
      ok: false,
      error: `"${item.name}" đã đủ ${line.qty_counted}/${line.qty_planned} — quét thêm là DƯ hàng!`,
    };
  }

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE warehouse_shipment_lines SET qty_counted = qty_counted + $2 WHERE id = $1`,
      [line.id, added]
    );
    await client.query(
      `INSERT INTO warehouse_shipment_scans (id, shipment_id, item_id, quantity, scanned_code, scanned_by)
       VALUES ($1,$2,$3,$4,$5,$6::uuid)`,
      [newId('wss'), input.shipmentId, item.id, added, input.code.trim(), input.scannedBy]
    );
    const updated = await client.query(
      `SELECT l.*, i.name, i.sku, i.unit FROM warehouse_shipment_lines l
       JOIN warehouse_items i ON i.id = l.item_id WHERE l.id = $1`,
      [line.id]
    );
    return { ok: true, line: updated.rows[0], added };
  });
}

/** Sửa tay số đã đếm của 1 dòng (khi không quét được — tem hỏng). Ghi log để đối chiếu. */
export async function setLineCounted(input: {
  lineId: string; qtyCounted: number; by: string;
}): Promise<{ ok: boolean; error?: string }> {
  const line = await queryOne<any>(
    `SELECT l.*, sh.status FROM warehouse_shipment_lines l
     JOIN warehouse_shipments sh ON sh.id = l.shipment_id WHERE l.id = $1`,
    [input.lineId]
  );
  if (!line) return { ok: false, error: 'Không tìm thấy dòng hàng' };
  if (line.status !== 'counting') return { ok: false, error: 'Đợt chưa ở trạng thái kiểm đếm' };
  const qty = Number(input.qtyCounted);
  if (!Number.isFinite(qty) || qty < 0 || qty > Number(line.qty_planned)) {
    return { ok: false, error: 'Số đếm không hợp lệ (0 → số dự kiến)' };
  }
  const delta = qty - Number(line.qty_counted);
  await withTransaction(async (client) => {
    await client.query(`UPDATE warehouse_shipment_lines SET qty_counted = $2 WHERE id = $1`, [input.lineId, qty]);
    if (delta !== 0) {
      await client.query(
        `INSERT INTO warehouse_shipment_scans (id, shipment_id, item_id, quantity, scanned_code, scanned_by)
         VALUES ($1,$2,$3,$4,'(sửa tay)',$5::uuid)`,
        [newId('wss'), line.shipment_id, line.item_id, delta, input.by]
      );
    }
  });
  return { ok: true };
}

/**
 * CHỐT & XUẤT KHO: mọi dòng phải đếm đủ (hoặc xác nhận xuất theo số đã đếm),
 * kiểm tồn đủ, rồi ghi ship_out theo SỐ ĐÃ ĐẾM trong 1 transaction.
 */
export async function finalizeShipment(input: {
  shipmentId: string; by: string;
  /** true = cho phép xuất khi đếm CHƯA đủ số dự kiến (xuất theo số thực đếm) */
  allowShort?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const sh = await getShipment(input.shipmentId);
  if (!sh) return { ok: false, error: 'Không tìm thấy đợt xuất' };
  if (sh.status !== 'counting') return { ok: false, error: 'Đợt chưa ở trạng thái kiểm đếm' };

  const shipLines = sh.lines.filter((l: any) => Number(l.qty_counted) > 0);
  if (shipLines.length === 0) return { ok: false, error: 'Chưa kiểm đếm được thùng hàng nào' };

  const short = sh.lines.filter((l: any) => Number(l.qty_counted) < Number(l.qty_planned));
  if (short.length > 0 && !input.allowShort) {
    return {
      ok: false,
      error: `Còn ${short.length} mặt hàng chưa đếm đủ (${short.map((l: any) => `${l.name}: ${l.qty_counted}/${l.qty_planned}`).join('; ')}). Đếm tiếp hoặc xác nhận xuất thiếu.`,
    };
  }

  // Kiểm tồn đủ cho số sẽ xuất
  for (const l of shipLines) {
    const stock = await getItemStock(l.item_id);
    if (stock < Number(l.qty_counted)) {
      return { ok: false, error: `Tồn kho "${l.name}" chỉ còn ${stock} — không đủ xuất ${l.qty_counted}` };
    }
  }

  await withTransaction(async (client) => {
    for (const l of shipLines) {
      await client.query(
        `INSERT INTO warehouse_stock_moves
           (id, warehouse_id, item_id, move_type, quantity, shipment_id, note, created_by)
         VALUES ($1,$2,$3,'ship_out',$4,$5,$6,$7::uuid)`,
        [newId('wsm'), sh.warehouse_id, l.item_id, Number(l.qty_counted), sh.id,
         `Xuất ${sh.code}${sh.customer ? ` — ${sh.customer}` : ''}`, input.by]
      );
    }
    await client.query(
      `UPDATE warehouse_shipments SET status = 'shipped', shipped_at = NOW(), shipped_by = $2::uuid
       WHERE id = $1`,
      [sh.id, input.by]
    );
  });
  return { ok: true };
}
