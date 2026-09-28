/**
 * Sinh mã đơn hàng SOLACE — nguyên tử, reset theo ngày kinh doanh (giờ VN).
 * Định dạng mặc định: S{YYMMDD}-{SEQ:3}  → vd "S260624-001".
 * STT tăng qua bảng solace_order_code_counters (UPSERT ... RETURNING).
 */
import { queryOne } from '@/lib/db';

/** Tăng STT nguyên tử cho 1 scope (= ngày YYYY-MM-DD), trả giá trị mới. */
async function nextSeq(scope: string): Promise<number> {
  const row = await queryOne<{ last_seq: number }>(
    `INSERT INTO solace_order_code_counters (scope, last_seq) VALUES ($1, 1)
       ON CONFLICT (scope)
       DO UPDATE SET last_seq = solace_order_code_counters.last_seq + 1, updated_at = NOW()
     RETURNING last_seq`,
    [scope]
  );
  return row?.last_seq ?? 1;
}

/**
 * Sinh mã đơn mới theo ngày kinh doanh hiện tại (giờ VN).
 * @returns { code, businessDate } — businessDate dạng "YYYY-MM-DD".
 */
export async function generateOrderCode(): Promise<{ code: string; businessDate: string }> {
  const d = await queryOne<{ yymmdd: string; ymd: string }>(
    `SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD')     AS yymmdd,
            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS ymd`
  );
  const yymmdd = d?.yymmdd ?? '000000';
  const businessDate = d?.ymd ?? '1970-01-01';

  let seq = await nextSeq(businessDate);
  const build = (s: number) => `S${yymmdd}-${String(s).padStart(3, '0')}`;

  // Chống trùng (nếu có mã nhập tay trước đó) — tăng STT thêm 1 lần.
  let code = build(seq);
  const dup = await queryOne<{ x: number }>(
    `SELECT 1 AS x FROM solace_orders WHERE lower(code) = lower($1)`,
    [code]
  );
  if (dup) {
    seq = await nextSeq(businessDate);
    code = build(seq);
  }
  return { code, businessDate };
}
