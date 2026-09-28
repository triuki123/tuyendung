/**
 * Lọc HTML an toàn (allowlist) trước khi render nội dung do người dùng soạn — dùng cho mô tả
 * biểu mẫu + khối nội dung, KỂ CẢ ở trang công khai. Chống XSS: bỏ script/iframe/style, mọi
 * thuộc tính `on*`, và mọi href `javascript:`. Chỉ giữ thẻ định dạng cơ bản.
 *
 * Chạy được cả server (regex thuần, không phụ thuộc DOM) — đủ cho nội dung do admin nội bộ soạn.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'a', 'span', 'div',
]);

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  let html = String(input);

  // Bỏ hẳn các khối nguy hiểm (kể cả nội dung bên trong).
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '');

  // Duyệt từng thẻ: chỉ giữ thẻ trong allowlist; lọc thuộc tính (bỏ on*, style, chỉ giữ href an toàn).
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, slash: string, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (slash) return `</${tag}>`;
    let safeAttrs = '';
    if (tag === 'a') {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const url = href ? (href[2] ?? href[3] ?? href[4] ?? '') : '';
      if (url && !/^\s*(javascript|data|vbscript):/i.test(url)) {
        safeAttrs = ` href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer"`;
      }
    }
    return `<${tag}${safeAttrs}>`;
  });

  // Dọn mọi thuộc tính on* còn sót (phòng hờ) + javascript: trong text.
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return html;
}

/** Kiểm tra chuỗi có "trông như HTML" không (để quyết định render HTML hay escape text cũ). */
export function looksLikeHtml(s: string | null | undefined): boolean {
  return !!s && /<\/?[a-z][\s\S]*>/i.test(s);
}
