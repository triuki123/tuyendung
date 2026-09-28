'use client';

import React, { memo, useId } from 'react';

/**
 * Bậc thưởng thị giác theo % hoàn thiện hồ sơ — càng cao càng "premium":
 *  - < 40%  : xám nhạt, không phát sáng (nhìn nhạt → khuyến khích điền thêm)
 *  - 40–69% : gradient xanh dương → cyan, sáng nhẹ
 *  - 70–99% : gradient chàm → tím, phát sáng rõ
 *  - 100%   : gradient VÀNG GOLD, phát sáng mạnh + nhịp lấp lánh (đỉnh cao)
 */
function tierFor(p: number): { from: string; to: string; glow: string; glowBlur: number; premium: boolean } {
  if (p >= 100) return { from: '#fde68a', to: '#f59e0b', glow: '#fbbf24', glowBlur: 8, premium: true };
  if (p >= 70) return { from: '#818cf8', to: '#c084fc', glow: '#a855f7', glowBlur: 5, premium: false };
  if (p >= 40) return { from: '#38bdf8', to: '#22d3ee', glow: '#22d3ee', glowBlur: 3, premium: false };
  return { from: '#64748b', to: '#94a3b8', glow: 'transparent', glowBlur: 0, premium: false };
}

interface CompletenessRingProps {
  /** Phần trăm 0–100. */
  percent: number;
  /** Đường kính px. Mặc định 44. */
  size?: number;
  /** Độ dày vòng. Mặc định 4. */
  stroke?: number;
  /** Tooltip. */
  title?: string;
  className?: string;
  /** Nội dung giữa vòng (vd avatar). */
  children?: React.ReactNode;
}

/**
 * Vòng tròn tiến độ bao quanh nội dung (avatar). Không hiện số %, thay vào đó
 * vòng càng đầy càng đẹp/premium để tạo động lực hoàn thiện hồ sơ.
 */
const CompletenessRing = memo(function CompletenessRing({
  percent,
  size = 44,
  stroke = 4,
  title,
  className = '',
  children,
}: CompletenessRingProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `cr-grad-${uid}`;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - p / 100);
  const t = tierFor(p);

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={title || `Hồ sơ nhân sự: ${p}%`}
      aria-label={`Hoàn thiện hồ sơ ${p}%`}
    >
      <svg
        width={size}
        height={size}
        className={`-rotate-90 absolute inset-0 ${t.premium ? 'animate-pulse' : ''}`}
        style={t.glowBlur ? { filter: `drop-shadow(0 0 ${t.glowBlur}px ${t.glow})` } : undefined}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={t.from} />
            <stop offset="100%" stopColor={t.to} />
          </linearGradient>
        </defs>
        {/* track nền */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
        {/* tiến độ */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
});

export default CompletenessRing;
