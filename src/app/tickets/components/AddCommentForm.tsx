'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Lock } from 'lucide-react';
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
}

export default function AddCommentForm({
  onSubmit,
  onCancel,
  users = [],
  loading = false,
  placeholder = 'Nhập bình luận... (gõ @ để mention người dùng)',
}: AddCommentFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mention dropdown state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearchTerm, setMentionSearchTerm] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);

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

  // Handle keyboard navigation in mention dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentionDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedUserIndex((i) => (i + 1) % filteredUsers.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedUserIndex((i) => (i - 1 + filteredUsers.length) % filteredUsers.length);
        break;
      case 'Enter':
        if (filteredUsers[selectedUserIndex]) {
          e.preventDefault();
          handleMentionSelect(filteredUsers[selectedUserIndex]);
        }
        break;
      case 'Escape':
        setShowMentionDropdown(false);
        break;
      default:
        break;
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

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError('Nội dung không thể trống');
      return;
    }

    setError(null);
    const mentions = extractMentions(content);
    await onSubmit({
      content,
      is_internal: isInternal,
      mentions,
    });
    setContent('');
    setIsInternal(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg bg-hover border border-line text-foreground placeholder-muted-foreground focus:border-indigo-500 focus:outline-none resize-none"
          rows={4}
          disabled={loading}
        />

        {/* Mention dropdown */}
        {showMentionDropdown && filteredUsers.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
            {filteredUsers.map((user, index) => (
              <button
                key={user.id}
                onClick={() => handleMentionSelect(user)}
                onMouseEnter={() => setSelectedUserIndex(index)}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  index === selectedUserIndex
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'text-foreground hover:bg-hover'
                }`}
              >
                {user.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            disabled={loading}
            className="w-4 h-4 rounded bg-hover-strong border border-line-strong checked:bg-indigo-500"
          />
          <Lock size={14} className="text-amber-400" />
          <span className="text-sm text-muted-foreground">Nội bộ</span>
        </label>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-line hover:bg-hover text-foreground text-sm transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Bình luận
          </button>
        </div>
      </div>
    </div>
  );
}
