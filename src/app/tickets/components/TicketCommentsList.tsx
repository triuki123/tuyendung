'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import CommentCard from './CommentCard';
import AddCommentForm from './AddCommentForm';

interface Comment {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  mentions?: string[];
}

interface TicketCommentsListProps {
  ticketId: string;
  currentUserId: string;
  currentUserRole: string;
  onCommentAdded?: () => void;
}

export default function TicketCommentsList({
  ticketId,
  currentUserId,
  currentUserRole,
  onCommentAdded,
}: TicketCommentsListProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load comments
  useEffect(() => {
    const loadComments = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/tickets/${ticketId}/comments`, {
          headers: {
            'x-current-user-id': currentUserId,
            'x-current-user-role': currentUserRole,
          },
        });

        if (!response.ok) throw new Error('Failed to load comments');
        const data = await response.json();
        setComments(data.data || []);
        setError(null);
      } catch (err) {
        console.error('Error loading comments:', err);
        setError('Lỗi khi tải bình luận');
      } finally {
        setLoading(false);
      }
    };

    loadComments();
  }, [ticketId, currentUserId, currentUserRole]);

  // Handle add comment
  const handleAddComment = async (data: {
    content: string;
    is_internal: boolean;
    mentions?: string[];
  }) => {
    try {
      setSubmitting(true);
      const response = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id': currentUserId,
          'x-current-user-name': currentUserRole,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Failed to add comment');
      const result = await response.json();
      setComments([result.data, ...comments]);
      onCommentAdded?.();
      setError(null);
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Lỗi khi thêm bình luận');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete comment
  const handleDeleteComment = async (comment: Comment) => {
    if (!confirm('Xác nhận xóa bình luận?')) return;

    try {
      setDeletingId(comment.id);
      const response = await fetch(
        `/api/tickets/${ticketId}/comments/${comment.id}`,
        {
          method: 'DELETE',
          headers: {
            'x-current-user-id': currentUserId,
            'x-current-user-role': currentUserRole,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to delete comment');
      setComments(comments.map((c) =>
        c.id === comment.id ? { ...c, deleted_at: new Date().toISOString() } : c
      ));
      setError(null);
    } catch (err) {
      console.error('Error deleting comment:', err);
      setError('Lỗi khi xóa bình luận');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add comment form */}
      <AddCommentForm
        onSubmit={handleAddComment}
        onCancel={() => {}}
        loading={submitting}
      />

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-4">
            Chưa có bình luận
          </p>
        ) : (
          comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              canEdit={comment.user_id === currentUserId}
              canDelete={
                comment.user_id === currentUserId ||
                currentUserRole === 'admin' ||
                currentUserRole === 'super_admin'
              }
              onDelete={handleDeleteComment}
              deleting={deletingId === comment.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
