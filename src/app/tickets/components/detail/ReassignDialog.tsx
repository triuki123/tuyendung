'use client';

import { useState, useEffect } from 'react';
import { UserCheck, X, Search, Loader2 } from 'lucide-react';
import { normalizeVN, includesVN } from '@/lib/utils/searchVN';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface User {
  id: string;
  name: string;
  email?: string;
  role?: string;
  tags?: string[];
}

interface ReassignDialogProps {
  ticketCode: string;
  currentAssignedId?: string;
  userId: string;
  onConfirm: (newUserId: string, newUserName: string, note: string) => Promise<void>;
  onCancel: () => void;
}

export default function ReassignDialog({
  ticketCode, currentAssignedId, userId, onConfirm, onCancel,
}: ReassignDialogProps) {
  const [users, setUsers]         = useState<User[]>([]);
  const [filtered, setFiltered]   = useState<User[]>([]);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<User | null>(null);
  const [note, setNote]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [fetching, setFetching]   = useState(true);
  const [error, setError]         = useState('');

  useEscapeKey(onCancel);

  // Load danh sách người dùng
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/users?userId=${userId}`);
        if (res.ok) {
          const data: User[] = await res.json();
          // Lọc bỏ bản thân và người được giao hiện tại
          const eligible = data.filter(u => u.id !== currentAssignedId);
          setUsers(eligible);
          setFiltered(eligible);
        }
      } catch {}
      finally { setFetching(false); }
    };
    load();
  }, [userId, currentAssignedId]);

  // Filter theo search
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(users);
    } else {
      const q = normalizeVN(search);
      setFiltered(users.filter(u =>
        normalizeVN(u.name).includes(q) ||
        normalizeVN(u.email || '').includes(q) ||
        u.tags?.some(t => typeof t === 'string' && normalizeVN(t).includes(q))
      ));
    }
  }, [search, users]);

  const handleConfirm = async () => {
    if (!selected) { setError('Vui lòng chọn người nhận mới'); return; }
    setLoading(true);
    setError('');
    try {
      await onConfirm(selected.id, selected.name, note.trim());
    } catch {
      setError('Có lỗi xảy ra, thử lại.');
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div className="bg-card border border-border rounded-2xl shadow-modal w-full max-w-md mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-indigo/15 border border-indigo/25 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-indigo" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Chuyển ticket</h3>
              <p className="text-xs text-muted-foreground">{ticketCode}</p>
            </div>
          </div>
          <button onClick={onCancel}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên, email, phòng ban..."
              className="w-full pl-9 pr-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 min-h-[180px]">
          {fetching && (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Đang tải...</span>
            </div>
          )}

          {!fetching && filtered.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Không tìm thấy người dùng
            </div>
          )}

          {!fetching && filtered.map((user) => {
            const isSelected = selected?.id === user.id;
            return (
              <button
                key={user.id}
                onClick={() => { setSelected(user); setError(''); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                  isSelected
                    ? 'bg-indigo/15 border border-indigo/30'
                    : 'hover:bg-secondary border border-transparent'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                  isSelected ? 'bg-indigo text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo' : 'text-foreground'}`}>
                    {user.name}
                  </p>
                  {user.email && (
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  )}
                  {user.tags && user.tags.length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {user.tags.slice(0, 3).map((tag: any, i: number) => {
                        const label = typeof tag === 'string' ? tag : tag?.name ?? '';
                        return label ? (
                          <span key={i} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {label}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <div className="w-4 h-4 rounded-full bg-indigo flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Note input */}
        <div className="px-5 pb-3 flex-shrink-0 space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">
            Ghi chú chuyển (tùy chọn)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Lý do chuyển ticket, hướng dẫn thêm..."
            rows={2}
            className="w-full p-3 bg-input border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border flex-shrink-0">
          <div>
            {selected && (
              <p className="text-xs text-muted-foreground">
                Chuyển cho: <span className="font-semibold text-foreground">{selected.name}</span>
              </p>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground bg-muted hover:bg-secondary rounded-lg transition-colors">
              Hủy
            </button>
            <button onClick={handleConfirm} disabled={loading || !selected}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo text-white rounded-lg hover:bg-indigo/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <UserCheck className="w-4 h-4" />
              }
              {loading ? 'Đang chuyển...' : 'Xác nhận chuyển'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
