'use client';

import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2 } from 'lucide-react';
import {
  isPushSupported,
  hasActiveSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push/client';

interface PushToggleProps {
  userId: string;
}

/**
 * Nút bật/tắt "Thông báo đẩy" (Web Push). Ẩn hoàn toàn nếu trình duyệt không hỗ trợ
 * hoặc chưa cấu hình VAPID → an toàn khi deploy.
 */
export default function PushToggle({ userId }: PushToggleProps) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if (ok) hasActiveSubscription().then(setSubscribed);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const ok = await subscribeToPush(userId);
      if (ok) setSubscribed(true);
    } catch (e) {
      console.error('[push] enable lỗi:', e);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch (e) {
      console.error('[push] disable lỗi:', e);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  return (
    <button
      onClick={subscribed ? disable : enable}
      disabled={busy}
      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
      title={subscribed ? 'Tắt thông báo đẩy trên thiết bị này' : 'Nhận thông báo đẩy trên thiết bị này'}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : subscribed ? (
        <BellOff className="h-3.5 w-3.5" />
      ) : (
        <BellRing className="h-3.5 w-3.5" />
      )}
      {subscribed ? 'Tắt đẩy' : 'Bật đẩy'}
    </button>
  );
}
