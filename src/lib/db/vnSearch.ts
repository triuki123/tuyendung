/**
 * Tìm kiếm tiếng Việt KHÔNG DẤU ở tầng SQL.
 *
 * Vì sao cần: các câu SQL đang so bằng `LOWER(col) LIKE '%tu khoa%'` — vẫn phân biệt dấu.
 * Người dùng gõ "nguyen van" sẽ KHÔNG khớp "Nguyễn Văn" ⇒ ô tìm nhân sự "khó dùng".
 * Bản đối chiếu phía client là `normalizeVN()` (src/lib/utils/searchVN.ts) — hàm này giữ
 * đúng ngữ nghĩa đó cho phía DB.
 *
 * Dùng `translate()` thuần Postgres, KHÔNG cần extension `unaccent` (extension cần quyền
 * superuser để cài — không phải DB nào cũng cho).
 *
 * Hai chuỗi dưới đây PHẢI luôn bằng độ dài (67 ký tự) — có unit-guard ở cuối file.
 */
const VN_ACCENTED =
  'áàảãạăắằẳẵặâấầẩẫậ' + // a (17)
  'éèẻẽẹêếềểễệ' +       // e (11)
  'íìỉĩị' +             // i (5)
  'óòỏõọôốồổỗộơớờởỡợ' + // o (17)
  'úùủũụưứừửữự' +       // u (11)
  'ýỳỷỹỵ' +             // y (5)
  'đ';                  // d (1)

const VN_PLAIN =
  'aaaaaaaaaaaaaaaaa' +
  'eeeeeeeeeee' +
  'iiiii' +
  'ooooooooooooooooo' +
  'uuuuuuuuuuu' +
  'yyyyy' +
  'd';

if (VN_ACCENTED.length !== VN_PLAIN.length) {
  // Lệch độ dài → translate() cắt bớt ký tự ⇒ hỏng dữ liệu tìm kiếm. Fail sớm còn hơn âm thầm sai.
  throw new Error('vnSearch: VN_ACCENTED và VN_PLAIN phải cùng độ dài');
}

/**
 * Sinh biểu thức SQL bỏ dấu + hạ chữ thường cho một cột/biểu thức.
 *
 * @example
 *   `WHERE ${vnUnaccent('u.name')} LIKE ${vnUnaccent('$1')}`
 *   → khớp "Nguyễn Văn" khi gõ "nguyen van" (và cả khi gõ có dấu).
 */
export function vnUnaccent(expr: string): string {
  return `translate(lower(${expr}), '${VN_ACCENTED}', '${VN_PLAIN}')`;
}
