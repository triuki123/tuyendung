'use client';

import React, { useState } from 'react';
import { X, Loader2, AlertCircle, Clock, CheckCircle2, Zap, Edit2, RotateCw, MessageSquare } from 'lucide-react';
import { updateTicket } from '@/lib/api-client';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import ActivityLog from './ActivityLog';
import Comments from './Comments';
import StatusHistory from './StatusHistory';
import FollowTicketButton from './FollowTicketButton';
import TicketExpensePanel from './TicketExpensePanel';
import { useToast } from '@/context/ToastContext';

interface Ticket {
  id: string;
  code: string;
  title: string;
  description: string;
  asset_code?: string;
  asset_name?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_by: string;
  created_by_name: string;
  assigned_to?: string;
  assigned_to_name?: string;
  support_category?: string;
  created_at: string;
  updated_at: string;
  followers?: string[]; // Array of user IDs following this ticket
}

interface TicketDetailPanelProps {
  ticket: Ticket;
  onClose: () => void;
  currentUser: any;
  onUpdate: (ticket: Ticket) => void;
  allUsers?: any[];
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Thấp', color: 'text-ink-muted' },
  medium: { label: 'Trung bình', color: 'text-amber-400' },
  high: { label: 'Cao', color: 'text-orange-400' },
  critical: { label: 'Khẩn cấp', color: 'text-red-400' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: 'Mở', color: 'text-blue-400' },
  in_progress: { label: 'Đang xử lý', color: 'text-amber-400' },
  resolved: { label: 'Đã giải quyết', color: 'text-emerald-400' },
  closed: { label: 'Đóng', color: 'text-ink-muted' },
};

export default function TicketDetailPanel({
  ticket,
  onClose,
  currentUser,
  onUpdate,
  allUsers = [],
}: TicketDetailPanelProps) {
  const toast = useToast();
  useEscapeKey(onClose);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    assigned_to: ticket.assigned_to || '',
  });

  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';
  const isCreator = currentUser?.id === ticket.created_by;
  const isAssigned = currentUser?.id === ticket.assigned_to;
  const canEdit = isAdmin || isCreator || isAssigned;
  const canReassign = isAdmin || isAssigned; // Only admins and assigned user can reassign

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const updated = await updateTicket(ticket.id, {
        ...form,
        userId: currentUser?.id,
        userRole: currentUser?.role,
      });
      onUpdate(updated);
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message || 'Không thể cập nhật ticket');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl overflow-y-auto" style={{ background: 'var(--card)' }}>
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-line z-10" style={{ background: 'var(--card)' }}>
          <div>
            <p className="text-xs text-muted-foreground font-mono">{ticket.code}</p>
            <h2 className="text-lg font-700 text-foreground mt-1">{ticket.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Quick Actions */}
          <div className="space-y-2">
            {isAdmin && !isEditing && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setForm(prev => ({ ...prev, status: 'in_progress' }))}
                  className="h-9 px-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-1.5 text-xs font-500"
                >
                  <Clock size={14} />
                  Xử lý
                </button>
                <button
                  onClick={() => setForm(prev => ({ ...prev, status: 'resolved' }))}
                  className="h-9 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5 text-xs font-500"
                >
                  <CheckCircle2 size={14} />
                  Xong
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="h-9 px-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 transition-colors flex items-center justify-center gap-1.5 text-xs font-500"
                >
                  <Edit2 size={14} />
                  Chỉnh sửa
                </button>
              </div>
            )}

            {/* Edit button for assigned users (non-admin) */}
            {isAssigned && !isAdmin && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="w-full h-9 px-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 transition-colors flex items-center justify-center gap-1.5 text-xs font-500"
              >
                <Edit2 size={14} />
                Chỉnh Sửa & Chuyển Giao
              </button>
            )}

            {/* Follow Button - Available for all users */}
            <FollowTicketButton
              ticketId={ticket.id}
              userId={currentUser?.id}
              followers={ticket.followers}
              className="w-full"
            />
          </div>

          {/* Status & Priority */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-600 text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <AlertCircle size={12} className="text-blue-400" />
                Trạng Thái
              </label>
              {isEditing ? (
                <select
                  value={form.status}
                  onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line"
                >
                  <option value="open">Mở</option>
                  <option value="in_progress">Đang xử lý</option>
                  <option value="resolved">Đã giải quyết</option>
                  <option value="closed">Đóng</option>
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  {getStatusIcon(ticket.status)}
                  <p className={`text-sm font-500 ${STATUS_CONFIG[ticket.status]?.color}`}>
                    {STATUS_CONFIG[ticket.status]?.label}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-600 text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Zap size={12} className="text-orange-400" />
                Độ Ưu Tiên
              </label>
              {isEditing ? (
                <select
                  value={form.priority}
                  onChange={e => setForm(prev => ({ ...prev, priority: e.target.value as any }))}
                  className="w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line"
                >
                  <option value="low">🟢 Thấp</option>
                  <option value="medium">🟡 Trung bình</option>
                  <option value="high">🟠 Cao</option>
                  <option value="critical">🔴 Khẩn cấp</option>
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  {getPriorityIcon(ticket.priority)}
                  <p className={`text-sm font-500 ${PRIORITY_CONFIG[ticket.priority]?.color}`}>
                    {PRIORITY_CONFIG[ticket.priority]?.label}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-600 text-muted-foreground mb-1.5">Mô Tả</label>
            {isEditing ? (
              <textarea
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm text-foreground bg-surface-2 border border-line resize-none"
              />
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-3 py-4 border-y border-line">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xs text-muted-foreground">Người Tạo</p>
                <p className="text-sm font-500 text-foreground mt-1">{ticket.created_by_name}</p>
              </div>
              <div>
                <p className="text-2xs text-muted-foreground">Danh Mục Hỗ Trợ</p>
                <p className="text-sm font-500 text-foreground mt-1">{ticket.support_category || '—'}</p>
              </div>
              <div>
                <p className="text-2xs text-muted-foreground">Ngày Tạo</p>
                <p className="text-sm font-500 text-foreground mt-1">{formatDate(ticket.created_at)}</p>
              </div>
              <div>
                <p className="text-2xs text-muted-foreground">Cập Nhật Lần Cuối</p>
                <p className="text-sm font-500 text-foreground mt-1">{formatDate(ticket.updated_at)}</p>
              </div>
            </div>

            {/* Assigned To */}
            <div className="pt-2 border-t border-line-subtle">
              <p className="text-2xs text-muted-foreground mb-2">Người Được Giao</p>
              {isEditing && canReassign ? (
                <select
                  value={form.assigned_to}
                  onChange={e => setForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line"
                >
                  <option value="">Không giao cho ai</option>
                  {allUsers?.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              ) : ticket.assigned_to ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-hover border border-line">
                  <div className="w-2 h-2 rounded-full" style={{ background: isAutoAssigned(ticket) ? '#60a5fa' : '#10b981' }} />
                  <span className="text-sm font-500 text-foreground">{ticket.assigned_to_name}</span>
                  {isAutoAssigned(ticket) && (
                    <span className="text-2xs text-blue-400 ml-auto bg-blue-500/10 px-2 py-0.5 rounded">
                      Auto (Danh Mục)
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-hover border border-dashed border-line text-muted-foreground">
                  <span className="text-sm">Chưa được giao</span>
                </div>
              )}
            </div>
          </div>

          {/* Dòng chảy: Chi phí gắn với ticket này */}
          <TicketExpensePanel ticketId={ticket.id} />

          {/* Status History */}
          <div>
            <h3 className="text-sm font-600 text-foreground mb-3 flex items-center gap-2">
              <Clock size={14} className="text-amber-400" />
              Lịch Sử Trạng Thái
            </h3>
            <StatusHistory ticketId={ticket.id} />
          </div>

          {/* Activity Log */}
          <ActivityLog ticket={ticket} />

          {/* Comments */}
          <Comments ticket={ticket} currentUser={currentUser} allUsers={allUsers} />

          {/* Edit Button */}
          {canEdit && (
            <div className="flex gap-2 pt-4">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 h-10 rounded-lg btn-primary text-sm font-600"
                >
                  Chỉnh Sửa
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 h-10 rounded-lg btn-accent text-sm font-600 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving && <Loader2 size={14} className="animate-spin" />}
                    Lưu
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 h-10 rounded-lg btn-ghost text-sm font-600"
                  >
                    Hủy
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper functions
function getStatusIcon(status: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    open: <AlertCircle size={16} className="text-blue-400" />,
    in_progress: <Clock size={16} className="text-amber-400" />,
    resolved: <CheckCircle2 size={16} className="text-emerald-400" />,
    closed: <CheckCircle2 size={16} className="text-ink-muted" />,
  };
  return icons[status] || <AlertCircle size={16} className="text-ink-muted" />;
}

function getPriorityIcon(priority: string): React.ReactNode {
  const colors: Record<string, string> = {
    low: 'text-emerald-400',
    medium: 'text-amber-400',
    high: 'text-orange-400',
    critical: 'text-red-400',
  };

  return (
    <div
      className={`w-2 h-2 rounded-full ${colors[priority] || 'text-ink-muted'}`}
      style={{
        backgroundColor: colors[priority]?.split('-')[0] === 'text' ? 'currentColor' : colors[priority],
      }}
    >
      <div
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: priority === 'critical' ? '#f87171' : priority === 'high' ? '#fb923c' : priority === 'medium' ? '#fbbf24' : '#10b981',
        }}
      />
    </div>
  );
}

function isAutoAssigned(ticket: any): boolean {
  // If assigned_to equals support_category, it's auto-assigned to the category
  return ticket.assigned_to === ticket.support_category && ticket.support_category !== null;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
