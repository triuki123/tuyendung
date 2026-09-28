'use client';

import { useCallback, useEffect, useState } from 'react';

export interface MentionNotification {
  id: string;
  comment_id: string;
  mentioned_user_id: string;
  read_at?: string;
  created_at: string;
}

interface UseTicketMentionsResult {
  mentions: MentionNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (mentionId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTicketMentions(
  ticketId: string,
  userId: string
): UseTicketMentionsResult {
  const [mentions, setMentions] = useState<MentionNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMentions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch from timeline endpoint - mentions are included with comments
      const res = await fetch(`/api/tickets/${ticketId}/timeline?type=comment&limit=1000`);
      if (!res.ok) throw new Error('Failed to fetch mentions');

      const data = await res.json();
      // Extract mentions where current user is mentioned
      const userMentions: MentionNotification[] = [];
      const comments = data.events || [];

      comments.forEach((event: any) => {
        if (event.event_type === 'comment' && event.mentions?.includes(userId)) {
          userMentions.push({
            id: `${event.id}-${userId}`,
            comment_id: event.id,
            mentioned_user_id: userId,
            read_at: undefined,
            created_at: event.created_at,
          });
        }
      });

      setMentions(userMentions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [ticketId, userId]);

  useEffect(() => {
    fetchMentions();
  }, [fetchMentions]);

  const unreadCount = mentions.filter((m) => !m.read_at).length;

  const markAsRead = useCallback(
    async (mentionId: string) => {
      try {
        // In a real implementation, this would call an API endpoint
        // For now, update locally
        setMentions((prev) =>
          prev.map((m) =>
            m.id === mentionId
              ? { ...m, read_at: new Date().toISOString() }
              : m
          )
        );
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to mark as read');
      }
    },
    []
  );

  const markAllAsRead = useCallback(async () => {
    try {
      setMentions((prev) =>
        prev.map((m) => ({
          ...m,
          read_at: m.read_at || new Date().toISOString(),
        }))
      );
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to mark all as read');
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchMentions();
  }, [fetchMentions]);

  return {
    mentions,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  };
}
