'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Số đếm tăng dần khi cuộn tới. Giữ nguyên tiền tố/hậu tố ("15+", "30.000 m²", "200+").
 * Nếu không tách được số → hiển thị nguyên văn (an toàn).
 */
function parse(v: string) {
  const m = String(v).match(/^(\D*?)([\d.,]+)(.*)$/);
  if (!m) return null;
  const [, pre, num, suf] = m;
  const hasSep = /[.,]/.test(num);
  const target = parseInt(num.replace(/[.,]/g, ''), 10);
  if (!Number.isFinite(target)) return null;
  return { pre, suf, target, hasSep };
}

export default function CountUp({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
  const parsed = parse(value || '');
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!parsed) return;
    const el = ref.current;
    if (!el) return;
    // Tôn trọng người dùng tắt chuyển động.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(parsed.target); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || started.current) return;
      started.current = true;
      io.disconnect();
      const dur = 1100;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        setN(Math.round(parsed.target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!parsed) return <span className={className} style={style}>{value}</span>;
  const shown = parsed.hasSep ? n.toLocaleString('vi-VN') : String(n);
  return <span ref={ref} className={className} style={style}>{parsed.pre}{shown}{parsed.suf}</span>;
}
