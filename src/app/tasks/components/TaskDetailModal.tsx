'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Settings2, ListTodo, Clock, Loader2, AlertCircle, Heart, MessageSquare, Paperclip, Edit2, Trash2, Archive, RotateCcw, Ticket, ExternalLink, UserPlus, Users as UsersIcon } from 'lucide-react';
import SearchableSelect, { type SearchableOption } from '@/components/ui/SearchableSelect';
import {
  fetchTaskSubtasks,
  fetchTaskTimeEntries,
  deleteSubtask,
  updateSubtask,
  deleteTimeEntry,
  createSubtask,
  createTimeEntry,
  updateTask,
} from '@/lib/api-client';
import { TASK_STATUS_CONFIG } from '@/lib/constants/taskConstants';
import { useTaskRealtime } from '@/hooks/useTaskRealtime';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import SubtasksList from './SubtasksList';
import AddSubtaskForm from './AddSubtaskForm';
import TimeEntriesList from './TimeEntriesList';
import AddTimeEntryForm from './AddTimeEntryForm';
import FollowButton from './FollowButton';
import FollowersList from './FollowersList';
import CommentsList from './CommentsList';
import AddCommentForm from './AddCommentForm';
import AttachmentsList, { Attachment } from './AttachmentsList';

interface Task {
  id: string;
  code?: string;
  task_code?: string | null;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to: string;
  assigned_to_name: string;
  created_by: string;
  created_by_name?: string;
  ticket_id?: string | null;
  ticket_code?: string | null;
  ticket_title?: string | null;
  due_date: string;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  estimated_hours?: number;
  actual_hours?: number;
  related_asset?: string;
  co_assignees?: Array<{ user_id: string; user_name: string | null; role: string }>;
}

interface Subtask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to?: string;
  assigned_to_name?: string;
  due_date?: string;
  completion_percentage: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface TimeEntry {
  id: string;
  task_id: string;
  subtask_id?: string;
  user_id: string;
  user_name: string;
  duration_minutes: number;
  date_worked: string;
  description?: string;
  is_billable: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

interface Follower {
  user_id: string;
  user_name: string;
  avatar?: string;
  created_at: string;
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

type TabType = 'details' | 'subtasks' | 'time' | 'followers' | 'comments' | 'attachments';

interface TaskDetailModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdate?: (task: Task) => void;
  /** Đồng bộ trạng thái mới về danh sách mà KHÔNG đóng modal (khác onTaskUpdate). */
  onStatusChanged?: (task: Task) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  readOnly?: boolean;
  allUsers?: any[];
}

const TAB_BUTTONS: { key: TabType; icon: React.ReactNode; label: string }[] = [
  { key: 'details', icon: <Settings2 size={16} />, label: 'Chi Tiết' },
  { key: 'subtasks', icon: <ListTodo size={16} />, label: 'Subtasks' },
  { key: 'time', icon: <Clock size={16} />, label: 'Thời Gian' },
  { key: 'followers', icon: <Heart size={16} />, label: 'Theo Dõi' },
  { key: 'comments', icon: <MessageSquare size={16} />, label: 'Bình Luận' },
  { key: 'attachments', icon: <Paperclip size={16} />, label: 'Tệp' },
];

export default function TaskDetailModal({
  task,
  isOpen,
  onClose,
  onTaskUpdate,
  onStatusChanged,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  readOnly = false,
  allUsers = [],
}: TaskDetailModalProps) {
  useEscapeKey(onClose, isOpen);
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [status, setStatus] = useState<Task['status']>(task.status);
  const [statusUpdating, setStatusUpdating] = useState<Task['status'] | null>(null);
  const [coAssignees, setCoAssignees] = useState<Array<{ user_id: string; user_name: string | null; role: string }>>(task.co_assignees || []);
  const [coAssigneeBusy, setCoAssigneeBusy] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [showAddTimeEntry, setShowAddTimeEntry] = useState(false);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);

  const currentUserId = typeof window !== 'undefined' ? (() => {
    const currentUser = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        return JSON.parse(currentUser).id || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  })() : null;

  const currentUserName = typeof window !== 'undefined' ? (() => {
    const currentUser = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        return JSON.parse(currentUser).name || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  })() : null;

  const isManager = typeof window !== 'undefined' ? (() => {
    const currentUser = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        return JSON.parse(currentUser).role === 'manager';
      } catch (e) {
        return false;
      }
    }
    return false;
  })() : false;

  // Đường dẫn trang ticket theo role (admin/manager → /tickets/admin, còn lại → /tickets/user)
  const ticketsBasePath = () => {
    if (typeof window === 'undefined') return '/tickets/user';
    try {
      const auth = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
      const role = auth ? JSON.parse(auth).role : '';
      return role === 'super_admin' || role === 'admin' || role === 'manager'
        ? '/tickets/admin'
        : '/tickets/user';
    } catch {
      return '/tickets/user';
    }
  };

  // Load subtasks and time entries when tab opens or task changes
  useEffect(() => {
    if (isOpen) {
      loadTabData();
    }
  }, [isOpen, task.id]);

  // Đồng bộ status cục bộ khi mở task khác
  useEffect(() => {
    setStatus(task.status);
  }, [task.id, task.status]);

  // Đồng bộ danh sách đồng phụ trách khi task thay đổi (nhận từ props sau update).
  useEffect(() => {
    setCoAssignees(task.co_assignees || []);
  }, [task.id, task.co_assignees]);

  // Thêm đồng phụ trách
  const handleAddCoAssignee = async (userId: string) => {
    if (!userId || !currentUserId) return;
    if (coAssignees.some(c => c.user_id === userId)) return;
    setCoAssigneeBusy('add');
    try {
      const res = await fetch(`/api/tasks/${task.id}/assignees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': currentUserId },
        body: JSON.stringify({ user_id: userId, role: 'assignee' }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        throw new Error(j.error || 'Không thêm được đồng phụ trách');
      }
      const u = allUsers.find(x => x.id === userId);
      setCoAssignees(prev => [...prev, { user_id: userId, user_name: u?.name || null, role: 'assignee' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi thêm');
    } finally {
      setCoAssigneeBusy(null);
    }
  };

  // Gỡ đồng phụ trách
  const handleRemoveCoAssignee = async (userId: string) => {
    if (!currentUserId) return;
    setCoAssigneeBusy(userId);
    try {
      const res = await fetch(`/api/tasks/${task.id}/assignees/${userId}`, {
        method: 'DELETE',
        headers: { 'x-current-user-id': currentUserId },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Không gỡ được đồng phụ trách');
      }
      setCoAssignees(prev => prev.filter(c => c.user_id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi khi gỡ');
    } finally {
      setCoAssigneeBusy(null);
    }
  };

  // Options cho dropdown thêm — loại trừ primary + đã thêm
  const coAssigneeOptions: SearchableOption[] = (allUsers || [])
    .filter((u: any) => u.id !== task.assigned_to && !coAssignees.some(c => c.user_id === u.id))
    .map((u: any) => ({
      value: u.id,
      label: u.name || u.email || u.id,
      sublabel: u.email || undefined,
    }));

  // Đổi trạng thái task ngay trong modal, không đóng popup
  const handleStatusChange = async (newStatus: Task['status']) => {
    if (newStatus === status || statusUpdating) return;
    setStatusUpdating(newStatus);
    setError(null);
    try {
      const res = await updateTask(task.id, { ...task, status: newStatus });
      const updated = (res?.data ?? { ...task, status: newStatus }) as Task;
      setStatus(updated.status);
      onStatusChanged?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái');
    } finally {
      setStatusUpdating(null);
    }
  };

  // Realtime: subscribe SSE events — tự động reload khi có comment/follower/attachment mới
  useTaskRealtime(task.id, {
    onCommentAdded: () => loadTabData(),
    onFollowerAdded: () => loadTabData(),
    onAttachmentAdded: () => loadTabData(),
  });

  const loadTabData = async () => {
    try {
      setLoading(true);
      setError(null);

      const headers: Record<string, string> = currentUserId
        ? { 'x-current-user-id': currentUserId }
        : {};

      const [subtasksData, timeEntriesData, followersRes, commentsRes, attachmentsRes] = await Promise.all([
        fetchTaskSubtasks(task.id),
        fetchTaskTimeEntries(task.id),
        fetch(`/api/tasks/${task.id}/followers`, {
          headers,
        }).then(r => r.json()),
        fetch(`/api/tasks/${task.id}/comments`, {
          headers,
        }).then(r => r.json()),
        fetch(`/api/tasks/${task.id}/attachments`, {
          headers,
        }).then(r => r.json()),
      ]);

      setSubtasks(subtasksData || []);
      setTimeEntries(timeEntriesData || []);

      if (attachmentsRes.success) {
        setAttachments(attachmentsRes.data || []);
      }

      if (followersRes.success && followersRes.data) {
        setFollowers(followersRes.data.followers || []);
        setFollowerCount(followersRes.data.count || 0);
        // Check if current user is following
        const isUserFollowing = followersRes.data.followers?.some(
          (f: Follower) => f.user_id === currentUserId
        ) || false;
        setIsFollowing(isUserFollowing);
      }

      if (commentsRes.success) {
        setComments(commentsRes.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      console.error('Error loading tab data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubtask = async (subtask: Subtask) => {
    try {
      await deleteSubtask(task.id, subtask.id);
      setSubtasks(subtasks.filter((s) => s.id !== subtask.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subtask');
    }
  };

  const handleSubtaskStatusChange = async (subtask: Subtask, newStatus: Subtask['status']) => {
    try {
      await updateSubtask(task.id, subtask.id, { status: newStatus });
      setSubtasks(
        subtasks.map((s) =>
          s.id === subtask.id ? { ...s, status: newStatus } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subtask');
    }
  };

  const handleDeleteTimeEntry = async (entry: TimeEntry) => {
    try {
      await deleteTimeEntry(task.id, entry.id);
      setTimeEntries(timeEntries.filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete time entry');
    }
  };

  const handleToggleFollow = async (currentState: boolean) => {
    try {
      if (!currentUserId) {
        setError('Phải xác thực trước');
        return;
      }

      if (currentState) {
        // Remove follower - use api-client function with proper auth
        const { removeTaskFollower } = await import('@/lib/api-client');
        await removeTaskFollower(task.id, currentUserId);
      } else {
        // Add follower - use api-client function with proper auth
        const { addTaskFollower } = await import('@/lib/api-client');
        await addTaskFollower(task.id);
      }

      await loadTabData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update follow status');
    }
  };

  const handleAddComment = async (data: { content: string; is_internal: boolean; mentions?: string[] }) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id': currentUserId || '',
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to add comment');

      await loadTabData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    try {
      await fetch(`/api/tasks/${task.id}/comments/${comment.id}`, {
        method: 'DELETE',
        headers: { 'x-current-user-id': currentUserId || '' },
      });

      await loadTabData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment');
    }
  };

  const handleEditComment = (comment: Comment) => {
    setEditingComment(comment);
  };

  const handleEditCommentSubmit = async (data: { content: string; is_internal: boolean }) => {
    if (!editingComment) return;

    try {
      const res = await fetch(`/api/tasks/${task.id}/comments/${editingComment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id': currentUserId || '',
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to update comment');

      setEditingComment(null);
      await loadTabData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update comment');
    }
  };

  const handleRemoveFollower = async (userId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (currentUserId) {
        headers['x-current-user-id'] = currentUserId;
      }
      if (isManager) {
        headers['x-current-user-role'] = 'manager';
      }

      const res = await fetch(`/api/tasks/${task.id}/followers/${userId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        throw new Error('Failed to remove follower');
      }

      await loadTabData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove follower');
    }
  };

  const calculateCompletion = (subtasks: Subtask[]) => {
    if (subtasks.length === 0)
      return { total: 0, done: 0, percentage: 0 };

    const done = subtasks.filter((s) => s.status === 'done').length;
    const percentage = Math.round((done / subtasks.length) * 100);

    return { total: subtasks.length, done, percentage };
  };

  if (!isOpen) return null;

  const completion = calculateCompletion(subtasks);
  const timeSummary = timeEntries.reduce(
    (acc, entry) => ({
      total_hours: acc.total_hours + entry.duration_minutes / 60,
      billable_hours: acc.billable_hours + (entry.is_billable ? entry.duration_minutes / 60 : 0),
      entry_count: acc.entry_count + 1,
    }),
    { total_hours: 0, billable_hours: 0, entry_count: 0 }
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl border border-line bg-slate-900/95 overflow-hidden max-h-[90vh] md:max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-4 md:px-6 py-3 md:py-4 border-b border-line gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-700 text-foreground truncate md:text-lg">{task.title}</h2>
            {(task.task_code || task.code) && (
              <p className="text-xs text-indigo-400 mt-1 font-mono">
                📌 {task.task_code || task.code}
              </p>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {!readOnly && onEdit && (
              <button
                onClick={() => { onClose(); onEdit(); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-colors text-xs font-600"
                title="Sửa công việc"
              >
                <Edit2 size={13} /> <span className="hidden sm:inline">Sửa</span>
              </button>
            )}
            {!readOnly && (task.archived_at ? onUnarchive : onArchive) && (
              task.archived_at ? (
                <button
                  onClick={() => { onUnarchive?.(); onClose(); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 hover:bg-teal-500/25 transition-colors text-xs font-600"
                  title="Khôi phục"
                >
                  <RotateCcw size={13} /> <span className="hidden sm:inline">Khôi phục</span>
                </button>
              ) : (
                <button
                  onClick={() => { onArchive?.(); onClose(); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-500/15 border border-slate-500/30 text-ink-bright hover:bg-slate-500/25 transition-colors text-xs font-600"
                  title="Lưu trữ"
                >
                  <Archive size={13} /> <span className="hidden sm:inline">Lưu trữ</span>
                </button>
              )
            )}
            {!readOnly && onDelete && (
              <button
                onClick={() => { onDelete(); onClose(); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors text-xs font-600"
                title="Xóa công việc"
              >
                <Trash2 size={13} /> <span className="hidden sm:inline">Xóa</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-hover-strong rounded-lg transition-colors active:bg-white/20 ml-1"
              aria-label="Đóng"
            >
              <X size={20} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 md:px-6 py-2 md:py-3 border-b border-line bg-hover overflow-x-auto" role="tablist">
          {TAB_BUTTONS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-600 md:font-500 text-xs md:text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.key
                  ? 'bg-indigo-500 text-white'
                  : 'text-muted-foreground hover:bg-hover-strong active:bg-white/20'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 md:py-12">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin text-indigo-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Đang tải...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 md:p-6">
              <div className="flex items-start gap-2.5 md:gap-3 p-3 md:p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-red-400">{error}</p>
                  <button
                    onClick={loadTabData}
                    className="mt-2 text-xs px-3 py-1.5 md:py-1 rounded bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40 transition-colors"
                  >
                    Thử lại
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && (
            <div className="p-3 md:p-6 space-y-3 md:space-y-4">
              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Ưu tiên</p>
                      <p className="text-sm font-500 text-foreground">
                        {task.priority === 'low'
                          ? 'Thấp'
                          : task.priority === 'medium'
                          ? 'Trung bình'
                          : 'Cao'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Trạng thái</p>
                      <p className="text-sm font-500 text-foreground">
                        {TASK_STATUS_CONFIG[status]?.label ?? status}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Người giao</p>
                      <p className="text-sm font-500 text-foreground">
                        {task.created_by_name || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Phân công cho</p>
                      <p className="text-sm font-500 text-foreground">
                        {task.assigned_to_name || '—'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <UsersIcon size={12} /> Đồng phụ trách
                        {coAssignees.length > 0 && (
                          <span className="text-foreground/60">({coAssignees.length})</span>
                        )}
                      </p>
                      {coAssignees.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {coAssignees.map((c) => (
                            <span
                              key={c.user_id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs"
                            >
                              {c.user_name || c.user_id}
                              <button
                                type="button"
                                disabled={coAssigneeBusy === c.user_id}
                                onClick={() => handleRemoveCoAssignee(c.user_id)}
                                className="hover:text-white transition-colors disabled:opacity-50"
                                aria-label="Gỡ"
                              >
                                {coAssigneeBusy === c.user_id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <X size={12} />
                                )}
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground/70 italic mb-2">Chưa có đồng phụ trách</p>
                      )}
                      <div className="max-w-xs">
                        <SearchableSelect
                          options={coAssigneeOptions}
                          value={null}
                          onChange={(v) => v && handleAddCoAssignee(v)}
                          placeholder={coAssigneeBusy === 'add' ? 'Đang thêm...' : '+ Thêm đồng phụ trách'}
                          emptyText="Không còn ai để thêm"
                        />
                      </div>
                      <p className="text-2xs text-muted-foreground/60 mt-1.5">
                        Đồng phụ trách cũng nhận thông báo khi đổi trạng thái, bình luận, subtask mới.
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Hạn hoàn thành</p>
                      <p className="text-sm font-500 text-foreground">
                        {task.due_date ? new Date(task.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Ngày tạo</p>
                      <p className="text-sm font-500 text-foreground">
                        {task.created_at ? new Date(task.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Đổi trạng thái nhanh */}
                  {!readOnly && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Đổi trạng thái</p>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(TASK_STATUS_CONFIG) as Task['status'][]).map((key) => {
                          const cfg = TASK_STATUS_CONFIG[key];
                          const Icon = cfg.icon;
                          const isActive = status === key;
                          const isBusy = statusUpdating === key;
                          return (
                            <button
                              key={key}
                              onClick={() => handleStatusChange(key)}
                              disabled={!!statusUpdating}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-600 transition-colors disabled:opacity-50 ${
                                isActive
                                  ? `${cfg.bg} ${cfg.color}`
                                  : 'border-line text-muted-foreground hover:bg-hover hover:text-foreground'
                              }`}
                            >
                              {isBusy ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Icon size={13} className={isActive && key === 'in_progress' ? 'animate-spin' : ''} />
                              )}
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Mô tả</p>
                    <div className="p-3 rounded-lg bg-hover border border-line text-sm text-foreground">
                      {task.description || '—'}
                    </div>
                  </div>

                  {/* Ticket Hỗ Trợ liên quan — click để mở ticket */}
                  {task.ticket_id && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Ticket Hỗ Trợ liên quan</p>
                      <button
                        onClick={() => {
                          window.location.href = `${ticketsBasePath()}?ticketId=${task.ticket_id}`;
                        }}
                        className="w-full flex items-center justify-between gap-2 p-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors text-left group"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Ticket size={15} className="text-indigo-400 flex-shrink-0" />
                          <span className="min-w-0">
                            <span className="text-xs font-mono text-indigo-400">{task.ticket_code || task.ticket_id}</span>
                            {task.ticket_title && (
                              <span className="block text-sm text-foreground truncate">{task.ticket_title}</span>
                            )}
                          </span>
                        </span>
                        <ExternalLink size={14} className="text-muted-foreground group-hover:text-indigo-400 flex-shrink-0" />
                      </button>
                    </div>
                  )}

                  {task.estimated_hours || task.actual_hours ? (
                    <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                      <div>
                        <p className="text-xs text-indigo-400 mb-1">Giờ dự tính</p>
                        <p className="text-sm font-600 text-indigo-300">
                          {task.estimated_hours || '—'}h
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-indigo-400 mb-1">Giờ thực tế</p>
                        <p className="text-sm font-600 text-indigo-300">
                          {task.actual_hours || '—'}h
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Subtasks Tab */}
              {activeTab === 'subtasks' && (
                <div className="space-y-4">
                  {!showAddSubtask ? (
                    <SubtasksList
                      subtasks={subtasks}
                      completion={completion}
                      onDelete={handleDeleteSubtask}
                      onStatusChange={handleSubtaskStatusChange}
                      onAddNew={() => setShowAddSubtask(true)}
                      loading={loading}
                      canEdit={!readOnly}
                      canDelete={!readOnly}
                    />
                  ) : (
                    <AddSubtaskForm
                      onSubmit={async (data) => {
                        try {
                          await createSubtask(task.id, data);
                          setShowAddSubtask(false);
                          await loadTabData();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to create subtask');
                        }
                      }}
                      onCancel={() => setShowAddSubtask(false)}
                      users={allUsers}
                    />
                  )}
                </div>
              )}

              {/* Time Tracking Tab */}
              {activeTab === 'time' && (
                <div className="space-y-4">
                  {!showAddTimeEntry ? (
                    <TimeEntriesList
                      entries={timeEntries}
                      summary={timeSummary}
                      onDelete={handleDeleteTimeEntry}
                      onAddNew={() => setShowAddTimeEntry(true)}
                      loading={loading}
                      canEdit={!readOnly}
                      canDelete={!readOnly}
                    />
                  ) : (
                    <AddTimeEntryForm
                      onSubmit={async (data) => {
                        try {
                          await createTimeEntry(task.id, data);
                          setShowAddTimeEntry(false);
                          await loadTabData();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to create time entry');
                        }
                      }}
                      onCancel={() => setShowAddTimeEntry(false)}
                      subtasks={subtasks}
                    />
                  )}
                </div>
              )}

              {/* Followers Tab */}
              {activeTab === 'followers' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-600 text-foreground">Những người theo dõi</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {followerCount} người đang theo dõi task này
                      </p>
                    </div>
                    <FollowButton
                      taskId={task.id}
                      isFollowing={isFollowing}
                      onToggle={handleToggleFollow}
                      followerCount={followerCount}
                      size="md"
                      showCount={false}
                    />
                  </div>

                  <FollowersList
                    followers={followers}
                    loading={loading}
                    onRemove={handleRemoveFollower}
                    currentUserId={currentUserId || undefined}
                    isManager={isManager}
                  />
                </div>
              )}

              {/* Comments Tab */}
              {activeTab === 'comments' && (
                <>
                  {editingComment ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-3 md:px-0">
                        <h3 className="text-sm font-600 text-foreground">Sửa Bình Luận</h3>
                        <button
                          onClick={() => setEditingComment(null)}
                          className="text-xs px-2 py-1 rounded bg-hover-strong hover:bg-white/20 text-muted-foreground"
                        >
                          Hủy
                        </button>
                      </div>
                      <AddCommentForm
                        onSubmit={handleEditCommentSubmit}
                        onCancel={() => setEditingComment(null)}
                        users={allUsers}
                      />
                    </div>
                  ) : (
                    <CommentsList
                      comments={comments}
                      onAdd={handleAddComment}
                      onEdit={handleEditComment}
                      onDelete={handleDeleteComment}
                      users={allUsers}
                      currentUserId={currentUserId || undefined}
                      isManager={isManager}
                      canComment={!readOnly}
                      loading={loading}
                    />
                  )}
                </>
              )}

              {/* Attachments Tab */}
              {activeTab === 'attachments' && (
                <AttachmentsList
                  taskId={task.id}
                  attachments={attachments}
                  currentUserId={currentUserId || undefined}
                  currentUserName={currentUserName || undefined}
                  isManager={isManager}
                  canUpload={!readOnly}
                  loading={loading}
                  onChanged={loadTabData}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
