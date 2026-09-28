'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TicketWatcher {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  avatar?: string;
  watch_type: 'all' | 'comments' | 'status';
  muted: boolean;
  created_at: string;
}

interface UseTicketWatchersResult {
  watchers: TicketWatcher[];
  loading: boolean;
  error: string | null;
  isFollowing: boolean;
  follow: (watch_type?: string) => Promise<void>;
  unfollow: () => Promise<void>;
  toggleMute: (watcherId: string, muted: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTicketWatchers(ticketId: string, userId: string): UseTicketWatchersResult {
  const [watchers, setWatchers] = useState<TicketWatcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWatchers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/tickets/${ticketId}/watchers`);
      if (!res.ok) throw new Error('Failed to fetch watchers');

      const data = await res.json();
      setWatchers(data.watchers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchWatchers();
  }, [fetchWatchers]);

  const isFollowing = watchers.some((w) => w.user_id === userId);

  const follow = useCallback(
    async (watch_type = 'all') => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/watchers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'follow',
            watch_type,
            userId,
          }),
        });

        if (!res.ok) throw new Error('Failed to follow');
        const data = await res.json();
        setWatchers(data.watchers || []);
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to follow');
      }
    },
    [ticketId, userId]
  );

  const unfollow = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/watchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unfollow',
          userId,
        }),
      });

      if (!res.ok) throw new Error('Failed to unfollow');
      const data = await res.json();
      setWatchers(data.watchers || []);
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to unfollow');
    }
  }, [ticketId, userId]);

  const toggleMute = useCallback(
    async (watcherId: string, muted: boolean) => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/watchers/${watcherId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ muted }),
        });

        if (!res.ok) throw new Error('Failed to update watcher');
        const data = await res.json();

        setWatchers((prev) =>
          prev.map((w) => (w.id === watcherId ? data.watcher : w))
        );
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to update watcher');
      }
    },
    [ticketId]
  );

  const refresh = useCallback(async () => {
    await fetchWatchers();
  }, [fetchWatchers]);

  return {
    watchers,
    loading,
    error,
    isFollowing,
    follow,
    unfollow,
    toggleMute,
    refresh,
  };
}
