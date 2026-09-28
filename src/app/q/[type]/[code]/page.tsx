'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Điểm đáp của QR lưỡng dụng: khi quét bằng camera điện thoại thường, URL
 * `/q/{type}/{code}` mở ở đây rồi điều hướng vào app để xử lý đúng ngữ cảnh.
 * - room  → /dashboard?scanRoom=CODE (AppLayout mở bảng hành động phòng)
 * - asset → /asset-management?assetCode=CODE
 */
export default function QrLandingPage({ params }: { params: { type: string; code: string } }) {
  const router = useRouter();
  const type = (params.type || '').toLowerCase();
  const code = decodeURIComponent(params.code || '');

  useEffect(() => {
    if (type === 'room') {
      router.replace(`/dashboard?scanRoom=${encodeURIComponent(code)}`);
    } else if (type === 'asset') {
      router.replace(`/dashboard?scanAsset=${encodeURIComponent(code)}`);
    } else if (type === 'solace-pay') {
      // QR thanh toán quán Solace: mở màn trả bằng ví.
      router.replace('/solace/tra-tien');
    } else {
      router.replace('/dashboard');
    }
  }, [type, code, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--background)' }}>
      <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
      <p className="text-sm text-muted-foreground">Đang mở…</p>
    </div>
  );
}
