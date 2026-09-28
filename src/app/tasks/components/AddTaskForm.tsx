'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { XCircle, Loader, Ticket, X as XIcon, UserPlus } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import MoneyInput from '@/components/ui/MoneyInput';
import SearchableSelect, { type SearchableOption } from '@/components/ui/SearchableSelect';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

/**
 * Extended TaskFormData with world-standard form fields
 */
export interface TaskFormData {
  // Tab 1 — Thông Tin (Basic Information)
  title: string;
  description: string;
  task_type: 'Task' | 'Subtask' | 'Milestone' | 'Issue';
  complexity: 'Low' | 'Medium' | 'High' | 'Critical';
  related_asset: string;

  // Tab 2 — Tài Nguyên (Resources & Timeline)
  assigned_to: string;
  assigned_to_name: string;
  start_date: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  parent_task_id?: string;
  parent_task_title?: string;
  task_dependencies?: string[];

  // Tab 3 — Liên Kết (Links & Tracking)
  // Liên kết Ticket Hỗ Trợ (thay cho Dự Án cũ): task này phục vụ ticket nào.
  ticket_id?: string;
  estimated_hours: string | number;
  budget_amount: string | number;
  additional_assignees?: string[];
}

interface TicketOption {
  id: string;
  code: string;
  title: string;
  status?: string;
}

export interface AddTaskFormProps {
  task?: any;
  mode?: 'create' | 'view' | 'edit';
  currentUser: any;
  allUsers: any[];
  onSave: (data: any) => void;
  onClose: () => void;
  /** Khi tạo task TỪ một ticket: khóa sẵn ticket liên kết, không cho đổi. */
  lockedTicket?: { id: string; code?: string; title?: string } | null;
}

type TabType = 'info' | 'resources' | 'links';

export default function AddTaskForm({
  task,
  mode = 'create',
  currentUser,
  allUsers,
  onSave,
  onClose,
  lockedTicket = null,
}: AddTaskFormProps) {
  const initialData = task;
  const isReadOnly = mode === 'view';

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  const [form, setForm] = useState<TaskFormData>({
    // Tab 1
    title: initialData?.title ?? '',
    description: initialData?.description ?? '',
    task_type: initialData?.task_type ?? 'Task',
    complexity: initialData?.complexity ?? 'Medium',
    related_asset: initialData?.related_asset ?? '',

    // Tab 2
    assigned_to: initialData?.assigned_to ?? currentUser?.id ?? '',
    assigned_to_name: initialData?.assigned_to_name ?? currentUser?.name ?? '',
    start_date: initialData?.start_date ?? '',
    due_date: initialData?.due_date ?? '',
    priority: initialData?.priority ?? 'medium',
    status: initialData?.status ?? 'todo',
    parent_task_id: initialData?.parent_task_id ?? '',
    task_dependencies: initialData?.task_dependencies ?? [],

    // Tab 3
    ticket_id: lockedTicket?.id ?? initialData?.ticket_id ?? '',
    estimated_hours: initialData?.estimated_hours ?? '',
    budget_amount: initialData?.budget_amount ?? '',
    additional_assignees: initialData?.additional_assignees ?? [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [tickets, setTickets] = useState<TicketOption[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Fetch ticket list để chọn liên kết (bỏ qua nếu đã khóa sẵn ticket).
  useEffect(() => {
    if (lockedTicket) return;
    fetchTickets();
  }, [lockedTicket]);

  // Set default assigned_to to current user when creating new task
  useEffect(() => {
    if (mode === 'create' && !form.assigned_to && currentUser?.id) {
      setForm(prev => ({
        ...prev,
        assigned_to: currentUser.id,
        assigned_to_name: currentUser.name,
      }));
    }
  }, [currentUser?.id, mode]);

  const fetchTickets = async () => {
    if (!currentUser?.id) return;
    setLoadingTickets(true);
    try {
      const res = await fetch('/api/tickets', {
        headers: {
          'x-current-user-id': currentUser.id,
          'x-current-user-role': currentUser.role || 'employee',
        },
      });
      if (res.ok) {
        const json = await res.json();
        const list: any[] = Array.isArray(json) ? json : json.data || [];
        // Chỉ hiện ticket đang chờ hoặc đang xử lý — bỏ hoàn thành/hủy/đóng/lưu trữ.
        const OPEN_STATUSES = ['open', 'submitted', 'in_progress'];
        setTickets(
          list
            .filter(t => OPEN_STATUSES.includes(t.status))
            .map(t => ({ id: t.id, code: t.code, title: t.title, status: t.status }))
        );
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Tab 1 validation
    if (!form.title.trim()) {
      newErrors.title = 'Tiêu đề là bắt buộc';
    } else if (form.title.trim().length < 3) {
      newErrors.title = 'Tiêu đề phải có ít nhất 3 ký tự';
    }

    // Complexity validation
    if (form.complexity === 'Critical' && currentUser?.rank > 1) {
      newErrors.complexity = 'Chỉ Giám đốc mới có thể đặt độ phức tạp Cực kỳ';
    }

    // Task type validation
    if (form.task_type === 'Milestone' && currentUser?.rank > 2) {
      newErrors.task_type = 'Chỉ Quản lý và trên có thể tạo công việc Cột mốc';
    }

    // Related asset format validation
    if (form.related_asset && !form.related_asset.match(/^[A-Z]{2}-[A-Z]{2}-\d{4}-\d{3}$/)) {
      newErrors.related_asset = 'Format tài sản không đúng (ví dụ: AF-IT-2026-001)';
    }

    // Tab 2 validation
    if (!form.assigned_to) {
      newErrors.assigned_to = 'Người phụ trách là bắt buộc';
    }

    // Date validation
    if (form.start_date && form.due_date) {
      if (new Date(form.start_date) > new Date(form.due_date)) {
        newErrors.due_date = 'Hạn chót phải sau ngày bắt đầu';
      }
    }

    // Tab 3 validation
    if (form.estimated_hours) {
      const hours = parseFloat(form.estimated_hours.toString());
      if (isNaN(hours) || hours < 0) {
        newErrors.estimated_hours = 'Giờ ước tính phải là số dương';
      }
    }

    if (form.budget_amount) {
      const budget = parseFloat(form.budget_amount.toString());
      if (isNaN(budget) || budget < 0) {
        newErrors.budget_amount = 'Ngân sách phải là số dương';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      // Khi edit: đính kèm id và các field gốc không thay đổi để handleSave phân biệt create vs update
      const payload = mode === 'edit' && initialData?.id
        ? { ...initialData, ...form, id: initialData.id }
        : form;
      markClean();
      onSave(payload);
    } catch (error) {
      console.error('Form submission error:', error);
      setErrors({
        submit: error instanceof Error ? error.message : 'Lỗi lưu dữ liệu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const assignedUser = allUsers.find(u => u.id === form.assigned_to);

  // Options cho dropdown-search người phụ trách.
  // Đảm bảo currentUser luôn có trong danh sách (tránh label rỗng khi allUsers chưa load xong).
  const assigneeOptions: SearchableOption[] = useMemo(() => {
    const list = allUsers.length > 0 ? allUsers : (currentUser ? [currentUser] : []);
    const seen = new Set<string>();
    const opts: SearchableOption[] = [];
    // Thêm currentUser lên đầu nếu chưa có trong allUsers
    if (currentUser?.id && !list.find(u => u.id === currentUser.id)) {
      opts.push({
        value: currentUser.id,
        label: currentUser.name || currentUser.email || currentUser.id,
        sublabel: currentUser.email || undefined,
      });
      seen.add(currentUser.id);
    }
    for (const u of list) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      // Sublabel chỉ là email — KHÔNG đẩy department (UUID) hay manager_name ra.
      opts.push({
        value: u.id,
        label: u.name || u.email || u.id,
        sublabel: u.email || undefined,
      });
    }
    return opts;
  }, [allUsers, currentUser]);

  // Conditionally hide Tab 3 for Subtask
  const showTab3 = form.task_type !== 'Subtask';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-3xl rounded-3xl border border-line overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/08">
          <h2 className="text-lg font-700 text-foreground">{mode === 'edit' ? 'Sửa Công Việc' : 'Tạo Công Việc Mới'}</h2>
          <button
            onClick={guardedClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <XCircle size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/08 px-6">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-3 text-sm font-600 border-b-2 transition-colors ${
              activeTab === 'info'
                ? 'border-indigo text-indigo'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Thông Tin
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`px-4 py-3 text-sm font-600 border-b-2 transition-colors ${
              activeTab === 'resources'
                ? 'border-indigo text-indigo'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Tài Nguyên
          </button>
          {showTab3 && (
            <button
              onClick={() => setActiveTab('links')}
              className={`px-4 py-3 text-sm font-600 border-b-2 transition-colors ${
                activeTab === 'links'
                  ? 'border-indigo text-indigo'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Liên Kết
            </button>
          )}
        </div>

        {/* Form Content */}
        <form id="task-form" onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(100vh-300px)]">
          <div className="px-6 py-4 space-y-4">
            {/* TAB 1: THÔNG TIN */}
            {activeTab === 'info' && (
              <>
                {/* Tiêu đề */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">
                    Tiêu đề <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => {
                      setForm({ ...form, title: e.target.value });
                      if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
                    }}
                    placeholder="Nhập tiêu đề công việc"
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  />
                  {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
                </div>

                {/* Mô tả */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Mô tả</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Nhập mô tả chi tiết công việc"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  />
                </div>

                {/* Loại Công Việc */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Loại Công Việc</label>
                  <select
                    value={form.task_type}
                    onChange={(e) => setForm({ ...form, task_type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  >
                    <option value="Task">Công Việc</option>
                    <option value="Subtask">Công Việc Con</option>
                    <option value="Milestone">Cột Mốc</option>
                    <option value="Issue">Vấn Đề</option>
                  </select>
                  {errors.task_type && <p className="text-red-500 text-xs mt-1">{errors.task_type}</p>}
                </div>

                {/* Độ Phức Tạp */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Độ Phức Tạp</label>
                  <select
                    value={form.complexity}
                    onChange={(e) => setForm({ ...form, complexity: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  >
                    <option value="Low">Thấp</option>
                    <option value="Medium">Trung Bình</option>
                    <option value="High">Cao</option>
                    <option value="Critical">Cực Kỳ</option>
                  </select>
                  {errors.complexity && <p className="text-red-500 text-xs mt-1">{errors.complexity}</p>}
                </div>

                {/* Mã Tài Liệu */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Mã Tài Liệu Liên Quan</label>
                  <input
                    type="text"
                    value={form.related_asset}
                    onChange={(e) => setForm({ ...form, related_asset: e.target.value })}
                    placeholder="VD: AF-IT-2026-001"
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  />
                  {errors.related_asset && <p className="text-red-500 text-xs mt-1">{errors.related_asset}</p>}
                </div>
              </>
            )}

            {/* TAB 2: TÀI NGUYÊN */}
            {activeTab === 'resources' && (
              <>
                {/* Người Phụ Trách */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">
                    Người Phụ Trách <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    options={assigneeOptions}
                    value={form.assigned_to || null}
                    onChange={(val) => {
                      const user = allUsers.find(u => u.id === val);
                      setForm({ ...form, assigned_to: val || '', assigned_to_name: user?.name || '' });
                      if (errors.assigned_to) setErrors(prev => ({ ...prev, assigned_to: '' }));
                    }}
                    placeholder="-- Chọn người dùng --"
                    emptyText="Không tìm thấy người dùng"
                  />
                  {errors.assigned_to && <p className="text-red-500 text-xs mt-1">{errors.assigned_to}</p>}
                </div>

                {/* Người Đồng Phụ Trách (co-assignees) */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2 flex items-center gap-1.5">
                    <UserPlus size={14} className="text-muted-foreground" />
                    Người Đồng Phụ Trách
                  </label>
                  <SearchableSelect
                    options={assigneeOptions.filter(o =>
                      o.value !== form.assigned_to &&
                      !(form.additional_assignees || []).includes(o.value)
                    )}
                    value={null}
                    onChange={(val) => {
                      if (!val) return;
                      const next = [...(form.additional_assignees || []), val];
                      setForm({ ...form, additional_assignees: next });
                    }}
                    placeholder="+ Thêm đồng phụ trách"
                    emptyText="Không còn ai để thêm"
                  />
                  {(form.additional_assignees || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(form.additional_assignees || []).map((uid) => {
                        const u = allUsers.find(x => x.id === uid);
                        return (
                          <span
                            key={uid}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs"
                          >
                            {u?.name || uid}
                            <button
                              type="button"
                              onClick={() => setForm({
                                ...form,
                                additional_assignees: (form.additional_assignees || []).filter(x => x !== uid),
                              })}
                              className="hover:text-white transition-colors"
                              aria-label="Bỏ"
                            >
                              <XIcon size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Đồng phụ trách cũng nhận thông báo khi có cập nhật, bình luận hoặc subtask.
                  </p>
                </div>

                {/* Ngày Bắt Đầu */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Ngày Bắt Đầu</label>
                  <DateInputVN
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  />
                  {errors.start_date && <p className="text-red-500 text-xs mt-1">{errors.start_date}</p>}
                </div>

                {/* Hạn Chót */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Hạn Chót</label>
                  <DateInputVN
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  />
                  {errors.due_date && <p className="text-red-500 text-xs mt-1">{errors.due_date}</p>}
                </div>

                {/* Ưu Tiên */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Ưu Tiên</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung Bình</option>
                    <option value="high">Cao</option>
                  </select>
                </div>

                {/* Trạng Thái */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Trạng Thái</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  >
                    <option value="todo">Cần Làm</option>
                    <option value="in_progress">Đang Xử Lý</option>
                    <option value="done">Hoàn Thành</option>
                    <option value="cancelled">Hủy Bỏ</option>
                  </select>
                </div>

                {/* Công Việc Cha (Subtask only) */}
                {form.task_type === 'Subtask' && (
                  <div>
                    <label className="block text-sm font-600 text-foreground mb-2">Công Việc Cha</label>
                    <input
                      type="text"
                      value={form.parent_task_id}
                      onChange={(e) => setForm({ ...form, parent_task_id: e.target.value })}
                      placeholder="Nhập ID công việc cha"
                      className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                    />
                  </div>
                )}
              </>
            )}

            {/* TAB 3: LIÊN KẾT */}
            {activeTab === 'links' && showTab3 && (
              <>
                {/* Ticket Hỗ Trợ liên kết */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Ticket Hỗ Trợ liên quan</label>
                  {lockedTicket ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo/30 bg-indigo/10">
                      <Ticket size={15} className="text-indigo flex-shrink-0" />
                      <span className="text-sm text-foreground truncate">
                        <span className="font-mono text-indigo">{lockedTicket.code || lockedTicket.id}</span>
                        {lockedTicket.title ? ` — ${lockedTicket.title}` : ''}
                      </span>
                    </div>
                  ) : (
                    <select
                      value={form.ticket_id || ''}
                      onChange={(e) => setForm({ ...form, ticket_id: e.target.value })}
                      disabled={loadingTickets}
                      className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50 disabled:opacity-50"
                    >
                      <option value="">-- Không liên kết ticket --</option>
                      {tickets.map(t => (
                        <option key={t.id} value={t.id}>{t.code} — {t.title}</option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Gắn task này vào một ticket hỗ trợ nếu nó là một công đoạn để xử lý ticket đó.
                  </p>
                </div>

                {/* Giờ Ước Tính */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Giờ Ước Tính</label>
                  <input
                    type="number"
                    value={form.estimated_hours}
                    onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
                    placeholder="0"
                    step="0.5"
                    min="0"
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  />
                  {errors.estimated_hours && <p className="text-red-500 text-xs mt-1">{errors.estimated_hours}</p>}
                </div>

                {/* Ngân Sách */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-2">Ngân Sách</label>
                  <MoneyInput
                    value={form.budget_amount}
                    onValueChange={(n) => setForm({ ...form, budget_amount: n ? String(n) : '' })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-line bg-hover text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/50"
                  />
                  {errors.budget_amount && <p className="text-red-500 text-xs mt-1">{errors.budget_amount}</p>}
                </div>
              </>
            )}

            {/* Error message */}
            {errors.submit && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
                {errors.submit}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="border-t border-white/08 px-6 py-4 space-y-3">
          {/* Validation summary — chỉ hiện sau khi đã bấm submit lần đầu */}
          {Object.keys(errors).filter(k => k !== 'submit').length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
              <p className="text-xs font-600 text-red-400 mb-1.5">Vui lòng điền đầy đủ các trường bắt buộc:</p>
              <ul className="space-y-1">
                {errors.title && (
                  <li className="flex items-center gap-2 text-xs text-red-300">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span>{errors.title}</span>
                    <button type="button" onClick={() => setActiveTab('info')}
                      className="ml-auto text-red-400 underline underline-offset-2 hover:text-red-300 whitespace-nowrap">
                      → Tab Thông Tin
                    </button>
                  </li>
                )}
                {errors.assigned_to && (
                  <li className="flex items-center gap-2 text-xs text-red-300">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span>{errors.assigned_to}</span>
                    <button type="button" onClick={() => setActiveTab('resources')}
                      className="ml-auto text-red-400 underline underline-offset-2 hover:text-red-300 whitespace-nowrap">
                      → Tab Tài Nguyên
                    </button>
                  </li>
                )}
                {errors.task_type && (
                  <li className="flex items-center gap-2 text-xs text-red-300">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span>{errors.task_type}</span>
                    <button type="button" onClick={() => setActiveTab('info')}
                      className="ml-auto text-red-400 underline underline-offset-2 hover:text-red-300 whitespace-nowrap">
                      → Tab Thông Tin
                    </button>
                  </li>
                )}
                {errors.complexity && (
                  <li className="flex items-center gap-2 text-xs text-red-300">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span>{errors.complexity}</span>
                    <button type="button" onClick={() => setActiveTab('info')}
                      className="ml-auto text-red-400 underline underline-offset-2 hover:text-red-300 whitespace-nowrap">
                      → Tab Thông Tin
                    </button>
                  </li>
                )}
                {(errors.start_date || errors.due_date) && (
                  <li className="flex items-center gap-2 text-xs text-red-300">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span>{errors.start_date || errors.due_date}</span>
                    <button type="button" onClick={() => setActiveTab('resources')}
                      className="ml-auto text-red-400 underline underline-offset-2 hover:text-red-300 whitespace-nowrap">
                      → Tab Tài Nguyên
                    </button>
                  </li>
                )}
                {(errors.estimated_hours || errors.budget_amount) && (
                  <li className="flex items-center gap-2 text-xs text-red-300">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span>{errors.estimated_hours || errors.budget_amount}</span>
                    <button type="button" onClick={() => setActiveTab('links')}
                      className="ml-auto text-red-400 underline underline-offset-2 hover:text-red-300 whitespace-nowrap">
                      → Tab Liên Kết
                    </button>
                  </li>
                )}
                {errors.submit && (
                  <li className="flex items-center gap-2 text-xs text-red-300">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span>{errors.submit}</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={guardedClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-line text-foreground hover:bg-hover disabled:opacity-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              form="task-form"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-indigo text-white font-600 hover:bg-indigo/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  {mode === 'edit' ? 'Đang lưu...' : 'Đang tạo...'}
                </>
              ) : (
                mode === 'edit' ? 'Lưu Thay Đổi' : 'Tạo Công Việc'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
