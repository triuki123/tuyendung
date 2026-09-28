'use client';

import React, { useRef, useState } from 'react';
import { X, QrCode, Download, Printer, Copy, CheckCircle, ClipboardList } from 'lucide-react';
import { Asset } from '@/lib/mockData';
import { buildQrUrl } from '@/lib/qr/qrPayload';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import dynamic from 'next/dynamic';

const QRCodeCanvas = dynamic(
  () => import('qrcode.react').then(m => m.QRCodeCanvas),
  { ssr: false, loading: () => <div className="w-48 h-48 rounded-2xl animate-pulse bg-white/05" /> }
);

interface AssetQRModalProps {
  asset: Asset;
  onClose: () => void;
  onInventory?: (a: Asset) => void;
}

export default function AssetQRModal({ asset, onClose, onInventory }: AssetQRModalProps) {
  const [copied, setCopied] = React.useState(false);
  const qrRef = useRef<any>(null);
  useEscapeKey(onClose);

  // URL ngắn lưỡng dụng (giống QR phòng) — quét bằng camera điện thoại thường mở app,
  // quét trong app → mở chi tiết tài sản. Tránh nhúng JSON dài + tiếng Việt khiến mã
  // quá dày, không quét được.
  const qrValue = buildQrUrl('asset', asset.code);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(asset.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (qrRef.current) {
      const canvas = qrRef.current.querySelector('canvas');
      if (canvas) {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR-${asset.code}.png`;
        a.click();
      }
    }
  };

  const handlePrint = () => {
    if (qrRef.current) {
      const canvas = qrRef.current.querySelector('canvas');
      if (canvas) {
        const printWindow = window.open('', '', 'height=400,width=400');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head><title>In QR Code - ${asset.code}</title></head>
              <body style="text-align:center; padding:20px; font-family:Arial;">
                <h2>${asset.name}</h2>
                <p>${asset.code}</p>
                ${canvas.outerHTML}
                <p>${asset.serialNumber}</p>
              </body>
            </html>
          `);
          printWindow.document.close();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 250);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-sm rounded-2xl sm:rounded-3xl border border-white/08 overflow-hidden modal-entrance"
        style={{ background: 'var(--primary)', boxShadow: 'var(--shadow-modal)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-white/08">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/15">
              <QrCode size={18} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-700 text-foreground">QR Code Tài Sản</h3>
              <p className="text-xs text-muted-foreground">Quét để xem thông tin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl btn-ghost text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* QR Display */}
        <div className="px-6 py-6 flex flex-col items-center gap-5" ref={qrRef}>
          {/* QR Code */}
          <div className="p-4 rounded-2xl bg-white">
            <QRCodeCanvas
              value={qrValue}
              size={180}
              level="H"
              fgColor="#0B1F3B"
              bgColor="#FFFFFF"
            />
          </div>

          {/* Asset info */}
          <div className="w-full space-y-2 text-center">
            <p className="text-base font-700 text-foreground">{asset.name}</p>
            <div className="flex items-center justify-center gap-2">
              <span className="font-mono text-sm font-600 text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg">
                {asset.code}
              </span>
              <button
                onClick={handleCopyCode}
                className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost text-muted-foreground hover:text-indigo-400 transition-colors"
                title="Sao chép mã tài sản"
              >
                {copied ? <CheckCircle size={15} className="text-emerald-400" /> : <Copy size={15} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{asset.serialNumber}</p>
            <p className="text-xs text-muted-foreground">{asset.department} · {asset.brand} {asset.model}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl btn-ghost text-sm font-500 hover:bg-white/05 transition-colors"
              title="Tải xuống QR Code"
            >
              <Download size={15} />
              Tải xuống
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl btn-indigo text-sm font-600 hover:bg-indigo-600 transition-colors"
              title="In QR Code"
            >
              <Printer size={15} />
              In QR
            </button>
          </div>

          {onInventory && (
            <button
              onClick={() => onInventory(asset)}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-xl btn-ghost text-sm font-600 hover:bg-white/05 transition-colors"
              title="Kiểm kê tài sản"
            >
              <ClipboardList size={15} />
              Kiểm kê tài sản
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
