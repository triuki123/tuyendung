'use client';

import React, { memo, useId } from 'react';

// Font cho wordmark SVG. Không dùng next/font/google để build không phụ thuộc
// mạng (server build có thể không tới được fonts.gstatic.com). Montserrat khi
// máy có; fallback về Plus Jakarta Sans (đã self-host toàn cục) rồi system sans.
const BRAND_FONT = "'Montserrat', var(--font-plus-jakarta-sans), system-ui, sans-serif";

interface BrandWordmarkProps {
  /** Chiều cao render (px). Chiều rộng tự suy theo tỉ lệ. Mặc định 80. */
  height?: number;
  /** Hiện dòng tagline phía dưới. Mặc định true. */
  tagline?: boolean;
  /** Đặt trên nền LUÔN tối (vd panel branding login) ⇒ ép chữ trắng, bỏ qua theme. */
  onDark?: boolean;
  className?: string;
}

/**
 * Wordmark chỉ chữ (Brand Asset Kit v3) — nền tối:
 * "FADO" tracking rộng (font-weight 400) trên,
 * "Asset·Flow" (font-weight 600, "Flow" gradient #818cf8→#c4b5fd) dưới,
 * kèm tagline mờ nếu bật.
 */
const BrandWordmark = memo(function BrandWordmark({ height = 80, tagline = true, onDark = false, className = '' }: BrandWordmarkProps) {
  const uid = useId().replace(/:/g, '');
  const flowId = `wm-flow-${uid}`;
  // onDark: ép trắng (nền luôn tối). Ngược lại theo theme: dark trắng / light navy.
  const inkFill = onDark ? '#ffffff' : 'var(--brand-ink)';
  const tagFill = onDark ? '#94a3b8' : 'var(--brand-tagline)';

  const VB_W = 300;
  const VB_H = tagline ? 118 : 96;
  const width = Math.round((height * VB_W) / VB_H);
  const font = BRAND_FONT;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="FADO AssetFlow"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={flowId} x1="150" y1="0" x2="260" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>

      {/* FADO */}
      <text x="6" y="28" fontFamily={font} fontWeight="400" fontSize="20" letterSpacing="3.54" style={{ fill: inkFill }}>
        FADO
      </text>

      {/* AssetFlow */}
      <text x="4" y="74" fontFamily={font} fontWeight="600" fontSize="38" letterSpacing="0.46">
        <tspan style={{ fill: inkFill }}>Asset</tspan>
        <tspan fill={`url(#${flowId})`}>Flow</tspan>
      </text>

      {/* Tagline */}
      {tagline && (
        <text x="6" y="106" fontFamily={font} fontWeight="500" fontSize="10.5" letterSpacing="0.4" style={{ fill: tagFill }}>
          Intelligent Business Operations Platform
        </text>
      )}
    </svg>
  );
});

export default BrandWordmark;
