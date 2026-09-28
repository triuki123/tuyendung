/**
 * Màu accent ổn định theo company_id — dùng cho badge + viền công ty ở Action Center,
 * Trung Tâm Thông Báo, danh sách duyệt hợp nhất. Cùng company_id → luôn cùng màu.
 *
 * ⚠️ Màu CHỈ là phụ trợ nhận diện nhanh — LUÔN hiển thị kèm TÊN công ty (an toàn mù màu,
 * chống nhầm công ty). Xem docs/technical/expense-module-roadmap.md §12.3.
 */

export interface CompanyAccent {
  /** text/viền, dùng qua style color/borderColor. */
  color: string;
  /** nền badge nhạt. */
  bg: string;
}

// Bảng màu tách biệt rõ (đủ tương phản trên nền tối), tránh 2 công ty cạnh nhau khó phân biệt.
const PALETTE: CompanyAccent[] = [
  { color: '#60a5fa', bg: 'rgba(96,165,250,0.14)' },  // xanh dương
  { color: '#34d399', bg: 'rgba(52,211,153,0.14)' },  // xanh lá
  { color: '#a78bfa', bg: 'rgba(167,139,250,0.14)' }, // tím
  { color: '#fbbf24', bg: 'rgba(251,191,36,0.14)' },  // vàng
  { color: '#f472b6', bg: 'rgba(244,114,182,0.14)' }, // hồng
  { color: '#22d3ee', bg: 'rgba(34,211,238,0.14)' },  // xanh cyan
  { color: '#fb923c', bg: 'rgba(251,146,60,0.14)' },  // cam
  { color: '#a3e635', bg: 'rgba(163,230,53,0.14)' },  // xanh chanh
];

/** Hash ổn định company_id → 1 accent trong palette. */
export function companyAccent(companyId: string | null | undefined): CompanyAccent {
  if (!companyId) return { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' };
  let h = 0;
  for (let i = 0; i < companyId.length; i++) h = (h * 31 + companyId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
