'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  mentions?: string[];
}

interface UseTicketCommentsResult {
  comments: TicketComment[];
  loading: boolean;
  error: string | null;
  total: number;
  has_more: boolean;
  addComment: (content: string, mentions: string[], is_internal?: boolean) => Promise<TicketComment>;
  editComment: (commentId: string, content: string, mentions: string[]) => Promise<TicketComment>;
  deleteComment: (commentId: string) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTicketComments(ticketId: string, userId: string): UseTicketCommentsResult {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [has_more, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchComments = useCallback(
    async (pageOffset = 0) => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/tickets/${ticketId}/comments?limit=${limit}&offset=${pageOffset}`
        );
        if (!res.ok) throw new Error('Failed to fetch comments');

        const data = await res.json();
        if (pageOffset === 0) {
          setComments(data.comments || []);
        } else {
          setComments((prev) => [...prev, ...(data.comments || [])]);
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
    fetchComments(0);
  }, [fetchComments]);

  const addComment = useCallback(
    async (content: string, mentions: string[], is_internal = false) => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            mentions,
            is_internal,
            userId,
          }),
        });

        if (!res.ok) throw new Error('Failed to create comment');
        const data = await res.json();
        const newComment = data.comment;

        setComments((prev) => [newComment, ...prev]);
        setTotal((prev) => prev + 1);
        return newComment;
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to add comment');
      }
    },
    [ticketId, userId]
  );

  const editComment = useCallback(
    async (commentId: string, content: string, mentions: string[]) => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/comments/${commentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            mentions,
            userId,
          }),
        });

        if (!res.ok) throw new Error('Failed to edit comment');
        const data = await res.json();
        const updated = data.comment;

        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? updated : c))
        );
        return updated;
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to edit comment');
      }
    },
    [ticketId, userId]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/comments/${commentId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });

        if (!res.ok) throw new Error('Failed to delete comment');

        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setTotal((prev) => prev - 1);
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to delete comment');
      }
    },
    [ticketId, userId]
  );

  const loadMore = useCallback(async () => {
    if (!has_more) return;
    await fetchComments(offset + limit);
  }, [offset, has_more, limit, fetchComments]);

  const refresh = useCallback(async () => {
    await fetchComments(0);
  }, [fetchComments]);

  return {
    comments,
    loading,
    error,
    total,
    has_more,
    addComment,
    editComment,
    deleteComment,
    loadMore,
    refresh,
  };
}
