'use client';

import { useEffect, useState } from 'react';

/**
 * Theo dõi 1 media query. Trả về true nếu khớp.
 * SSR-safe: mặc định false cho tới khi mount (tránh hydration mismatch).
 *
 *   const isMobile = useMediaQuery('(max-width: 1023px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Tiện ích: true khi màn < lg (1024px) — ranh giới mobile/tablet của hệ thống. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
