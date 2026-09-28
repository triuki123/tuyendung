'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, UserCheck, ArrowRight, ShieldCheck, Search, ChevronDown } from 'lucide-react';
import { normalizeVN } from '@/lib/utils/searchVN';
import { useToast } from '@/context/ToastContext';

interface Props {
  userId: string;
  role: string;
}

interface UserOpt {
  id: string;
  name: string;
  email: string | null;
}

interface Delegation {
  id: string;
  approver_user_id: string;
  approver_name: string | null;
  approver_email: string | null;
  target_user_id: string;
  target_name: string | null;
  target_email: string | null;
  target_company_name: string | null;
  note: string | null;
}

/** Ô chọn 1 người, tìm không phân biệt dấu (normalizeVN). */
function UserSelect({
  users, value, onChange, placeholder, excludeId,
}: {
  users: UserOpt[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const selected = users.find((u) => u.id === value) || null;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const filtered = useMemo(() => {
    const nq = normalizeVN(q).trim();
    return users
      .filter((u) => u.id !== excludeId)
      .filter((u) => !nq || normalizeVN(u.name).includes(nq) || normalizeVN(u.email || '').includes(nq))
      .slice(0, 50);
  }, [users, q, excludeId]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm text-left text-foreground"
      >
        <span className={selected ? '' : 'text-muted-foreground'}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên hoặc email (không dấu)…"
              className="w-full bg-transparent text-sm text-foreground outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Không tìm thấy</p>
            ) : filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onChange(u.id); setOpen(false); setQ(''); }}
                className="w-full px-3 py-2 text-left hover:bg-white/5"
              >
                <p className="text-sm text-foreground">{u.name}</p>
                {u.email && <p className="text-2xs text-muted-foreground">{u.email}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DelegationsManager({ userId, role }: Props) {
  const toast = useToast();
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [rows, setRows] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [approverId, setApproverId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', 'x-current-user-id': userId, 'x-current-user-role': role }),
    [userId, role]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, dRes] = await Promise.all([
        fetch('/api/users?status=active', { headers }),
        fetch('/api/leave/delegations', { headers }),
      ]);
      const uJson = await uRes.json();
      const uArr = Array.isArray(uJson) ? uJson : (uJson?.data ?? []);
      setUsers(uArr.map((u: any) => ({ id: String(u.id), name: u.name, email: u.email ?? null })));
      const dJson = await dRes.json();
      if (dRes.ok && Array.isArray(dJson?.data)) setRows(dJson.data);
    } catch {
      toast.error('Không tải được dữ liệu ủy quyền');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!approverId || !targetId) { toast.error('Chọn cả người duyệt và người được duyệt cho'); return; }
    if (approverId === targetId) { toast.error('Không thể tự ủy quyền cho chính mình'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/leave/delegations', {
        method: 'POST', headers,
        body: JSON.stringify({ approverUserId: approverId, targetUserId: targetId, note: note.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Không lưu được');
      toast.success('Đã thêm ủy quyền duyệt công');
      setApproverId(''); setTargetId(''); setNote('');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Lỗi khi thêm');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/leave/delegations/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error();
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success('Đã gỡ ủy quyền');
    } catch {
      toast.error('Không gỡ được');
    }
  };

  // Nhóm theo người duyệt để dễ đọc "A duyệt cho những ai".
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; email: string | null; items: Delegation[] }>();
    for (const r of rows) {
      const k = r.approver_user_id;
      if (!m.has(k)) m.set(k, { name: r.approver_name || r.approver_user_id, email: r.approver_email, items: [] });
      m.get(k)!.items.push(r);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-teal-400 mt-0.5" />
          <div>
            <h2 className="text-base font-600 text-foreground">Ủy Quyền Duyệt Công</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Áp dụng cho <b className="text-foreground">cả 3 loại đơn: Nghỉ Phép · Bù Công (lẻ &amp; nhiều ngày) · Tăng Ca</b>.
              Mặc định người duyệt là <b className="text-foreground">quản lý trực tiếp theo sơ đồ tổ chức</b> —
              gán ở đây để giao thêm quyền duyệt của một nhân sự cho người khác, kể cả khác nhánh sơ đồ.
              Người được gán sẽ <b className="text-foreground">nhận thông báo</b> khi nhân sự đó tạo đơn và
              <b className="text-foreground"> duyệt được</b> đơn. Đây là <b className="text-foreground">bổ sung</b>, quản lý trực tiếp vẫn duyệt như cũ.
            </p>
          </div>
        </div>
      </div>

      {/* Form thêm */}
      <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Người duyệt (được giao quyền)</label>
            <UserSelect users={users} value={approverId} onChange={setApproverId} placeholder="Chọn người duyệt…" excludeId={targetId} />
          </div>
          <div className="hidden sm:flex items-center justify-center pb-2 text-muted-foreground">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div>
            <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Duyệt công cho</label>
            <UserSelect users={users} value={targetId} onChange={setTargetId} placeholder="Chọn nhân sự…" excludeId={approverId} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (tùy chọn) — vd: Giám Đốc giao khi đi công tác"
            className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none"
          />
          <button
            onClick={add}
            disabled={saving || !approverId || !targetId}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm ủy quyền
          </button>
        </div>
      </div>

      {/* Danh sách */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <UserCheck className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có ủy quyền nào</p>
          <p className="text-xs mt-1 opacity-60">Ai không được gán ở đây sẽ đi theo sơ đồ tổ chức như cũ</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.name + g.email} className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
              <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
                <UserCheck className="h-4 w-4 text-teal-400" />
                <div>
                  <p className="text-sm font-600 text-foreground">{g.name}</p>
                  {g.email && <p className="text-2xs text-muted-foreground">{g.email}</p>}
                </div>
                <span className="ml-auto text-2xs text-muted-foreground">duyệt công cho {g.items.length} người</span>
              </div>
              <div className="divide-y divide-white/5">
                {g.items.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">
                        {d.target_name || d.target_user_id}
                        {d.target_company_name && <span className="text-2xs text-muted-foreground"> · {d.target_company_name}</span>}
                      </p>
                      {d.note && <p className="text-2xs text-muted-foreground/70 truncate">📝 {d.note}</p>}
                    </div>
                    <button onClick={() => remove(d.id)} className="btn-ghost rounded-lg p-1.5 text-red-400 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
