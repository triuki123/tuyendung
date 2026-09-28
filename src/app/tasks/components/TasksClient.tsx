'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Search, XCircle, Edit2, Trash2, CheckCircle, Clock, Loader2, Calendar, Archive, RotateCcw, Eye,
  ChevronDown, Inbox, Lock, AlertCircle, Kanban, TrendingUp, User
} from 'lucide-react';
import {
  fetchTasks, createTask, updateTask, deleteTask, fetchUsers,
  generateTaskCode, recordTaskActivity
} from '@/lib/api-client';
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, TASK_SORT_OPTIONS, formatTaskDeadlineStatus } from '@/lib/constants/taskConstants';
import { markTaskInProgress, markTaskDone, bulkUpdateTaskStatus, archiveTask, unarchiveTask } from '@/lib/services/taskActionService';
import { useTaskPermissions } from '@/hooks/useTaskPermissions';
import SavedFilters from '@/components/SavedFilters';
import AdvancedSearch from '@/components/AdvancedSearch';
import FilterBuilder, { FilterCriteria } from '@/components/FilterBuilder';
import SearchResultsIndicator from '@/components/SearchResultsIndicator';
import { formatArchiveDate } from '@/lib/archive-utils';
import { ActivityLogModal } from './ActivityLogModal';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import TaskCard from './TaskCard';
import TaskDetailModal from './TaskDetailModal';
import AddTaskForm from './AddTaskForm';
import { ViewSwitcher, type ViewType } from './ViewSwitcher';
import { usePersistentView } from '@/hooks/usePersistentView';
import KanbanBoard from './KanbanBoard';
import CalendarView from './CalendarView';
import GanttView from './GanttView';
import ExportReportButton from './ExportReportButton';
import { includesVN } from '@/lib/utils/searchVN';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import ErrorState from '@/components/ui/ErrorState';

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
  related_asset?: string;
  estimated_hours?: number | string | null;
  actual_hours?: number | null;
}

export default function TasksClient() {
  // ============================================================================
  // PERMISSION SYSTEM
  // ============================================================================
  const permissions = useTaskPermissions();
  const toast = useToast();
  const confirm = useConfirm();
  const [taskPermissions, setTaskPermissions] = useState<Record<string, { edit: boolean; delete: boolean }>>({});
  const [permissionLoading, setPermissionLoading] = useState(false);

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [myTasksOnly, setMyTasksOnly] = useState(true);
  const [sortBy, setSortBy] = useState<string>('newest');
  const [showArchived, setShowArchived] = useState(false); // 🔐 Toggle archived tasks
  const [isMobile, setIsMobile] = useState(false);
  const [currentView, setCurrentView] = usePersistentView<ViewType>('tasks_view_mode', ['kanban', 'calendar', 'gantt', 'card'], 'card'); // nhớ qua localStorage
  const [modal, setModal] = useState<{ mode: 'create' | 'view' | 'edit'; task?: Task } | null>(null);
  // Ticket được khóa sẵn khi tạo task từ trang ticket (?ticketId=...)
  const [lockedTicket, setLockedTicket] = useState<{ id: string; code?: string; title?: string } | null>(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  useEscapeKey(() => setDeleteId(null), deleteId !== null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterCriteria[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [activityLogModal, setActivityLogModal] = useState<{ isOpen: boolean; taskId?: string; taskCode?: string }>({ isOpen: false });
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }

    // Detect mobile device
    const checkMobile = () => {
      const mobile = typeof window !== 'undefined' && window.innerWidth < 768;
      setIsMobile(mobile);
      return mobile;
    };

    const isMobileDevice = checkMobile();

    // Load preferred view from localStorage, or use default based on device type
    const savedView = localStorage.getItem('tasks-preferred-view');
    if (savedView && ['kanban', 'calendar', 'gantt', 'card'].includes(savedView)) {
      setCurrentView(savedView as ViewType);
    } else {
      // Default: Grid on mobile, Kanban on desktop
      setCurrentView(isMobileDevice ? 'card' : 'kanban');
    }

    // Listen for window resize to update mobile state
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Optionally switch view based on device change
      const savedView = localStorage.getItem('tasks-preferred-view');
      if (!savedView) {
        setCurrentView(mobile ? 'card' : 'kanban');
      }
    };

    window.addEventListener('resize', handleResize);

    loadData();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Deep-link từ trang Ticket:
  //  - ?ticketId=&ticketCode=&ticketTitle= → mở form tạo task khóa sẵn ticket
  //  - ?openTask=<id> → mở chi tiết task tương ứng
  useEffect(() => {
    if (deepLinkHandled || loading) return;
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const ticketId = sp.get('ticketId');
    const openTask = sp.get('openTask');

    if (ticketId) {
      setLockedTicket({
        id: ticketId,
        code: sp.get('ticketCode') || undefined,
        title: sp.get('ticketTitle') || undefined,
      });
      setModal({ mode: 'create' });
      setDeepLinkHandled(true);
      window.history.replaceState(null, '', '/tasks');
    } else if (openTask) {
      const found = tasks.find(t => t.id === openTask);
      if (found) {
        setModal({ mode: 'view', task: found });
        setDeepLinkHandled(true);
        window.history.replaceState(null, '', '/tasks');
      }
    }
  }, [loading, tasks, deepLinkHandled]);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const [tasksResponse, usersResponse] = await Promise.all([
        fetchTasks({}),
        fetchUsers({}),
      ]);

      // Handle both response formats: {success, data} or just array
      const tasks = tasksResponse?.data || tasksResponse || [];
      const users = usersResponse?.data || usersResponse || [];

      const sortedTasks = (tasks || []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const sortedUsers = (users || []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setTasks(sortedTasks);
      setAllUsers(sortedUsers);

      // 🔐 Cache permission checks for displayed tasks
      if (!permissions.loading) {
        await checkTaskPermissions(sortedTasks);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🔐 Check and cache permissions for each task
   * Used to conditionally show/hide Edit/Delete buttons
   */
  const checkTaskPermissions = async (tasksToCheck: Task[]) => {
    setPermissionLoading(true);
    try {
      const perms: Record<string, { edit: boolean; delete: boolean }> = {};

      for (const task of tasksToCheck) {
        if (!perms[task.id]) {
          const [canEdit, canDelete] = await Promise.all([
            permissions.canEdit(task.id),
            permissions.canDelete(task.id),
          ]);
          perms[task.id] = { edit: canEdit, delete: canDelete };
        }
      }

      setTaskPermissions(perms);
    } catch (error) {
      console.error('Error checking task permissions:', error);
    } finally {
      setPermissionLoading(false);
    }
  };

  const applyFilterCriteria = (task: Task, criteria: FilterCriteria): boolean => {
    const fieldValue = (task as any)[criteria.field];
    if (fieldValue === undefined || fieldValue === null) return false;

    const val = String(fieldValue).toLowerCase();
    const filterVal = String(criteria.value).toLowerCase();

    switch (criteria.operator) {
      case 'equals': return val === filterVal;
      case 'contains': return val.includes(filterVal);
      case 'startsWith': return val.startsWith(filterVal);
      case 'endsWith': return val.endsWith(filterVal);
      case 'gt': return Number(fieldValue) > Number(criteria.value);
      case 'lt': return Number(fieldValue) < Number(criteria.value);
      case 'between': return Number(fieldValue) >= Number(criteria.value);
      default: return true;
    }
  };

  // Sort tasks
  const sortedTasks = useMemo(() => {
    const sorted = [...tasks];

    switch (sortBy) {
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      case 'priority-high': {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return sorted.sort(
          (a, b) =>
            (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
            (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
        );
      }

      case 'priority-low': {
        const priorityOrder = { low: 0, medium: 1, high: 2 };
        return sorted.sort(
          (a, b) =>
            (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
            (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
        );
      }

      case 'deadline-soon':
        return sorted.sort((a, b) => {
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        });

      case 'deadline-late':
        return sorted.sort((a, b) => {
          if (!a.due_date) return -1;
          if (!b.due_date) return 1;
          return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
        });

      case 'title-asc':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));

      case 'title-desc':
        return sorted.sort((a, b) => b.title.localeCompare(a.title));

      case 'newest':
      default:
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [tasks, sortBy]);

  // Filter tasks
  const filtered = useMemo(() => {
    return sortedTasks.filter(t => {
      // 🔐 Archive filter: separate active vs archived
      const isArchived = !!t.archived_at;
      const matchArchiveFilter = showArchived ? isArchived : !isArchived;
      if (!matchArchiveFilter) return false;

      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.code ?? '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || t.status === statusFilter;
      const matchMyTasks = !myTasksOnly || !currentUser || String(t.assigned_to) === String(currentUser?.id);
      const advSearchMatch = !searchQuery ||
        (t.code && includesVN(t.code, searchQuery)) ||
        includesVN(t.title, searchQuery) ||
        includesVN(t.assigned_to_name, searchQuery);

      const andFilters: FilterCriteria[] = [];
      const orFilters: FilterCriteria[] = [];
      advancedFilters.forEach((f, idx) => {
        if (idx === 0 || f.logic === 'AND') {
          andFilters.push(f);
        } else {
          orFilters.push(f);
        }
      });

      const andMatch = andFilters.every(f => applyFilterCriteria(t, f));
      if (!andMatch) return false;
      if (orFilters.length > 0) {
        const orMatch = orFilters.some(f => applyFilterCriteria(t, f));
        if (!orMatch) return false;
      }

      return matchSearch && matchStatus && advSearchMatch && matchMyTasks;
    });
  }, [sortedTasks, search, statusFilter, searchQuery, advancedFilters, showArchived, myTasksOnly, currentUser]);

  const handleSave = async (t: Task) => {
    // Build auth headers từ localStorage
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('assetflow_auth');
      if (stored) {
        try {
          const user = JSON.parse(stored);
          if (user.id && user.role) {
            headers['x-current-user-id'] = user.id;
            headers['x-current-user-role'] = user.role;
            const activeCompany = localStorage.getItem('active_company_id') || user.company_id;
            if (activeCompany) headers['x-current-user-company'] = activeCompany;
          }
        } catch (e) {
          console.error('Error parsing auth:', e);
        }
      }
    }

    if (!headers['x-current-user-id']) {
      toast.error('Lỗi: Chưa tải thông tin người dùng. Vui lòng làm mới trang.');
      return;
    }

    try {
      if (t.id) {
        // UPDATE — PUT /api/tasks/:id
        const response = await fetch(`/api/tasks/${t.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(t),
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Lỗi cập nhật công việc');
        }
        const result = await response.json();
        t = result.data;
      } else {
        // CREATE — POST /api/tasks
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers,
          body: JSON.stringify(t),
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Lỗi tạo công việc');
        }
        const result = await response.json();
        t = result.data;
      }
    } catch (error) {
      console.error('handleSave error:', error);
      toast.error(error instanceof Error ? error.message : 'Lỗi lưu công việc. Vui lòng thử lại.');
      return;
    }

    setTasks(prev => {
      const exists = prev.find(x => x.id === t.id);
      if (exists) return prev.map(x => x.id === t.id ? { ...t } : x);
      return [{ ...t }, ...prev];
    });
    setModal(null);
    setLockedTicket(null);
  };

  const handleQuickProgress = async (task: Task) => {
    setIsUpdating(task.id);
    try {
      await markTaskInProgress(task.id, task);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'in_progress' } : t));
    } catch (error) {
      console.error('Error:', error);
      const message = error instanceof Error ? error.message : 'Lỗi cập nhật trạng thái. Vui lòng thử lại.';
      toast.error(message);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleQuickDone = async (task: Task) => {
    setIsUpdating(task.id);
    try {
      await markTaskDone(task.id, task);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'done' } : t));
    } catch (error) {
      console.error('Error:', error);
      const message = error instanceof Error ? error.message : 'Lỗi cập nhật trạng thái. Vui lòng thử lại.';
      toast.error(message);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDelete = async (task: Task) => {
    const ok = await confirm({
      title: 'Xóa công việc?',
      message: `Bạn chắc chắn muốn xóa "${task.title}"?`,
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (ok) {
      setIsUpdating(task.id);
      try {
        await deleteTask(task.id);
        setTasks(prev => prev.filter(t => t.id !== task.id));
        setDeleteId(null);
      } catch (error) {
        console.error('Error deleting task:', error);
        toast.error('Lỗi xóa công việc. Vui lòng thử lại.');
      } finally {
        setIsUpdating(null);
      }
    }
  };

  const handleArchive = async (task: Task) => {
    setIsUpdating(task.id);
    try {
      await archiveTask(task.id, task as any);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, archived_at: new Date().toISOString() } : t));
    } catch (error) {
      console.error('Error archiving task:', error);
      toast.error('Lỗi lưu trữ công việc. Vui lòng thử lại.');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUnarchive = async (task: Task) => {
    setIsUpdating(task.id);
    try {
      await unarchiveTask(task.id, task as any);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, archived_at: null } : t));
    } catch (error) {
      console.error('Error unarchiving task:', error);
      toast.error('Lỗi khôi phục công việc. Vui lòng thử lại.');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleBulkStatusUpdate = async (newStatus: Task['status']) => {
    if (selectedTasks.size === 0) return;

    setBulkUpdating(true);
    try {
      const tasksToUpdate = Array.from(selectedTasks).map(id => tasks.find(t => t.id === id)!).filter(Boolean);
      await bulkUpdateTaskStatus(Array.from(selectedTasks), tasksToUpdate, newStatus);
      setTasks(prev => prev.map(t => selectedTasks.has(t.id) ? { ...t, status: newStatus } : t));
      setSelectedTasks(new Set());
    } catch (error) {
      console.error('Error bulk updating:', error);
      toast.error('Lỗi cập nhật hàng loạt. Vui lòng thử lại.');
    } finally {
      setBulkUpdating(false);
    }
  };

  if (!currentUser) return null;

  const groupedByStatus = {
    todo: filtered.filter(t => t.status === 'todo'),
    in_progress: filtered.filter(t => t.status === 'in_progress'),
    done: filtered.filter(t => t.status === 'done'),
    cancelled: filtered.filter(t => t.status === 'cancelled'),
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Công Việc</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Hiển thị {filtered.length} / {tasks.length} công việc</p>
        </div>
        <div className="flex items-center gap-2">
          {/* TODO: Enable SavedFilters when ready */}
          {/* <SavedFilters
            currentFilters={advancedFilters}
            onLoadFilter={setAdvancedFilters}
            onDeleteFilter={() => {}}
            moduleName="tasks"
          /> */}
          {currentUser && (
            <ExportReportButton
              userId={currentUser.id}
              userName={currentUser.name || 'User'}
              userRole={currentUser.role || 'user'}
            />
          )}
          <button
            onClick={() => { setLockedTicket(null); setModal({ mode: 'create' }); }}
            disabled={permissions.loading || permissionLoading}
            title={permissions.loading ? 'Đang kiểm tra quyền...' : 'Tạo công việc mới'}
            className={`flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-600 w-full sm:w-auto min-h-[44px] transition-all ${
              permissions.loading || permissionLoading
                ? 'btn-accent opacity-50 cursor-not-allowed'
                : 'btn-accent hover:opacity-90'
            }`}
          >
            {permissions.loading || permissionLoading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Đang tải...
              </>
            ) : (
              <>
                <Plus size={15} />
                Tạo Công Việc
              </>
            )}
          </button>
        </div>
      </div>

      {/* Controls — sticky */}
      <div className="sticky top-0 z-20 bg-gradient-to-b from-slate-900/95 to-slate-900/90 backdrop-blur -mx-6 px-6 py-3 space-y-2.5">

        {/* Row 1: Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm theo tiêu đề, mã công việc..."
            className="w-full h-9 pl-9 pr-9 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <XCircle size={16} />
            </button>
          )}
        </div>

        {/* Row 2: Scope · Archive · [spacer] · ViewSwitcher */}
        <div className="flex items-center gap-2">

          {/* Segmented: Của Tôi / Tất Cả */}
          <div className="flex items-center rounded-lg border border-line bg-hover p-0.5 gap-0.5 shrink-0">
            <button
              onClick={() => setMyTasksOnly(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-600 transition-all ${
                myTasksOnly ? 'bg-indigo-500/25 text-indigo-300' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <User size={12} />
              Của Tôi
            </button>
            <button
              onClick={() => setMyTasksOnly(false)}
              className={`flex items-center px-2.5 py-1 rounded-md text-xs font-600 transition-all ${
                !myTasksOnly ? 'bg-hover-strong text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tất Cả
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-hover-strong shrink-0" />

          {/* Segmented: Active / Archived */}
          <div className="flex items-center rounded-lg border border-line bg-hover p-0.5 gap-0.5 shrink-0">
            <button
              onClick={() => setShowArchived(false)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-600 transition-all ${
                !showArchived ? 'bg-indigo-500/25 text-indigo-300' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Inbox size={12} />
              Hoạt Động
              <span className="opacity-50">({tasks.filter(t => !t.archived_at).length})</span>
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-600 transition-all ${
                showArchived ? 'bg-amber-500/20 text-amber-300' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Archive size={12} />
              Lưu Trữ
              <span className="opacity-50">({tasks.filter(t => !!t.archived_at).length})</span>
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* View Switcher */}
          <ViewSwitcher
            currentView={currentView}
            onViewChange={(view) => {
              setCurrentView(view);
              localStorage.setItem('tasks-preferred-view', view);
            }}
          />
        </div>

        {/* Row 3: Status chips + Sort + Filter */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 no-scrollbar">
            {(['', 'todo', 'in_progress', 'done', 'cancelled'] as const).map((status) => {
              const count = status ? filtered.filter(t => t.status === status).length : filtered.length;
              const label = status ? TASK_STATUS_CONFIG[status]?.label : 'Tất Cả';
              const isActive = statusFilter === status;
              return (
                <button
                  key={status || 'all'}
                  onClick={() => setStatusFilter(status)}
                  className={`whitespace-nowrap px-3 py-1 rounded-lg text-xs font-600 transition-colors shrink-0 ${
                    isActive
                      ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
                      : 'bg-hover border border-line text-muted-foreground hover:bg-hover-strong'
                  }`}
                >
                  {label} <span className="opacity-50">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Sort */}
          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="h-8 pl-3 pr-7 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 appearance-none"
            >
              {TASK_SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* Filter */}
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`h-8 px-3 rounded-lg text-xs font-600 border transition-colors shrink-0 ${
              filterOpen || advancedFilters.length > 0
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                : 'bg-hover border-line text-muted-foreground hover:bg-hover-strong hover:text-foreground'
            }`}
          >
            Bộ lọc{advancedFilters.length > 0 ? ` (${advancedFilters.length})` : ''}
          </button>
        </div>

      </div>

      {/* Advanced Filter Builder */}
      {filterOpen && (
        <FilterBuilder
          fields={[
            { name: 'code', label: 'Mã Công Việc', type: 'text' },
            { name: 'title', label: 'Tiêu Đề', type: 'text' },
            {
              name: 'priority',
              label: 'Mức Độ Ưu Tiên',
              type: 'select',
              options: [
                { value: 'low', label: 'Thấp' },
                { value: 'medium', label: 'Trung bình' },
                { value: 'high', label: 'Cao' },
              ],
            },
            {
              name: 'status',
              label: 'Trạng Thái',
              type: 'select',
              options: [
                { value: 'todo', label: 'Chờ làm' },
                { value: 'in_progress', label: 'Đang làm' },
                { value: 'done', label: 'Hoàn thành' },
                { value: 'cancelled', label: 'Hủy' },
              ],
            },
            { name: 'assigned_to_name', label: 'Người Thực Hiện', type: 'text' },
          ]}
          onApply={setAdvancedFilters}
          onReset={() => setAdvancedFilters([])}
          initialFilters={advancedFilters}
        />
      )}

      {/* Search Results Indicator */}
      <SearchResultsIndicator
        totalItems={tasks.length}
        filteredItems={filtered.length}
        appliedFilters={advancedFilters}
        searchQuery={searchQuery}
        onResetFilters={() => setAdvancedFilters([])}
        onResetSearch={() => setSearchQuery('')}
      />

      {/* Task List by Status */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <ErrorState onRetry={loadData} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Inbox size={48} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Không có công việc nào phù hợp với bộ lọc</p>
        </div>
      ) : currentView === 'card' ? (
        // CARD GRID VIEW (Current Default)
        <div className="space-y-6">
          {Object.entries(TASK_STATUS_CONFIG).map(([statusKey, statusConfig]) => {
            const statusTasks = groupedByStatus[statusKey as keyof typeof groupedByStatus];
            if (statusTasks.length === 0) return null;

            return (
              <div key={statusKey} className="space-y-3">
                <div className="flex items-center gap-2">
                  <statusConfig.icon className={statusConfig.color} size={18} />
                  <h3 className={`text-sm font-600 ${statusConfig.color}`}>{statusConfig.label} ({statusTasks.length})</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {statusTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isSelected={selectedTasks.has(task.id)}
                      onSelect={() => setModal({ mode: 'view', task })}
                      onCheckboxChange={(id, checked) => {
                        const newSelected = new Set(selectedTasks);
                        if (checked) {
                          newSelected.add(id);
                        } else {
                          newSelected.delete(id);
                        }
                        setSelectedTasks(newSelected);
                      }}
                      onQuickDone={handleQuickDone}
                      onQuickProgress={handleQuickProgress}
                      onView={() => setModal({ mode: 'view', task })}
                      onEdit={() => setModal({ mode: 'edit', task })}
                      onDelete={handleDelete}
                      onArchive={handleArchive}
                      onUnarchive={handleUnarchive}
                      completing={isUpdating === task.id}
                      progressing={isUpdating === task.id}
                      deleting={isUpdating === task.id}
                      // 🔐 Pass permission flags
                      canEdit={taskPermissions[task.id]?.edit ?? true}
                      canDelete={taskPermissions[task.id]?.delete ?? true}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : currentView === 'kanban' ? (
        // KANBAN VIEW
        <KanbanBoard
          tasks={filtered}
          onTaskClick={(task) => setModal({ mode: 'view', task: task as unknown as Task })}
          onStatusChange={(taskId, newStatus) => {
            const updatedTasks = tasks.map(t =>
              t.id === taskId ? { ...t, status: newStatus } : t
            );
            setTasks(updatedTasks);
          }}
        />
      ) : currentView === 'calendar' ? (
        // CALENDAR VIEW
        <CalendarView
          tasks={filtered}
          onTaskClick={(task) => setModal({ mode: 'view', task: task as unknown as Task })}
        />
      ) : (
        // GANTT VIEW
        <GanttView
          tasks={filtered}
          onTaskClick={(task) => setModal({ mode: 'view', task: task as unknown as Task })}
        />
      )}

      {/* Sticky Bottom FAB - Bulk Actions */}
      {selectedTasks.size > 0 && (
        <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 z-30 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-r from-indigo-500/90 to-indigo-600/90 backdrop-blur border border-indigo-400/50 rounded-xl px-4 py-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-600 text-white">
                ☑️ {selectedTasks.size} công việc được chọn
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={() => handleBulkStatusUpdate('in_progress')}
                  disabled={bulkUpdating}
                  className="h-9 px-4 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50 text-xs font-600 min-h-[44px] sm:min-h-auto"
                >
                  {bulkUpdating ? <Loader2 size={14} className="animate-spin" /> : '→ Làm'}
                </button>
                <button
                  onClick={() => handleBulkStatusUpdate('done')}
                  disabled={bulkUpdating}
                  className="h-9 px-4 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 text-xs font-600 min-h-[44px] sm:min-h-auto"
                >
                  {bulkUpdating ? <Loader2 size={14} className="animate-spin" /> : '✓ Xong'}
                </button>
                <button
                  onClick={() => setSelectedTasks(new Set())}
                  className="h-9 px-4 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 transition-colors text-xs font-600 min-h-[44px] sm:min-h-auto"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal && modal.mode === 'view' && modal.task ? (
        <TaskDetailModal
          task={modal.task as any}
          isOpen={true}
          onClose={() => setModal(null)}
          onTaskUpdate={handleSave}
          onStatusChanged={(updated) => {
            setTasks(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
            setModal(m => m && m.task ? { ...m, task: { ...m.task, ...updated } } : m);
          }}
          onEdit={() => setModal({ mode: 'edit', task: modal.task })}
          onDelete={() => handleDelete(modal.task!)}
          onArchive={modal.task.archived_at ? undefined : () => handleArchive(modal.task!)}
          onUnarchive={modal.task.archived_at ? () => handleUnarchive(modal.task!) : undefined}
          readOnly={false}
          allUsers={allUsers}
        />
      ) : modal ? (
        <AddTaskForm
          task={modal.task}
          mode={modal.mode}
          currentUser={currentUser}
          allUsers={allUsers}
          lockedTicket={modal.mode === 'create' ? lockedTicket : null}
          onClose={() => { setModal(null); setLockedTicket(null); }}
          onSave={handleSave}
        />
      ) : null}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setDeleteId(null)}>
          <div className="bg-slate-900 border border-line rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <p className="text-foreground font-600 mb-4">Xóa công việc này?</p>
            <p className="text-sm text-muted-foreground mb-6">Thao tác này không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 h-9 rounded-lg btn-ghost border border-line"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  const task = tasks.find(t => t.id === deleteId);
                  if (task) handleDelete(task);
                }}
                className="flex-1 h-9 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 font-600"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {activityLogModal.isOpen && (
        <ActivityLogModal
          isOpen={true}
          taskId={activityLogModal.taskId!}
          taskCode={activityLogModal.taskCode ?? ''}
          onClose={() => setActivityLogModal({ isOpen: false })}
        />
      )}
    </div>
  );
}
