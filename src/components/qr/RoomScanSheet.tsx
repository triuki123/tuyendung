'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Loader2, DoorOpen, MapPin, Users, CheckCircle2, LogOut, CalendarPlus,
  Clock, AlertCircle, Wrench, Send, Timer,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useNotification } from '@/lib/useNotification';
import type { RoomScanStatus, RoomBriefBooking } from '@/lib/services/roomCheckinService';

interface RoomScanSheetProps {
  code: string;
  onClose: () => void;
}

/**
 * Bảng hành động phòng họp khi quét QR — trạng thái thời gian thực + check-in/out + đặt nhanh.
 * Dùng pattern modal chuẩn (fixed inset-0 z-50 flex items-center justify-center) để tự thành
 * bottom-sheet trên mobile theo CSS toàn cục.
 */
export default function RoomScanSheet({ code, onClose }: RoomScanSheetProps) {
  const router = useRouter();
  const { showNotification } = useNotification();
  const [status, setStatus] = useState<RoomScanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [issueMode, setIssueMode] = useState(false);
  const [issueText, setIssueText] = useState('');

  const user = typeof window !== 'undefined' ? getCurrentUser() : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/by-code/${encodeURIComponent(code)}/status`, {
        headers: { 'x-current-user-id': user?.id || '', 'x-current-user-role': (user as any)?.role || 'user' },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Không tải được trạng thái phòng'); return; }
      setStatus(json.data);
    } catch {
      setError('Lỗi kết nối khi tải trạng thái phòng');
    } finally {
      setLoading(false);
    }
  }, [code, user?.id]);

  useEffect(() => { load(); }, [load]);

  const doCheckIn = async (b: RoomBriefBooking) => {
    setActing(true);
    try {
      const res = await fetch(`/api/room-bookings/${b.id}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': user?.id || '' },
        body: JSON.stringify({ userName: user?.name || '' }),
      });
      const json = await res.json();
      if (!res.ok) { showNotification(json.error || 'Không thể nhận phòng', 'error'); return; }
      showNotification('Đã xác nhận nhận phòng ✓', 'success');
      onClose();
    } finally { setActing(false); }
  };

  const doCheckOut = async (b: RoomBriefBooking) => {
    setActing(true);
    try {
      const res = await fetch(`/api/room-bookings/${b.id}/check-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': user?.id || '' },
      });
      const json = await res.json();
      if (!res.ok) { showNotification(json.error || 'Không thể trả phòng', 'error'); return; }
      showNotification('Đã trả phòng ✓', 'success');
      onClose();
    } finally { setActing(false); }
  };

  const doExtend = async (b: RoomBriefBooking, minutes: number) => {
    setActing(true);
    try {
      const res = await fetch(`/api/room-bookings/${b.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': user?.id || '' },
        body: JSON.stringify({ minutes }),
      });
      const json = await res.json();
      if (!res.ok) { showNotification(json.error || 'Không thể gia hạn', 'error'); return; }
      showNotification(`Đã gia hạn tới ${json.newEnd} ✓`, 'success');
      load();
    } finally { setActing(false); }
  };

  const quickBook = () => {
    if (!status) return;
    onClose();
    router.push(`/room-bookings?bookRoom=${encodeURIComponent(status.room.name)}`);
  };

  const submitIssue = async () => {
    if (!status || !issueText.trim()) return;
    setActing(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': user?.id || '', 'x-current-user-role': (user as any)?.role || 'user' },
        body: JSON.stringify({
          title: `Sự cố phòng họp: ${status.room.name}`,
          description: `${issueText.trim()}\n\n— Báo từ QR phòng ${status.room.code}`,
          asset_code: status.room.code,
          asset_name: status.room.name,
          priority: 'high',
          status: 'open',
          support_category: 'Cơ sở vật chất',
          created_by: user?.id || '',
          created_by_name: user?.name || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) { showNotification(json.error || 'Không tạo được ticket', 'error'); return; }
      showNotification(`Đã gửi báo sự cố${json.code ? ` (${json.code})` : ''} ✓`, 'success');
      onClose();
    } finally { setActing(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'var(--card)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
              <DoorOpen className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-700 text-foreground truncate">
                {status?.room.name || 'Phòng họp'}
              </h2>
              <p className="text-2xs text-muted-foreground">{status?.room.code || code}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5 shrink-0"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <div className="flex flex-col items-center py-8 text-center">
              <AlertCircle className="h-9 w-9 text-red-400/70 mb-2" />
              <p className="text-sm text-foreground">{error}</p>
              <button onClick={load} className="btn-ghost rounded-xl px-4 py-2 text-sm mt-3">Thử lại</button>
            </div>
          ) : status ? (
            <>
              {/* Trạng thái hiện tại */}
              <div
                className={`rounded-2xl border px-4 py-3 ${
                  status.isBusy ? 'border-red-500/25 bg-red-500/5' : 'border-emerald-500/25 bg-emerald-500/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${status.isBusy ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
                  <p className={`text-sm font-600 ${status.isBusy ? 'text-red-400' : 'text-emerald-400'}`}>
                    {status.isBusy ? `Đang họp · trống lúc ${status.busyUntil}` : 'Đang trống'}
                  </p>
                  <span className="ml-auto text-2xs text-muted-foreground">Bây giờ {status.now}</span>
                </div>
                {!status.isBusy && status.nextFrom && (
                  <p className="text-2xs text-muted-foreground mt-1">Lịch kế tiếp lúc {status.nextFrom}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-2xs text-muted-foreground">
                  {status.room.capacity > 0 && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {status.room.capacity} chỗ</span>}
                  {status.room.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {status.room.location}</span>}
                </div>
              </div>

              {/* Hành động chính */}
              <div className="space-y-2.5">
                {status.checkInBooking && (
                  <button
                    onClick={() => doCheckIn(status.checkInBooking!)}
                    disabled={acting}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-3 text-sm font-600 transition-colors disabled:opacity-50"
                  >
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Xác nhận đã nhận phòng
                    <span className="opacity-80 font-400">({status.checkInBooking.start_time}–{status.checkInBooking.end_time})</span>
                  </button>
                )}
                {status.checkOutBooking && (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={() => doExtend(status.checkOutBooking!, 15)}
                        disabled={acting}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 py-2.5 text-sm font-600 transition-colors disabled:opacity-50"
                      >
                        <Timer className="h-4 w-4" /> +15′
                      </button>
                      <button
                        onClick={() => doExtend(status.checkOutBooking!, 30)}
                        disabled={acting}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 py-2.5 text-sm font-600 transition-colors disabled:opacity-50"
                      >
                        <Timer className="h-4 w-4" /> +30′
                      </button>
                    </div>
                    <button
                      onClick={() => doCheckOut(status.checkOutBooking!)}
                      disabled={acting}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 hover:bg-white/5 text-foreground py-3 text-sm font-600 transition-colors disabled:opacity-50"
                    >
                      {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      Trả phòng (kết thúc sớm)
                    </button>
                  </>
                )}
                {!status.checkInBooking && !status.checkOutBooking && (
                  <button
                    onClick={quickBook}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-sm font-600 transition-colors"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {status.isFreeNow ? 'Đặt nhanh phòng này' : 'Đặt phòng này (chọn giờ)'}
                  </button>
                )}
              </div>

              {/* Lịch hôm nay */}
              <div>
                <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-2">Lịch hôm nay</p>
                {status.todayBookings.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Chưa có lịch nào hôm nay.</p>
                ) : (
                  <div className="space-y-1.5">
                    {status.todayBookings.map(b => {
                      const mine = b.requested_by === user?.id;
                      return (
                        <div key={b.id} className="flex items-center gap-2.5 rounded-xl border border-white/5 px-3 py-2" style={{ background: 'var(--secondary)' }}>
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-600 text-foreground tabular-nums shrink-0">{b.start_time}–{b.end_time}</span>
                          <span className="text-xs text-muted-foreground truncate flex-1">{b.purpose || b.requested_by_name || '—'}</span>
                          {b.checked_in_at && !b.checked_out_at && <span className="text-2xs text-emerald-400 shrink-0">đang dùng</span>}
                          {mine && <span className="text-2xs text-indigo-400 shrink-0">của bạn</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Báo sự cố phòng → ticket */}
              <div className="border-t border-white/5 pt-3">
                {!issueMode ? (
                  <button
                    onClick={() => setIssueMode(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 hover:bg-white/5 text-muted-foreground hover:text-amber-400 py-2.5 text-sm font-500 transition-colors"
                  >
                    <Wrench className="h-4 w-4" /> Báo sự cố phòng (máy chiếu, điều hoà…)
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      rows={3}
                      value={issueText}
                      onChange={e => setIssueText(e.target.value)}
                      placeholder="Mô tả sự cố: máy chiếu không lên, điều hoà hỏng, thiếu dây HDMI…"
                      className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-ink-faint focus:outline-none focus:border-amber-500/60 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setIssueMode(false); setIssueText(''); }}
                        className="flex-1 rounded-xl border border-white/10 hover:bg-white/5 text-muted-foreground py-2.5 text-sm font-500 transition-colors"
                      >
                        Huỷ
                      </button>
                      <button
                        onClick={submitIssue}
                        disabled={acting || !issueText.trim()}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white py-2.5 text-sm font-600 transition-colors disabled:opacity-50"
                      >
                        {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi báo sự cố
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
