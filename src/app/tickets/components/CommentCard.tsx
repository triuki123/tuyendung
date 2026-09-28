'use client';

import React, { useState } from 'react';
import { Edit2, Trash2, Lock, Loader2 } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

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

interface CommentCardProps {
  comment: Comment;
  onEdit?: (comment: Comment) => void;
  onDelete?: (comment: Comment) => Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
}

export default function CommentCard({
  comment,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
  deleting = false,
}: CommentCardProps) {
  const [showActions, setShowActions] = useState(false);

  if (comment.deleted_at) {
    return (
      <div className="p-3 rounded-lg bg-hover border border-line italic text-muted-foreground text-sm">
        [Bình luận đã bị xóa]
      </div>
    );
  }

  return (
    <div
      className="p-3 md:p-4 rounded-lg border border-line bg-hover space-y-2"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 md:gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <UserAvatar name={comment.user_name} avatarUrl={comment.user_avatar} size="xs" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-600 text-foreground truncate">
                {comment.user_name}
              </p>
              {comment.is_internal && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
                  <Lock size={12} />
                  <span className="hidden sm:inline">Nội bộ</span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(comment.created_at).toLocaleString('vi-VN')}
            </p>
          </div>
        </div>

        {(showActions || deleting) && (canEdit || canDelete) && (
          <div className="flex gap-1 flex-shrink-0">
            {canEdit && (
              <button
                onClick={() => onEdit?.(comment)}
                disabled={deleting}
                className="p-1.5 text-amber-400 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
                title="Sửa"
              >
                <Edit2 size={14} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete?.(comment)}
                disabled={deleting}
                className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
                title="Xóa"
              >
                {deleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <p className="text-sm text-foreground whitespace-pre-wrap break-words">
        {comment.content}
      </p>

      {/* Edit indicator */}
      {comment.updated_at !== comment.created_at && (
        <p className="text-xs text-muted-foreground italic mt-1">
          (sửa: {new Date(comment.updated_at).toLocaleString('vi-VN')})
        </p>
      )}
    </div>
  );
}
