'use client';

import React, { useRef } from 'react';
import { X, QrCode, Printer } from 'lucide-react';
import { Asset } from '@/lib/mockData';
import { buildQrUrl } from '@/lib/qr/qrPayload';
import dynamic from 'next/dynamic';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const QRCodeCanvas = dynamic(
  () => import('qrcode.react').then(m => m.QRCodeCanvas),
  { ssr: false, loading: () => <div className="animate-pulse rounded bg-white/10" style={{ width: 80, height: 80 }} /> }
);

interface BulkQRPrintModalProps {
  assets: Asset[];
  onClose: () => void;
}

const SIZES = [
  { key: 'sm', label: 'Nhỏ', desc: '~3cm', qrSize: 72, cols: 5 },
  { key: 'md', label: 'Vừa', desc: '~5cm', qrSize: 110, cols: 4 },
  { key: 'lg', label: 'Lớn', desc: '~8cm', qrSize: 160, cols: 3 },
] as const;

type SizeKey = typeof SIZES[number]['key'];

export default function BulkQRPrintModal({ assets, onClose }: BulkQRPrintModalProps) {
  const toast = useToast();
  const [sizeKey, setSizeKey] = React.useState<SizeKey>('md');
  const previewRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);

  const sizeConfig = SIZES.find(s => s.key === sizeKey)!;

  const handlePrint = () => {
    if (!previewRef.current) return;

    const cards = previewRef.current.querySelectorAll<HTMLElement>('[data-asset-card]');
    const cardsHtml = Array.from(cards).map(card => {
      const canvas = card.querySelector('canvas');
      const name = card.getAttribute('data-name') || '';
      const code = card.getAttribute('data-code') || '';
      const serial = card.getAttribute('data-serial') || '';
      const imgSrc = canvas ? canvas.toDataURL('image/png') : '';

      return `<div class="qr-card">
        <img src="${imgSrc}" width="${sizeConfig.qrSize}" height="${sizeConfig.qrSize}" alt="${code}" />
        <div class="asset-name">${name}</div>
        <div class="asset-code">${code}</div>
        ${serial ? `<div class="asset-serial">S/N: ${serial}</div>` : ''}
      </div>`;
    }).join('');

    const printWin = window.open('', '_blank', 'width=960,height=700');
    if (!printWin) { toast.warning('Vui lòng cho phép mở popup để in.'); return; }

    printWin.document.write(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>In QR Tài Sản — ${assets.length} tem</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
    .grid {
      display: grid;
      grid-template-columns: repeat(${sizeConfig.cols}, 1fr);
      gap: 6px;
      padding: 8mm;
    }
    .qr-card {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 8px 6px 6px;
      text-align: center;
      break-inside: avoid;
    }
    .qr-card img { display: block; margin: 0 auto 5px; }
    .asset-name { font-size: 10px; font-weight: 700; color: #111; margin-bottom: 3px; line-height: 1.3; }
    .asset-code { font-size: 9px; font-family: 'Courier New', monospace; color: #374151; margin-bottom: 2px; }
    .asset-serial { font-size: 8px; color: #6b7280; }
    @media print {
      @page { margin: 8mm; size: A4; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="grid">${cardsHtml}</div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`);
    printWin.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-3xl flex flex-col rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'var(--card)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/08 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/15">
              <QrCode size={18} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-700 text-foreground">Xuất QR Hàng Loạt</h3>
              <p className="text-xs text-muted-foreground">{assets.length} tài sản đã chọn</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl btn-ghost text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Size selector */}
        <div className="px-6 py-3.5 border-b border-white/08 shrink-0 flex items-center gap-4">
          <span className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Kích thước tem:</span>
          <div className="flex gap-2">
            {SIZES.map(s => (
              <button
                key={s.key}
                onClick={() => setSizeKey(s.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-600 transition-all ${
                  sizeKey === s.key
                    ? 'bg-indigo-600 text-white'
                    : 'btn-ghost text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label} <span className="opacity-60">{s.desc}</span>
              </button>
            ))}
          </div>
          <p className="ml-auto text-xs text-muted-foreground hidden sm:block">
            {sizeConfig.cols} cột / hàng · A4
          </p>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-6" ref={previewRef}>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${sizeConfig.cols}, 1fr)` }}
          >
            {assets.map(asset => (
              <div
                key={asset.id}
                data-asset-card
                data-name={asset.name}
                data-code={asset.code}
                data-serial={asset.serialNumber || ''}
                className="flex flex-col items-center p-3 rounded-xl border border-white/08 text-center"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <div className="p-2 bg-white rounded-lg mb-2.5">
                  <QRCodeCanvas
                    value={buildQrUrl('asset', asset.code)}
                    size={sizeConfig.qrSize}
                    level="H"
                    fgColor="#0B1F3B"
                    bgColor="#FFFFFF"
                  />
                </div>
                <p className="text-xs font-700 text-foreground leading-snug mb-1 line-clamp-2 w-full">{asset.name}</p>
                <p className="text-2xs font-mono text-indigo-300">{asset.code}</p>
                {asset.serialNumber && (
                  <p className="text-2xs text-muted-foreground mt-0.5 truncate w-full">S/N: {asset.serialNumber}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/08 shrink-0">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Cửa sổ in sẽ mở tự động sau khi nhấn In
          </p>
          <div className="flex gap-3 ml-auto">
            <button onClick={onClose} className="h-9 px-4 rounded-xl btn-ghost text-sm">Đóng</button>
            <button
              onClick={handlePrint}
              className="h-9 px-5 rounded-xl btn-indigo text-sm font-600 flex items-center gap-2"
            >
              <Printer size={15} />
              In {assets.length} tem QR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
