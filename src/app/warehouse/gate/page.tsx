'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import dynamicImport from 'next/dynamic';
import { Loader2, Warehouse } from 'lucide-react';

const QRCodeCanvas = dynamicImport(() => import('qrcode.react').then((m) => m.QRCodeCanvas), { ssr: false });

export const dynamic = 'force-dynamic';

/**
 * Màn hình QR động treo ở cổng kho (tablet/màn hình cũ): /warehouse/gate?wh=MÃ_KHO
 * Token xoay mỗi 10 phút, trang tự refresh mỗi 60s. Công nhân GPS lỗi quét QR này
 * (vẫn bắt buộc chụp ảnh mặt khi chấm công).
 */
function GateInner() {
  const params = useSearchParams();
  const code = params.get('wh') || '';
  const [data, setData] = useState<{ warehouse_name: string; qr_value: string } | null>(null);
  const [error, setError] = useState('');
  const [clock, setClock] = useState('');

  const load = useCallback(async () => {
    if (!code) { setError('Thiếu mã kho trong đường dẫn (?wh=MÃ_KHO)'); return; }
    try {
      const res = await fetch(`/api/warehouse/gate-qr?wh=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Lỗi tải QR'); return; }
      setData(json.data);
      setError('');
    } catch {
      setError('Mất kết nối — đang thử lại...');
    }
  }, [code]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const c = setInterval(() => setClock(new Date().toLocaleTimeString('vi-VN')), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [load]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'var(--background)' }}>
      <div className="flex items-center gap-3 mb-6">
        <Warehouse className="h-8 w-8 text-indigo-400" />
        <h1 className="text-2xl font-700 text-foreground">{data?.warehouse_name || 'Warehouse'}</h1>
      </div>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !data ? (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="rounded-3xl bg-white p-6">
            <QRCodeCanvas value={data.qr_value} size={280} level="M" fgColor="#0B1F3B" bgColor="#FFFFFF" />
          </div>
          <p className="text-sm text-muted-foreground mt-6 text-center max-w-xs">
            Mở app Warehouse → <b className="text-foreground">Quét QR tại cổng</b> để chấm công khi GPS lỗi
          </p>
          <p className="text-xs text-muted-foreground/50 mt-2">{clock} · Mã tự đổi mỗi 10 phút</p>
        </>
      )}
    </div>
  );
}

export default function GatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--background)' }} />}>
      <GateInner />
    </Suspense>
  );
}
