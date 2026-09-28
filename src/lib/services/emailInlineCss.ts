/**
 * Inline CSS cho email — KHÔNG phụ thuộc thư viện ngoài.
 *
 * VÌ SAO CẦN: client email (Gmail, Outlook, Zimbra…) LOẠI BỎ khối `<style>` và `@import`.
 * Template viết kiểu `<style>.container{...}</style>` + class sẽ mất sạch định dạng khi tới
 * hộp thư (dù xem trước trên web vẫn đẹp vì trình duyệt có đọc `<style>`).
 * Chuẩn ngành: chuyển mọi rule CSS thành `style="..."` gắn thẳng lên từng thẻ.
 *
 * Phạm vi hỗ trợ (đủ cho template email thực tế): selector dạng `tag`, `.class`, `#id`,
 * `tag.class`, `.a.b` và danh sách phân tách bằng dấu phẩy. Selector phức tạp (dấu cách,
 * `>`, `:hover`, `[attr]`) và `@media` KHÔNG inline được → giữ lại trong một `<style>` cuối.
 *
 * An toàn: không có `<style>` → trả nguyên HTML. Mọi lỗi → trả HTML gốc, không chặn gửi mail.
 */

type Decl = string; // "color:red;padding:8px"

interface Rule {
  selector: string;
  decls: Decl;
  specificity: number;
  order: number;
}

/** Điểm ưu tiên thô: #id=100, .class=10, tag=1 (đủ để quyết định rule nào đè rule nào). */
function specificityOf(sel: string): number {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const classes = (sel.match(/\.[\w-]+/g) || []).length;
  const tags = (sel.replace(/[.#][\w-]+/g, '').match(/[a-zA-Z][\w-]*/g) || []).length;
  return ids * 100 + classes * 10 + tags;
}

/** Selector chỉ gồm tag/.class/#id nối liền nhau → inline được. */
function isSimpleSelector(sel: string): boolean {
  return /^[a-zA-Z][\w-]*$/.test(sel) || /^(?:[a-zA-Z][\w-]*)?(?:[.#][\w-]+)+$/.test(sel);
}

/** Tách selector đơn thành { tag, classes, id }. */
function parseSimple(sel: string): { tag: string | null; classes: string[]; id: string | null } {
  const tagMatch = sel.match(/^[a-zA-Z][\w-]*/);
  const tag = tagMatch ? tagMatch[0].toLowerCase() : null;
  const classes = (sel.match(/\.[\w-]+/g) || []).map((c) => c.slice(1));
  const idMatch = sel.match(/#([\w-]+)/);
  return { tag, classes, id: idMatch ? idMatch[1] : null };
}

/** Gộp CSS declarations: bản sau đè bản trước (theo tên thuộc tính). */
function mergeDecls(...parts: string[]): string {
  const map = new Map<string, string>();
  for (const part of parts) {
    for (const raw of part.split(';')) {
      const i = raw.indexOf(':');
      if (i <= 0) continue;
      const prop = raw.slice(0, i).trim().toLowerCase();
      const val = raw.slice(i + 1).trim();
      if (prop && val) map.set(prop, val);
    }
  }
  return Array.from(map, ([p, v]) => `${p}:${v}`).join(';');
}

export async function inlineEmailCss(html: string): Promise<string> {
  if (!html || !/<style[\s>]/i.test(html)) return html;
  try {
    const inlinable: Rule[] = [];
    const leftover: string[] = []; // rule không inline được → giữ trong <style>
    let order = 0;

    // 1) Rút toàn bộ nội dung <style> ra, xoá chúng khỏi HTML.
    const stripped = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css: string) => {
      let body = String(css).replace(/\/\*[\s\S]*?\*\//g, ''); // bỏ comment
      // @import: client email luôn chặn. Phải nuốt TRỌN url(...)/chuỗi vì URL Google Fonts
      // chứa dấu ';' (vd wght@400;500;700) — nếu cắt ở ';' đầu tiên sẽ để lại rác làm hỏng
      // rule ngay sau đó.
      body = body.replace(/@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;?/gi, '');

      // Giữ nguyên @media / @font-face (không inline được).
      body = body.replace(/@(?:media|font-face|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, (at) => {
        leftover.push(at.trim());
        return '';
      });

      // 2) Tách các rule "selector { decls }".
      const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = ruleRe.exec(body)) !== null) {
        const selectors = m[1].trim();
        const decls = m[2].trim();
        if (!selectors || !decls) continue;
        for (const sel of selectors.split(',').map((s) => s.trim()).filter(Boolean)) {
          if (isSimpleSelector(sel)) {
            inlinable.push({ selector: sel, decls, specificity: specificityOf(sel), order: order++ });
          } else {
            leftover.push(`${sel}{${decls}}`);
          }
        }
      }
      return '';
    });

    if (!inlinable.length && !leftover.length) return html;

    // 3) Duyệt từng thẻ mở, gắn style cho thẻ khớp selector.
    const openTagRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    const out = stripped.replace(openTagRe, (full, tagName: string, attrs: string) => {
      const tag = tagName.toLowerCase();
      if (tag === 'style' || tag === 'script') return full;

      const classAttr = attrs.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i);
      const classes = (classAttr ? (classAttr[2] ?? classAttr[3] ?? '') : '').split(/\s+/).filter(Boolean);
      const idAttr = attrs.match(/\bid\s*=\s*("([^"]*)"|'([^']*)')/i);
      const id = idAttr ? (idAttr[2] ?? idAttr[3] ?? '') : '';

      const matched = inlinable.filter((r) => {
        const p = parseSimple(r.selector);
        if (p.tag && p.tag !== tag) return false;
        if (p.id && p.id !== id) return false;
        return p.classes.every((c) => classes.includes(c));
      });
      if (!matched.length) return full;

      matched.sort((a, b) => a.specificity - b.specificity || a.order - b.order);

      const existing = attrs.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
      const existingDecls = existing ? (existing[2] ?? existing[3] ?? '') : '';
      // style="" viết tay LUÔN thắng rule trong <style>.
      const merged = mergeDecls(...matched.map((r) => r.decls), existingDecls);
      if (!merged) return full;

      const attrsNoStyle = existing ? attrs.replace(existing[0], '') : attrs;
      const cleaned = attrsNoStyle.replace(/\s+/g, ' ').trimEnd();
      return `<${tagName}${cleaned ? ' ' + cleaned.trim() : ''} style="${merged}">`;
    });

    // 4) Trả lại phần không inline được (@media…) trong 1 <style> duy nhất.
    const tail = leftover.length ? `<style>${leftover.join('\n')}</style>` : '';
    if (!tail) return out;
    return /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${tail}</head>`) : tail + out;
  } catch (err) {
    console.error('[email] inline CSS lỗi — gửi HTML gốc:', (err as Error).message);
    return html;
  }
}
