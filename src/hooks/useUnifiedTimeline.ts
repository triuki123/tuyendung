'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TimelineEvent {
  id: string;
  event_type: 'comment' | 'status_change' | 'attachment' | 'watcher' | 'audit_event';
  ticket_id: string;
  user_id: string;
  actor_name: string;
  created_at: string;
  updated_at: string;
  entity_type: string;
  entity_id: string;
  content?: string;
  is_internal?: boolean;
  deleted_at?: string | null;
  mentions?: string[];
  old_value?: any;
  new_value?: any;
  metadata?: any;
}

interface UseUnifiedTimelineResult {
  events: TimelineEvent[];
  loading: boolean;
  error: string | null;
  total: number;
  has_more: boolean;
  eventFilter: string;
  setEventFilter: (filter: string) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useUnifiedTimeline(ticketId: string): UseUnifiedTimelineResult {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [has_more, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [eventFilter, setEventFilter] = useState('all');
  const limit = 50;

  const fetchTimeline = useCallback(
    async (pageOffset = 0, filter = 'all') => {
      try {
        setLoading(true);
        setError(null);

        let url = `/api/tickets/${ticketId}/timeline?limit=${limit}&offset=${pageOffset}`;
        if (filter !== 'all') {
          url += `&type=${filter}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch timeline');

        const data = await res.json();
        if (pageOffset === 0) {
          setEvents(data.events || []);
        } else {
          setEvents((prev) => [...prev, ...(data.events || [])]);
        }
        setTotal(data.total || 0);
        setHasMore(data.has_more || false);
        setOffset(pageOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [ticketId, limit]
  );

  useEffect(() => {
    fetchTimeline(0, eventFilter);
  }, [eventFilter, fetchTimeline]);

  const handleSetEventFilter = useCallback(
    (filter: string) => {
      setEventFilter(filter);
      setOffset(0);
    },
    []
  );

  const loadMore = useCallback(async () => {
    if (!has_more) return;
    await fetchTimeline(offset + limit, eventFilter);
  }, [offset, has_more, limit, eventFilter, fetchTimeline]);

  const refresh = useCallback(async () => {
    await fetchTimeline(0, eventFilter);
  }, [eventFilter, fetchTimeline]);

  return {
    events,
    loading,
    error,
    total,
    has_more,
    eventFilter,
    setEventFilter: handleSetEventFilter,
    loadMore,
    refresh,
  };
}
