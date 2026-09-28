'use client';

import React, { useEffect } from 'react';

// Không dùng next/font/google để build không phụ thuộc mạng (server build có thể
// không tới được fonts.gstatic.com). Montserrat khi máy có; fallback Plus Jakarta
// Sans (đã self-host toàn cục) rồi system sans.
const BRAND_FONT = "'Montserrat', var(--font-plus-jakarta-sans), system-ui, sans-serif";

interface SplashScreenProps {
  /** Gọi khi animation kết thúc (để điều hướng tiếp). */
  onFinish?: () => void;
  /** Thời lượng splash (ms) trước khi gọi onFinish. Mặc định 2800ms. */
  duration?: number;
}

/**
 * Màn hình welcome (splash) hiển thị ngay sau khi đăng nhập thành công,
 * trước khi vào dashboard. Tự động responsive:
 *  - Desktop (≥1024px): lockup ngang (ô monogram + wordmark) + thanh progress dưới đáy.
 *  - Mobile  (<1024px): lockup dọc + spinner.
 * Animation thuần SVG + CSS, đồng bộ tông navy/indigo của hệ thống.
 */
export default function SplashScreen({ onFinish, duration = 2800 }: SplashScreenProps) {
  useEffect(() => {
    if (!onFinish) return;
    const timer = setTimeout(onFinish, duration);
    return () => clearTimeout(timer);
  }, [onFinish, duration]);

  return (
    <div className="splash-root" role="status" aria-label="Đang khởi động FADO AssetFlow">
      {/* ===== DESKTOP: lockup ngang ===== */}
      <div className="screen play desktop">
        <div className="glow" />
        <div className="splash-row">
          <div className="tile">
            <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ag-d" x1="10" y1="40" x2="38" y2="8" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#818cf8" />
                  <stop offset="1" stopColor="#c4b5fd" />
                </linearGradient>
              </defs>
              <path className="leg" pathLength={100} d="M10 40 L24 8 L38 40" stroke="url(#ag-d)" />
              <path className="bar" pathLength={100} d="M16.5 27 H31.5" />
            </svg>
          </div>
          <div className="divider" />
          <div className="word" style={{ fontFamily: BRAND_FONT }}>
            <div className="w-fado">FADO</div>
            <div className="w-af">
              Asset<span className="flow">Flow</span>
            </div>
          </div>
        </div>
        <div className="copyright">Intelligent Business Operations Platform</div>
        <div className="progress" />
      </div>

      {/* ===== MOBILE: lockup dọc ===== */}
      <div className="screen play mobile">
        <div className="glow" />
        <div className="splash-col">
          <div className="tile">
            <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ag-m" x1="10" y1="40" x2="38" y2="8" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#818cf8" />
                  <stop offset="1" stopColor="#c4b5fd" />
                </linearGradient>
              </defs>
              <path className="leg" pathLength={100} d="M10 40 L24 8 L38 40" stroke="url(#ag-m)" />
              <path className="bar" pathLength={100} d="M16.5 27 H31.5" />
            </svg>
          </div>
          <div className="word" style={{ fontFamily: BRAND_FONT }}>
            <div className="w-fado">FADO</div>
            <div className="w-af">
              Asset<span className="flow">Flow</span>
            </div>
          </div>
        </div>
        <div className="copyright copyright-mobile">Intelligent Business Operations Platform</div>
      </div>

      <style jsx>{`
        .splash-root {
          position: fixed;
          inset: 0;
          z-index: 100;
        }
        .screen {
          position: absolute;
          inset: 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(110% 130% at 50% 46%, #10294a 0%, #0b1f3b 48%, #081627 100%);
        }
        /* breakpoint khớp lg: của hệ thống (1024px) */
        .screen.mobile {
          display: none;
        }
        @media (max-width: 1023px) {
          .screen.desktop {
            display: none;
          }
          .screen.mobile {
            display: flex;
          }
          .screen.mobile {
            background: radial-gradient(120% 90% at 50% 42%, #10294a 0%, #0b1f3b 46%, #081627 100%);
          }
        }

        .splash-row {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 34px;
        }
        .splash-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 26px;
        }

        .glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 560px;
          height: 360px;
          transform: translate(-50%, -50%) scale(0.5);
          background: radial-gradient(ellipse, rgba(129, 140, 248, 0.28), rgba(129, 140, 248, 0) 62%);
          opacity: 0;
          pointer-events: none;
          animation: glow 2.6s ease-out 0.2s forwards;
        }
        .screen.mobile .glow {
          top: 38%;
          width: 260px;
          height: 260px;
          background: radial-gradient(circle, rgba(129, 140, 248, 0.34), rgba(129, 140, 248, 0) 65%);
          transform: translate(-50%, -50%) scale(0.4);
          animation: glowMobile 2.6s ease-out 0.25s forwards;
        }

        .tile {
          width: 128px;
          height: 128px;
          border-radius: 32px;
          flex-shrink: 0;
          background: linear-gradient(145deg, #0e2748, #0a1c34);
          border: 1px solid rgba(129, 140, 248, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 18px 44px -14px rgba(99, 102, 241, 0.7);
          opacity: 0;
          transform: scale(0.6);
          animation: tileIn 0.7s cubic-bezier(0.34, 1.4, 0.5, 1) 0.2s forwards;
        }
        .screen.mobile .tile {
          width: 118px;
          height: 118px;
          border-radius: 30px;
          box-shadow: 0 16px 40px -14px rgba(99, 102, 241, 0.7);
        }
        .tile svg {
          width: 70px;
          height: 70px;
          overflow: visible;
        }
        .screen.mobile .tile svg {
          width: 64px;
          height: 64px;
        }
        .leg {
          fill: none;
          stroke-width: 5;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: draw 0.7s ease-in-out 0.5s forwards;
        }
        .bar {
          fill: none;
          stroke: #6366f1;
          stroke-width: 5;
          stroke-linecap: round;
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: draw 0.34s ease-in-out 1.12s forwards;
        }

        .word {
          line-height: 1.12;
        }
        .screen.mobile .word {
          text-align: center;
          line-height: 1.1;
        }
        .w-fado {
          font-weight: 400;
          font-size: 20px;
          letter-spacing: 0.177em;
          padding-left: 0.177em;
          color: #fff;
          text-transform: uppercase;
          opacity: 0;
          transform: translateX(-16px);
          animation: slideX 0.55s ease-out 1.3s forwards;
        }
        .w-af {
          font-weight: 600;
          font-size: 46px;
          letter-spacing: 0.01em;
          margin-top: 6px;
          color: #fff;
          opacity: 0;
          transform: translateX(-16px);
          animation: slideX 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 1.45s forwards;
        }
        .screen.mobile .w-fado {
          font-size: 16px;
          transform: translateY(10px);
          animation: slideY 0.5s ease-out 1.35s forwards;
        }
        .screen.mobile .w-af {
          font-size: 30px;
          margin-top: 5px;
          transform: translateY(12px);
          animation: slideY 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) 1.5s forwards;
        }
        .w-af .flow {
          background: linear-gradient(100deg, #818cf8, #c4b5fd);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .divider {
          width: 1px;
          height: 0;
          background: linear-gradient(180deg, transparent, rgba(129, 140, 248, 0.6), transparent);
          align-self: center;
          opacity: 0;
          animation: divIn 0.5s ease-out 1s forwards;
        }

        .progress {
          position: absolute;
          left: 0;
          bottom: 0;
          height: 3px;
          width: 0;
          background: linear-gradient(100deg, #818cf8, #c4b5fd);
          box-shadow: 0 0 12px rgba(129, 140, 248, 0.7);
          animation: load 1.9s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
        }
        .copyright {
          position: absolute;
          bottom: 16px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #3f5573;
          opacity: 0;
          animation: fadein 0.5s ease 1.9s forwards;
        }

        .copyright-mobile {
          bottom: 48px;
          padding: 0 28px;
          font-size: 10px;
          animation-delay: 1.9s;
        }

        @keyframes tileIn {
          from {
            opacity: 0;
            transform: scale(0.6);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes divIn {
          from {
            height: 0;
            opacity: 0;
          }
          to {
            height: 96px;
            opacity: 1;
          }
        }
        @keyframes slideX {
          from {
            opacity: 0;
            transform: translateX(-16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideY {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes glow {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
          }
          45% {
            opacity: 1;
          }
          100% {
            opacity: 0.6;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes glowMobile {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.4);
          }
          45% {
            opacity: 1;
          }
          100% {
            opacity: 0.55;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes load {
          0% {
            width: 0;
          }
          100% {
            width: 100%;
          }
        }
        @keyframes fadein {
          to {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .glow,
          .tile,
          .leg,
          .bar,
          .divider,
          .w-fado,
          .w-af,
          .progress,
          .copyright {
            animation-duration: 0.01ms !important;
            animation-delay: 0ms !important;
          }
        }
      `}</style>
    </div>
  );
}
