'use client';

import { Dispatch, SetStateAction, useEffect, useState } from 'react';

/**
 * useState cho chế độ xem (Lịch/Bảng/Lưới/Kanban…) có nhớ qua localStorage.
 * - `key`: khóa lưu, duy nhất theo module (vd 'tasks_view_mode').
 * - `allowed`: danh sách giá trị hợp lệ — chống giá trị cũ/đổi tên còn kẹt trong storage.
 * - `defaultValue`: giá trị mặc định khi chưa lưu hoặc không hợp lệ.
 * Dùng thay `useState` bình thường; giá trị được ghi lại mỗi khi đổi.
 */
export function usePersistentView<T extends string>(
  key: string,
  allowed: readonly T[],
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const saved = localStorage.getItem(key);
      return saved && (allowed as readonly string[]).includes(saved) ? (saved as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, state);
    } catch {
      /* noop */
    }
  }, [key, state]);

  return [state, setState];
}
