'use client';

import { CheckCircle2, Circle, XCircle, Lock } from 'lucide-react';

export type TicketStatus = 'submitted' | 'in_progress' | 'completed' | 'rejected' | 'closed';

interface StatusFlowProps {
  currentStatus: TicketStatus;
}

const STEPS = [
  { key: 'submitted',   label: 'Đã gửi' },
  { key: 'in_progress', label: 'Đang xử lý' },
  { key: 'completed',   label: 'Đã hoàn thành' },
  { key: 'closed',      label: 'Đóng' },
] as const;

const STATUS_ORDER: Record<string, number> = {
  submitted: 0,
  open: 0,       // legacy map
  in_progress: 1,
  pending: 1,    // legacy map
  completed: 2,
  resolved: 2,   // legacy map
  closed: 3,
  rejected: -1,
};

export default function StatusFlow({ currentStatus }: StatusFlowProps) {
  const isRejected = currentStatus === 'rejected';
  const isClosed   = currentStatus === 'closed';
  // Normalize legacy values
  const statusStr = currentStatus as string;
  const normalizedStatus = statusStr === 'open' ? 'submitted'
    : statusStr === 'resolved' ? 'completed'
    : statusStr === 'pending' ? 'in_progress'
    : currentStatus;
  const currentIdx = STATUS_ORDER[statusStr] ?? 0;

  return (
    <div className="flex items-center gap-0">
      {isRejected ? (
        /* ── Trạng thái từ chối ── */
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/25 rounded-xl">
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-red-400">Đã từ chối</span>
        </div>
      ) : isClosed ? (
        /* ── Trạng thái đóng ── */
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 border border-slate-500/25 rounded-xl">
          <Lock className="w-4 h-4 text-ink-muted flex-shrink-0" />
          <span className="text-xs font-semibold text-ink-muted">Đã đóng</span>
        </div>
      ) : (
        /* ── Stepper bình thường ── */
        <div className="flex items-center">
          {STEPS.map((step, idx) => {
            const isDone    = idx < currentIdx;
            const isActive  = idx === currentIdx;
            const isPending = idx > currentIdx;

            return (
              <div key={step.key} className="flex items-center">
                {/* Step node */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isDone
                    ? 'text-emerald-400'
                    : isActive
                    ? 'bg-indigo/15 text-indigo border border-indigo/30'
                    : 'text-muted-foreground'
                }`}>
                  {isDone
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : isActive
                    ? <Circle className="w-3.5 h-3.5 fill-indigo/30" />
                    : <Circle className="w-3.5 h-3.5 opacity-30" />
                  }
                  {step.label}
                </div>

                {/* Connector */}
                {idx < STEPS.length - 1 && (
                  <div className={`w-6 h-px mx-1 ${isDone ? 'bg-emerald-500/40' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
