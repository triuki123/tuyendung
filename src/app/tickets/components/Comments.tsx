'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';
import CommentCard from './CommentCard';
import AddCommentForm from './AddCommentForm';

interface User {
  id: string;
  name: string;
}

interface CommentsProps {
  ticket: Ticket;
  currentUser: any;
  allUsers?: User[];
}

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

export default function Comments({ ticket, currentUser, allUsers: initialUsers = [] }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>(initialUsers);

  useEffect(() => {
    const loadCommentsAndUsers = async () => {
      try {
        setLoading(true);

        // Fetch comments
        const commentsRes = await fetch(`/api/tickets/${ticket.id}/comments`, {
          headers: {
            'x-current-user-id': currentUser?.id || '',
            'x-current-user-role': currentUser?.role || 'user',
          },
        });
        if (!commentsRes.ok) throw new Error('Failed to load comments');
        const commentsData = await commentsRes.json();
        setComments(commentsData.data || []);

        // Fetch users for mention dropdown (if not already provided)
        if (initialUsers.length === 0) {
          const usersRes = await fetch('/api/tickets/assignable-users', {
            headers: {
              'x-current-user-id': currentUser?.id || '',
            },
          });
          if (usersRes.ok) {
            const usersData = await usersRes.json();
            // assignable-users returns array directly
            const rawList = Array.isArray(usersData) ? usersData : (usersData.data || []);
            const usersList = rawList.map((u: any) => ({
              id: u.id,
              name: u.name || u.email,
            }));
            setUsers(usersList);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Error loading comments:', err);
        setError('Lỗi khi tải bình luận');
      } finally {
        setLoading(false);
      }
    };
    loadCommentsAndUsers();
  }, [ticket.id, currentUser?.id, currentUser?.role, initialUsers.length]);

  const handleAddComment = async (data: { content: string; is_internal: boolean; mentions?: string[] }) => {
    try {
      setSubmitting(true);
      const response = await fetch(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id': currentUser?.id || '',
          'x-current-user-name': currentUser?.name || '',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to add comment');
      const result = await response.json();
      setComments([result.data, ...comments]);
      setError(null);
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Lỗi khi thêm bình luận');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    if (!confirm('Xác nhận xóa bình luận?')) return;
    try {
      setDeletingId(comment.id);
      const response = await fetch(`/api/tickets/${ticket.id}/comments/${comment.id}`, {
        method: 'DELETE',
        headers: {
          'x-current-user-id': currentUser?.id || '',
          'x-current-user-role': currentUser?.role || 'user',
        },
      });
      if (!response.ok) throw new Error('Failed to delete comment');
      setComments(comments.map((c) => c.id === comment.id ? { ...c, deleted_at: new Date().toISOString() } : c));
      setError(null);
    } catch (err) {
      console.error('Error deleting comment:', err);
      setError('Lỗi khi xóa bình luận');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-600 text-foreground flex items-center gap-2">
        <MessageCircle size={14} className="text-indigo-400" />
        Bình Luận
      </h3>
      <AddCommentForm onSubmit={handleAddComment} onCancel={() => {}} loading={submitting} users={users} />
      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-4">Chưa có bình luận</p>
        ) : (
          comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              canEdit={comment.user_id === currentUser?.id}
              canDelete={comment.user_id === currentUser?.id || currentUser?.role === 'admin' || currentUser?.role === 'super_admin'}
              onDelete={handleDeleteComment}
              deleting={deletingId === comment.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
