'use client';

import { CheckCircle2, Clock } from 'lucide-react';

interface ApprovalTimelineProps {
  ticket: any;
}

export default function ApprovalTimeline({ ticket }: ApprovalTimelineProps) {
  const approvalSteps = [
    { id: 1, label: 'Tạo', status: 'completed', date: ticket.created_at },
    { id: 2, label: 'Xử lý', status: ticket.status === 'in_progress' || ticket.status === 'resolved' ? 'completed' : 'pending' },
    { id: 3, label: 'Hoàn thành', status: ticket.status === 'resolved' || ticket.status === 'closed' ? 'completed' : 'pending' },
  ];

  return (
    <div className="bg-secondary rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Quy trình</h3>
      <div className="space-y-1">
        {approvalSteps.map((step, idx) => (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              {step.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Clock className="w-4 h-4 text-muted-foreground opacity-40" />
              )}
              {idx < approvalSteps.length - 1 && (
                <div className={`w-px h-6 mt-0.5 ${step.status === 'completed' ? 'bg-emerald-500/30' : 'bg-border'}`} />
              )}
            </div>
            <div className="pb-2">
              <p className={`text-sm font-semibold ${step.status === 'completed' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step.label}
              </p>
              {step.date && (
                <p className="text-xs text-muted-foreground">
                  {new Date(step.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
