'use client';

import { useState, useEffect } from 'react';
import { Send, Lock, AtSign } from 'lucide-react';
import { useTicketComments } from '@/hooks/useTicketComments';
import MentionDropdown from './MentionDropdown';

interface CommentEditorProps {
  ticketId: string;
  userId: string;
  onCommentAdded?: () => void;
}

export default function CommentEditor({ ticketId, userId, onCommentAdded }: CommentEditorProps) {
  const [content, setContent] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [isInternal, setIsInternal] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);

  const { addComment, loading, error } = useTicketComments(ticketId, userId);

  useEffect(() => {
    const atIndex = content.lastIndexOf('@', cursorPosition);
    if (atIndex !== -1) {
      const afterAt = content.substring(atIndex + 1, cursorPosition);
      if (/^\w*$/.test(afterAt)) {
        setMentionSearch(afterAt);
        setShowMentionDropdown(true);
      } else {
        setShowMentionDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
    }
  }, [content, cursorPosition]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setCursorPosition(e.target.selectionStart);
  };

  const handleAddMention = (mentionUserId: string, userName: string) => {
    const atIndex = content.lastIndexOf('@', cursorPosition);
    const newContent = `${content.substring(0, atIndex)}@${userName} ${content.substring(cursorPosition)}`;
    setContent(newContent);
    setMentions((prev) => prev.includes(mentionUserId) ? prev : [...prev, mentionUserId]);
    setShowMentionDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      await addComment(content, mentions, isInternal);
      setContent('');
      setMentions([]);
      setIsInternal(false);
      onCommentAdded?.();
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <textarea
          value={content}
          onChange={handleInputChange}
          placeholder="Thêm bình luận... (sử dụng @ để @mention)"
          className="w-full p-3 bg-input border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-colors"
          rows={3}
        />
        {showMentionDropdown && (
          <MentionDropdown
            search={mentionSearch}
            onSelect={handleAddMention}
            onClose={() => setShowMentionDropdown(false)}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs cursor-pointer group">
          <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
            isInternal ? 'bg-amber-500/20 border-amber-500/50' : 'bg-input border-border'
          }`}>
            {isInternal && <Lock className="w-2.5 h-2.5 text-amber-400" />}
          </div>
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="sr-only"
          />
          <span className={`font-semibold transition-colors ${isInternal ? 'text-amber-400' : 'text-muted-foreground group-hover:text-foreground'}`}>
            Nội bộ
          </span>
        </label>

        <div className="flex items-center gap-2">
          {mentions.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-indigo bg-indigo/10 px-2 py-1 rounded-lg border border-indigo/20">
              <AtSign className="w-3 h-3" />
              {mentions.length} mention
            </span>
          )}
          <button
            type="submit"
            disabled={!content.trim() || loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo text-white text-sm font-semibold rounded-lg hover:bg-indigo/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {loading ? 'Đang gửi...' : 'Gửi'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-xl">
          {error}
        </div>
      )}
    </form>
  );
}
