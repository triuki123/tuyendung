'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AuditEvent {
  id: string;
  ticket_id: string;
  event_type: string;
  actor_id: string;
  actor_name: string;
  old_value?: Record<string, any>;
  new_value?: Record<string, any>;
  related_entity_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

interface UseTicketAuditResult {
  events: AuditEvent[];
  loading: boolean;
  error: string | null;
  total: number;
  has_more: boolean;
  eventTypeFilter: string;
  actorFilter: string;
  setEventTypeFilter: (filter: string) => void;
  setActorFilter: (filter: string) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTicketAudit(ticketId: string): UseTicketAuditResult {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [has_more, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const limit = 100;

  const fetchAuditLog = useCallback(
    async (pageOffset = 0, typeFilter = '', actorId = '') => {
      try {
        setLoading(true);
        setError(null);

        let url = `/api/tickets/${ticketId}/audit-log?limit=${limit}&offset=${pageOffset}`;
        if (typeFilter) {
          url += `&type=${typeFilter}`;
        }
        if (actorId) {
          url += `&actor=${actorId}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch audit log');

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
    fetchAuditLog(0, eventTypeFilter, actorFilter);
  }, [eventTypeFilter, actorFilter, fetchAuditLog]);

  const handleSetEventTypeFilter = useCallback((filter: string) => {
    setEventTypeFilter(filter);
    setOffset(0);
  }, []);

  const handleSetActorFilter = useCallback((filter: string) => {
    setActorFilter(filter);
    setOffset(0);
  }, []);

  const loadMore = useCallback(async () => {
    if (!has_more) return;
    await fetchAuditLog(offset + limit, eventTypeFilter, actorFilter);
  }, [offset, has_more, limit, eventTypeFilter, actorFilter, fetchAuditLog]);

  const refresh = useCallback(async () => {
    await fetchAuditLog(0, eventTypeFilter, actorFilter);
  }, [eventTypeFilter, actorFilter, fetchAuditLog]);

  return {
    events,
    loading,
    error,
    total,
    has_more,
    eventTypeFilter,
    actorFilter,
    setEventTypeFilter: handleSetEventTypeFilter,
    setActorFilter: handleSetActorFilter,
    loadMore,
    refresh,
  };
}
