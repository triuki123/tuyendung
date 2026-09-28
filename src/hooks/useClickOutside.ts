'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Gọi `handler` khi click/chạm RA NGOÀI phần tử `ref`.
 *
 * Dùng cho dropdown/popup neo vào Topbar: backdrop kiểu `fixed inset-0` KHÔNG đáng
 * tin ở đây vì header có `backdrop-filter` → tạo containing block, `position:fixed`
 * con bị giới hạn trong khung header nên không phủ hết màn → click vùng dưới không
 * đóng được. Hook này lắng nghe ở document nên không dính vấn đề đó.
 *
 * `ref` nên bọc CẢ nút mở lẫn panel để click vào nút không bị tính là "ra ngoài".
 * Lắng nghe `mousedown`/`touchstart` (trước click) để đóng mượt, kể cả khi đang focus input.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const listener = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, enabled]);
}
