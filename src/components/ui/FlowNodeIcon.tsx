'use client';

import React, { useId } from 'react';

interface FlowNodeIconProps {
  size?: number;
  className?: string;
  /** Bật hiệu ứng xoay chậm 14s. Mặc định: true */
  animated?: boolean;
}

export default function FlowNodeIcon({ size = 32, className = '', animated = true }: FlowNodeIconProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `fni-g-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AssetFlow Pro"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>

      {/* Outer arcs + arrowheads — xoay chậm 14s */}
      <g className={animated ? 'logo-spin-slow' : undefined}>
        <path d="M32 8 a24 24 0 0 1 20.8 12" fill="none" stroke="#6366f1" strokeWidth="4.2" strokeLinecap="round" />
        <path d="M56.28 26.06 L48.22 20.9 L55.85 16.5 Z" fill="#6366f1" />
        <path d="M52.8 44 a24 24 0 0 1 -20.8 12" fill="none" stroke="#818cf8" strokeWidth="4.2" strokeLinecap="round" />
        <path d="M25 56 L33.5 51.6 L33.5 60.4 Z" fill="#818cf8" />
        <path d="M11.2 44 a24 24 0 0 1 0 -24" fill="none" stroke="#c4b5fd" strokeWidth="4.2" strokeLinecap="round" />
        <path d="M14.72 13.94 L14.28 23.5 L6.65 19.1 Z" fill="#c4b5fd" />
      </g>

      {/* Center node — đứng yên */}
      <circle cx="32" cy="32" r="11" fill={`url(#${gradId})`} />
      <circle cx="32" cy="32" r="4.4" fill="#0B1F3B" />
    </svg>
  );
}
