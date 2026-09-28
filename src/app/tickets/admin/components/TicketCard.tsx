'use client';

import React, { useState, useRef } from 'react';
import { Eye, Edit2, Trash2, Check, X, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';
import { PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/constants/ticketConstants';
import { isCreatedToday, formatDaysAgo } from '@/lib/utils/dateUtils';
import { detectConflicts, type ConflictInfo } from '@/lib/services/ticketConflictService';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import UserAvatar from '@/components/UserAvatar';

interface TicketCardProps {
  ticket: Ticket;
  conflict?: ConflictInfo;
  isSelected?: boolean;
  onSelect?: (ticket: Ticket) => void;
  onCheckboxChange?: (ticketId: string, checked: boolean) => void;
  onQuickApprove?: (ticket: Ticket) => Promise<void>;
  onQuickReject?: (ticket: Ticket) => Promise<void>;
  onDelete?: (ticket: Ticket) => Promise<void>;
  approving?: boolean;
  rejecting?: boolean;
  deleting?: boolean;
}

const PRIORITY_DOT_COLORS = {
  critical: '#EF4444', // Red
  high: '#F97316',     // Orange
  medium: '#EAB308',   // Yellow
  low: '#6B7280',      // Gray
};

export default function TicketCard({
  ticket,
  conflict,
  isSelected = false,
  onSelect,
  onCheckboxChange,
  onQuickApprove,
  onQuickReject,
  onDelete,
  approving = false,
  rejecting = false,
  deleting = false,
}: TicketCardProps) {
  const p = PRIORITY_CONFIG[ticket.priority];
  const s = STATUS_CONFIG[ticket.status];
  const isToday = isCreatedToday(ticket.created_at);
  const isApprovalPending = ticket.status === 'open' || ticket.status === 'in_progress';
  const [expandedActions, setExpandedActions] = useState(false);

  const priorityDotColor = PRIORITY_DOT_COLORS[ticket.priority];
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeAction, setSwipeAction] = useState<'left' | 'right' | null>(null);

  // Swipe gesture handlers
  const { onTouchStart, onTouchEnd } = useSwipeGesture({
    onSwipeLeft: () => {
      if (isApprovalPending) {
        setSwipeAction('left');
        setTimeout(() => {
          onQuickReject?.(ticket);
          setSwipeAction(null);
        }, 150);
      }
    },
    onSwipeRight: () => {
      if (isApprovalPending) {
        setSwipeAction('right');
        setTimeout(() => {
          onQuickApprove?.(ticket);
          setSwipeAction(null);
        }, 150);
      }
    },
    threshold: 40,
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      ref={cardRef}
      className={`rounded-lg border transition-all duration-200 p-4 space-y-3 cursor-pointer relative overflow-hidden group ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20'
          : isToday
          ? 'border-amber-500/50 bg-amber-500/5 shadow-lg shadow-amber-500/10'
          : conflict
          ? 'border-red-500/50 bg-red-500/5 shadow-md shadow-red-500/10'
          : 'border-line bg-hover hover:border-line-strong hover:bg-white/8 shadow-sm'
      } ${swipeAction === 'right' ? 'bg-emerald-500/20 border-emerald-500' : ''} ${
        swipeAction === 'left' ? 'bg-red-500/20 border-red-500' : ''
      }`}
      onClick={() => onSelect?.(ticket)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Swipe Action Indicators */}
      {isApprovalPending && (
        <>
          {/* Swipe Right Indicator */}
          <div
            className={`absolute inset-0 left-0 right-auto rounded-lg bg-gradient-to-r from-emerald-500/20 to-transparent flex items-center justify-start pl-4 transition-all duration-300 pointer-events-none ${
              swipeAction === 'right' ? 'w-full' : 'w-0'
            }`}
          >
            <Check size={20} className="text-emerald-400" />
          </div>

          {/* Swipe Left Indicator */}
          <div
            className={`absolute inset-0 right-0 left-auto rounded-lg bg-gradient-to-l from-red-500/20 to-transparent flex items-center justify-end pr-4 transition-all duration-300 pointer-events-none ${
              swipeAction === 'left' ? 'w-full' : 'w-0'
            }`}
          >
            <X size={20} className="text-red-400" />
          </div>
        </>
      )}

      {/* Card Content */}
      <div className="relative z-10">
      {/* Header: Checkbox + Code + Priority Dot + Title */}
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="flex-shrink-0 pt-0.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onCheckboxChange?.(ticket.id, e.target.checked);
            }}
            className="w-4 h-4 rounded border-line-strong accent-indigo-500 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Priority Dot + Code + Title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {/* Priority Dot */}
            <div
              className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5"
              style={{ backgroundColor: priorityDotColor }}
              title={p.label}
            />

            {/* Code + Title */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground font-mono font-600">{ticket.code}</p>
                {isToday && <span className="text-2xs text-amber-400 font-600">⭐ HÔM NAY</span>}
                {conflict && (
                  <span
                    className="text-2xs text-red-400 font-600 flex items-center gap-1"
                    title={`Xung đột: ${conflict.conflictingWith.length} ticket khác`}
                  >
                    <AlertTriangle size={10} /> XUNG ĐỘT
                  </span>
                )}
              </div>
              <p className="text-sm font-600 text-foreground mt-1 line-clamp-2">{ticket.title}</p>
            </div>
          </div>
        </div>

        {/* Expand Button */}
        <button
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors pt-0.5"
          onClick={(e) => {
            e.stopPropagation();
            setExpandedActions(!expandedActions);
          }}
        >
          <ChevronRight size={16} className={`transition-transform ${expandedActions ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Meta Row: Priority Badge + Status Badge + Assignee + Date */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Priority Badge */}
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-600 border ${p.bg} ${p.color}`}>
          {p.label}
        </span>

        {/* Status Badge */}
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-600 border ${s.bg} ${s.color}`}>
          {s.label}
        </span>
      </div>

      {/* Description - Truncated */}
      {ticket.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
      )}

      {/* Info Row: Assignee + Date */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {ticket.assigned_to ? (
            <div className="flex items-center gap-2">
              <UserAvatar name={ticket.assigned_to_name || ''} size="sm" />
              <span className="text-foreground font-500 line-clamp-1 max-w-[120px]">
                {ticket.assigned_to_name || 'N/A'}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground italic">Chưa giao</span>
          )}
        </div>

        {/* Date */}
        <span className="text-muted-foreground">{formatDaysAgo(ticket.created_at)}</span>
      </div>

      {/* Actions - Quick Approve/Reject or All Actions */}
      <div className="space-y-2">
        {/* Quick Actions (Always visible on pending) */}
        {isApprovalPending && (
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickApprove?.(ticket);
              }}
              disabled={approving}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 text-xs font-600"
            >
              {approving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Đã Giải Quyết
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickReject?.(ticket);
              }}
              disabled={rejecting}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50 text-xs font-600"
            >
              {rejecting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              Từ Chối
            </button>
          </div>
        )}

        {/* All Actions (Expandable) */}
        {expandedActions && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line-subtle">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(ticket);
              }}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-300 hover:bg-blue-500/30 transition-colors text-2xs font-600"
              title="Xem"
            >
              <Eye size={12} />
              Xem
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(ticket);
              }}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30 transition-colors text-2xs font-600"
              title="Sửa"
            >
              <Edit2 size={12} />
              Sửa
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(ticket);
              }}
              disabled={deleting}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50 text-2xs font-600"
              title="Xóa"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Xóa
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
