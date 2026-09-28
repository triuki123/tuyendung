'use client';

/**
 * Preview mã hợp đồng phía client (chỉ để hiển thị mẫu trong Cài đặt).
 * Logic render token phải khớp với server: src/lib/services/contractCodeService.ts
 */
export const DEFAULT_CODE_TEMPLATE = '{DD}{MM}.{SEQ}/{YYYY}/{TYPE}-{COMPANY}';

/** Render mẫu với ngày hôm nay (giờ VN), STT=1, công ty mẫu = "PS". */
export function previewContractCode(template: string, typeCode: string): string {
  const tpl = (template && template.trim()) || DEFAULT_CODE_TEMPLATE;
  const now = new Date();
  // Lấy phần ngày theo giờ VN
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', ...opts }).format(now);
  const dd = fmt({ day: '2-digit' });
  const mm = fmt({ month: '2-digit' });
  const yyyy = fmt({ year: 'numeric' });
  const yy = yyyy.slice(-2);
  const seq = 1;
  return tpl
    .replace(/\{DD\}/g, dd)
    .replace(/\{MM\}/g, mm)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{SEQ:(\d+)\}/g, (_m, n: string) => String(seq).padStart(Number(n), '0'))
    .replace(/\{SEQ\}/g, String(seq).padStart(2, '0'))
    .replace(/\{TYPE\}/g, typeCode || 'TYPE')
    .replace(/\{COMPANY\}/g, 'PS');
}
