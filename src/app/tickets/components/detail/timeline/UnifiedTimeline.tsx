'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useUnifiedTimeline, TimelineEvent } from '@/hooks/useUnifiedTimeline';
import TimelineComment from './TimelineComment';
import TimelineStatusChange from './TimelineStatusChange';
import TimelineAttachment from './TimelineAttachment';
import TimelineWatcher from './TimelineWatcher';
import TimelineAuditEvent from './TimelineAuditEvent';
import TimelineFilters from './TimelineFilters';
import { Clock } from 'lucide-react';

interface UnifiedTimelineProps {
  ticketId: string;
  userId: string;
}

export default function UnifiedTimeline({ ticketId, userId }: UnifiedTimelineProps) {
  const { events, loading, error, total, has_more, eventFilter, setEventFilter, loadMore } = useUnifiedTimeline(ticketId);
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && has_more && !loading) loadMore(); },
      { threshold: 0.1 }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [has_more, loading, loadMore]);

  const renderEvent = useCallback((event: TimelineEvent) => {
    switch (event.event_type) {
      case 'comment':
        return <TimelineComment key={event.id} event={event} userId={userId} ticketId={ticketId} />;
      case 'status_change':
        return <TimelineStatusChange key={event.id} event={event} />;
      case 'attachment':
        return <TimelineAttachment key={event.id} event={event} />;
      case 'watcher':
        return <TimelineWatcher key={event.id} event={event} />;
      default:
        return <TimelineAuditEvent key={event.id} event={event} />;
    }
  }, [userId, ticketId]);

  return (
    <div className="space-y-4">
      <TimelineFilters eventFilter={eventFilter} onFilterChange={setEventFilter} />

      {loading && events.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
          Đang tải timeline...
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có hoạt động nào</p>
        </div>
      )}

      <div className="space-y-3">
        {events.map(renderEvent)}
      </div>

      {has_more && (
        <div ref={observerTarget} className="flex justify-center py-4">
          {loading && <span className="text-sm text-muted-foreground">Đang tải thêm...</span>}
        </div>
      )}

      {!has_more && events.length > 0 && (
        <p className="text-center text-xs text-muted-foreground py-2">
          Tất cả {total} sự kiện
        </p>
      )}
    </div>
  );
}
