'use client';

import React, { useRef, useState } from 'react';
import { X, QrCode, Download, Printer, Copy, CheckCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { buildQrUrl } from '@/lib/qr/qrPayload';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const QRCodeCanvas = dynamic(
  () => import('qrcode.react').then(m => m.QRCodeCanvas),
  { ssr: false, loading: () => <div className="w-44 h-44 rounded-2xl animate-pulse bg-white/05" /> },
);

interface RoomQRModalProps {
  room: { id: string; name: string; code: string; location?: string; capacity?: number };
  onClose: () => void;
}

/**
 * In tem QR dán cửa phòng họp. QR mã hoá URL lưỡng dụng (.../q/room/CODE):
 * quét bằng camera thường HOẶC trong app đều mở đúng bảng hành động phòng.
 */
export default function RoomQRModal({ room, onClose }: RoomQRModalProps) {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  useEscapeKey(onClose);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const qrValue = buildQrUrl('room', room.code, baseUrl);

  const handleCopy = () => {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getCanvas = () => qrRef.current?.querySelector('canvas') as HTMLCanvasElement | null;

  const handleDownload = () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `QR-${room.code}.png`;
    a.click();
  };

  const handlePrint = () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const img = canvas.toDataURL('image/png');
    const w = window.open('', '', 'height=520,width=420');
    if (!w) return;
    w.document.write(`
      <html><head><title>Tem QR - ${room.name}</title></head>
      <body style="text-align:center;padding:24px;font-family:Arial,sans-serif;">
        <h2 style="margin:0 0 4px">${room.name}</h2>
        <p style="margin:0 0 16px;color:#555;font-size:14px">Mã phòng: <b>${room.code}</b></p>
        <img src="${img}" style="width:300px;height:300px" />
        <p style="margin-top:16px;color:#777;font-size:12px">Quét QR để xem tình trạng phòng &amp; nhận phòng</p>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl sm:rounded-3xl border border-white/08 overflow-hidden modal-entrance"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/08">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/15">
              <QrCode size={18} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-700 text-foreground">Tem QR Phòng Họp</h3>
              <p className="text-xs text-muted-foreground">In &amp; dán lên cửa phòng</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl btn-ghost text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col items-center gap-5">
          <div className="p-4 rounded-2xl bg-white" ref={qrRef}>
            <QRCodeCanvas value={qrValue} size={180} level="H" fgColor="#0B1F3B" bgColor="#FFFFFF" />
          </div>

          <div className="w-full space-y-2 text-center">
            <p className="text-base font-700 text-foreground">{room.name}</p>
            <div className="flex items-center justify-center gap-2">
              <span className="font-mono text-sm font-600 text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg">
                {room.code}
              </span>
              <button onClick={handleCopy} className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost text-muted-foreground hover:text-indigo-400 transition-colors" title="Sao chép mã phòng">
                {copied ? <CheckCircle size={15} className="text-emerald-400" /> : <Copy size={15} />}
              </button>
            </div>
            {(room.location || room.capacity) && (
              <p className="text-xs text-muted-foreground">
                {room.location}{room.location && room.capacity ? ' · ' : ''}{room.capacity ? `${room.capacity} chỗ` : ''}
              </p>
            )}
          </div>

          <div className="flex gap-3 w-full">
            <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl btn-ghost text-sm font-500 hover:bg-white/05 transition-colors">
              <Download size={15} /> Tải xuống
            </button>
            <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl btn-indigo text-sm font-600 transition-colors">
              <Printer size={15} /> In tem
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
