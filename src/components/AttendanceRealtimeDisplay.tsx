'use client';

import React from 'react';
import { useAttendanceRealtimeContext } from '@/context/AttendanceRealtimeContext';

const cn = (...classes: (string | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ');

/**
 * Component hiển thị attendance realtime
 * Dùng context, vì vậy phải wrap trong AttendanceRealtimeProvider
 *
 * Hiển thị:
 * - Status kết nối
 * - Sự kiện mới nhất
 * - Danh sách sự kiện gần đây (30 giây)
 */
export function AttendanceRealtimeDisplay() {
  const { connected, lastEvent, recentEvents, error } = useAttendanceRealtimeContext();

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      {/* Status */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'h-3 w-3 rounded-full',
            connected ? 'bg-green-500' : 'bg-red-500'
          )}
        />
        <span className="text-sm font-medium">
          {connected ? 'Đang kết nối' : 'Mất kết nối'}
        </span>
        {error && <span className="ml-auto text-xs text-red-500">{error}</span>}
      </div>

      {/* Sự kiện mới nhất */}
      {lastEvent && (
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
          <p className="text-xs text-ink-faint dark:text-ink-muted">Mới nhất</p>
          <p className="mt-1 font-semibold">
            {lastEvent.type === 'check_in' ? '✅ Điểm danh vào' : '🔚 Điểm danh ra'}
          </p>
          <p className="text-sm text-slate-700 dark:text-ink-bright">
            {lastEvent.user_name || lastEvent.user_id}
          </p>
          <p className="text-xs text-ink-faint dark:text-ink-muted">
            {new Date(lastEvent.recorded_at).toLocaleTimeString('vi-VN', {
              timeZone: 'Asia/Ho_Chi_Minh',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </div>
      )}

      {/* Danh sách gần đây */}
      {recentEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-ink-muted">
            Sự kiện gần đây
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {recentEvents.slice(0, 10).map((event, i) => (
              <div
                key={`${event.user_id}-${event.timestamp}-${i}`}
                className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span>
                  {event.type === 'check_in' ? '✅' : '🔚'} {event.user_name || event.user_id}
                </span>
                <span className="text-ink-faint dark:text-ink-muted">
                  {new Date(event.recorded_at).toLocaleTimeString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
