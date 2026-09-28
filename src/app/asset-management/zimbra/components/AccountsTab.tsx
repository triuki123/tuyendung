'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, RefreshCw, Copy, Check, AlertCircle, X, Edit2, Ban, RotateCcw } from 'lucide-react';
import AccountEditModal from './AccountEditModal';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const PAGE_SIZE = 25;

interface ZimbraAccount {
  id: string;
  name: string;
  displayName?: string;
  status?: string;
  description?: string;
}

interface Props {
  isActive: boolean;
  isAdmin: boolean;
  getHeaders: () => Record<string, string>;
  onToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return (data && typeof data.error === 'string' && data.error) || fallback;
  } catch {
    return fallback;
  }
}

export default function AccountsTab({ isActive, isAdmin, getHeaders, onToast }: Props) {
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<ZimbraAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [domain, setDomain] = useState('');
  const [query, setQuery] = useState('');
  const fetchedRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', displayName: '', password: '' });
  const [creating, setCreating] = useState(false);

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Edit account modal state
  const [editTarget, setEditTarget] = useState<ZimbraAccount | null>(null);

  // ESC đóng modal hiển thị mật khẩu mới (AccountEditModal tự xử lý ESC riêng)
  const closePasswordModal = React.useCallback(() => {
    setNewPassword(null);
    setResetTarget(null);
    setCopied(false);
  }, []);
  useEscapeKey(closePasswordModal, Boolean(newPassword && resetTarget));

  useEffect(() => {
    if (isActive && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchAccounts(domain, query, 0, false);
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll: auto-load next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchAccounts(domain, query, offset, true);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, offset, domain, query]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAccounts(d: string, q: string, nextOffset: number, append: boolean) {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      if (d) params.set('domain', d);
      if (q) params.set('search', q);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(nextOffset));
      const res = await fetch(`/api/zimbra/accounts?${params}`, { headers: getHeaders() });
      if (!res.ok) {
        const msg = await readError(res, 'Không thể tải danh sách tài khoản Zimbra');
        onToast(msg, 'error');
        return;
      }
      const data = await res.json();
      const fetched: ZimbraAccount[] = data.accounts ?? [];
      if (append) {
        setAccounts((prev) => [...prev, ...fetched]);
      } else {
        setAccounts(fetched);
      }
      // Trust Zimbra `more` flag, but fall back to page-fullness: a full page
      // likely means more rows exist even if the flag is absent/unreliable.
      setHasMore(!!data.more || fetched.length >= PAGE_SIZE);
      setOffset(nextOffset + fetched.length);
    } catch (err) {
      console.error('Zimbra accounts fetch error:', err);
      onToast('Không thể tải danh sách tài khoản Zimbra', 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function handleSearch() {
    setOffset(0);
    fetchAccounts(domain, query, 0, false);
  }

  function handleLoadMore() {
    fetchAccounts(domain, query, offset, true);
  }

  async function handleToggleStatus(acc: ZimbraAccount) {
    const closing = acc.status !== 'closed';
    const verb = closing ? 'đóng' : 'mở lại';
    const ok = await confirm({ title: `${closing ? 'Đóng' : 'Mở lại'} tài khoản?`, message: `Bạn có chắc muốn ${verb} tài khoản ${acc.name}?`, confirmLabel: closing ? 'Đóng' : 'Mở lại', danger: closing });
    if (!ok) return;
    setStatusLoadingId(acc.id);
    try {
      const res = await fetch('/api/zimbra/accounts', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ id: acc.id, status: closing ? 'closed' : 'active' }),
      });
      if (!res.ok) {
        const msg = await readError(res, `Không thể ${verb} tài khoản`);
        onToast(msg, 'error');
        return;
      }
      const data = await res.json();
      const newStatus: string | undefined = data?.account?.status;
      setAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? { ...a, status: newStatus ?? (closing ? 'closed' : 'active') } : a))
      );
      onToast(`Đã ${verb} ${acc.name}`, 'success');
    } catch (err) {
      console.error('Zimbra toggle status error:', err);
      onToast(`Không thể ${verb} tài khoản`, 'error');
    } finally {
      setStatusLoadingId(null);
    }
  }

  async function handleCreate() {
    if (!createForm.email.trim()) { onToast('Vui lòng nhập email', 'warning'); return; }
    setCreating(true);
    try {
      const body: Record<string, string> = { email: createForm.email.trim() };
      if (createForm.displayName.trim()) body.displayName = createForm.displayName.trim();
      if (createForm.password.trim()) body.password = createForm.password.trim();
      const res = await fetch('/api/zimbra/accounts', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await readError(
          res,
          res.status === 409 ? 'Tài khoản đã tồn tại' : 'Không thể tạo tài khoản'
        );
        onToast(msg, 'error');
        return;
      }
      onToast('Tạo tài khoản thành công', 'success');
      setShowCreate(false);
      setCreateForm({ email: '', displayName: '', password: '' });
      fetchAccounts(domain, query, 0, false);
    } catch (err) {
      console.error('Zimbra create account error:', err);
      onToast('Không thể tạo tài khoản', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(email: string) {
    setResetting(true);
    try {
      const res = await fetch('/api/zimbra/accounts/reset-password', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const msg = await readError(res, 'Không thể đặt lại mật khẩu');
        onToast(msg, 'error');
        return;
      }
      const data = await res.json();
      setNewPassword(data.newPassword);
      setResetTarget(email);
    } catch (err) {
      console.error('Zimbra reset password error:', err);
      onToast('Không thể đặt lại mật khẩu', 'error');
    } finally {
      setResetting(false);
    }
  }

  function copyPassword() {
    if (!newPassword) return;
    navigator.clipboard.writeText(newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Domain (vd: example.com)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 w-full sm:w-48"
        />
        <input
          type="text"
          placeholder="Tìm kiếm tài khoản..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 flex-1"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-sm transition disabled:opacity-50"
        >
          <Search size={15} />
          Tìm
        </button>
        {isAdmin && (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm transition"
          >
            <Plus size={15} />
            Tạo mới
          </button>
        )}
      </div>

      {/* Create form (inline) */}
      {isAdmin && showCreate && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 mb-4 space-y-3">
          <h3 className="text-white font-semibold text-sm">Tạo tài khoản mới</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="email"
              placeholder="Email *"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <input
              type="text"
              placeholder="Tên hiển thị"
              value={createForm.displayName}
              onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <input
              type="password"
              placeholder="Mật khẩu (tùy chọn)"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowCreate(false); setCreateForm({ email: '', displayName: '', password: '' }); }}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition"
            >
              Hủy
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm transition disabled:opacity-50"
            >
              {creating ? 'Đang tạo...' : 'Tạo'}
            </button>
          </div>
        </div>
      )}

      {/* Loading initial */}
      {loading && (
        <div className="flex items-center gap-3 py-10 justify-center text-ink-muted">
          <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      )}

      {/* Table */}
      {!loading && (
        accounts.length === 0 ? (
          <p className="text-center text-ink-muted py-10 text-sm">Không tìm thấy tài khoản nào.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-bright uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-bright uppercase tracking-wide">Tên hiển thị</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-bright uppercase tracking-wide">Mô tả</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-bright uppercase tracking-wide">Trạng thái</th>
                    {isAdmin && <th className="px-4 py-3 text-xs font-semibold text-ink-bright uppercase tracking-wide text-center">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {accounts.map((acc) => {
                    const isClosed = acc.status === 'closed';
                    const statusBusy = statusLoadingId === acc.id;
                    return (
                    <tr key={acc.id} className={`hover:bg-hover transition-colors ${isClosed ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-white font-medium">{acc.name}</td>
                      <td className="px-4 py-3 text-ink-bright">{acc.displayName || '—'}</td>
                      <td className="px-4 py-3 text-ink-muted max-w-xs truncate" title={acc.description || ''}>{acc.description || '—'}</td>
                      <td className="px-4 py-3">
                        {acc.status ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            isClosed
                              ? 'bg-red-900/40 text-red-300 border border-red-700/40'
                              : 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
                          }`}>
                            {isClosed ? 'Đã đóng' : acc.status === 'active' ? 'Hoạt động' : acc.status}
                          </span>
                        ) : <span className="text-ink-faint">—</span>}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                            <button
                              onClick={() => setEditTarget(acc)}
                              className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-cyan-700/30 hover:bg-cyan-700/50 border border-cyan-600/30 text-cyan-300 rounded text-xs transition"
                              title="Sửa"
                            >
                              <Edit2 size={13} />
                              <span className="hidden sm:inline">Sửa</span>
                            </button>
                            <button
                              onClick={() => handleResetPassword(acc.name)}
                              disabled={resetting}
                              className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-orange-700/30 hover:bg-orange-700/50 border border-orange-600/30 text-orange-300 rounded text-xs transition disabled:opacity-50"
                              title="Đặt lại mật khẩu"
                            >
                              <RefreshCw size={13} />
                              <span className="hidden sm:inline">Đặt lại MK</span>
                            </button>
                            <button
                              onClick={() => handleToggleStatus(acc)}
                              disabled={statusBusy}
                              className={`inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded text-xs transition disabled:opacity-50 border ${
                                isClosed
                                  ? 'bg-emerald-700/30 hover:bg-emerald-700/50 border-emerald-600/30 text-emerald-300'
                                  : 'bg-red-700/30 hover:bg-red-700/50 border-red-600/30 text-red-300'
                              }`}
                              title={statusBusy ? '...' : isClosed ? 'Mở lại' : 'Đóng'}
                            >
                              {isClosed ? <RotateCcw size={13} /> : <Ban size={13} />}
                              <span className="hidden sm:inline">{statusBusy ? '...' : isClosed ? 'Mở lại' : 'Đóng'}</span>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Infinite scroll sentinel + fallback button */}
            {hasMore && (
              <div ref={sentinelRef} className="mt-4">
                {loadingMore ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-ink-muted text-sm">
                    <span className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin inline-block" />
                    Đang tải thêm...
                  </div>
                ) : (
                  <button
                    onClick={handleLoadMore}
                    className="w-full py-2 text-sm text-cyan-400 hover:text-cyan-300 bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700 rounded-lg transition"
                  >
                    Tải thêm
                  </button>
                )}
              </div>
            )}
          </>
        )
      )}

      {/* Reset password result modal */}
      {newPassword && resetTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) closePasswordModal(); }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Mật khẩu mới</h3>
              <button onClick={closePasswordModal}
                className="text-ink-muted hover:text-white transition">
                <X size={18} />
              </button>
            </div>
            <p className="text-ink-muted text-sm mb-3">
              Tài khoản: <span className="text-white font-medium">{resetTarget}</span>
            </p>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 mb-4">
              <code className="text-cyan-300 text-sm flex-1 font-mono select-all">{newPassword}</code>
              <button onClick={copyPassword} className="text-ink-muted hover:text-white transition flex-shrink-0">
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </div>
            {!copied && (
              <p className="flex items-center gap-1.5 text-yellow-400 text-xs">
                <AlertCircle size={13} />
                Hãy sao chép mật khẩu trước khi đóng cửa sổ này.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Edit account modal */}
      {editTarget && (
        <AccountEditModal
          account={editTarget}
          getHeaders={getHeaders}
          onToast={onToast}
          onSuccess={() => {
            setEditTarget(null);
            fetchAccounts(domain, query, 0, false);
          }}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
