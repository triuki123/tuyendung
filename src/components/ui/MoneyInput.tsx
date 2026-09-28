'use client';

import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/format';

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Giá trị số tiền (đồng VND). Chấp nhận number hoặc chuỗi số. */
  value: number | string | null | undefined;
  /** Trả về số nguyên (đồng) mỗi khi người dùng gõ. Rỗng → 0. */
  onValueChange: (value: number) => void;
  /** Hiển thị "0" khi giá trị bằng 0 thay vì để trống ô. Mặc định: để trống. */
  showZero?: boolean;
}

/** Chỉ giữ chữ số → số nguyên (đồng). "12.000" / "12,000 đ" → 12000. */
function digitsToNumber(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : 0;
  if (!raw) return 0;
  const digits = String(raw).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Ô nhập số tiền có phân nhóm hàng nghìn kiểu Việt Nam ("13.800.000") trong lúc gõ.
 * Lưu/trả về số nguyên đồng qua onValueChange, hiển thị đã format.
 * Dùng thay cho <input type="number"> ở mọi ô tiền để đồng nhất định dạng.
 */
export default function MoneyInput({
  value,
  onValueChange,
  showZero = false,
  inputMode,
  ...rest
}: MoneyInputProps) {
  const toDisplay = (v: number | string | null | undefined): string => {
    const n = digitsToNumber(v);
    if (n === 0 && !showZero) return '';
    return formatNumber(n);
  };

  const [display, setDisplay] = useState<string>(() => toDisplay(value));

  // Đồng bộ khi giá trị bên ngoài thay đổi (mở lại form, reset) và khác với đang gõ.
  useEffect(() => {
    if (digitsToNumber(display) !== digitsToNumber(value)) {
      setDisplay(toDisplay(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/[^\d]/g, '');
    const n = digits ? parseInt(digits, 10) : 0;
    setDisplay(digits ? formatNumber(n) : '');
    onValueChange(n);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode={inputMode ?? 'numeric'}
      value={display}
      onChange={handleChange}
    />
  );
}
