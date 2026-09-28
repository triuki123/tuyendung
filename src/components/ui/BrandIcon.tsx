'use client';

import React, { memo, useId } from 'react';

interface BrandIconProps {
  /** Kích thước px (vuông). Mặc định 32. */
  size?: number;
  /**
   * 'tile'  — ô bo góc nền gradient navy + viền indigo (dùng cho header/sidebar/favicon).
   * 'glyph' — chỉ monogram "A" nền trong suốt.
   */
  variant?: 'tile' | 'glyph';
  className?: string;
}

/**
 * Logo nhận diện thương hiệu FADO AssetFlow — monogram "A".
 * Dựng đúng tỉ lệ trong Brand Asset Kit v3:
 *  - Chân chữ A: gradient #818cf8 → #c4b5fd
 *  - Thanh ngang: #6366f1
 *  - Tile: nền gradient #0e2748 → #0a1c34, bo góc 32, viền indigo mờ.
 */
const BrandIcon = memo(function BrandIcon({ size = 32, variant = 'tile', className = '' }: BrandIconProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `bi-bg-${uid}`;
  const aId = `bi-a-${uid}`;

  if (variant === 'glyph') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="FADO AssetFlow"
        className={className}
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id={aId} x1="10" y1="40" x2="38" y2="8" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#818cf8" />
            <stop offset="1" stopColor="#c4b5fd" />
          </linearGradient>
        </defs>
        <path d="M10 40 L24 8 L38 40" fill="none" stroke={`url(#${aId})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.5 27 H31.5" fill="none" stroke="#6366f1" strokeWidth="5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
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
      </defs>
      <rect x="0.7" y="0.7" width="126.6" height="126.6" rx="32" fill={`url(#${bgId})`} stroke="#818cf8" strokeOpacity="0.45" strokeWidth="1.3" />
      <g transform="translate(29 29) scale(1.4583)">
        <path d="M10 40 L24 8 L38 40" fill="none" stroke={`url(#${aId})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16.5 27 H31.5" fill="none" stroke="#6366f1" strokeWidth="5" strokeLinecap="round" />
      </g>
    </svg>
  );
});

export default BrandIcon;
