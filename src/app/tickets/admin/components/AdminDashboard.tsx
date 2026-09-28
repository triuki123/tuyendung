'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePersistentView } from '@/hooks/usePersistentView';
import Link from 'next/link';
import { fetchTickets, fetchUsers, updateTicket } from '@/lib/api-client';
import { Plus, Search, LayoutGrid, TableIcon, SlidersHorizontal, CheckCircle2, Send, Star, HelpCircle, X } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';
import { includesVN } from '@/lib/utils/searchVN';
import StatsStrip from './StatsStrip';
import QuickFilters from './QuickFilters';
import SearchBar from './SearchBar';
import TicketsTable from './TicketsTable';
import KanbanBoard from './KanbanBoard';
import TeamStats from './TeamStats';
import TicketDetailPanel from '../../components/detail/TicketDetailPanel';
import CreateTicketModal from '../../components/CreateTicketModal';
import AdvancedFilters, { FilterOptions } from './AdvancedFilters';
import BulkActionsToolbar from './BulkActionsToolbar';
import StatusLegend from './StatusLegend';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import ErrorState from '@/components/ui/ErrorState';

type AdminTabType = 'my-tickets' | 'sent' | 'following' | 'all';

interface User {
  id: string;
  name: string;
  role: string;
}

interface AdminDashboardProps {
  initialTicketId?: string | null;
}

export default function AdminDashboard({ initialTicketId }: AdminDashboardProps) {
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterOptions>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [viewMode, setViewMode] = usePersistentView('tickets_admin_view_mode', ['table', 'kanban'] as const, 'table');
  const [activeTab, setActiveTab] = useState<AdminTabType>('all');
  const [showLegendModal, setShowLegendModal] = useState(false);

  useEscapeKey(() => setShowLegendModal(false), showLegendModal);

  // Load user from localStorage
  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
  }, []);

  // Load tickets and users
  const loadData = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setLoadError(false);
      const [ticketsData, usersData] = await Promise.all([
        fetchTickets({ userId: currentUser.id, userRole: currentUser.role }),
        fetchUsers(),
      ]);
      setTickets(ticketsData || []);
      setUsers(usersData || []);

      // Auto-select ticket from URL query param (ticketId)
      if (initialTicketId && ticketsData) {
        const ticket = ticketsData.find((t: Ticket) => t.id === initialTicketId);
        if (ticket) {
          setSelectedTicket(ticket);
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser, initialTicketId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter tickets
  const filtered = useMemo(() => {
    return tickets.filter(t => {
      // Tab filter - only apply if not in 'all' tab
      if (activeTab === 'my-tickets' && t.assigned_to !== currentUser?.id) return false;
      if (activeTab === 'sent' && t.created_by !== currentUser?.id) return false;
      if (activeTab === 'following' && !(t.followers?.includes(currentUser?.id))) return false;
      // 'all' tab shows everything (no tab filter)

      // Search filter
      const matchSearch = !search ||
        includesVN(t.title, search) ||
        includesVN(t.code, search) ||
        includesVN(t.created_by_name, search) ||
        includesVN(t.assigned_to_name, search);

      // Quick filters
      const matchStatus = !statusFilter || t.status === statusFilter;
      const matchPriority = !priorityFilter || t.priority === priorityFilter;

      // Advanced filters
      const matchDateFrom = !advancedFilters.dateFrom || new Date(t.created_at) >= new Date(advancedFilters.dateFrom);
      const matchDateTo = !advancedFilters.dateTo || new Date(t.created_at) <= new Date(advancedFilters.dateTo + 'T23:59:59');
      const matchCreatedBy = !advancedFilters.createdBy || t.created_by === advancedFilters.createdBy;
      const matchAssignedTo = !advancedFilters.assignedTo || t.assigned_to === advancedFilters.assignedTo;
      const matchCategory = !advancedFilters.supportCategory || t.support_category === advancedFilters.supportCategory;
      const matchAdvancedStatus = !advancedFilters.status || t.status === advancedFilters.status;
      const matchAdvancedPriority = !advancedFilters.priority || t.priority === advancedFilters.priority;

      return matchSearch && matchStatus && matchPriority && matchDateFrom && matchDateTo &&
             matchCreatedBy && matchAssignedTo && matchCategory && matchAdvancedStatus && matchAdvancedPriority;
    });
  }, [tickets, search, statusFilter, priorityFilter, advancedFilters, activeTab, currentUser?.id]);

  // Get support categories
  const supportCategories = useMemo(() => {
    const cats = new Set<string>();
    tickets.forEach(t => {
      if (t.support_category) cats.add(t.support_category);
    });
    return Array.from(cats).sort();
  }, [tickets]);

  // Bulk action handlers
  const handleBulkChangeStatus = async (status: string) => {
    setBulkActionLoading(true);
    try {
      const ticketsToUpdate = Array.from(selectedTickets);
      await Promise.all(
        ticketsToUpdate.map(id =>
          updateTicket(id, {
            status,
            userId: currentUser?.id,
            userRole: currentUser?.role,
          })
        )
      );

      // Update local state - cast status to TicketStatus
      const updatedTickets = tickets.map(t =>
        selectedTickets.has(t.id) ? { ...t, status: status as Ticket['status'] } : t
      );
      setTickets(updatedTickets);
      setSelectedTickets(new Set());
      toast.success(`Cập nhật ${ticketsToUpdate.length} ticket thành công`);
    } catch (error: any) {
      toast.error(error.message || 'Lỗi cập nhật ticket');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkReassign = async (userId: string) => {
    setBulkActionLoading(true);
    try {
      const ticketsToUpdate = Array.from(selectedTickets);
      const assignedUser = users.find(u => u.id === userId);

      await Promise.all(
        ticketsToUpdate.map(id =>
          updateTicket(id, {
            assigned_to: userId,
            assigned_to_name: assignedUser?.name || '',
            userId: currentUser?.id,
            userRole: currentUser?.role,
          })
        )
      );

      // Update local state
      const updatedTickets = tickets.map(t =>
        selectedTickets.has(t.id)
          ? { ...t, assigned_to: userId, assigned_to_name: assignedUser?.name || '' }
          : t
      );
      setTickets(updatedTickets);
      setSelectedTickets(new Set());
      toast.success(`Giao ${ticketsToUpdate.length} ticket thành công`);
    } catch (error: any) {
      toast.error(error.message || 'Lỗi giao ticket');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      const ticketsToDelete = Array.from(selectedTickets);
      await Promise.all(
        ticketsToDelete.map(id =>
          fetch(`/api/tickets/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUser?.id,
              userRole: currentUser?.role,
            }),
          })
        )
      );

      // Update local state
      const updatedTickets = tickets.filter(t => !selectedTickets.has(t.id));
      setTickets(updatedTickets);
      setSelectedTickets(new Set());
      toast.success(`Xóa ${ticketsToDelete.length} ticket thành công`);
    } catch (error: any) {
      toast.error(error.message || 'Lỗi xóa ticket');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Calculate tab counts
  const myTicketsCount = tickets.filter(t => t.assigned_to === currentUser?.id).length;
  const sentCount = tickets.filter(t => t.created_by === currentUser?.id).length;
  const followingCount = tickets.filter(t => t.followers?.includes(currentUser?.id)).length;

  if (!currentUser) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground break-words">Quản Lý Ticket Hỗ Trợ</h1>
            <button
              onClick={() => setShowLegendModal(true)}
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-hover hover:bg-hover-strong text-muted-foreground hover:text-foreground transition-colors"
              title="Xem chú thích trạng thái"
            >
              <HelpCircle size={18} />
            </button>
          </div>
          <p className="text-2xs sm:text-sm text-muted-foreground mt-1">{filtered.length} ticket · {tickets.filter(t => t.status === 'open').length} đang mở</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View Mode Toggle */}
          <div className="flex-1 sm:flex-none flex items-center gap-1 p-1 rounded-lg bg-hover border border-line">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 h-9 sm:h-10 rounded text-2xs sm:text-xs font-600 transition-colors min-w-[44px] ${
                viewMode === 'table'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Dạng bảng"
            >
              <TableIcon size={16} className="sm:hidden" />
              <TableIcon size={14} className="hidden sm:block" />
              <span className="hidden md:inline">Bảng</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 h-9 sm:h-10 rounded text-2xs sm:text-xs font-600 transition-colors min-w-[44px] ${
                viewMode === 'kanban'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Dạng kanban"
            >
              <LayoutGrid size={16} className="sm:hidden" />
              <LayoutGrid size={14} className="hidden sm:block" />
              <span className="hidden md:inline">Kanban</span>
            </button>
          </div>

          {currentUser.role === 'super_admin' && (
            <Link
              href="/tickets/admin/config"
              className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg sm:rounded-xl text-2xs sm:text-sm font-600 btn-ghost border border-line text-muted-foreground hover:text-foreground flex-1 sm:flex-none min-h-[44px]"
              title="Cấu hình loại yêu cầu, danh mục và trường động"
            >
              <SlidersHorizontal size={16} />
              <span className="hidden sm:inline">Cấu Hình</span>
            </Link>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg sm:rounded-xl text-2xs sm:text-sm font-600 btn-accent flex-1 sm:flex-none min-h-[44px]"
          >
            <Plus size={18} className="sm:hidden" />
            <Plus size={16} className="hidden sm:block" />
            <span className="hidden sm:inline">Tạo Ticket</span>
            <span className="sm:hidden">Tạo</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 border-b border-line overflow-x-auto pb-0">
        {[
          { id: 'my-tickets' as AdminTabType, label: 'Ticket Giao Cho Tôi', icon: CheckCircle2, count: myTicketsCount },
          { id: 'sent' as AdminTabType, label: 'Ticket Tôi Gửi', icon: Send, count: sentCount },
          { id: 'following' as AdminTabType, label: 'Đang Theo Dõi', icon: Star, count: followingCount },
          { id: 'all' as AdminTabType, label: 'Tất Cả', icon: null, count: tickets.length },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2 sm:px-4 py-2 sm:py-3 text-2xs sm:text-sm font-600 border-b-2 transition-colors whitespace-nowrap min-h-[44px] sm:min-h-auto ${
                isActive
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {Icon && <Icon size={14} className="hidden sm:inline" />}
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`ml-0.5 px-1.5 py-0 rounded-full text-2xs font-700 ${
                  isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-hover text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dải chỉ số gọn 1 hàng — để danh sách ticket nổi lên ngay đầu màn hình */}
      <StatsStrip tickets={tickets} currentUser={currentUser} />

      {/* Filters Section */}
      <div className="space-y-4">
        <QuickFilters
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
        />

        <SearchBar
          value={search}
          onChange={setSearch}
        />

        <AdvancedFilters
          users={users}
          supportCategories={supportCategories}
          onFilterChange={setAdvancedFilters}
          isOpen={showFilters}
          onToggle={() => setShowFilters(!showFilters)}
        />
      </div>

      {/* Bulk Actions Toolbar - Only in table view */}
      {viewMode === 'table' && selectedTickets.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedTickets.size}
          onChangeStatus={handleBulkChangeStatus}
          onReassign={handleBulkReassign}
          onDelete={handleBulkDelete}
          users={users}
          isLoading={bulkActionLoading}
        />
      )}

      {/* Main Content Grid */}
      <div className={viewMode === 'table' ? 'grid grid-cols-1 lg:grid-cols-4 gap-6' : ''}>
        {/* Tickets View */}
        <div className={viewMode === 'table' ? 'lg:col-span-3' : ''}>
          {!loading && loadError ? (
            <ErrorState onRetry={loadData} />
          ) : viewMode === 'table' ? (
            <TicketsTable
              tickets={filtered}
              loading={loading}
              onSelectTicket={setSelectedTicket}
              onTicketsChange={setTickets}
              currentUser={currentUser}
              allUsers={users}
              selectedTickets={selectedTickets}
              onSelectTicketsChange={setSelectedTickets}
              compact
            />
          ) : (
            <KanbanBoard
              tickets={filtered}
              loading={loading}
              onSelectTicket={setSelectedTicket}
            />
          )}
        </div>

        {/* Team Stats Sidebar - Only show in table view */}
        {viewMode === 'table' && (
          <div className="lg:col-span-1">
            <TeamStats tickets={tickets} users={users} />
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          userId={currentUser.id}
          userRole={currentUser.role}
          onClose={() => setSelectedTicket(null)}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateTicketModal
          onClose={() => setShowCreateModal(false)}
          currentUser={currentUser}
          users={users}
          onTicketCreated={(ticket) => {
            setTickets(prev => [ticket, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Legend Modal */}
      {showLegendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowLegendModal(false)}>
          <div className="bg-slate-900 border border-line rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-line sticky top-0 bg-slate-900/95 backdrop-blur">
              <h2 className="text-lg font-600 text-foreground">Chú Thích Ticket</h2>
              <button
                onClick={() => setShowLegendModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-hover-strong transition-colors text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <StatusLegend />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
