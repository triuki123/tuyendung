/**
 * Sinh mã hợp đồng theo template cấu hình ở từng loại hợp đồng.
 *
 * Template hỗ trợ các token:
 *   {DD} {MM} {YYYY} {YY}  — ngày/tháng/năm (giờ VN)
 *   {SEQ}                  — số thứ tự trong ngày (pad 2 chữ số), reset theo loại+công ty+ngày
 *   {SEQ:n}               — số thứ tự pad n chữ số
 *   {TYPE}                — mã loại hợp đồng (contract_types.code)
 *   {COMPANY}             — mã công ty (companies.code) suy từ phòng ban của nhân viên
 *
 * STT tăng nguyên tử qua bảng contract_code_counters (UPSERT ... RETURNING).
 * Counter CHỈ tăng khi thực sự cấp mã (nút Sinh mã / tạo nháp) — không tăng khi chỉ mở form.
 */
import { queryOne } from '@/lib/db';

export const DEFAULT_CODE_TEMPLATE = '{DD}{MM}.{SEQ}/{YYYY}/{TYPE}-{COMPANY}';

interface TemplateVars {
  dd: string;
  mm: string;
  yyyy: string;
  yy: string;
  seq: number;
  type: string;
  company: string;
}

/** Render template thuần — không I/O, dễ kiểm thử. */
export function renderTemplate(template: string, v: TemplateVars): string {
  return template
    .replace(/\{DD\}/g, v.dd)
    .replace(/\{MM\}/g, v.mm)
    .replace(/\{YYYY\}/g, v.yyyy)
    .replace(/\{YY\}/g, v.yy)
    .replace(/\{SEQ:(\d+)\}/g, (_m, n: string) => String(v.seq).padStart(Number(n), '0'))
    .replace(/\{SEQ\}/g, String(v.seq).padStart(2, '0'))
    .replace(/\{TYPE\}/g, v.type)
    .replace(/\{COMPANY\}/g, v.company);
}

/** Tăng STT nguyên tử cho 1 scope, trả về giá trị mới. */
async function nextSeq(scope: string): Promise<number> {
  const row = await queryOne<{ last_seq: number }>(
    `INSERT INTO contract_code_counters (scope, last_seq) VALUES ($1, 1)
       ON CONFLICT (scope)
       DO UPDATE SET last_seq = contract_code_counters.last_seq + 1, updated_at = NOW()
     RETURNING last_seq`,
    [scope]
  );
  return row?.last_seq ?? 1;
}

/**
 * Sinh mã hợp đồng cho 1 nhân viên + 1 loại hợp đồng.
 * @throws Error nếu loại HĐ chưa có mã, hoặc template cần {COMPANY} mà nhân viên chưa có mã công ty.
 */
export async function generateContractCode(
  contractTypeId: string,
  employeeId: string
): Promise<string> {
  // 1. Cấu hình mã + template của loại HĐ
  const t = await queryOne<{ code: string | null; code_template: string | null }>(
    `SELECT code, code_template FROM contract_types WHERE id = $1`,
    [contractTypeId]
  );
  if (!t || !t.code || !t.code.trim()) {
    throw new Error('Loại hợp đồng chưa cấu hình "Mã". Vào Cài đặt → Loại hợp đồng để đặt mã trước khi sinh.');
  }
  const template = (t.code_template && t.code_template.trim()) || DEFAULT_CODE_TEMPLATE;
  const typeCode = t.code.trim();

  // 2. Mã công ty suy từ phòng ban của nhân viên
  const comp = await queryOne<{ code: string | null }>(
    `SELECT co.code AS code
       FROM users u
       LEFT JOIN departments d ON d.id::text = u.department_id::text
       LEFT JOIN companies   co ON co.id::text = d.company_id::text
      WHERE u.id::text = $1`,
    [employeeId]
  );
  const companyCode = (comp?.code || '').trim();
  if (template.includes('{COMPANY}') && !companyCode) {
    throw new Error('Nhân viên chưa gắn công ty hoặc công ty chưa có mã. Cấu hình mã công ty trong Tổ Chức → Công ty.');
  }

  // 3. Các phần ngày theo giờ VN
  const d = await queryOne<{ dd: string; mm: string; yyyy: string; yy: string; ymd: string }>(
    `SELECT to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD')         AS dd,
            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MM')         AS mm,
            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY')       AS yyyy,
            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YY')         AS yy,
            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS ymd`
  );
  const parts = d ?? { dd: '01', mm: '01', yyyy: '1970', yy: '70', ymd: '1970-01-01' };

  // 4. STT nguyên tử theo loại + công ty + ngày
  const scope = `${typeCode}|${companyCode}|${parts.ymd}`;
  let seq = await nextSeq(scope);

  const build = (s: number) =>
    renderTemplate(template, {
      dd: parts.dd, mm: parts.mm, yyyy: parts.yyyy, yy: parts.yy,
      seq: s, type: typeCode, company: companyCode,
    });

  // 5. Chống trùng — nếu mã render bị trùng (do sửa tay trước đó), tăng STT thêm 1 lần.
  let code = build(seq);
  const dup = await queryOne<{ x: number }>(
    `SELECT 1 AS x FROM contracts WHERE contract_number = $1`,
    [code]
  );
  if (dup) {
    seq = await nextSeq(scope);
    code = build(seq);
  }
  return code;
}
