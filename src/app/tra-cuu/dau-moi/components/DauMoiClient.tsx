'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Users, Search, Plus, Phone, Mail, Pencil, Trash2, X, ArrowLeft,
  Loader2, Building2, MapPin, Briefcase, ChevronDown,
} from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import ErrorState from '@/components/ui/ErrorState';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  user_id: string | null;
  responsibility: string;
  note: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  // populated từ JOIN users + departments + sub_departments + positions
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_department: string | null;
  user_sub_department: string | null;
  user_position: string | null;
  user_avatar: string | null;
  user_role: string | null;
  user_work_location: string | null;
  user_status: string | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  department: string | null;
  sub_department: string | null;
  position: string | null;
  avatar: string | null;
  work_location: string | null;
  role: string;
  status: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'from-indigo-500 to-purple-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-pink-500 to-rose-500',
  'from-blue-500 to-cyan-500',
  'from-violet-500 to-fuchsia-500',
];

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase();
}

// ─── UserDropdown — tìm kiếm người đại diện ──────────────────────────────────

function UserDropdown({
  value,
  onChange,
}: {
  value: UserOption | null;
  onChange: (u: UserOption | null) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Đóng khi click ra ngoài
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Tính vị trí fixed cho dropdown (tránh bị clip bởi overflow:hidden của modal)
  function openDropdown() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(true);
  }

  // Fetch users: ngay khi mở (q rỗng → load tất cả), debounce 200ms khi gõ
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const delay = q === '' ? 0 : 200; // load ngay nếu q rỗng
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/search-users?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (json.success) {
          setOptions(json.data ?? []);
        } else {
          console.error('search-users error:', json.error);
          setOptions([]);
        }
      } catch (err) {
        console.error('search-users fetch error:', err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, delay);
  }, [q, open]);

  function select(u: UserOption) {
    onChange(u);
    setOpen(false);
    setQ('');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm transition-colors hover:border-line-strong focus:outline-none"
      >
        {value ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {value.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.avatar} alt={value.name} className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-700 text-white ${getAvatarGradient(value.name)}`}>
                {getInitials(value.name)}
              </div>
            )}
            <span className="truncate text-foreground">{value.name}</span>
            {(value.company || value.department) && (
              <span className="hidden sm:inline text-xs text-muted-foreground truncate">
                · {[value.company, value.department].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">Tìm và chọn người đại diện...</span>
        )}
        <div className="flex flex-shrink-0 items-center gap-1">
          {value && (
            <span onClick={clear} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown panel — dùng fixed để thoát khỏi overflow:hidden của modal */}
      {open && (
        <div className="overflow-hidden rounded-xl border border-line shadow-xl" style={{ ...dropdownStyle, background: 'var(--card)' }}>
          {/* Search */}
          <div className="border-b border-line-subtle p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                className="h-8 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50"
                placeholder="Tìm tên, email, phòng ban..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {/* Results */}
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : options.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Không tìm thấy người dùng</p>
            ) : (
              options.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => select(u)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-hover"
                >
                  {u.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar} alt={u.name} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-700 text-white ${getAvatarGradient(u.name)}`}>
                      {getInitials(u.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-500 text-foreground">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[u.company, u.department].filter(Boolean).join(' · ') || u.email}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ContactForm Modal ────────────────────────────────────────────────────────

interface FormState {
  responsibility: string;
  user_id: string;
  note: string;
  sort_order: number;
}

const EMPTY_FORM: FormState = { responsibility: '', user_id: '', note: '', sort_order: 0 };

function ContactFormModal({
  editing,
  contacts,
  userRole,
  userId,
  onClose,
  onSaved,
}: {
  editing: Contact | null;
  contacts: Contact[];
  userRole: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    editing
      ? { responsibility: editing.responsibility, user_id: editing.user_id ?? '', note: editing.note ?? '', sort_order: editing.sort_order }
      : EMPTY_FORM
  );
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(() => {
    if (!editing?.user_id) return null;
    return {
      id: editing.user_id,
      name: editing.user_name ?? '',
      email: editing.user_email ?? '',
      phone: editing.user_phone ?? null,
      company: null,
      department: editing.user_department ?? null,
      sub_department: editing.user_sub_department ?? null,
      position: editing.user_position ?? null,
      avatar: editing.user_avatar ?? null,
      work_location: editing.user_work_location ?? null,
      role: editing.user_role ?? 'user',
      status: editing.user_status ?? 'active',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  function handleSelectUser(u: UserOption | null) {
    setSelectedUser(u);
    setForm((f) => ({ ...f, user_id: u?.id ?? '' }));
    markDirty();
  }

  async function handleSave() {
    if (!form.responsibility.trim()) { setError('Vui lòng nhập công việc phụ trách'); return; }
    setSaving(true);
    setError('');
    try {
      const url = editing ? `/api/contacts/${editing.id}` : '/api/contacts';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-role': userRole,
          'x-current-user-id': userId,
        },
        body: JSON.stringify({
          responsibility: form.responsibility.trim(),
          user_id: form.user_id || null,
          note: form.note.trim() || null,
          sort_order: form.sort_order,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Lỗi lưu dữ liệu'); return; }
      markClean();
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}>
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-line" style={{ background: 'var(--card)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-base font-700 text-foreground">
            {editing ? 'Chỉnh sửa đầu mối liên hệ' : 'Thêm đầu mối liên hệ'}
          </h2>
          <button onClick={guardedClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6" onChange={markDirty}>

          {/* Công Việc Phụ Trách */}
          <div>
            <label className="mb-1.5 block text-xs font-600 uppercase tracking-wider text-muted-foreground">
              Công Việc Phụ Trách <span className="text-red-400">*</span>
            </label>
            <input
              className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/50 focus:outline-none"
              placeholder="VD: Bảo Trì Bảo Dưỡng Toà Nhà"
              value={form.responsibility}
              onChange={(e) => setForm({ ...form, responsibility: e.target.value })}
            />
          </div>

          {/* Người Đại Diện */}
          <div>
            <label className="mb-1.5 block text-xs font-600 uppercase tracking-wider text-muted-foreground">
              Người Đại Diện
            </label>
            <UserDropdown value={selectedUser} onChange={handleSelectUser} />
          </div>

          {/* Auto-populated fields từ User — chỉ show khi đã chọn user */}
          {selectedUser && (
            <div className="rounded-xl border border-line-subtle p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Thông Tin Người Đại Diện</p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {/* Phòng Ban — luôn hiển thị, N/A nếu không có */}
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-indigo-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phòng Ban</p>
                    <p className={`text-sm ${selectedUser.department ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                      {selectedUser.department || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Bộ Phận */}
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-violet-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Bộ Phận</p>
                    <p className={`text-sm ${selectedUser.sub_department ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                      {selectedUser.sub_department || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Chức Vụ */}
                <div className="flex items-start gap-2">
                  <Briefcase className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Chức Vụ</p>
                    <p className={`text-sm ${selectedUser.position ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                      {selectedUser.position || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Số Điện Thoại */}
                <div className="flex items-start gap-2">
                  <Phone className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Điện Thoại</p>
                    <p className={`text-sm ${selectedUser.phone ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                      {selectedUser.phone?.trim() || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Email — full width */}
                <div className="flex items-start gap-2 col-span-2">
                  <Mail className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-indigo-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className={`text-sm ${selectedUser.email ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                      {selectedUser.email || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ghi Chú */}
          <div>
            <label className="mb-1.5 block text-xs font-600 uppercase tracking-wider text-muted-foreground">
              Ghi Chú
            </label>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/50 focus:outline-none resize-none"
              placeholder="Ghi chú thêm nếu có..."
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="rounded-xl border border-line px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.responsibility.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            {saving ? <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu...</span> : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DauMoiClient() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');

  const isAdmin = userRole === 'super_admin' || userRole === 'admin';

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUserRole(u.role ?? '');
        setUserId(u.id ?? '');
      } catch { /* empty */ }
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/contacts${params}`);
      const json = await res.json();
      if (json.success) setContacts(json.data);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  function openCreate() { setEditing(null); setShowForm(true); }
  function openEdit(c: Contact) { setEditing(c); setShowForm(true); }

  async function handleDelete(id: string) {
    if (!confirm('Xóa đầu mối liên hệ này?')) return;
    await fetch(`/api/contacts/${id}`, {
      method: 'DELETE',
      headers: { 'x-current-user-role': userRole },
    });
    fetchContacts();
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      {/* Back link */}
      <Link href="/tra-cuu" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Tra Cứu
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Đầu Mối Liên Hệ</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Nhân sự phụ trách từng mảng công việc</p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" /> Thêm liên hệ
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/50 focus:outline-none"
          placeholder="Tìm theo công việc, tên người, phòng ban..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <ErrorState onRetry={fetchContacts} />
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Users className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có đầu mối liên hệ nào</p>
          {isAdmin && (
            <p className="text-xs mt-1 opacity-60">Nhấn "Thêm liên hệ" để tạo mới</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {contacts.map((c) => {
            const displayName = c.user_name ?? '—';
            const hasUser = !!c.user_id;

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-line-subtle overflow-hidden transition-all hover:border-white/15"
                style={{ background: 'var(--card)' }}
              >
                {/* Tiêu đề: Công Việc Phụ Trách */}
                <div className="px-4 pt-4 pb-3 border-b border-line-subtle">
                  <p className="text-xs font-600 uppercase tracking-wider text-indigo-400 mb-0.5">
                    Công Việc Phụ Trách
                  </p>
                  <h3 className="text-sm font-700 text-foreground leading-snug">{c.responsibility}</h3>
                </div>

                {/* Người Đại Diện */}
                <div className="px-4 py-3">
                  {hasUser ? (
                    <div className="flex items-center gap-3 mb-3">
                      {c.user_avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.user_avatar} alt={displayName} className="h-11 w-11 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0" />
                      ) : (
                        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-700 text-white ${getAvatarGradient(displayName)}`}>
                          {getInitials(displayName)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-600 text-foreground truncate">{displayName}</p>
                        {c.user_position && (
                          <p className="text-xs text-muted-foreground truncate">{c.user_position}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                      <div className="h-11 w-11 flex-shrink-0 rounded-full border border-dashed border-white/15 flex items-center justify-center">
                        <Users className="h-4 w-4 opacity-40" />
                      </div>
                      <p className="text-sm italic opacity-50">Chưa có người đại diện</p>
                    </div>
                  )}

                  {/* Chi tiết liên hệ */}
                  {hasUser && (
                    <div className="space-y-1.5">
                      {/* Phòng Ban */}
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400/70" />
                        <span className="text-xs text-muted-foreground truncate">
                          {c.user_department || <span className="italic opacity-50">N/A</span>}
                        </span>
                      </div>
                      {/* Bộ Phận */}
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-violet-400/70" />
                        <span className="text-xs text-muted-foreground truncate">
                          {c.user_sub_department || <span className="italic opacity-50">N/A</span>}
                        </span>
                      </div>
                      {/* SĐT */}
                      {c.user_phone?.trim() ? (
                        <a href={`tel:${c.user_phone.trim()}`} className="flex items-center gap-2 group/phone">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400/70 group-hover/phone:text-emerald-400 transition-colors" />
                          <span className="text-xs text-muted-foreground group-hover/phone:text-foreground transition-colors">{c.user_phone.trim()}</span>
                        </a>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400/30" />
                          <span className="text-xs italic text-muted-foreground/50">N/A</span>
                        </div>
                      )}
                      {/* Email */}
                      {c.user_email ? (
                        <a href={`mailto:${c.user_email}`} className="flex items-center gap-2 group/mail">
                          <Mail className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400/70 group-hover/mail:text-indigo-400 transition-colors" />
                          <span className="text-xs text-muted-foreground truncate group-hover/mail:text-foreground transition-colors">{c.user_email}</span>
                        </a>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400/30" />
                          <span className="text-xs italic text-muted-foreground/50">N/A</span>
                        </div>
                      )}
                    </div>
                  )}

                  {c.note && (
                    <p className="mt-3 text-xs italic text-muted-foreground/60 border-t border-line-subtle pt-2">{c.note}</p>
                  )}
                </div>

                {/* Actions (admin only) */}
                {isAdmin && (
                  <div className="flex justify-end gap-1 border-t border-line-subtle px-3 py-2">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-hover transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-hover transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <ContactFormModal
          editing={editing}
          contacts={contacts}
          userRole={userRole}
          userId={userId}
          onClose={() => setShowForm(false)}
          onSaved={fetchContacts}
        />
      )}
    </div>
  );
}
