'use client';

import { useState } from 'react';
import { Edit3, Trash2, Lock, AtSign } from 'lucide-react';
import { TimelineEvent } from '@/hooks/useUnifiedTimeline';
import { useTicketComments } from '@/hooks/useTicketComments';

interface TimelineCommentProps {
  event: TimelineEvent;
  userId: string;
  ticketId: string;
}

export default function TimelineComment({ event, userId, ticketId }: TimelineCommentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(event.content || '');
  const { editComment, deleteComment } = useTicketComments(ticketId, userId);
  const isAuthor = event.user_id === userId;

  const handleSave = async () => {
    try {
      await editComment(event.entity_id, editContent, event.mentions || []);
      setIsEditing(false);
    } catch {}
  };

  const handleDelete = async () => {
    if (confirm('Bạn chắc chắn muốn xóa bình luận này?')) {
      try { await deleteComment(event.entity_id); } catch {}
    }
  };

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-indigo/15 border border-indigo/25 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-bold text-indigo">
          {event.actor_name?.charAt(0).toUpperCase()}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold text-foreground">{event.actor_name}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(event.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
          {event.is_internal && (
            <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              <Lock className="w-2.5 h-2.5" /> Nội bộ
            </span>
          )}
          {isAuthor && (
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => setIsEditing(!isEditing)} className="p-1 text-muted-foreground hover:text-indigo rounded transition-colors">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleDelete} className="p-1 text-muted-foreground hover:text-red-400 rounded transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full p-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
            />
            <div className="flex gap-2">
              <button onClick={handleSave} className="px-3 py-1.5 bg-indigo text-white text-xs font-semibold rounded-lg hover:bg-indigo/90 transition-colors">
                Lưu
              </button>
              <button onClick={() => { setIsEditing(false); setEditContent(event.content || ''); }}
                className="px-3 py-1.5 bg-muted text-muted-foreground text-xs font-semibold rounded-lg hover:text-foreground transition-colors">
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-secondary rounded-xl border border-border p-3 group">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{event.content}</p>
            {event.mentions && event.mentions.length > 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-indigo">
                <AtSign className="w-3 h-3" />
                <span>{event.mentions.length} người được nhắc đến</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
