'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Loader2, Lock } from 'lucide-react';
import { includesVN } from '@/lib/utils/searchVN';

interface User {
  id: string;
  name: string;
}

interface AddCommentFormProps {
  onSubmit: (data: {
    content: string;
    is_internal: boolean;
    mentions?: string[];
  }) => Promise<void>;
  onCancel: () => void;
  users?: User[];
  loading?: boolean;
  placeholder?: string;
  submitLabel?: string;
}

export default function AddCommentForm({
  onSubmit,
  onCancel,
  users = [],
  loading = false,
  placeholder = 'Nhập bình luận... (gõ @ để mention người dùng)',
  submitLabel = 'Bình luận',
}: AddCommentFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mention dropdown state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearchTerm, setMentionSearchTerm] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);

  const validateForm = (): boolean => {
    if (!content.trim()) {
      setError('Nội dung không thể trống');
      return false;
    }
    return true;
  };

  // Extract mentions from content (for submission)
  const extractMentions = (text: string): string[] => {
    const mentions: string[] = [];

    // Pattern 1: @"Full Name with spaces"
    const quotedRegex = /@"([^"]+)"/g;
    let match;
    while ((match = quotedRegex.exec(text)) !== null) {
      const name = match[1].trim();
      const user = users.find((u) => u.name.toLowerCase() === name.toLowerCase());
      if (user?.id && !mentions.includes(user.id)) {
        mentions.push(user.id);
      }
    }

    // Pattern 2: @Word or @Word Word (match up to space, comma, dot, newline)
    const nameRegex = /@([a-zA-Zà-ỿ\s'\-]+?)(?=\s[a-z]|,|$|\.|\n|[^a-zA-Zà-ỿ\s'\-])/g;
    while ((match = nameRegex.exec(text)) !== null) {
      const name = match[1].trim();
      if (name.length < 2) continue;

      const user = users.find((u) => {
        const nameLower = u.name.toLowerCase();
        const searchLower = name.toLowerCase();
        return (
          nameLower === searchLower ||
          nameLower.includes(searchLower) ||
          searchLower.split(/\s+/).some(word => nameLower.includes(word))
        );
      });

      if (user?.id && !mentions.includes(user.id)) {
        mentions.push(user.id);
      }
    }

    return mentions;
  };

  // Handle textarea change - detect @ mentions
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    setContent(value);

    // Find text before cursor
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Extract search term from @ to cursor
      const searchTerm = textBeforeCursor.substring(lastAtIndex + 1);

      // Check if search term contains space (if so, no dropdown)
      if (!searchTerm.includes(' ')) {
        setMentionSearchTerm(searchTerm);

        // Filter users
        const filtered = users.filter((u) => includesVN(u.name, searchTerm));

        setFilteredUsers(filtered);
        setShowMentionDropdown(filtered.length > 0);
        setSelectedUserIndex(0);
      } else {
        setShowMentionDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
    }
  };

  // Handle mention selection
  const handleMentionSelect = (user: User) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = content.substring(0, cursorPos);
    const textAfterCursor = content.substring(cursorPos);

    // Find @ position
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex === -1) return;

    // Reconstruct with mention
    const beforeMention = textBeforeCursor.substring(0, lastAtIndex);
    const mentionText = `@"${user.name}" `;

    const newContent = beforeMention + mentionText + textAfterCursor;
    setContent(newContent);
    setShowMentionDropdown(false);

    // Move cursor after mention
    setTimeout(() => {
      const newPos = beforeMention.length + mentionText.length;
      textareaRef.current?.setSelectionRange(newPos, newPos);
      textareaRef.current?.focus();
    }, 0);
  };

  // Handle keyboard in dropdown
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentionDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedUserIndex((prev) =>
        (prev + 1) % filteredUsers.length
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedUserIndex((prev) =>
        prev === 0 ? filteredUsers.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredUsers.length > 0) {
        handleMentionSelect(filteredUsers[selectedUserIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowMentionDropdown(false);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowMentionDropdown(false);
    };

    if (showMentionDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMentionDropdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);
    setError(null);

    try {
      const mentions = extractMentions(content);

      await onSubmit({
        content: content.trim(),
        is_internal: isInternal,
        mentions,
      });

      setContent('');
      setIsInternal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi thêm bình luận');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 md:space-y-3 p-3 md:p-4 rounded-lg border border-line bg-hover">
      {error && (
        <div className="p-2.5 md:p-3 rounded text-sm bg-red-500/20 text-red-400">
          {error}
        </div>
      )}

      {/* Content Input - with mention dropdown */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            handleTextareaChange(e);
            if (error) setError(null);
          }}
          onKeyDown={handleTextareaKeyDown}
          onClickCapture={(e) => e.stopPropagation()}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 md:py-2 rounded-lg bg-hover border border-line text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 resize-none min-h-20 md:min-h-24"
          rows={3}
          disabled={submitting || loading}
          aria-label="Nội dung bình luận"
        />

        {/* Mention Dropdown */}
        {showMentionDropdown && filteredUsers.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-line rounded-lg shadow-lg z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-h-48 overflow-y-auto">
              {filteredUsers.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleMentionSelect(user)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                    index === selectedUserIndex
                      ? 'bg-indigo-500/30 text-indigo-200'
                      : 'text-foreground hover:bg-hover-strong'
                  }`}
                >
                  <span className="font-500">@{user.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      {users.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          💡 Gõ @ để mention: {users.slice(0, 3).map(u => `@${u.name}`).join(', ')}
          {users.length > 3 ? ', ...' : ''}
        </p>
      )}

      {/* Internal Toggle */}
      <div className="flex items-center gap-2.5 px-1">
        <input
          type="checkbox"
          id="is_internal"
          checked={isInternal}
          onChange={(e) => setIsInternal(e.target.checked)}
          className="w-5 h-5 md:w-4 md:h-4 rounded border-line bg-hover cursor-pointer"
          disabled={submitting || loading}
          aria-label="Chỉ cho phép nội bộ xem"
        />
        <label htmlFor="is_internal" className="text-sm font-500 text-muted-foreground cursor-pointer flex items-center gap-1">
          <Lock size={14} className="flex-shrink-0" />
          <span className="hidden sm:inline">Chỉ cho phép nội bộ xem</span>
          <span className="sm:hidden">Nội bộ</span>
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1 md:pt-2">
        <button
          type="submit"
          disabled={submitting || loading}
          className="flex-1 flex items-center justify-center gap-1.5 md:gap-2 px-3 py-2.5 md:py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-sm md:text-sm font-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-10 md:min-h-9"
          aria-label="Gửi bình luận"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin flex-shrink-0" />
              <span className="hidden sm:inline">Đang gửi...</span>
            </>
          ) : (
            <>
              <Plus size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">{submitLabel}</span>
              <span className="sm:hidden">Gửi</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting || loading}
          className="flex-1 flex items-center justify-center gap-1.5 md:gap-2 px-3 py-2.5 md:py-2 rounded-lg border border-line hover:border-line-strong hover:bg-hover active:bg-hover-strong text-sm md:text-sm font-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-10 md:min-h-9"
          aria-label="Hủy bình luận"
        >
          <X size={16} className="flex-shrink-0" />
          <span className="hidden sm:inline">Hủy</span>
        </button>
      </div>
    </form>
  );
}
