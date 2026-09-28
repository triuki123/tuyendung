'use client';

import { Paperclip, Download, Lock } from 'lucide-react';
import { TimelineEvent } from '@/hooks/useUnifiedTimeline';

interface TimelineAttachmentProps {
  event: TimelineEvent;
}

export default function TimelineAttachment({ event }: TimelineAttachmentProps) {
  const fileName = event.content || 'File';

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-indigo/15 border border-indigo/25 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Paperclip className="w-3.5 h-3.5 text-indigo" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold text-foreground">{event.actor_name}</span>
          <span className="text-sm text-muted-foreground">đính kèm tệp</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(event.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 bg-secondary rounded-xl border border-border hover:border-indigo/30 transition-colors group">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo/10 border border-indigo/20 flex items-center justify-center flex-shrink-0">
              <Paperclip className="w-3.5 h-3.5 text-indigo" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{fileName}</p>
              {event.is_internal && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <Lock className="w-2.5 h-2.5" /> Nội bộ
                </span>
              )}
            </div>
          </div>
          <button className="p-1.5 text-muted-foreground hover:text-indigo hover:bg-indigo/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
