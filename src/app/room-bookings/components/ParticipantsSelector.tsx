'use client';

import { useState, useMemo, useCallback } from 'react';
import { Search, X, Users } from 'lucide-react';
import { includesVN } from '@/lib/utils/searchVN';

interface Participant {
  id: string;
  name: string;
  email?: string;
}

interface ParticipantsSelectorProps {
  selectedParticipants: Participant[];
  onAdd?: (participant: Participant) => void;
  onRemove?: (participantId: string) => void;
  onParticipantsChange?: (participants: Participant[]) => void;
  allUsers: Array<{ id: string; name: string; email: string }>;
  disabled?: boolean;
  /** Tùy biến label + placeholder để tái dụng (vd "Người nhận thông báo"). */
  label?: string;
  emptyText?: string;
  searchPlaceholder?: string;
}

export function ParticipantsSelector({
  selectedParticipants,
  onAdd,
  onRemove,
  onParticipantsChange,
  allUsers,
  disabled = false,
  label = 'Người Tham Dự',
  emptyText = 'Chưa chọn người tham dự',
  searchPlaceholder = 'Tìm kiếm người dùng...',
}: ParticipantsSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Filter users not already selected
  const availableUsers = useMemo(() => {
    const selectedIds = new Set(selectedParticipants.map(p => p.id));
    return allUsers.filter(
      user =>
        !selectedIds.has(user.id) &&
        (includesVN(user.name, searchQuery) || includesVN(user.email, searchQuery))
    );
  }, [allUsers, selectedParticipants, searchQuery]);

  const handleAddParticipant = useCallback((user: any) => {
    const newParticipant: Participant = {
      id: user.id,
      name: user.name,
      email: user.email,
    };
    if (onAdd) {
      onAdd(newParticipant);
    } else if (onParticipantsChange) {
      onParticipantsChange([...selectedParticipants, newParticipant]);
    }
    setSearchQuery('');
    setIsOpen(false);
  }, [onAdd, onParticipantsChange, selectedParticipants]);

  const handleRemoveParticipant = useCallback((participantId: string) => {
    if (onRemove) {
      onRemove(participantId);
    } else if (onParticipantsChange) {
      onParticipantsChange(selectedParticipants.filter(p => p.id !== participantId));
    }
  }, [onRemove, onParticipantsChange, selectedParticipants]);

  return (
    <div className="space-y-2">
      <label className="block text-2xs font-600 text-muted-foreground uppercase">{label}</label>

      {/* Selected Participants */}
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {selectedParticipants.length === 0 ? (
          <div className="flex items-center gap-2 text-2xs text-muted-foreground/60 py-1.5">
            <Users size={14} />
            <span>{emptyText}</span>
          </div>
        ) : (
          selectedParticipants.map(participant => (
            <div
              key={participant.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/50 text-2xs text-foreground group"
            >
              <span className="truncate max-w-[100px]">{participant.name}</span>
              <button
                onClick={() => handleRemoveParticipant(participant.id)}
                disabled={disabled}
                className="ml-1 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Search & Dropdown */}
      <div className="relative">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-line focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-colors">
          <Search size={14} className="text-muted-foreground/60" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            disabled={disabled}
            className="flex-1 text-2xs bg-transparent border-0 text-foreground placeholder-muted-foreground/50 focus:outline-none"
          />
        </div>

        {/* Dropdown List */}
        {isOpen && availableUsers.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 border border-line rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto backdrop-blur-sm">
            {availableUsers.map(user => (
              <button
                key={user.id}
                onClick={() => handleAddParticipant(user)}
                disabled={disabled}
                className="w-full text-left px-3 py-2 text-2xs hover:bg-hover-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-b border-line-subtle last:border-0"
                type="button"
              >
                <div className="font-500 text-foreground">{user.name}</div>
                <div className="text-muted-foreground/70 truncate">{user.email}</div>
              </button>
            ))}
          </div>
        )}

        {isOpen && searchQuery && availableUsers.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 border border-line rounded-lg shadow-lg z-50 p-3">
            <p className="text-2xs text-muted-foreground text-center">Không tìm thấy người dùng</p>
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
