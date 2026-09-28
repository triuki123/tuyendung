'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchTickets } from '@/lib/api-client';
import { Plus, CheckCircle2, Send, Star, Search } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';
import ErrorState from '@/components/ui/ErrorState';
import TicketsTable from '../../admin/components/TicketsTable';
import TicketDetailPanel from '../../components/detail/TicketDetailPanel';
import CreateTicketModal from '../../components/CreateTicketModal';

interface User {
  id: string;
  name: string;
  tags?: string[];
}

type TabType = 'my-tickets' | 'sent' | 'following';

export default function UserTicketsView() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('my-tickets');

  // Load user
  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
  }, []);

  // Load users with tags for support category dropdown
  useEffect(() => {
    const loadUsers = async () => {
      if (!currentUser) return;
      try {
        const response = await fetch(`/api/users?userId=${currentUser.id}`);
        if (response.ok) {
          const data = await response.json();
          setUsers(data || []);
        }
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    };
    loadUsers();
  }, [currentUser]);

  // Load tickets
  const loadData = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setLoadError(false);
      const ticketsData = await fetchTickets({
        userId: currentUser.id,
        userRole: currentUser.role,
      });
      setTickets(ticketsData || []);

      // Tự mở ticket từ deep-link ?ticketId= (vd quay về từ task liên kết)
      if (typeof window !== 'undefined' && ticketsData) {
        const tid = new URLSearchParams(window.location.search).get('ticketId');
        if (tid) {
          const t = ticketsData.find((x: Ticket) => x.id === tid);
          if (t) setSelectedTicket(t);
        }
      }
    } catch (error) {
      console.error('Failed to load tickets:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!currentUser) return null;

  // Filter tickets by active tab
  const myTickets = tickets.filter(t => t.assigned_to === currentUser.id);
  const sentTickets = tickets.filter(t => t.created_by === currentUser.id);
  const followingTickets = tickets.filter(t =>
    Array.isArray(t.followers) && t.followers.includes(currentUser.id)
  );

  // Get tickets for current tab
  const getTabTickets = () => {
    switch (activeTab) {
      case 'my-tickets':
        return myTickets;
      case 'sent':
        return sentTickets;
      case 'following':
        return followingTickets;
      default:
        return myTickets;
    }
  };

  const tabTickets = getTabTickets();

  // Apply search & status filter
  const filtered = tabTickets.filter(t => {
    const matchSearch = !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || t.status === statusFilter;
    return matchSearch && matchStatus;
  });


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-700 text-foreground">Ticket Của Tôi</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} ticket · {tickets.filter(t => t.status === 'open').length} đang mở</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-600 btn-accent shrink-0"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Tạo Ticket</span>
          <span className="sm:hidden">Tạo</span>
        </button>
      </div>

      {/* 3-Tab Navigation — scroll ngang trên mobile */}
      <div className="flex border-b border-line overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {([
          { key: 'my-tickets', icon: <CheckCircle2 size={14} />, label: 'Giao Cho Tôi', count: myTickets.length },
          { key: 'sent',       icon: <Send size={14} />,         label: 'Tôi Gửi',      count: sentTickets.length },
          { key: 'following',  icon: <Star size={14} />,         label: 'Theo Dõi',     count: followingTickets.length },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch(''); setStatusFilter(''); }}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-600 border-b-2 whitespace-nowrap transition-all shrink-0 ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`text-2xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-indigo-500/20 text-indigo-300' : 'bg-hover text-muted-foreground'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search + filters — 1 hàng gọn */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm ticket..."
            className="w-full h-9 pl-8 pr-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-2.5 rounded-xl text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 shrink-0"
        >
          <option value="">Tất cả</option>
          <option value="open">Mở</option>
          <option value="in_progress">Đang xử lý</option>
          <option value="resolved">Đã giải quyết</option>
          <option value="closed">Đóng</option>
        </select>
      </div>

      {/* Table */}
      {!loading && loadError ? (
        <ErrorState onRetry={loadData} />
      ) : (
        <TicketsTable
          tickets={filtered}
          loading={loading}
          onSelectTicket={setSelectedTicket}
          onTicketsChange={setTickets}
          currentUser={currentUser}
          allUsers={[]}
          compact
        />
      )}

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
    </div>
  );
}
