/**
 * Tiện ích định dạng dùng chung.
 *
 * Tiền trong hệ thống SOLACE lưu BIGINT theo ĐỒNG VND (không số lẻ) để tránh
 * sai số dấu phẩy động khi cộng/trừ ví & sổ cái. Mọi hiển thị đi qua formatVND.
 */

/** Định dạng số tiền (đồng VND) → "12.000 đ". null/undefined → "0 đ". */
export function formatVND(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (n == null || Number.isNaN(n)) return '0 đ';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} đ`;
}

/**
 * Số tiền RÚT GỌN kiểu Việt Nam — dùng cho thẻ thống kê/dashboard nơi số đầy đủ quá dài.
 * ≥ 1 tỷ  → "1,4 tỷ đ"   (1 số lẻ, dấu phẩy thập phân kiểu VN)
 * ≥ 1 triệu → "850 triệu đ"
 * ≥ 1 nghìn → "12 nghìn đ"
 * còn lại → formatVND đầy đủ.
 */
export function formatVNDCompact(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (n == null || Number.isNaN(n)) return '0 đ';
  const abs = Math.abs(n);
  const vi = (v: number, digits: number) =>
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(v);

  if (abs >= 1_000_000_000) return `${vi(n / 1_000_000_000, 1)} tỷ đ`;
  if (abs >= 1_000_000) return `${vi(n / 1_000_000, 0)} triệu đ`;
  if (abs >= 1_000) return `${vi(n / 1_000, 0)} nghìn đ`;
  return formatVND(n);
}

/**
 * Định dạng tiền ĐA TIỀN TỆ (module Chi Phí — công ty đa quốc gia).
 * VND → "12.000 đ" (nguyên); ngoại tệ → "1,234.50 USD" (2 số lẻ, phân nhóm kiểu quốc tế).
 */
export function formatMoney(amount: number | string | null | undefined, currency?: string | null): string {
  const cur = (currency || 'VND').toUpperCase();
  if (cur === 'VND') return formatVND(amount);
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (n == null || Number.isNaN(n)) return `0 ${cur}`;
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} ${cur}`;
}

/**
 * Định dạng SỐ NGÀY PHÉP chính xác tới 2 chữ số thập phân, bỏ số 0 thừa.
 * VD: 0.56 → "0.56", 1.0 → "1", 0.44 → "0.44". Tránh làm tròn 1 số (0.56→"0.6") gây hiểu nhầm quỹ phép.
 */
export function fmtDays(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (v == null || Number.isNaN(v)) return '0';
  return String(Number(v.toFixed(2)));
}

/** Định dạng số nguyên có phân nhóm hàng nghìn ("12.000"). */
export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return '0';
  return new Intl.NumberFormat('vi-VN').format(n);
}

/**
 * Parse chuỗi người dùng nhập ("12.000", "12,000", "12000 đ") → số đồng (integer).
 * Trả 0 nếu không hợp lệ.
 */
export function parseVND(input: string | number | null | undefined): number {
  if (typeof input === 'number') return Math.round(input);
  if (!input) return 0;
  const digits = String(input).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}
