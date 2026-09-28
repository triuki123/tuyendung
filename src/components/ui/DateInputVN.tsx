'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

/**
 * Ô nhập ngày dd/mm/yyyy (chuẩn Việt Nam) — CHO PHÉP GÕ SỐ TRỰC TIẾP + chọn lịch.
 *
 * - Gõ số: tự chèn "/" → dd/mm/yyyy (vd gõ 15011990 → 15/01/1990). Nhập nhanh, không cần chuột.
 * - Nút lịch: mở date picker gốc (showPicker) để chọn bằng chuột.
 * - Hợp đồng props GIỮ NGUYÊN như input[type=date]: value/defaultValue dạng YYYY-MM-DD,
 *   onChange nhận event có target.value = YYYY-MM-DD (hoặc '' khi trống). Drop-in, forward ref.
 */

/** Kiểm tra ngày hợp lệ (đúng số ngày của tháng, năm 1900–2100). */
function isValidYMD(yyyy: string, mm: string, dd: string): boolean {
  const y = Number(yyyy), m = Number(mm), d = Number(dd);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** YYYY-MM-DD → dd/mm/yyyy (hiển thị). */
function isoToDisplay(iso: string): string {
  const p = (iso || '').slice(0, 10).split('-');
  return p.length === 3 && p[0] && p[1] && p[2] ? `${p[2]}/${p[1]}/${p[0]}` : '';
}

/** Chèn "/" vào chuỗi số: ddmmyyyy → dd/mm/yyyy. */
function formatDigits(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

const DateInputVN = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function DateInputVN(props, ref) {
    const { className, value, defaultValue, disabled, onChange, name, min, max, required, ...rest } = props;
    const textRef = useRef<HTMLInputElement | null>(null);
    const dateRef = useRef<HTMLInputElement | null>(null);

    const isControlled = value !== undefined;
    const initialIso = String((isControlled ? value : defaultValue) ?? '');
    const [text, setText] = useState(isoToDisplay(initialIso));

    // Đồng bộ text khi value (controlled) thay đổi từ bên ngoài (vd reset form, load dữ liệu).
    useEffect(() => {
      if (isControlled) setText(isoToDisplay(String(value ?? '')));
    }, [isControlled, value]);

    const setTextRefs = (el: HTMLInputElement | null) => {
      textRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
    };

    // Phát onChange với value dạng YYYY-MM-DD (hoặc '') để tương thích input[type=date].
    const fireChange = (iso: string) => {
      onChange?.({
        target: { value: iso, name: name ?? '' },
        currentTarget: { value: iso, name: name ?? '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    };

    const handleType = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
      setText(formatDigits(digits));
      if (digits.length === 0) { fireChange(''); return; }
      if (digits.length === 8) {
        const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4);
        if (isValidYMD(yyyy, mm, dd)) fireChange(`${yyyy}-${mm}-${dd}`);
      }
      // Chưa đủ 8 số hoặc chưa hợp lệ → chưa commit (giữ giá trị cũ), người dùng gõ tiếp.
    };

    const openPicker = () => {
      if (disabled) return;
      const el = dateRef.current;
      if (!el) return;
      try { (el as any).showPicker?.(); } catch { /* fallback */ }
      el.focus();
    };

    const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
      const iso = e.target.value;
      setText(isoToDisplay(iso));
      fireChange(iso);
    };

    // Hợp lệ để tô màu cảnh báo nhẹ khi gõ đủ 8 số nhưng sai (vd 31/02).
    const digitsLen = text.replace(/\D/g, '').length;
    const invalid =
      digitsLen === 8 &&
      !isValidYMD(text.slice(6, 10), text.slice(3, 5), text.slice(0, 2));

    return (
      <div
        className={`relative flex items-center gap-2 ${disabled ? 'opacity-60' : ''} focus-within:border-indigo-500/60 ${invalid ? 'border-red-500/60' : ''} ${className ?? ''}`}
      >
        {/* Ô gõ số dd/mm/yyyy */}
        <input
          ref={setTextRefs}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/yyyy"
          value={text}
          disabled={disabled}
          required={required}
          onChange={handleType}
          {...rest}
          className="flex-1 min-w-0 bg-transparent outline-none border-0 p-0 text-inherit placeholder:text-muted-foreground/50"
        />
        {/* Nút mở lịch */}
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          tabIndex={-1}
          className={`shrink-0 ${disabled ? '' : 'cursor-pointer hover:text-indigo-400'} text-muted-foreground/70`}
          title="Chọn theo lịch"
        >
          <CalendarDays size={14} />
        </button>
        {/* Input date ẩn — chỉ để mở picker; giữ form value YYYY-MM-DD */}
        <input
          ref={dateRef}
          type="date"
          value={isControlled ? String(value ?? '') : undefined}
          defaultValue={!isControlled ? (defaultValue as string | undefined) : undefined}
          onChange={handlePick}
          disabled={disabled}
          min={min}
          max={max}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 w-0 h-0 opacity-0"
        />
      </div>
    );
  }
);

export default DateInputVN;
