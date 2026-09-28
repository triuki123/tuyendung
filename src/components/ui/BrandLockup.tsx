'use client';

import React, { memo, useId } from 'react';

// Font cho wordmark SVG. Không dùng next/font/google để build không phụ thuộc
// mạng (server build có thể không tới được fonts.gstatic.com). Montserrat khi
// máy có; fallback về Plus Jakarta Sans (đã self-host toàn cục) rồi system sans.
const BRAND_FONT = "'Montserrat', var(--font-plus-jakarta-sans), system-ui, sans-serif";

interface BrandLockupProps {
  /** Chiều cao px; chiều rộng tự suy theo tỉ lệ 455:128. Mặc định 38. */
  height?: number;
  className?: string;
}

/**
 * Logo ngang (Horizontal Lockup) — nền tối, theo Brand Asset Kit v3.
 * ViewBox 455×128: ô monogram "A" + wordmark "FADO / AssetFlow" + tagline.
 * Dùng cho header/sidebar khi mở rộng.
 */
const BrandLockup = memo(function BrandLockup({ height = 38, className = '' }: BrandLockupProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `bl-bg-${uid}`;
  const aId = `bl-a-${uid}`;
  const flowId = `bl-flow-${uid}`;
  const width = Math.round((height * 455) / 128);
  const font = BRAND_FONT;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 455 128"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="FADO AssetFlow"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={bgId} x1="18" y1="18" x2="110" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0e2748" />
          <stop offset="1" stopColor="#0a1c34" />
        </linearGradient>
        <linearGradient id={aId} x1="10" y1="40" x2="38" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
        <linearGradient id={flowId} x1="300" y1="0" x2="430" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>

      {/* Tile monogram */}
      <rect x="0.7" y="0.7" width="126.6" height="126.6" rx="32" fill={`url(#${bgId})`} stroke="#818cf8" strokeOpacity="0.45" strokeWidth="1.3" />
      <g transform="translate(29 29) scale(1.4583)">
        <path d="M10 40 L24 8 L38 40" fill="none" stroke={`url(#${aId})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.5 27 H31.5" fill="none" stroke="#6366f1" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* Wordmark — màu chữ theo theme: dark trắng (#fff) = mặc định; light navy.
          Dùng CSS var qua style (SVG attribute không resolve var) ⇒ dark giữ nguyên. */}
      <text x="160" y="34" fontFamily={font} fontWeight="400" fontSize="20" letterSpacing="3.54" style={{ fill: 'var(--brand-ink)' }}>
        FADO
      </text>
      <text x="158" y="80" fontFamily={font} fontWeight="600" fontSize="46" letterSpacing="0.46">
        <tspan style={{ fill: 'var(--brand-ink)' }}>Asset</tspan>
        <tspan fill={`url(#${flowId})`}>Flow</tspan>
      </text>
      <text x="160" y="105" fontFamily={font} fontWeight="500" fontSize="12.5" letterSpacing="0.4" style={{ fill: 'var(--brand-tagline)' }}>
        Intelligent Business Operations Platform
      </text>
    </svg>
  );
});

export default BrandLockup;
