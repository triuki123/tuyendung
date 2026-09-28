'use client';

import React, { useState, useEffect } from 'react';
import { isAdmin, isSuperAdmin } from '@/lib/authStore';
import { fetchTickets, createTicket, updateTicket, deleteTicket, fetchUsers } from '@/lib/api-client';
import { Ticket as TicketIcon, Plus, Search, Clock, CheckCircle, XCircle, Loader2, Eye, Edit2, Trash2 } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';
import { useToast } from '@/context/ToastContext';
import ErrorState from '@/components/ui/ErrorState';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'user';
  department: string;
}

const PRIORITY_CONFIG = {
  low: { label: 'Thấp', color: 'text-ink-muted', bg: 'bg-slate-500/15 border-slate-500/30' },
  medium: { label: 'Trung bình', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' },
  high: { label: 'Cao', color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
  critical: { label: 'Khẩn cấp', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' },
};

const STATUS_CONFIG = {
  open: { label: 'Mở', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/30', icon: <Clock size={12} /> },
  in_progress: { label: 'Đang xử lý', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30', icon: <Loader2 size={12} /> },
  resolved: { label: 'Đã giải quyết', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', icon: <CheckCircle size={12} /> },
  closed: { label: 'Đóng', color: 'text-ink-muted', bg: 'bg-slate-500/15 border-slate-500/30', icon: <XCircle size={12} /> },
  pending: { label: 'Chờ xử lý', color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30', icon: <Clock size={12} /> },
  rejected: { label: 'Từ chối', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30', icon: <XCircle size={12} /> },
};

interface TicketModalProps {
  ticket?: Ticket | null;
  mode: 'create' | 'view' | 'edit';
  currentUser: any;
  adminUsers: User[];
  onClose: () => void;
  onSave: (t: Ticket) => void;
}

function TicketModal({ ticket, mode, currentUser, adminUsers, onClose, onSave }: TicketModalProps) {
  const [form, setForm] = useState({
    title: ticket?.title ?? '',
    description: ticket?.description ?? '',
    asset_code: ticket?.asset_code ?? '',
    asset_name: ticket?.asset_name ?? '',
    priority: ticket?.priority ?? 'medium' as Ticket['priority'],
    status: ticket?.status ?? 'open' as Ticket['status'],
    assigned_to: ticket?.assigned_to ?? '',
    assigned_to_name: ticket?.assigned_to_name ?? '',
    support_category: ticket?.support_category ?? '',
  });

  const isReadOnly = mode === 'view';
  const canEditStatus = isAdmin(currentUser) || isSuperAdmin(currentUser);

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  const handleSave = () => {
    const now = new Date().toISOString();
    const saved: Ticket = {
      id: ticket?.id ?? `ticket-${Date.now()}`,
      code: ticket?.code ?? `TK-2026-${String(Date.now()).slice(-3)}`,
      title: form.title,
      description: form.description,
      asset_code: form.asset_code,
      asset_name: form.asset_name,
      priority: form.priority,
      status: form.status,
      created_by: ticket?.created_by ?? currentUser.id,
      created_by_name: ticket?.created_by_name ?? currentUser.name,
      assigned_to: form.assigned_to,
      assigned_to_name: form.assigned_to_name,
      support_category: form.support_category,
      created_at: ticket?.created_at ?? now,
      updated_at: now,
    };
    markClean();
    onSave(saved);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/08">
          <h2 className="text-lg font-700 text-foreground">
            {mode === 'create' ? 'Tạo Ticket Mới' : mode === 'edit' ? 'Chỉnh Sửa Ticket' : 'Chi Tiết Ticket'}
          </h2>
          <button onClick={guardedClose} className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground">
            <XCircle size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-500 text-foreground mb-1.5">Tiêu đề *</label>
            <input
              disabled={isReadOnly}
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
              placeholder="Mô tả ngắn gọn vấn đề..."
            />
          </div>
          <div>
            <label className="block text-sm font-500 text-foreground mb-1.5">Mô tả chi tiết</label>
            <textarea
              disabled={isReadOnly}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60 resize-none"
              placeholder="Mô tả chi tiết vấn đề cần hỗ trợ..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Mã tài sản</label>
              <input
                disabled={isReadOnly}
                value={form.asset_code}
                onChange={e => setForm(p => ({ ...p, asset_code: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                placeholder="AF-IT-2026-001"
              />
            </div>
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Tên tài sản</label>
              <input
                disabled={isReadOnly}
                value={form.asset_name}
                onChange={e => setForm(p => ({ ...p, asset_name: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                placeholder="Dell Latitude 5540"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Mức độ ưu tiên</label>
              <select
                disabled={isReadOnly}
                value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value as Ticket['priority'] }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
              >
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Cao</option>
                <option value="critical">Khẩn cấp</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Trạng thái</label>
              <select
                disabled={isReadOnly || !canEditStatus}
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value as Ticket['status'] }))}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
              >
                <option value="open">Mở</option>
                <option value="in_progress">Đang xử lý</option>
                <option value="resolved">Đã giải quyết</option>
                <option value="closed">Đóng</option>
              </select>
            </div>
          </div>
          {canEditStatus && (
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Phân công cho</label>
              <select
                disabled={isReadOnly}
                value={form.assigned_to}
                onChange={e => {
                  const u = adminUsers.find(u => u.id === e.target.value);
                  setForm(p => ({ ...p, assigned_to: e.target.value, assigned_to_name: u?.name ?? '' }));
                }}
                className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
              >
                <option value="">-- Chọn người xử lý --</option>
                {adminUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {!isReadOnly && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/08">
            <button onClick={guardedClose} className="h-9 px-5 rounded-xl btn-ghost text-sm font-500">Hủy</button>
            <button onClick={handleSave} disabled={!form.title} className="h-9 px-5 rounded-xl btn-accent text-sm font-600 disabled:opacity-50">
              {mode === 'create' ? 'Tạo Ticket' : 'Lưu Thay Đổi'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TicketsClient() {
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' | 'view' | 'edit'; ticket?: Ticket } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEscapeKey(() => setDeleteId(null), !!deleteId);

  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
  }, []);

  const loadData = React.useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setLoadError(false);
      const [ticketsData, usersData] = await Promise.all([
        fetchTickets({ userId: currentUser.id, userRole: currentUser.role }),
        fetchUsers(),
      ]);
      setTickets(ticketsData || []);
      setAdminUsers(usersData?.filter((u: User) => u.role === 'admin' || u.role === 'super_admin') || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!currentUser) return null;

  const canAdmin = isAdmin(currentUser) || isSuperAdmin(currentUser);

  const filtered = tickets.filter(t => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || t.status === statusFilter;
    const matchPriority = !priorityFilter || t.priority === priorityFilter;
    // Regular users see: tickets they created OR assigned to them
    // Admins see: all tickets
    const isCreator = t.created_by === currentUser?.id;
    const isAssigned = t.assigned_to === currentUser?.id;
    const matchUser = canAdmin || isCreator || isAssigned;
    return matchSearch && matchStatus && matchPriority && matchUser;
  });

  const handleSave = async (t: Ticket) => {
    try {
      if (t.id && tickets.find(x => x.id === t.id)) {
        // Update existing
        const updatedTicket = await updateTicket(t.id, {
          title: t.title,
          description: t.description,
          asset_code: t.asset_code,
          asset_name: t.asset_name,
          priority: t.priority,
          status: t.status,
          assigned_to: t.assigned_to,
          assigned_to_name: t.assigned_to_name,
          userId: currentUser?.id,
          userRole: currentUser?.role,
        });
        setTickets(prev => prev.map(x => x.id === t.id ? updatedTicket : x));
      } else {
        // Create new
        const newTicket = await createTicket({
          code: t.code,
          title: t.title,
          description: t.description,
          asset_code: t.asset_code,
          asset_name: t.asset_name,
          priority: t.priority,
          status: t.status,
          created_by: currentUser?.id,
          created_by_name: currentUser?.name,
          assigned_to: t.assigned_to,
          assigned_to_name: t.assigned_to_name,
        });
        setTickets(prev => [newTicket, ...prev]);
      }
      setModal(null);
    } catch (error: any) {
      console.error('Failed to save ticket:', error);
      const message = error.message || 'Không thể lưu ticket. Vui lòng thử lại.';
      toast.error(message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      await deleteTicket(id, {
        userId: currentUser?.id,
        userRole: currentUser?.role,
      });
      setTickets(prev => prev.filter(t => t.id !== id));
      setDeleteId(null);
    } catch (error: any) {
      console.error('Failed to delete ticket:', error);
      const message = error.message || 'Không thể xóa ticket. Vui lòng thử lại.';
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const stats = [
    { label: 'Tổng', value: filtered.length, color: 'text-foreground' },
    { label: 'Đang mở', value: filtered.filter(t => t.status === 'open').length, color: 'text-blue-400' },
    { label: 'Đang xử lý', value: filtered.filter(t => t.status === 'in_progress').length, color: 'text-amber-400' },
    { label: 'Khẩn cấp', value: filtered.filter(t => t.priority === 'critical').length, color: 'text-red-400' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Ticket Hỗ Trợ</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{filtered.length} ticket · {filtered.filter(t => t.status === 'open').length} đang mở</p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-600 btn-accent w-full sm:w-auto"
        >
          <Plus size={15} />
          Tạo Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {stats.map((s, i) => (
          <div key={i} className="rounded-2xl p-3 sm:p-4 border border-white/05" style={{ background: 'var(--card)' }}>
            <p className={`text-xl sm:text-2xl font-700 ${s.color}`}>{s.value}</p>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-3">
        <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm ticket..."
            className="w-full h-9 pl-9 pr-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="open">Mở</option>
          <option value="in_progress">Đang xử lý</option>
          <option value="resolved">Đã giải quyết</option>
          <option value="closed">Đóng</option>
        </select>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
          className="h-9 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none"
        >
          <option value="">Tất cả ưu tiên</option>
          <option value="low">Thấp</option>
          <option value="medium">Trung bình</option>
          <option value="high">Cao</option>
          <option value="critical">Khẩn cấp</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <ErrorState onRetry={loadData} />
      ) : (
      <>
      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/05 px-4 py-10 text-center" style={{ background: 'var(--card)' }}>
            <TicketIcon size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground">Không có ticket nào</p>
          </div>
        ) : (
          filtered.map(ticket => {
            const p = PRIORITY_CONFIG[ticket.priority];
            const s = STATUS_CONFIG[ticket.status];
            return (
              <div key={`mt-${ticket.id}`} className="rounded-2xl border border-white/05 p-4" style={{ background: 'var(--card)' }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-2xs text-muted-foreground font-mono">{ticket.code}</span>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-600 border ${s.bg} ${s.color}`}>
                      {s.icon}
                      {s.label}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-500 text-foreground mb-2 line-clamp-2">{ticket.title}</p>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-600 border ${p.bg} ${p.color}`}>{p.label}</span>
                  {ticket.asset_code && (
                    <span className="text-2xs font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">{ticket.asset_code}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/05">
                  <div className="min-w-0">
                    <p className="text-2xs text-muted-foreground/70">Người tạo</p>
                    <p className="text-xs text-foreground truncate">{ticket.created_by_name}</p>
                    <p className="text-2xs text-muted-foreground/60 mt-0.5">{ticket.created_at.split('T')[0]}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setModal({ mode: 'view', ticket })}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                      title="Xem"
                    >
                      <Eye size={15} />
                    </button>
                    {(canAdmin || ticket.created_by === currentUser?.id || ticket.assigned_to === currentUser?.id) && (
                      <button
                        onClick={() => setModal({ mode: 'edit', ticket })}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                        title="Sửa"
                      >
                        <Edit2 size={15} />
                      </button>
                    )}
                    {(canAdmin || ticket.created_by === currentUser?.id) && (
                      <button
                        onClick={() => setDeleteId(ticket.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                        title="Xóa"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Table (md+) */}
      <div className="hidden md:block rounded-2xl border border-white/05 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/05">
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Mã / Tiêu đề</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Tài sản</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ưu tiên</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Trạng thái</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Người tạo</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ngày tạo</th>
                <th className="text-right px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    <TicketIcon size={32} className="mx-auto mb-3 opacity-30" />
                    Không có ticket nào
                  </td>
                </tr>
              )}
              {filtered.map(ticket => {
                const p = PRIORITY_CONFIG[ticket.priority];
                const s = STATUS_CONFIG[ticket.status];
                return (
                  <tr key={ticket.id} className="border-b border-white/04 last:border-0 hover:bg-white/02 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted-foreground font-mono">{ticket.code}</p>
                      <p className="text-sm font-500 text-foreground mt-0.5 line-clamp-1">{ticket.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      {ticket.asset_code ? (
                        <div>
                          <p className="text-xs font-mono text-indigo-300">{ticket.asset_code}</p>
                          <p className="text-xs text-muted-foreground">{ticket.asset_name}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-600 border ${p.bg} ${p.color}`}>
                        {p.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-600 border ${s.bg} ${s.color}`}>
                        {s.icon}
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{ticket.created_by_name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{ticket.created_at.split('T')[0]}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModal({ mode: 'view', ticket })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-300 hover:bg-blue-500/15 transition-colors"
                          title="Xem"
                        >
                          <Eye size={14} />
                        </button>
                        {(canAdmin || ticket.created_by === currentUser?.id || ticket.assigned_to === currentUser?.id) && (
                          <button
                            onClick={() => setModal({ mode: 'edit', ticket })}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-300 hover:bg-amber-500/15 transition-colors"
                            title="Sửa"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {(canAdmin || ticket.created_by === currentUser?.id) && (
                          <button
                            onClick={() => setDeleteId(ticket.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-300 hover:bg-red-500/15 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Modals */}
      {modal && (
        <TicketModal
          ticket={modal.ticket}
          mode={modal.mode}
          currentUser={currentUser}
          adminUsers={adminUsers}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setDeleteId(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-line p-6" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-700 text-foreground mb-2">Xác nhận xóa</h3>
            <p className="text-sm text-muted-foreground mb-6">Bạn có chắc muốn xóa ticket này không?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} disabled={deleting} className="flex-1 h-9 rounded-xl btn-ghost text-sm disabled:opacity-50">Hủy</button>
              <button onClick={() => handleDelete(deleteId)} disabled={deleting} className="flex-1 h-9 rounded-xl btn-accent text-sm font-600 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">{deleting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xử lý...</> : 'Xóa'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
