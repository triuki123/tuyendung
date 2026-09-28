/**
 * Chuẩn hoá chuỗi tiếng Việt để tìm kiếm không phụ thuộc dấu/hoa-thường.
 *
 * Ví dụ:
 *   "Nguyễn Văn Á" → "nguyen van a"
 *   "Trần Đức"    → "tran duc"
 *
 * Quy trình:
 *  1. NFD: tách ký tự dấu thành ký tự gốc + combining mark (U+0300..U+036F)
 *  2. Bỏ tất cả combining marks
 *  3. Thay đ/Đ → d (NFD không tách 2 ký tự này)
 *  4. Lowercase
 */
export function normalizeVN(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

/**
 * Kiểm tra haystack có chứa needle theo kiểu tìm tiếng Việt không phân biệt dấu.
 * Trả true nếu needle rỗng (không filter).
 */
export function includesVN(haystack: unknown, needle: string): boolean {
  const q = normalizeVN(needle).trim();
  if (!q) return true;
  return normalizeVN(haystack).includes(q);
}
