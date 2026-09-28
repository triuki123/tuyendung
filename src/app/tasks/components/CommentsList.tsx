'use client';

import React, { useState } from 'react';
import { Plus, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import CommentCard from './CommentCard';
import AddCommentForm from './AddCommentForm';

const PAGE_SIZE = 5;

interface Comment {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  content: string;
  is_internal: boolean;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  mentions?: string[];
}

interface User {
  id: string;
  name: string;
}

interface CommentsListProps {
  comments: Comment[];
  onAdd?: (data: any) => Promise<void>;
  onEdit?: (comment: Comment) => void;
  onDelete?: (comment: Comment) => Promise<void>;
  users?: User[];
  currentUserId?: string;
  isManager?: boolean;
  canComment?: boolean;
  loading?: boolean;
}

export default function CommentsList({
  comments,
  onAdd,
  onEdit,
  onDelete,
  users = [],
  currentUserId,
  isManager = false,
  canComment = true,
  loading = false,
}: CommentsListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Group comments into threads: root comments + nested replies (oldest-first)
  const rootComments = comments.filter((c) => !c.parent_id);
  const repliesByParent = comments.reduce<Record<string, Comment[]>>((acc, c) => {
    if (c.parent_id) {
      (acc[c.parent_id] ||= []).push(c);
    }
    return acc;
  }, {});
  Object.values(repliesByParent).forEach((list) =>
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  );

  const handleDelete = async (comment: Comment) => {
    setDeleting(comment.id);
    try {
      await onDelete?.(comment);
    } finally {
      setDeleting(null);
    }
  };

  const canEdit = (comment: Comment) => {
    return comment.user_id === currentUserId || isManager;
  };

  const canDelete = (comment: Comment) => {
    return comment.user_id === currentUserId || isManager;
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-hover rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Comment Count */}
      <div className="flex items-center gap-2 px-3 md:px-0">
        <MessageSquare size={16} className="text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-600 text-foreground">
          {comments.length} bình luận
        </span>
      </div>

      {/* Add Comment Form */}
      {canComment && (
        <div className="px-3 md:px-0">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 md:py-2 rounded-lg border border-line hover:border-indigo-500 hover:bg-indigo-500/10 transition-colors text-sm text-muted-foreground hover:text-foreground active:bg-indigo-500/20 md:active:bg-indigo-500/10"
              aria-label="Thêm bình luận mới"
            >
              <Plus size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Thêm bình luận</span>
              <span className="sm:hidden">Bình luận</span>
            </button>
          ) : (
            <AddCommentForm
              onSubmit={async (data) => {
                await onAdd?.(data);
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
              users={users}
            />
          )}
        </div>
      )}

      {/* Comments List (threaded) */}
      {comments.length === 0 ? (
        <div className="flex items-center justify-center py-6 md:py-8 text-muted-foreground">
          <span className="text-sm">Chưa có bình luận nào</span>
        </div>
      ) : (
        <div className="space-y-2 md:space-y-3 px-3 md:px-0">
          {rootComments.slice(0, visibleCount).map((comment) => {
            const replies = repliesByParent[comment.id] || [];
            return (
              <div key={comment.id} className="space-y-2">
                <CommentCard
                  comment={comment}
                  onEdit={onEdit}
                  onDelete={handleDelete}
                  onReply={() =>
                    setReplyingTo(replyingTo === comment.id ? null : comment.id)
                  }
                  canReply={canComment && !comment.deleted_at}
                  canEdit={canEdit(comment)}
                  canDelete={canDelete(comment)}
                  deleting={deleting === comment.id}
                />

                {/* Replies + reply form, indented under the root comment */}
                {(replies.length > 0 || replyingTo === comment.id) && (
                  <div className="ml-4 md:ml-6 pl-2 md:pl-3 border-l-2 border-line space-y-2">
                    {replies.map((reply) => (
                      <CommentCard
                        key={reply.id}
                        comment={reply}
                        onEdit={onEdit}
                        onDelete={handleDelete}
                        canEdit={canEdit(reply)}
                        canDelete={canDelete(reply)}
                        deleting={deleting === reply.id}
                      />
                    ))}

                    {replyingTo === comment.id && (
                      <AddCommentForm
                        placeholder={`Trả lời ${comment.user_name}...`}
                        submitLabel="Trả lời"
                        onSubmit={async (data) => {
                          await onAdd?.({ ...data, parent_id: comment.id });
                          setReplyingTo(null);
                        }}
                        onCancel={() => setReplyingTo(null)}
                        users={users}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more / collapse buttons */}
          {rootComments.length > PAGE_SIZE && (
            <div className="flex items-center justify-center pt-1">
              {visibleCount < rootComments.length ? (
                <button
                  onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-indigo-400 hover:bg-indigo-500/10 border border-line hover:border-indigo-500/40 transition-colors"
                >
                  <ChevronDown size={14} />
                  Xem thêm {Math.min(PAGE_SIZE, rootComments.length - visibleCount)} bình luận
                  <span className="text-muted-foreground">({rootComments.length - visibleCount} còn lại)</span>
                </button>
              ) : (
                <button
                  onClick={() => setVisibleCount(PAGE_SIZE)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-muted-foreground hover:bg-hover border border-line transition-colors"
                >
                  <ChevronUp size={14} />
                  Thu gọn
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
