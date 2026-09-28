'use client';

import React, { createContext, useContext } from 'react';
import { useAttendanceRealtime, AttendanceEvent, AttendanceRealtimeState } from '@/hooks/useAttendanceRealtime';

interface AttendanceRealtimeContextType extends AttendanceRealtimeState {
  connect: () => void;
  disconnect: () => void;
}

const AttendanceRealtimeContext = createContext<AttendanceRealtimeContextType | undefined>(
  undefined
);

/**
 * Provider để chia sẻ attendance realtime state
 * Wrap ở layout top-level:
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <AttendanceRealtimeProvider>
 *       {children}
 *     </AttendanceRealtimeProvider>
 *   );
 * }
 */
export function AttendanceRealtimeProvider({ children }: { children: React.ReactNode }) {
  const state = useAttendanceRealtime();

  return (
    <AttendanceRealtimeContext.Provider value={state}>
      {children}
    </AttendanceRealtimeContext.Provider>
  );
}

/**
 * Hook để dùng attendance realtime state
 * const { connected, lastEvent, recentEvents } = useAttendanceRealtimeContext();
 */
export function useAttendanceRealtimeContext() {
  const context = useContext(AttendanceRealtimeContext);
  if (!context) {
    throw new Error('useAttendanceRealtimeContext must be used within AttendanceRealtimeProvider');
  }
  return context;
}

export type { AttendanceEvent };
