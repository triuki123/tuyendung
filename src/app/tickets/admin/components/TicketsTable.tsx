'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Eye, Edit2, Trash2, Loader2, Check, X, AlertTriangle, ChevronDown, Search, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { deleteTicket } from '@/lib/api-client';
import { Ticket } from '@/lib/types/ticket';
import { PRIORITY_CONFIG, STATUS_CONFIG, SORT_OPTIONS } from '@/lib/constants/ticketConstants';
import { normalizeVN } from '@/lib/utils/searchVN';
import { isCreatedToday, formatDaysAgo } from '@/lib/utils/dateUtils';
import { detectConflicts, type ConflictInfo } from '@/lib/services/ticketConflictService';
import { approveTicket, rejectTicket } from '@/lib/services/ticketActionService';
import TicketCard from './TicketCard';
import RejectReasonModal from './RejectReasonModal';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

interface TicketsTableProps {
  tickets: Ticket[];
  loading: boolean;
  onSelectTicket: (ticket: Ticket) => void;
  onTicketsChange: (tickets: Ticket[]) => void;
  currentUser: any;
  allUsers: any[];
  selectedTickets?: Set<string>;
  onSelectTicketsChange?: (ids: Set<string>) => void;
  /** Ẩn sticky search + chip filters (dùng khi wrapper đã có filter ngoài) */
  compact?: boolean;
}

export default function TicketsTable({
  tickets,
  loading,
  onSelectTicket,
  onTicketsChange,
  currentUser,
  allUsers,
  selectedTickets = new Set(),
  onSelectTicketsChange,
  compact = false,
}: TicketsTableProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [activeStatusFilters, setActiveStatusFilters] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Detect conflicts for all tickets
  const conflictMap = useMemo(() => {
    const map = new Map<string, ConflictInfo>();

    tickets.forEach(ticket => {
      const conflict = detectConflicts(tickets, ticket.id);
      if (conflict) {
        map.set(ticket.id, conflict);
      }
    });

    return map;
  }, [tickets]);

  // Sort tickets
  const sortedTickets = useMemo(() => {
    const sorted = [...tickets];

    switch (sortBy) {
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      case 'priority-high':
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return sorted.sort(
          (a, b) =>
            (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4) -
            (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4)
        );

      case 'priority-low':
        return sorted.sort(
          (a, b) =>
            (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4) -
            (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4)
        );

      case 'title-asc':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));

      case 'title-desc':
        return sorted.sort((a, b) => b.title.localeCompare(a.title));

      case 'newest':
      default:
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [tickets, sortBy]);

  // Filter by status and search
  const filteredTickets = useMemo(() => {
    let result = sortedTickets;

    // Filter by status
    if (activeStatusFilters.size > 0) {
      result = result.filter(t => activeStatusFilters.has(t.status));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = normalizeVN(searchQuery);
      result = result.filter(t =>
        normalizeVN(t.code).includes(query) ||
        normalizeVN(t.title).includes(query) ||
        normalizeVN(t.description).includes(query) ||
        normalizeVN(t.assigned_to_name || '').includes(query) ||
        normalizeVN(t.created_by_name).includes(query)
      );
    }

    return result;
  }, [sortedTickets, activeStatusFilters, searchQuery]);

  // Reset về trang 1 khi filter thay đổi
  React.useEffect(() => { setCurrentPage(1); }, [filteredTickets.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const pagedTickets = filteredTickets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSelectTicket = (ticketId: string) => {
    if (!onSelectTicketsChange) return;
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    onSelectTicketsChange(newSelected);
  };

  const handleSelectAll = () => {
    if (!onSelectTicketsChange) return;
    if (selectedTickets.size === filteredTickets.length) {
      onSelectTicketsChange(new Set());
    } else {
      onSelectTicketsChange(new Set(filteredTickets.map(t => t.id)));
    }
  };

  const handleDelete = async (ticket: Ticket) => {
    const ok = await confirm({ title: 'Xóa ticket?', message: `Xóa ticket ${ticket.code}?`, confirmLabel: 'Xóa', danger: true });
    if (!ok) return;

    try {
      setDeleting(ticket.id);
      await deleteTicket(ticket.id, {
        userId: currentUser?.id,
        userRole: currentUser?.role,
      });
      onTicketsChange(tickets.filter(t => t.id !== ticket.id));
    } catch (error: any) {
      toast.error(error.message || 'Không thể xóa ticket');
    } finally {
      setDeleting(null);
    }
  };

  const handleQuickApprove = async (ticket: Ticket) => {
    const ok = await confirm({ title: 'Duyệt ticket?', message: `Duyệt ticket ${ticket.code}?`, confirmLabel: 'Duyệt' });
    if (!ok) return;

    try {
      setApproving(ticket.id);
      const result = await approveTicket(ticket.id, currentUser?.id, currentUser?.role);

      if (result.success) {
        onTicketsChange(tickets.map(t => (t.id === ticket.id ? result.data : t)));
        toast.success(`Ticket ${ticket.code} được duyệt`);
      } else {
        toast.error(result.error || 'Không thể duyệt ticket');
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi server');
    } finally {
      setApproving(null);
    }
  };

  const handleQuickReject = async (ticket: Ticket) => {
    setShowRejectModal(true);
    setRejectReason('');
    // Store the single ticket to reject
    onSelectTicketsChange?.(new Set([ticket.id]));
  };

  const toggleStatusFilter = (status: string) => {
    const newFilters = new Set(activeStatusFilters);
    if (newFilters.has(status)) {
      newFilters.delete(status);
    } else {
      newFilters.add(status);
    }
    setActiveStatusFilters(newFilters);
  };

  const handleBulkApprove = async () => {
    if (selectedTickets.size === 0) return;
    const ok = await confirm({ title: 'Duyệt ticket?', message: `Duyệt ${selectedTickets.size} ticket?`, confirmLabel: 'Duyệt' });
    if (!ok) return;

    try {
      setBulkApproving(true);
      const selectedArray = Array.from(selectedTickets);
      const ticketsToApprove = filteredTickets.filter(t => selectedArray.includes(t.id));

      let successCount = 0;
      for (const ticket of ticketsToApprove) {
        const result = await approveTicket(ticket.id, currentUser?.id, currentUser?.role);
        if (result.success) successCount++;
      }

      if (successCount > 0) {
        onTicketsChange(tickets.map(t => {
          const updated = ticketsToApprove.find(tu => tu.id === t.id);
          return updated ? { ...t, status: 'resolved' as const } : t;
        }));
        onSelectTicketsChange?.(new Set());
        toast.success(`${successCount}/${selectedTickets.size} ticket được duyệt`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi server');
    } finally {
      setBulkApproving(false);
    }
  };

  const handleBulkReject = () => {
    if (selectedTickets.size === 0) return;
    setShowRejectModal(true);
    setRejectReason('');
  };

  const handleConfirmReject = async (reason: string) => {
    if (selectedTickets.size === 0) return;

    try {
      setBulkRejecting(true);
      const selectedArray = Array.from(selectedTickets);
      const ticketsToReject = filteredTickets.filter(t => selectedArray.includes(t.id));

      let successCount = 0;
      for (const ticket of ticketsToReject) {
        const result = await rejectTicket(ticket.id, currentUser?.id, currentUser?.role, reason || undefined);
        if (result.success) successCount++;
      }

      if (successCount > 0) {
        onTicketsChange(tickets.map(t => {
          const updated = ticketsToReject.find(tu => tu.id === t.id);
          return updated ? { ...t, status: 'closed' as const } : t;
        }));
        onSelectTicketsChange?.(new Set());
        toast.success(`${successCount}/${selectedTickets.size} ticket được từ chối`);
      }
      setShowRejectModal(false);
    } catch (error: any) {
      toast.error(error.message || 'Lỗi server');
    } finally {
      setBulkRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/05 p-8 flex items-center justify-center" style={{ background: 'var(--card)' }}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={32} className="text-indigo-400 animate-spin" />
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 md:pb-4">
      {!compact && (
        <>
          {/* Sticky Search Bar */}
          <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur -mx-4 px-4 py-3 sm:py-4 border-b border-line">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Tìm ticket... (TK-2026, tiêu đề, người giao)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 sm:py-3 rounded-lg bg-hover border border-line text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500 focus:bg-hover-strong transition-colors text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 rounded-lg bg-hover border border-line text-sm text-foreground hover:bg-hover-strong transition-colors"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-1 sticky top-[60px] md:top-[60px] z-20 bg-slate-900/95 backdrop-blur -mx-4 px-4 py-2 overflow-x-auto sm:relative sm:top-auto sm:z-auto sm:bg-transparent sm:backdrop-blur-none sm:mx-0 sm:px-0 sm:py-0">
              {Object.entries(STATUS_CONFIG).map(([status, config]) => {
                const count = tickets.filter(t => t.status === status).length;
                const isActive = activeStatusFilters.has(status);
                return (
                  <button
                    key={status}
                    onClick={() => toggleStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-full text-2xs font-600 transition-colors border flex-shrink-0 ${
                      isActive ? config.bg : 'bg-hover border-line text-muted-foreground hover:bg-hover-strong'
                    }`}
                  >
                    {config.label} ({count})
                  </button>
                );
              })}
            </div>

            {activeStatusFilters.size > 0 && (
              <button
                onClick={() => setActiveStatusFilters(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {filteredTickets.length === 0 ? (
        <div className="rounded-2xl border border-white/05 p-8 text-center" style={{ background: 'var(--card)' }}>
          <Inbox size={32} className="mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-2">
            {searchQuery ? 'Không tìm thấy ticket phù hợp' : activeStatusFilters.size > 0 ? 'Không tìm thấy ticket với bộ lọc này' : 'Không tìm thấy ticket nào'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Xóa tìm kiếm
            </button>
          )}
          {activeStatusFilters.size > 0 && (
            <button
              onClick={() => setActiveStatusFilters(new Set())}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors block mt-2"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 animate-in fade-in-50 duration-300">
            {pagedTickets.map(ticket => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                conflict={conflictMap.get(ticket.id)}
                isSelected={selectedTickets.has(ticket.id)}
                onSelect={onSelectTicket}
                onCheckboxChange={handleSelectTicket}
                onQuickApprove={handleQuickApprove}
                onQuickReject={handleQuickReject}
                onDelete={handleDelete}
                approving={approving === ticket.id}
                rejecting={rejecting === ticket.id}
                deleting={deleting === ticket.id}
              />
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block rounded-2xl border border-white/05 overflow-hidden animate-in fade-in-50 duration-300" style={{ background: 'var(--card)' }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/05 sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
                    <th className="text-left px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedTickets.size > 0 && selectedTickets.size === filteredTickets.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-line-strong accent-indigo-500 cursor-pointer"
                        title="Chọn tất cả"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Mã / Tiêu Đề</th>
                    <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ưu Tiên</th>
                    <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Trạng Thái</th>
                    <th className="hidden lg:table-cell text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">👤 Người Được Giao</th>
                    <th className="hidden lg:table-cell text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Khi Tạo</th>
                    <th className="text-right px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTickets.map(ticket => {
                    const p = PRIORITY_CONFIG[ticket.priority];
                    const s = STATUS_CONFIG[ticket.status];
                    const isSelected = selectedTickets.has(ticket.id);
                    const isToday = isCreatedToday(ticket.created_at);
                    const conflict = conflictMap.get(ticket.id);
                    const isApprovalPending = ticket.status === 'open' || ticket.status === 'in_progress';

                    return (
                      <tr
                        key={ticket.id}
                        className={`border-b border-white/04 last:border-0 transition-colors cursor-pointer ${
                          isSelected ? 'bg-indigo-500/10' : isToday ? 'bg-amber-500/10 border-l-2 border-amber-500' : 'hover:bg-white/02'
                        }`}
                        onClick={() => onSelectTicket(ticket)}
                      >
                        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectTicket(ticket.id)}
                            className="w-4 h-4 rounded border-line-strong accent-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-muted-foreground font-mono">{ticket.code}</p>
                          <p className="text-sm font-500 text-foreground mt-0.5 line-clamp-1">{ticket.title}</p>
                          {isToday && <p className="text-2xs text-amber-400 mt-1">⭐ Tạo hôm nay</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-600 border ${p.bg} ${p.color}`}>
                            {p.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-600 border ${s.bg} ${s.color}`}>
                              {s.label}
                            </span>
                            {conflict && (
                              <button
                                title={`Xung đột: ${conflict.conflictingWith.length} ticket khác`}
                                className="text-red-400 hover:text-red-300"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <AlertTriangle size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-3">
                          {ticket.assigned_to ? (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              <p className="text-sm font-500 text-foreground">{ticket.assigned_to_name}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Chưa giao</p>
                          )}
                        </td>
                        <td className="hidden lg:table-cell px-4 py-3">
                          <p className="text-xs text-muted-foreground">{formatDaysAgo(ticket.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {isApprovalPending && (
                              <>
                                <button
                                  onClick={() => handleQuickApprove(ticket)}
                                  disabled={approving === ticket.id}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                  title="Duyệt"
                                >
                                  {approving === ticket.id ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <Check size={16} />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleQuickReject(ticket)}
                                  disabled={rejecting === ticket.id}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                  title="Từ chối"
                                >
                                  {rejecting === ticket.id ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <X size={16} />
                                  )}
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => onSelectTicket(ticket)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-300 hover:bg-blue-500/20 transition-colors"
                              title="Xem"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => onSelectTicket(ticket)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-amber-300 hover:bg-amber-500/20 transition-colors"
                              title="Sửa"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(ticket)}
                              disabled={deleting === ticket.id}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              title="Xóa"
                            >
                              {deleting === ticket.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
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

      {/* Pagination */}
      {filteredTickets.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 pb-1">
          {/* Info + page size */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredTickets.length)} / {filteredTickets.length} ticket
            </span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="h-7 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60"
            >
              {[10, 15, 20, 50].map(n => (
                <option key={n} value={n}>{n} / trang</option>
              ))}
            </select>
          </div>

          {/* Page controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-xs text-muted-foreground hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              «
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>

            {/* Page numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | '...')[]>((acc, p, i, arr) => {
                if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="h-7 w-7 flex items-center justify-center text-xs text-muted-foreground">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p as number)}
                    className={`h-7 w-7 flex items-center justify-center rounded-lg text-xs font-600 transition-colors ${
                      currentPage === p
                        ? 'bg-indigo-600 text-white'
                        : 'text-muted-foreground hover:bg-hover'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-xs text-muted-foreground hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Action Bar (Mobile Only) - When tickets selected */}
      {selectedTickets.size > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/98 to-slate-900/95 backdrop-blur border-t border-indigo-500/30 px-4 py-4 space-y-3 z-40 animate-in slide-in-from-bottom-3 duration-300"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {/* Selection Info */}
          <div className="text-xs text-muted-foreground">
            <strong className="text-foreground">{selectedTickets.size}</strong> ticket được chọn
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleBulkApprove}
              disabled={bulkApproving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 font-600 text-sm"
            >
              {bulkApproving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Đang...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Đã Giải Quyết
                </>
              )}
            </button>
            <button
              onClick={handleBulkReject}
              disabled={bulkRejecting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50 font-600 text-sm"
            >
              {bulkRejecting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Đang...
                </>
              ) : (
                <>
                  <X size={16} />
                  Từ Chối
                </>
              )}
            </button>
          </div>

          {/* Clear Selection */}
          <button
            onClick={() => onSelectTicketsChange?.(new Set())}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Sticky Bottom Info Bar (Mobile Only) - When no selection */}
      {selectedTickets.size === 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-line px-4 py-3 text-xs text-muted-foreground"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {filteredTickets.length} ticket
        </div>
      )}

      {/* Reject Reason Modal */}
      <RejectReasonModal
        isOpen={showRejectModal}
        ticketCount={selectedTickets.size}
        onConfirm={handleConfirmReject}
        onCancel={() => setShowRejectModal(false)}
        isLoading={bulkRejecting}
      />
    </div>
  );
}
