/**
 * Engine sinh chữ ký email — table-based HTML + inline CSS (premium, email-safe).
 *
 * ⚠️ QUY TẮC EMAIL-SAFE (đừng phá vỡ):
 *   - Layout bằng <table>/<td>, KHÔNG flexbox/grid (Outlook = Word engine).
 *   - CSS inline trong style="" — Gmail/Outlook xóa thẻ <style>.
 *   - Ảnh dùng URL TUYỆT ĐỐI (http...), không base64.
 *   - Font web-safe có fallback. Không Google Fonts.
 *   - Nền ô set cả bgcolor="" lẫn style background (Outlook ưu tiên bgcolor).
 *   - border-radius chạy trên client hiện đại; Outlook cũ về vuông — chấp nhận được.
 */

export type SignatureTemplateId = 'executive' | 'modern' | 'classic' | 'compact' | 'banner' | 'minimal' | 'monogram' | 'centered' | 'sidebar';

export interface SignatureSocial {
  facebook?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
  zalo?: string;
  telegram?: string;
}

export interface SignatureData {
  templateId: SignatureTemplateId;
  fullName: string;
  jobTitle?: string;
  department?: string;
  subDepartment?: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  avatarUrl?: string; // URL tuyệt đối
  logoUrl?: string;   // URL tuyệt đối
  /** Hệ số cỡ logo (1 = mặc định theo mẫu; người dùng chỉnh được) */
  logoScale?: number;
  /** Câu khẩu hiệu / disclaimer ngắn dưới chữ ký */
  tagline?: string;
  social?: SignatureSocial;
  /** Màu nhấn thương hiệu (hex), mặc định indigo */
  primaryColor?: string;
  /** Màu chữ chính */
  textColor?: string;
  /** Màu chữ phụ */
  mutedColor?: string;
  /** Font family áp cho toàn chữ ký */
  fontFamily?: string;
}

export interface SignatureTemplateMeta {
  id: SignatureTemplateId;
  name: string;
  description: string;
}

export const SIGNATURE_TEMPLATES: SignatureTemplateMeta[] = [
  { id: 'executive', name: 'Executive', description: 'Tông sang trọng, nhiều khoảng thở, hợp vai trò quản lý và lãnh đạo' },
  { id: 'modern',  name: 'Modern Line',  description: 'Một đường nhấn dọc rất sạch, nhìn hiện đại và tin cậy' },
  { id: 'classic', name: 'Split Panel', description: 'Chia khối cân bằng, hợp doanh nghiệp và bộ phận vận hành' },
  { id: 'compact', name: 'Signature Row',   description: 'Tinh gọn cho email trao đổi hằng ngày nhưng vẫn có gu' },
  { id: 'banner',  name: 'Accent Card',   description: 'Khối nhấn thương hiệu rõ hơn, đẹp khi cần tạo dấu ấn' },
  { id: 'minimal', name: 'Bare Minimal',   description: 'Tối giản triệt để, phù hợp người thích sự im lặng và sạch sẽ' },
  { id: 'monogram', name: 'Monogram',      description: 'Huy hiệu chữ cái đầu bên trái — gọn, nổi bật kể cả khi không có ảnh' },
  { id: 'centered', name: 'Centered',      description: 'Cân giữa đối xứng, ảnh trên cùng — trang nhã, dễ nhìn' },
  { id: 'sidebar',  name: 'Brand Sidebar', description: 'Thẻ có cột màu thương hiệu bên trái — đậm dấu ấn doanh nghiệp' },
];

const DEFAULTS = {
  primaryColor: '#4f46e5',
  textColor: '#111827',
  mutedColor: '#6b7280',
  // System font stack hiện đại — đẹp trên mọi máy (Segoe UI/San Francisco/Roboto), email-safe.
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

/** Font serif sang trọng cho tên (mẫu executive). Web-safe, có ở cả Win/Mac. */
const SERIF_DISPLAY = "Georgia, 'Times New Roman', 'Songti SC', serif";

/** Base URL tuyệt đối tới bộ icon PNG tĩnh (public/signature-icons). */
const ICON_BASE = `${(process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')}/signature-icons`;
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

/**
 * Chuẩn hoá URL ảnh cho email: đổi endpoint NỘI BỘ (cần đăng nhập) sang bản PUBLIC
 * (mail client fetch ẩn danh) + tuyệt đối hoá. Nếu không phải các endpoint này thì giữ nguyên.
 *   /api/companies/{id}/logo   → /api/public/company-logo/{id}
 *   /api/users/{id}/avatar     → /api/public/user-avatar/{id}
 */
function toPublicAssetUrl(url?: string): string | undefined {
  if (!url) return url;
  let u = url
    .replace(/\/api\/companies\/([^/?#]+)\/logo/i, '/api/public/company-logo/$1')
    .replace(/\/api\/users\/([^/?#]+)\/avatar/i, '/api/public/user-avatar/$1');
  // Tuyệt đối hoá đường dẫn tương đối (để chạy trong email của người nhận).
  if (u.startsWith('/') && SITE_URL) u = `${SITE_URL}${u}`;
  return u;
}

/** Màu nhấn có sẵn bộ icon liên hệ. Màu tùy chỉnh → dùng slate mặc định. */
const ICON_PRESETS = new Set(['4f46e5', '0ea5e9', '10b981', 'ef4444', 'f59e0b', '8b5cf6', '0f172a', 'db2777', '475569']);
function iconColorSlug(primary: string): string {
  const slug = primary.replace('#', '').toLowerCase();
  return ICON_PRESETS.has(slug) ? slug : '475569';
}

/** Escape HTML để tránh vỡ markup / chèn thẻ ngoài ý muốn. */
function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Chuẩn hóa URL website: href có scheme, label bỏ scheme cho gọn. */
function normalizeUrl(url?: string): { href: string; label: string } | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const label = trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return { href, label };
}

/** Icon liên hệ PNG thật (tô theo màu nhấn), URL tuyệt đối → hiển thị trong email. */
function contactIcon(kind: 'phone' | 'mail' | 'web' | 'pin', primary: string): string {
  const slug = iconColorSlug(primary);
  return `<img src="${ICON_BASE}/${kind}-${slug}.png" width="15" height="15" alt="" style="display:block;border:0;" />`;
}

/** Một dòng liên hệ: icon PNG nhỏ + giá trị (link nếu có href). */
function contactRow(
  value: string | undefined,
  kind: 'phone' | 'mail' | 'web' | 'pin',
  opts: { href?: string; primary: string; text: string; font: string }
): string {
  if (!value) return '';
  const inner = opts.href
    ? `<a href="${esc(opts.href)}" style="color:${opts.text};text-decoration:none;">${esc(value)}</a>`
    : `<span style="color:${opts.text};">${esc(value)}</span>`;
  return (
    `<tr>` +
    `<td width="15" valign="middle" style="padding:3px 10px 3px 0;">${contactIcon(kind, opts.primary)}</td>` +
    `<td valign="middle" style="font-family:${opts.font};font-size:13px;line-height:18px;letter-spacing:.1px;">${inner}</td>` +
    `</tr>`
  );
}

/** Mạng xã hội: logo PNG thương hiệu thật (tile bo góc), URL tuyệt đối → chạy trong email. */
function socialButtons(
  social: SignatureSocial | undefined,
  _primary: string,
  _font: string,
  opts: { size?: number } = {}
): string {
  if (!social) return '';
  const sz = opts.size || 26;
  const items: Array<{ url?: string; name: string }> = [
    { url: social.linkedin,  name: 'linkedin' },
    { url: social.facebook,  name: 'facebook' },
    { url: social.twitter,   name: 'twitter' },
    { url: social.instagram, name: 'instagram' },
    { url: social.youtube,   name: 'youtube' },
    { url: social.zalo,      name: 'zalo' },
    { url: social.telegram,  name: 'telegram' },
  ].filter((i) => i.url && i.url.trim());
  if (items.length === 0) return '';

  const cells = items
    .map((i) => {
      const href = /^https?:\/\//i.test(i.url!) ? i.url! : `https://${i.url!.replace(/^\/+/, '')}`;
      return (
        `<td style="padding-right:7px;">` +
        `<a href="${esc(href)}" style="text-decoration:none;">` +
        `<img src="${ICON_BASE}/social-${i.name}.png" width="${sz}" height="${sz}" alt="${i.name}" ` +
        `style="display:block;border:0;border-radius:${Math.round(sz * 0.23)}px;" />` +
        `</a></td>`
      );
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

/** Avatar tròn (URL tuyệt đối) với vòng nhấn mảnh. */
function avatarImg(url: string | undefined, size: number, ring: string): string {
  if (!url) return '';
  return (
    `<img src="${esc(url)}" width="${size}" height="${size}" alt="" ` +
    `style="display:block;width:${size}px;height:${size}px;border-radius:${Math.round(size / 2)}px;` +
    `object-fit:cover;border:3px solid ${ring};" />`
  );
}

/** Logo công ty — giữ tỉ lệ, set height cố định + width auto (Outlook bỏ qua max-width).
 *  `scale` = hệ số người dùng chỉnh (clamp 0.4–3.0) nhân với height gốc của mẫu. */
function logoImg(url: string | undefined, maxHeight: number, alt = '', scale = 1): string {
  if (!url) return '';
  const s = Math.min(3, Math.max(0.4, scale || 1));
  const h = Math.round(maxHeight * s);
  return (
    `<img src="${esc(url)}" alt="${esc(alt)}" height="${h}" ` +
    `style="display:block;height:${h}px;width:auto;border:0;outline:none;text-decoration:none;" />`
  );
}

function softLine(color = '#e5e7eb'): string {
  return `<tr><td style="padding-top:14px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${color};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;
}

function premiumMeta(label: string, value: string, accent: string, font: string): string {
  return `<tr><td style="padding-top:3px;font-family:${font};font-size:12px;line-height:18px;letter-spacing:.28px;color:${accent};text-transform:uppercase;">${esc(label)}</td></tr><tr><td style="font-family:${font};font-size:13px;line-height:18px;color:#475569;">${esc(value)}</td></tr>`;
}

/** Chữ cái đầu (tối đa 2) từ họ tên — cho huy hiệu monogram. */
function initials(name?: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const a = parts[0][0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (a + b).toUpperCase();
}

/** Huy hiệu tròn chứa chữ cái đầu (thay avatar khi không có ảnh). */
function monogramBadge(name: string, size: number, bg: string, font: string, fg = '#ffffff'): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${bg}" ` +
    `style="width:${size}px;height:${size}px;background:${bg};border-radius:${Math.round(size / 2)}px;` +
    `font-family:${font};font-size:${Math.round(size * 0.4)}px;font-weight:700;color:${fg};` +
    `text-align:center;line-height:${size}px;">${esc(initials(name))}</td>` +
    `</tr></table>`
  );
}

/** Cụm dòng liên hệ (icon + giá trị), dùng chung cho các mẫu mới. */
function contactStack(d: SignatureData, p: string, m: string, f: string): string {
  const web = normalizeUrl(d.website);
  const rows = [
    contactRow(d.phone, 'phone', { href: d.phone ? `tel:${d.phone.replace(/\s/g, '')}` : undefined, primary: p, text: m, font: f }),
    contactRow(d.email, 'mail', { href: d.email ? `mailto:${d.email}` : undefined, primary: p, text: m, font: f }),
    web ? contactRow(web.label, 'web', { href: web.href, primary: p, text: m, font: f }) : '',
    contactRow(d.address, 'pin', { primary: p, text: m, font: f }),
  ].join('');
  return rows ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table>` : '';
}

interface Resolved {
  d: SignatureData;
  primaryColor: string;
  textColor: string;
  mutedColor: string;
  fontFamily: string;
}

function resolve(d: SignatureData): Resolved {
  // Chuẩn hoá ảnh logo/avatar sang bản public + tuyệt đối để chạy được trong email.
  d = { ...d, logoUrl: toPublicAssetUrl(d.logoUrl), avatarUrl: toPublicAssetUrl(d.avatarUrl) };
  return {
    d,
    primaryColor: d.primaryColor || DEFAULTS.primaryColor,
    textColor: d.textColor || DEFAULTS.textColor,
    mutedColor: d.mutedColor || DEFAULTS.mutedColor,
    fontFamily: d.fontFamily || DEFAULTS.fontFamily,
  };
}

/* ───────────────────────── EXECUTIVE — "Sang Trọng" ───────────────────────── */
function tplExecutive(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const web = normalizeUrl(d.website);
  const nameBlock = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="font-family:${SERIF_DISPLAY};font-size:25px;line-height:30px;font-weight:700;color:${t};letter-spacing:.2px;">${esc(d.fullName)}</td></tr>
      ${d.jobTitle ? `<tr><td style="font-family:${f};font-size:12px;line-height:18px;letter-spacing:.26px;color:${p};text-transform:uppercase;font-weight:700;padding-top:3px;">${esc(d.jobTitle)}</td></tr>` : ''}
      ${d.company ? `<tr><td style="font-family:${f};font-size:13px;line-height:18px;color:${m};padding-top:5px;">${esc(d.company)}</td></tr>` : ''}
      ${d.address ? `<tr><td style="font-family:${f};font-size:12px;line-height:17px;color:${m};padding-top:6px;">${esc(d.address)}</td></tr>` : ''}
    </table>
  `;

  // Tính màu nhạt hơn từ primary (cho gradient giả lập) — dùng opacity trick
  const pLight = p + '18'; // 10% opacity hex suffix (cho background nhẹ)

  const contactItems: string[] = [];
  if (d.phone) contactItems.push(
    `<td style="padding-right:24px;vertical-align:middle;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="middle" style="padding-right:8px;">${contactIcon('phone', p)}</td>` +
    `<td valign="middle" style="font-family:${f};font-size:13px;color:${t};line-height:1;letter-spacing:.2px;">` +
    `<a href="tel:${esc(d.phone.replace(/\s/g, ''))}" style="color:${t};text-decoration:none;">${esc(d.phone)}</a></td>` +
    `</tr></table></td>`
  );
  if (d.email) contactItems.push(
    `<td style="padding-right:24px;vertical-align:middle;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="middle" style="padding-right:8px;">${contactIcon('mail', p)}</td>` +
    `<td valign="middle" style="font-family:${f};font-size:13px;color:${t};line-height:1;letter-spacing:.2px;">` +
    `<a href="mailto:${esc(d.email)}" style="color:${t};text-decoration:none;">${esc(d.email)}</a></td>` +
    `</tr></table></td>`
  );
  if (web) contactItems.push(
    `<td style="padding-right:24px;vertical-align:middle;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td valign="middle" style="padding-right:8px;">${contactIcon('web', p)}</td>` +
    `<td valign="middle" style="font-family:${f};font-size:13px;color:${p};line-height:1;letter-spacing:.2px;font-weight:600;">` +
    `<a href="${esc(web.href)}" style="color:${p};text-decoration:none;">${esc(web.label)}</a></td>` +
    `</tr></table></td>`
  );

  const contactRow2 = contactItems.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${contactItems.join('')}</tr></table>`
    : '';

  const social = socialButtons(d.social, p, f, { size: 28 });

  // Avatar lớn (96px) với viền accent dày hơn (4px)
  const avatar = d.avatarUrl
    ? `<img src="${esc(d.avatarUrl)}" width="96" height="96" alt="" ` +
      `style="display:block;width:96px;height:96px;border-radius:48px;object-fit:cover;border:4px solid ${p};" />`
    : '';

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="font-family:${f};width:520px;max-width:520px;">
  <!-- Thanh gradient nhấn trên cùng -->
  <tr><td style="height:4px;font-size:0;line-height:0;background:linear-gradient(90deg,${p},${p}88);" bgcolor="${p}">&nbsp;</td></tr>
  <tr><td style="padding:24px 28px 0 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        ${avatar ? `<td valign="top" width="120" style="padding-right:24px;"><div style="padding:4px;border-radius:56px;background:${pLight};">${avatar}</div></td>` : ''}
        <td valign="top">
          <!-- Tên — serif display sang trọng -->
          ${nameBlock}
          ${d.logoUrl ? `<div style="margin-top:10px;">${logoImg(d.logoUrl, 40, d.company, d.logoScale)}</div>` : ''}
        </td>
      </tr>
    </table>
  </td></tr>
  ${softLine('#e7eaf0')}
  ${contactRow2 ? `<tr><td style="padding:14px 28px 0 28px;">${contactRow2}</td></tr>` : ''}

  <!-- Địa chỉ riêng dòng (nếu có) -->
  ${d.address ? `<tr><td style="padding:8px 28px 0 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="padding-right:8px;">${contactIcon('pin', p)}</td>
      <td valign="middle" style="font-family:${f};font-size:12px;color:${m};line-height:1;letter-spacing:.2px;">${esc(d.address)}</td>
    </tr></table>
  </td></tr>` : ''}

  <!-- Social -->
  ${social ? `<tr><td style="padding:18px 28px 0 28px;">${social}</td></tr>` : ''}

  <!-- Tagline / CTA -->
  ${d.tagline ? `<tr><td style="padding:16px 28px 0 28px;">
    <div style="font-family:${f};font-size:12px;color:${m};font-style:italic;line-height:17px;border-left:3px solid ${p};padding-left:12px;">${esc(d.tagline)}</div>
  </td></tr>` : ''}

  <!-- Footer bar -->
  <tr><td style="padding-top:22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td style="height:2px;font-size:0;line-height:0;background:linear-gradient(90deg,${p},${p}00);" bgcolor="${p}">&nbsp;</td></tr>
    </table>
  </td></tr>
</table>`.trim();
}

/* ───────────────────────── MODERN — "Điều Hành" ───────────────────────── */
function tplModern(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const web = normalizeUrl(d.website);
  const title = [d.jobTitle, d.subDepartment, d.department].filter(Boolean).map(esc).join(' · ');

  const contacts =
    contactRow(d.phone, 'phone', { href: d.phone ? `tel:${d.phone.replace(/\s/g, '')}` : undefined, primary: p, text: t, font: f }) +
    contactRow(d.email, 'mail', { href: d.email ? `mailto:${d.email}` : undefined, primary: p, text: t, font: f }) +
    (web ? contactRow(web.label, 'web', { href: web.href, primary: p, text: t, font: f }) : '') +
    contactRow(d.address, 'pin', { primary: p, text: m, font: f });

  const social = socialButtons(d.social, p, f);

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${f};">
  <tr>
    ${d.avatarUrl ? `<td valign="top" style="padding-right:18px;">${avatarImg(d.avatarUrl, 76, p)}</td>` : ''}
    <td valign="top" style="padding:2px 0 2px 18px;border-left:3px solid ${p};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-family:${f};font-size:20px;font-weight:700;color:${t};line-height:24px;letter-spacing:.15px;padding-bottom:1px;">${esc(d.fullName)}</td></tr>
        ${title ? `<tr><td style="font-family:${f};font-size:12px;color:${p};font-weight:700;line-height:18px;letter-spacing:.24px;text-transform:uppercase;padding-bottom:3px;">${title}</td></tr>` : ''}
        ${d.company ? `<tr><td style="font-family:${f};font-size:13px;color:${m};line-height:18px;">${esc(d.company)}</td></tr>` : ''}
        ${d.logoUrl ? `<tr><td style="padding-top:10px;">${logoImg(d.logoUrl, 34, d.company, d.logoScale)}</td></tr>` : ''}
        ${softLine('#edf0f4')}
        <tr><td style="padding-top:12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${contacts}</table></td></tr>
        ${social ? `<tr><td style="padding-top:12px;">${social}</td></tr>` : ''}
        ${d.tagline ? `<tr><td style="font-family:${f};font-size:11px;color:${m};font-style:italic;line-height:15px;padding-top:12px;">${esc(d.tagline)}</td></tr>` : ''}
      </table>
    </td>
  </tr>
</table>`.trim();
}

/* ───────────────────────── CLASSIC — "Doanh Nghiệp" ───────────────────────── */
function tplClassic(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const web = normalizeUrl(d.website);
  const title = [d.jobTitle, d.subDepartment, d.department].filter(Boolean).map(esc).join(', ');

  const contacts =
    contactRow(d.phone, 'phone', { href: d.phone ? `tel:${d.phone.replace(/\s/g, '')}` : undefined, primary: p, text: t, font: f }) +
    contactRow(d.email, 'mail', { href: d.email ? `mailto:${d.email}` : undefined, primary: p, text: t, font: f }) +
    (web ? contactRow(web.label, 'web', { href: web.href, primary: p, text: t, font: f }) : '') +
    contactRow(d.address, 'pin', { primary: p, text: m, font: f });

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${f};">
  <tr>
    <td valign="top" style="padding-right:20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-family:${f};font-size:19px;font-weight:700;color:${t};line-height:23px;letter-spacing:.15px;">${esc(d.fullName)}</td></tr>
        ${title ? `<tr><td style="font-family:${f};font-size:12px;color:${p};font-weight:700;line-height:18px;letter-spacing:.24px;text-transform:uppercase;padding-top:2px;">${title}</td></tr>` : ''}
        ${d.company ? `<tr><td style="font-family:${f};font-size:13px;color:${m};line-height:18px;">${esc(d.company)}</td></tr>` : ''}
        ${softLine('#e7eaf0')}
        <tr><td style="padding-top:8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${contacts}</table></td></tr>
        ${d.social ? `<tr><td style="padding-top:12px;">${socialButtons(d.social, p, f)}</td></tr>` : ''}
        ${d.tagline ? `<tr><td style="font-family:${f};font-size:11px;color:${m};font-style:italic;line-height:15px;padding-top:10px;">${esc(d.tagline)}</td></tr>` : ''}
      </table>
    </td>
    ${d.logoUrl ? `<td valign="middle" align="center" style="border-left:2px solid ${p};padding-left:20px;">${logoImg(d.logoUrl, 60, d.company, d.logoScale)}</td>` : ''}
  </tr>
</table>`.trim();
}

/* ───────────────────────── COMPACT — "Một Dòng" ───────────────────────── */
function tplCompact(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const web = normalizeUrl(d.website);
  const sep = `<span style="color:#cbd5e1;"> &nbsp;•&nbsp; </span>`;
  const parts = [
    d.phone ? `<a href="tel:${esc(d.phone.replace(/\s/g, ''))}" style="color:${t};text-decoration:none;">${esc(d.phone)}</a>` : '',
    d.email ? `<a href="mailto:${esc(d.email)}" style="color:${t};text-decoration:none;">${esc(d.email)}</a>` : '',
    web ? `<a href="${esc(web.href)}" style="color:${p};text-decoration:none;font-weight:bold;">${esc(web.label)}</a>` : '',
  ].filter(Boolean).join(sep);
  const title = [d.jobTitle, d.company].filter(Boolean).map(esc).join(' · ');

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${f};">
  <tr><td style="border-left:3px solid ${p};padding:1px 0 1px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="font-family:${f};font-size:15px;line-height:20px;color:${t};">
        <strong style="color:${t};letter-spacing:.18px;">${esc(d.fullName)}</strong>${title ? `<span style="color:${m};font-weight:normal;"> <span style="color:#cbd5e1;">·</span> ${title}</span>` : ''}
      </td></tr>
      ${parts ? `<tr><td style="font-family:${f};font-size:12px;line-height:18px;padding-top:4px;">${parts}</td></tr>` : ''}
      ${d.social ? `<tr><td style="padding-top:9px;">${socialButtons(d.social, p, f, { size: 24 })}</td></tr>` : ''}
    </table>
  </td></tr>
</table>`.trim();
}

/* ───────────────────────── BANNER — "Thẻ Nhấn" ───────────────────────── */
function tplBanner(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const web = normalizeUrl(d.website);
  const title = [d.jobTitle, d.subDepartment, d.department].filter(Boolean).map(esc).join(' · ');
  const contacts = [
    d.phone ? `<a href="tel:${esc(d.phone.replace(/\s/g, ''))}" style="color:#ffffff;text-decoration:none;">${esc(d.phone)}</a>` : '',
    d.email ? `<a href="mailto:${esc(d.email)}" style="color:#ffffff;text-decoration:none;">${esc(d.email)}</a>` : '',
    web ? `<a href="${esc(web.href)}" style="color:#ffffff;text-decoration:none;">${esc(web.label)}</a>` : '',
  ].filter(Boolean).join(`<span style="opacity:.6;"> &nbsp;•&nbsp; </span>`);

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="468" style="font-family:${f};width:468px;max-width:468px;border:1px solid #e7eaf0;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.06);">
  <tr><td bgcolor="${p}" style="background:${p};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:18px 20px 16px 20px;background:#ffffff;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        ${d.avatarUrl ? `<td valign="middle" width="64" style="padding-right:16px;">${avatarImg(d.avatarUrl, 58, p)}</td>` : ''}
        <td valign="middle">
          <div style="font-family:${f};font-size:18px;font-weight:700;color:${t};line-height:22px;letter-spacing:.14px;">${esc(d.fullName)}</div>
          ${title ? `<div style="font-family:${f};font-size:12px;color:${p};font-weight:700;line-height:18px;letter-spacing:.24px;text-transform:uppercase;padding-top:2px;">${title}</div>` : ''}
          ${d.company ? `<div style="font-family:${f};font-size:13px;color:${m};line-height:18px;">${esc(d.company)}</div>` : ''}
        </td>
        ${d.logoUrl ? `<td valign="middle" align="right" style="padding-left:14px;">${logoImg(d.logoUrl, 42, d.company, d.logoScale)}</td>` : ''}
      </tr>
      ${softLine('#eef2f7')}
      ${d.social ? `<tr><td colspan="${d.avatarUrl ? (d.logoUrl ? 3 : 2) : (d.logoUrl ? 2 : 1)}" style="padding-top:14px;">${socialButtons(d.social, p, f, { size: 24 })}</td></tr>` : ''}
    </table>
  </td></tr>
  <tr><td bgcolor="${p}" style="background:${p};padding:10px 20px;font-family:${f};font-size:12px;color:#ffffff;line-height:18px;letter-spacing:.18px;">
    ${contacts || esc(d.tagline || '')}
  </td></tr>
</table>`.trim();
}

/* ───────────────────────── MINIMAL — "Tinh Gọn" ───────────────────────── */
function tplMinimal(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const web = normalizeUrl(d.website);
  const title = [d.jobTitle, d.subDepartment, d.department, d.company].filter(Boolean).map(esc).join(' · ');
  const sep = `<span style="color:#cbd5e1;"> &nbsp;•&nbsp; </span>`;
  const contacts = [
    d.phone ? `<span style="color:${t};">${esc(d.phone)}</span>` : '',
    d.email ? `<a href="mailto:${esc(d.email)}" style="color:${p};text-decoration:none;">${esc(d.email)}</a>` : '',
    web ? `<a href="${esc(web.href)}" style="color:${p};text-decoration:none;">${esc(web.label)}</a>` : '',
  ].filter(Boolean).join(sep);

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${f};">
  <tr><td style="font-family:${f};font-size:16px;font-weight:700;color:${t};line-height:21px;letter-spacing:.14px;padding-bottom:2px;">${esc(d.fullName)}</td></tr>
  ${title ? `<tr><td style="font-family:${f};font-size:12px;color:${m};line-height:17px;letter-spacing:.22px;text-transform:uppercase;padding-bottom:10px;">${title}</td></tr>` : ''}
  <tr><td style="padding-bottom:10px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="44" style="border-top:2px solid ${p};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
  ${contacts ? `<tr><td style="font-family:${f};font-size:13px;color:${m};line-height:18px;">${contacts}</td></tr>` : ''}
  ${d.social ? `<tr><td style="padding-top:11px;">${socialButtons(d.social, p, f, { size: 24 })}</td></tr>` : ''}
  ${d.tagline ? `<tr><td style="font-family:${f};font-size:11px;color:${m};font-style:italic;line-height:15px;padding-top:10px;">${esc(d.tagline)}</td></tr>` : ''}
</table>`.trim();
}

/* ───────────────────────── MONOGRAM — "Huy Hiệu" ───────────────────────── */
function tplMonogram(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const title = [d.jobTitle, d.subDepartment, d.department].filter(Boolean).map(esc).join(' · ');
  const badge = d.avatarUrl ? avatarImg(d.avatarUrl, 66, p) : monogramBadge(d.fullName, 66, p, f);
  const contacts = contactStack(d, p, m, f);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${f};">
  <tr>
    <td valign="top" style="padding-right:16px;">${badge}</td>
    <td valign="top" style="border-left:2px solid ${p};padding-left:16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-family:${f};font-size:18px;font-weight:700;color:${t};line-height:23px;letter-spacing:.14px;">${esc(d.fullName)}</td></tr>
        ${title ? `<tr><td style="font-family:${f};font-size:12px;color:${p};font-weight:700;line-height:18px;letter-spacing:.24px;text-transform:uppercase;padding-top:2px;">${title}</td></tr>` : ''}
        ${d.company ? `<tr><td style="font-family:${f};font-size:13px;color:${m};line-height:18px;padding-top:2px;">${esc(d.company)}</td></tr>` : ''}
        ${contacts ? `<tr><td style="padding-top:10px;">${contacts}</td></tr>` : ''}
        ${d.logoUrl ? `<tr><td style="padding-top:12px;">${logoImg(d.logoUrl, 34, d.company, d.logoScale)}</td></tr>` : ''}
        ${d.social ? `<tr><td style="padding-top:12px;">${socialButtons(d.social, p, f, { size: 24 })}</td></tr>` : ''}
        ${d.tagline ? `<tr><td style="font-family:${f};font-size:11px;color:${m};font-style:italic;line-height:15px;padding-top:10px;">${esc(d.tagline)}</td></tr>` : ''}
      </table>
    </td>
  </tr>
</table>`.trim();
}

/* ───────────────────────── CENTERED — "Cân Giữa" ───────────────────────── */
function tplCentered(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const web = normalizeUrl(d.website);
  const title = [d.jobTitle, d.subDepartment, d.department, d.company].filter(Boolean).map(esc).join(' · ');
  const badge = d.avatarUrl ? avatarImg(d.avatarUrl, 72, p) : monogramBadge(d.fullName, 72, p, f);
  const sep = `<span style="color:#cbd5e1;"> &nbsp;•&nbsp; </span>`;
  const contacts = [
    d.phone ? `<span style="color:${m};">${esc(d.phone)}</span>` : '',
    d.email ? `<a href="mailto:${esc(d.email)}" style="color:${p};text-decoration:none;">${esc(d.email)}</a>` : '',
    web ? `<a href="${esc(web.href)}" style="color:${p};text-decoration:none;">${esc(web.label)}</a>` : '',
  ].filter(Boolean).join(sep);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="font-family:${f};text-align:center;">
  <tr><td align="center" style="padding-bottom:10px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center">${badge}</td></tr></table></td></tr>
  <tr><td align="center" style="font-family:${f};font-size:18px;font-weight:700;color:${t};line-height:23px;letter-spacing:.14px;">${esc(d.fullName)}</td></tr>
  ${title ? `<tr><td align="center" style="font-family:${f};font-size:12px;color:${p};font-weight:700;line-height:17px;letter-spacing:.22px;text-transform:uppercase;padding-top:3px;">${title}</td></tr>` : ''}
  <tr><td align="center" style="padding:10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="40" style="border-top:2px solid ${p};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
  ${contacts ? `<tr><td align="center" style="font-family:${f};font-size:13px;color:${m};line-height:19px;">${contacts}</td></tr>` : ''}
  ${d.logoUrl ? `<tr><td align="center" style="padding-top:12px;">${logoImg(d.logoUrl, 32, d.company, d.logoScale)}</td></tr>` : ''}
  ${d.social ? `<tr><td align="center" style="padding-top:12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center">${socialButtons(d.social, p, f, { size: 24 })}</td></tr></table></td></tr>` : ''}
  ${d.tagline ? `<tr><td align="center" style="font-family:${f};font-size:11px;color:${m};font-style:italic;line-height:15px;padding-top:10px;">${esc(d.tagline)}</td></tr>` : ''}
</table>`.trim();
}

/* ───────────────────────── SIDEBAR — "Thanh Bên Thương Hiệu" ───────────────────────── */
function tplSidebar(r: Resolved): string {
  const { d, primaryColor: p, textColor: t, mutedColor: m, fontFamily: f } = r;
  const title = [d.jobTitle, d.subDepartment, d.department].filter(Boolean).map(esc).join(' · ');
  const badge = d.avatarUrl ? avatarImg(d.avatarUrl, 60, '#ffffff') : monogramBadge(d.fullName, 60, '#ffffff', f, p);
  const contacts = contactStack(d, p, m, f);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="472" style="font-family:${f};width:472px;max-width:472px;border:1px solid #e7eaf0;border-radius:14px;overflow:hidden;">
  <tr>
    <td width="132" valign="top" align="center" bgcolor="${p}" style="width:132px;background:${p};padding:20px 16px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center">${badge}</td></tr></table>
      ${d.logoUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" style="padding-top:14px;">${logoImg(d.logoUrl, 26, d.company, d.logoScale)}</td></tr></table>` : ''}
    </td>
    <td valign="top" style="padding:20px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-family:${f};font-size:18px;font-weight:700;color:${t};line-height:23px;letter-spacing:.14px;">${esc(d.fullName)}</td></tr>
        ${title ? `<tr><td style="font-family:${f};font-size:12px;color:${p};font-weight:700;line-height:17px;letter-spacing:.22px;text-transform:uppercase;padding-top:2px;">${title}</td></tr>` : ''}
        ${d.company ? `<tr><td style="font-family:${f};font-size:13px;color:${m};line-height:18px;padding-top:2px;">${esc(d.company)}</td></tr>` : ''}
        ${contacts ? `<tr><td style="padding-top:12px;">${contacts}</td></tr>` : ''}
        ${d.social ? `<tr><td style="padding-top:12px;">${socialButtons(d.social, p, f, { size: 24 })}</td></tr>` : ''}
        ${d.tagline ? `<tr><td style="font-family:${f};font-size:11px;color:${m};font-style:italic;line-height:15px;padding-top:10px;">${esc(d.tagline)}</td></tr>` : ''}
      </table>
    </td>
  </tr>
</table>`.trim();
}

const RENDERERS: Record<SignatureTemplateId, (r: Resolved) => string> = {
  executive: tplExecutive,
  modern: tplModern,
  classic: tplClassic,
  compact: tplCompact,
  banner: tplBanner,
  minimal: tplMinimal,
  monogram: tplMonogram,
  centered: tplCentered,
  sidebar: tplSidebar,
};

/** Sinh HTML chữ ký hoàn chỉnh (email-safe) từ dữ liệu. */
export function renderSignatureHtml(data: SignatureData): string {
  const r = resolve(data);
  const renderer = RENDERERS[data.templateId] || RENDERERS.modern;
  return renderer(r);
}

/** Sinh bản plain-text (cho client không hỗ trợ HTML). */
export function renderSignatureText(data: SignatureData): string {
  const lines = [
    data.fullName,
    [data.jobTitle, data.subDepartment, data.department].filter(Boolean).join(' - '),
    data.company,
    data.phone ? `ĐT: ${data.phone}` : '',
    data.email ? `Email: ${data.email}` : '',
    data.website ? `Web: ${data.website}` : '',
    data.address ? `ĐC: ${data.address}` : '',
    data.tagline || '',
  ].filter(Boolean);
  return lines.join('\n');
}
