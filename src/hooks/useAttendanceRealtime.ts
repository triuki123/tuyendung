'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface AttendanceEvent {
  type: 'check_in' | 'check_out';
  user_id: string;
  user_name?: string;
  recorded_at: string;
  machine_id?: string;
  timestamp: number;
}

export interface AttendanceRealtimeState {
  connected: boolean;
  lastEvent: AttendanceEvent | null;
  recentEvents: AttendanceEvent[];
  error: string | null;
}

/**
 * Hook để lắng nghe attendance events realtime từ TCP proxy
 *
 * Usage:
 *   const { connected, lastEvent, recentEvents } = useAttendanceRealtime();
 *   if (lastEvent) {
 *     console.log(`${lastEvent.user_name} just ${lastEvent.type}`);
 *   }
 */
export function useAttendanceRealtime() {
  const [state, setState] = useState<AttendanceRealtimeState>({
    connected: false,
    lastEvent: null,
    recentEvents: [],
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const maxEventsRef = useRef(50);

  const connect = useCallback(() => {
    if (eventSourceRef.current) return; // Already connecting

    try {
      const eventSource = new EventSource('/api/events/attendance');

      eventSource.addEventListener('open', () => {
        console.log('[Realtime] Connected to attendance events');
        setState((prev) => ({ ...prev, connected: true, error: null }));
      });

      eventSource.addEventListener('message', (e) => {
        try {
          const message = JSON.parse(e.data);

          if (message.type === 'event') {
            const event = message.data as AttendanceEvent;
            console.log(
              `[Realtime] New event: ${event.type} by ${event.user_name || event.user_id}`
            );

            setState((prev) => ({
              ...prev,
              lastEvent: event,
              recentEvents: [event, ...prev.recentEvents].slice(0, maxEventsRef.current),
            }));
          } else if (message.type === 'history') {
            const events = message.data as AttendanceEvent[];
            console.log(`[Realtime] Received ${events.length} history events`);

            setState((prev) => ({
              ...prev,
              recentEvents: [...events, ...prev.recentEvents].slice(0, maxEventsRef.current),
              lastEvent: events[0] || prev.lastEvent,
            }));
          }
        } catch (err) {
          console.error('[Realtime] Parse error:', err);
        }
      });

      eventSource.addEventListener('error', () => {
        console.error('[Realtime] Connection error');
        setState((prev) => ({
          ...prev,
          connected: false,
          error: 'Connection lost. Reconnecting...',
        }));

        // Reconnect sau 3 giây
        setTimeout(() => {
          eventSource.close();
          eventSourceRef.current = null;
          connect();
        }, 3000);
      });

      eventSourceRef.current = eventSource;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Realtime] Connection failed:', err);
      setState((prev) => ({
        ...prev,
        error: `Failed to connect: ${errorMsg}`,
      }));

      // Retry sau 5 giây
      setTimeout(connect, 5000);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      console.log('[Realtime] Disconnected');
      setState((prev) => ({ ...prev, connected: false }));
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    // Mini-site /warehouse dùng auth riêng (công nhân không có phiên AssetFlow)
    // → không mở SSE, tránh spam lỗi kết nối.
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/warehouse')) return;
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
  };
}
