'use client';

import { ArrowRight } from 'lucide-react';
import { TimelineEvent } from '@/hooks/useUnifiedTimeline';

interface TimelineStatusChangeProps {
  event: TimelineEvent;
}

export default function TimelineStatusChange({ event }: TimelineStatusChangeProps) {
  const oldStatus = event.old_value?.status || 'Không xác định';
  const newStatus = event.new_value?.status || 'Không xác định';

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
        <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
      </div>
      <div className="flex-1 py-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{event.actor_name}</span>
          <span className="text-sm text-muted-foreground">thay đổi trạng thái</span>
          <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-xs font-semibold">{oldStatus}</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-semibold">{newStatus}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(event.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>
      </div>
    </div>
  );
}
