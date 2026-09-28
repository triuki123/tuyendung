'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, X, Search, Loader2, CheckCheck, Trash2, ArrowUp, Settings2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { hasModuleAccess } from '@/lib/permissions';
import { resolveRouteModule } from '@/lib/notifications/routeModuleMap';
import { CATEGORY_META, categorize, type CategoryKey } from '@/lib/notifications/categories';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useToast } from '@/context/ToastContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import NotificationPreferencesModal from './NotificationPreferencesModal';
import NotifIcon from '@/lib/notifications/notifIcon';

interface NotifItem {
  id: string;
  type: string;
  title: string;
  message: string;
  icon?: string;
  read: boolean;
  created_at: string;
  relatedUrl?: string;
  related_url?: string;
}

interface Counts {
  total: number;
  unread: number;
  byCategory: Record<string, { total: number; unread: number }>;
}

type ReadFilter = 'all' | 'unread' | 'read';
const LIMIT = 20;

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} ngày trước`;
  return d.toLocaleDateString('vi-VN');
}

export default function NotificationCenterClient() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<{ id: string; role?: string; permissions?: any } | null>(null);

  const [category, setCategory] = useState<CategoryKey | 'all'>('all');
  const [read, setRead] = useState<ReadFilter>('all');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [items, setItems] = useState<NotifItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts>({ total: 0, unread: 0, byCategory: {} });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [confirmDeleteRead, setConfirmDeleteRead] = useState(false);
  const [deletingRead, setDeletingRead] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const reqSeq = useRef(0);
  const pageRef = useRef(1);
  pageRef.current = page;

  useEffect(() => {
    const u = getCurrentUser();
    if (u) setUser({ id: u.id, role: u.role, permissions: (u as any).module_permissions });
  }, []);

  // Debounce ô tìm kiếm.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const fetchPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (!user?.id) return;
      const seq = ++reqSeq.current;
      if (replace) {
        setLoading(true);
        setHasNew(false);
      } else setLoadingMore(true);
      try {
        const params = new URLSearchParams({
          userId: user.id,
          category,
          read,
          page: String(pageNum),
          limit: String(LIMIT),
        });
        if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
        const res = await fetch(`/api/notifications/center?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (seq !== reqSeq.current) return; // bỏ kết quả cũ (race)
        setTotal(data.total || 0);
        setCounts(data.counts || { total: 0, unread: 0, byCategory: {} });
        setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
      } catch (e) {
        console.error('fetch center error:', e);
      } finally {
        if (seq === reqSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [user?.id, category, read, debouncedQ]
  );

  // Đổi bộ lọc → reset về trang 1.
  useEffect(() => {
    setPage(1);
    fetchPage(1, true);
  }, [fetchPage]);

  // Realtime: có thông báo mới → nếu đang ở trang 1 tự tải lại; nếu đang xem trang
  // sâu hơn thì chỉ báo "có mới" (tránh giật khi đang đọc).
  const realtimeRef = useRef<() => void>(() => {});
  realtimeRef.current = () => {
    if (pageRef.current === 1) fetchPage(1, true);
    else setHasNew(true);
  };
  const handleRealtime = useCallback(() => realtimeRef.current(), []);
  useRealtimeData(['notifications'], { enabled: !!user?.id, onUpdate: handleRealtime });

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(next, false);
  };

  const reloadTop = () => {
    setPage(1);
    fetchPage(1, true);
  };

  const canNavigate = (url: string): boolean => {
    if (!url) return false;
    if (!user || user.role === 'super_admin' || !user.permissions) return true;
    const moduleId = resolveRouteModule(url);
    if (!moduleId) return true;
    return hasModuleAccess(user.permissions, moduleId);
  };

  const urlOf = (n: NotifItem) => n.relatedUrl || n.related_url || '';

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: 'PUT' }).catch(() => {});
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setCounts((c) => ({ ...c, unread: Math.max(0, c.unread - 1) }));
  };

  const openItem = (n: NotifItem) => {
    const url = urlOf(n);
    if (!n.read) markRead(n.id);
    if (url && canNavigate(url)) router.push(url);
  };

  const removeItem = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
    setItems((prev) => prev.filter((n) => n.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  const markAllRead = async () => {
    if (!user?.id || counts.unread === 0) return;
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setCounts((c) => ({ ...c, unread: 0 }));
      if (read === 'unread') fetchPage(1, true);
      toast.show('Đã đánh dấu tất cả là đã đọc', 'success');
    } catch {
      toast.show('Không thể đánh dấu đã đọc', 'error');
    }
  };

  const doDeleteRead = async () => {
    if (!user?.id) return;
    setDeletingRead(true);
    try {
      const res = await fetch(`/api/notifications/center?userId=${user.id}&scope=read`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.show('Đã xoá các thông báo đã đọc', 'success');
      setConfirmDeleteRead(false);
      reloadTop();
    } catch {
      toast.show('Không thể xoá thông báo', 'error');
    } finally {
      setDeletingRead(false);
    }
  };

  const chips = useMemo(
    () => [
      { key: 'all' as const, label: 'Tất cả', icon: '🗂️', count: counts.total, unread: counts.unread },
      ...CATEGORY_META.map((m) => ({
        key: m.key,
        label: m.label,
        icon: m.icon,
        count: counts.byCategory[m.key]?.total ?? 0,
        unread: counts.byCategory[m.key]?.unread ?? 0,
      })).filter((c) => c.count > 0),
    ],
    [counts]
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Trung Tâm Thông Báo</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Toàn bộ thông báo của bạn — phân loại, tìm kiếm và điều hướng nhanh.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPrefsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-foreground hover:bg-white/5"
          >
            <Settings2 className="h-4 w-4" /> Tùy chọn
          </button>
          <button
            onClick={markAllRead}
            disabled={counts.unread === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-foreground hover:bg-white/5 disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" /> Đánh dấu tất cả đã đọc
          </button>
          <button
            onClick={() => setConfirmDeleteRead(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" /> Xoá đã đọc
          </button>
        </div>
      </div>

      {/* Báo có thông báo mới (khi đang xem trang sâu) */}
      {hasNew && (
        <button
          onClick={reloadTop}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-600 text-indigo-300 hover:bg-indigo-500/20"
        >
          <ArrowUp className="h-3.5 w-3.5" /> Có thông báo mới — Tải lại
        </button>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
          <p className="text-xs text-muted-foreground">Tổng cộng</p>
          <p className="mt-1 text-2xl font-700 text-foreground">{counts.total}</p>
        </div>
        <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
          <p className="text-xs text-muted-foreground">Chưa đọc</p>
          <p className="mt-1 text-2xl font-700 text-indigo-400">{counts.unread}</p>
        </div>
      </div>

      {/* Chips phân loại */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chips.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c.key as CategoryKey | 'all')}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                active
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                  : 'border-white/10 text-muted-foreground hover:bg-white/5'
              }`}
            >
              <span>{c.icon}</span>
              <span>{c.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-indigo-500/30' : 'bg-white/10'}`}>
                {c.count}
              </span>
              {c.unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
            </button>
          );
        })}
      </div>

      {/* Filters + Search */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
        <div className="inline-flex rounded-xl border border-white/10 p-0.5 text-xs">
          {(['all', 'unread', 'read'] as ReadFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRead(r)}
              className={`rounded-lg px-3 py-1.5 transition ${
                read === r ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r === 'all' ? 'Tất cả' : r === 'unread' ? 'Chưa đọc' : 'Đã đọc'}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm trong tiêu đề, nội dung…"
            className="w-full rounded-xl border border-white/10 bg-[#162033] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Danh sách */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Bell className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Không có thông báo nào</p>
          <p className="text-xs mt-1 opacity-60">Thử đổi bộ lọc hoặc từ khoá tìm kiếm.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="divide-y divide-white/5">
            {items.map((n) => {
              const url = urlOf(n);
              const clickable = !!url && canNavigate(url);
              const cat = CATEGORY_META.find((m) => m.key === categorize(n.type));
              return (
                <div
                  key={n.id}
                  onClick={clickable ? () => openItem(n) : undefined}
                  className={`flex items-start gap-3 p-4 transition ${
                    clickable ? 'cursor-pointer hover:bg-white/5' : ''
                  } ${!n.read ? 'bg-indigo-500/[0.04]' : ''}`}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-indigo-400">
                    <NotifIcon name={n.icon} className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                      <p className="truncate text-sm font-600 text-foreground">{n.title}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {cat && (
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {cat.label}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground/70">{relativeTime(n.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    {!n.read && (
                      <button
                        onClick={() => markRead(n.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-indigo-400"
                        title="Đánh dấu đã đọc"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => removeItem(n.id)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-red-400"
                      title="Xoá"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {items.length < total && (
            <div className="border-t border-white/5 p-3 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs text-indigo-400 hover:bg-white/5 disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Xem thêm ({total - items.length})
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteRead}
        title="Xoá thông báo đã đọc?"
        message="Toàn bộ thông báo ĐÃ ĐỌC của bạn sẽ bị xoá vĩnh viễn và không thể khôi phục. Thông báo chưa đọc vẫn được giữ lại."
        confirmLabel="Xoá đã đọc"
        cancelLabel="Huỷ"
        danger
        busy={deletingRead}
        onConfirm={doDeleteRead}
        onCancel={() => setConfirmDeleteRead(false)}
      />

      {user?.id && (
        <NotificationPreferencesModal
          userId={user.id}
          isOpen={prefsOpen}
          onClose={() => setPrefsOpen(false)}
        />
      )}
    </div>
  );
}
