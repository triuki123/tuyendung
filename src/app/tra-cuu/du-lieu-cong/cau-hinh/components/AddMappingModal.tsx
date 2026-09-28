'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Search, ChevronDown } from 'lucide-react';
import { includesVN } from '@/lib/utils/searchVN';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Props {
  machineId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddMappingModal({ machineId, isOpen, onClose, onSuccess }: Props) {
  const toast = useToast();
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose, isOpen);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [form, setForm] = useState({
    employee_code: '',
    user_id: '',
  });

  // Filter users based on search term
  const filteredUsers = users.filter((u) =>
    includesVN(u.name, searchTerm) || includesVN(u.email, searchTerm)
  );

  // Get selected user name
  const selectedUser = users.find((u) => u.id === form.user_id);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      const json = await res.json();
      // API returns array directly or {error: ...}
      if (Array.isArray(json)) {
        setUsers(json);
      } else if (json.error) {
        console.error('API error:', json.error);
      } else if (json.data && Array.isArray(json.data)) {
        setUsers(json.data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!form.employee_code || !form.user_id) {
      toast.error('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/attendance/machine-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: machineId,
          employee_code: form.employee_code,
          user_id: form.user_id,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setForm({ employee_code: '', user_id: '' });
        markClean();
        onSuccess();
        onClose();
      } else {
        toast.error('Lỗi: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error adding mapping:', err);
      toast.error('Lỗi khi lưu mapping');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-slate-950 overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">Thêm Mapping</h2>
          <button onClick={guardedClose} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 p-6" onChange={markDirty}>
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground">MÃ NHÂN VIÊN TRÊN MÁY *</label>
                <input
                  type="text"
                  placeholder="VD: 1, 2, 101..."
                  value={form.employee_code}
                  onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                  className="h-9 w-full rounded-lg border border-line bg-slate-900/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                />
                <p className="text-xs text-muted-foreground mt-1">Nhập mã nhân viên từ máy chấm công</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground">CHỌN NHÂN VIÊN HỆ THỐNG *</label>
                {users.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Không có nhân viên</p>
                ) : (
                  <div className="relative">
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Tìm nhân viên..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        className="h-9 w-full rounded-lg border border-line bg-slate-900/50 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                      />
                    </div>

                    {/* Dropdown List */}
                    {showDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-line bg-slate-900 max-h-60 overflow-y-auto z-10 shadow-lg">
                        {filteredUsers.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                            Không tìm thấy nhân viên
                          </div>
                        ) : (
                          filteredUsers.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setForm({ ...form, user_id: u.id });
                                setSearchTerm('');
                                setShowDropdown(false);
                                markDirty();
                              }}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-800 transition ${
                                form.user_id === u.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-foreground'
                              }`}
                            >
                              <div className="font-500">{u.name}</div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {/* Selected User Badge */}
                    {selectedUser && (
                      <div className="mt-2 px-3 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10">
                        <p className="text-xs font-500 text-indigo-300">✓ {selectedUser.name}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
                <p className="text-xs text-indigo-300">
                  💡 <strong>Mã máy:</strong> <span className="font-mono">{form.employee_code || '(chưa nhập)'}</span> sẽ được gán cho <strong>{selectedUser?.name || '(chưa chọn)'}</strong>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
            <button onClick={guardedClose} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-slate-700 transition">
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.employee_code || !form.user_id}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 font-600 disabled:opacity-40 transition"
            >
              {submitting ? 'Đang lưu...' : 'Lưu Mapping'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
