'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Plus, Trash2, Pencil, Check, X, Zap, Lock, ChevronUp, ChevronDown, AlertTriangle, UserCircle2, Bell, Search,
} from 'lucide-react';
import {
  listObTemplates, createObTemplate, updateObTemplate, deleteObTemplate,
  ObTemplate, OB_CATEGORY_LABELS,
} from '@/lib/api/offboardingApi';
import { useConfirm } from '@/context/ConfirmContext';

const CATEGORIES = ['hcns', 'asset', 'it', 'finance', 'other'];

interface SimpleUser { id: string; name: string; avatar: string | null; }

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const stored = localStorage.getItem('assetflow_auth');
  if (!stored) return {};
  try {
    const u = JSON.parse(stored);
    const h: Record<string, string> = {};
    if (u.id) h['x-current-user-id'] = u.id;
    if (u.role) h['x-current-user-role'] = u.role;
    if (u.module_permissions) h['x-user-permissions'] = JSON.stringify(u.module_permissions);
    return h;
  } catch { return {}; }
}

/** Dropdown có ô tìm kiếm — dùng portal fixed để không bị overflow:hidden cắt. */
function UserSearchDropdown({ users, placeholder, onSelect, excludeIds = [] }: {
  users: SimpleUser[];
  placeholder: string;
  onSelect: (id: string) => void;
  excludeIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 224 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const openDropdown = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const dropH = 240;
      setPos({
        top: spaceBelow >= dropH ? r.bottom + 4 : r.top - dropH - 4,
        left: r.left,
        width: Math.max(r.width, 224),
      });
    }
    setOpen(o => !o);
    setQ('');
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return users.filter(u => !excludeIds.includes(u.id) && (!qn || u.name.toLowerCase().includes(qn)));
  }, [users, q, excludeIds]);

  return (
    <>
      <button ref={btnRef} type="button" onClick={openDropdown}
        className="h-7 rounded-md px-2 text-2xs text-muted-foreground bg-hover border border-line hover:border-indigo-500/40 hover:text-foreground transition-colors whitespace-nowrap">
        {placeholder}
      </button>
      {open && (
        <div ref={dropRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, background: 'var(--card)' }}
          className="rounded-xl border border-line shadow-xl overflow-hidden">
          <div className="p-2 border-b border-line-subtle">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                placeholder="Tìm tên..."
                className="w-full h-7 pl-6 pr-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-center text-2xs text-muted-foreground">Không tìm thấy</p>
            ) : filtered.map(u => (
              <button key={u.id} type="button"
                onClick={() => { onSelect(u.id); setOpen(false); setQ(''); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-hover transition-colors">
                <div className="h-5 w-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-2xs text-indigo-300 shrink-0 font-600">
                  {u.name.charAt(0)}
                </div>
                <span className="text-xs text-foreground truncate">{u.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function ChecklistConfigPanel() {
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<ObTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('hcns');
  const [newRequired, setNewRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [notifyRecipients, setNotifyRecipients] = useState<(SimpleUser & { department_name: string | null })[]>([]);

  const loadNotifyRecipients = () =>
    fetch('/api/hr/offboarding/notify-recipients', { headers: authHeaders() })
      .then(r => r.json()).then(j => { if (j.success) setNotifyRecipients(j.data); })
      .catch(() => {});

  const addNotifyRecipient = async (userId: string) => {
    if (!userId || notifyRecipients.some(r => r.id === userId)) return;
    await fetch('/api/hr/offboarding/notify-recipients', {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    loadNotifyRecipients();
  };

  const removeNotifyRecipient = async (userId: string) => {
    await fetch('/api/hr/offboarding/notify-recipients', {
      method: 'DELETE', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    setNotifyRecipients(prev => prev.filter(r => r.id !== userId));
  };

  const load = async () => {
    setLoading(true);
    try { setTemplates(await listObTemplates()); }
    catch (e: any) { setError(e.message || 'Lỗi server'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    loadNotifyRecipients();
    fetch('/api/users?status=active&limit=200', { headers: authHeaders() })
      .then(r => r.json())
      .then(j => {
        const list: any[] = Array.isArray(j) ? j : j.data || [];
        setUsers(list.map((u: any) => ({ id: u.id, name: u.name, avatar: u.avatar })));
      })
      .catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, ObTemplate[]> = {};
    for (const t of templates) (g[t.category] ||= []).push(t);
    return g;
  }, [templates]);

  const patch = async (id: string, body: Partial<ObTemplate>) => {
    setError('');
    try {
      const updated = await updateObTemplate(id, body);
      setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, ...updated } : t));
    } catch (e: any) { setError(e.message || 'Lỗi server'); }
  };

  const move = async (t: ObTemplate, dir: -1 | 1) => {
    const list = grouped[t.category] || [];
    const idx = list.findIndex((x) => x.id === t.id);
    const swap = list[idx + dir];
    if (!swap) return;
    setError('');
    try {
      await Promise.all([
        updateObTemplate(t.id, { sort_order: swap.sort_order }),
        updateObTemplate(swap.id, { sort_order: t.sort_order }),
      ]);
      await load();
    } catch (e: any) { setError(e.message || 'Lỗi server'); }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setSaving(true); setError('');
    try {
      await createObTemplate({ title: newTitle, description: newDesc || undefined, category: newCategory, required: newRequired });
      setNewTitle(''); setNewDesc(''); setAdding(false);
      await load();
    } catch (e: any) { setError(e.message || 'Lỗi server'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (t: ObTemplate) => {
    if (!await confirm({ title: 'Xóa đầu mục?', message: `Xóa đầu mục "${t.title}"? Quy trình đã tạo trước đó không bị ảnh hưởng.`, confirmLabel: 'Xóa', danger: true })) return;
    setError('');
    try { await deleteObTemplate(t.id); await load(); }
    catch (e: any) { setError(e.message || 'Lỗi server'); }
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    await patch(editId, { title: editTitle, description: editDesc || null });
    setEditId('');
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
        Mỗi quy trình nghỉ việc mới sẽ <span className="text-foreground font-600">chụp lại các đầu mục đang bật</span> tại thời điểm tạo
        (quy trình cũ không bị ảnh hưởng khi sửa cấu hình). Đầu mục có nhãn <Zap className="inline h-3 w-3 text-amber-400" /> <span className="text-amber-400">tự động</span> sẽ
        bung thành từng dòng theo tài sản đang cấp phát cho nhân sự. Đầu mục <span className="text-foreground font-600">bắt buộc</span> phải
        được check hết mới bấm được nút xác nhận hoàn tất.
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {CATEGORIES.filter((c) => grouped[c]?.length).map((cat) => {
        const cl = OB_CATEGORY_LABELS[cat] || OB_CATEGORY_LABELS.other;
        const list = grouped[cat];
        return (
          <div key={cat} className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="border-b border-line-subtle px-4 py-3">
              <p className={`text-xs font-600 uppercase tracking-wider ${cl.color}`}>{cl.label} ({list.length})</p>
            </div>
            <div className="divide-y divide-line-subtle">
              {list.map((t, idx) => (
                <div key={t.id} className={`flex items-start gap-3 p-3.5 ${!t.enabled ? 'opacity-45' : ''}`}>
                  <button onClick={() => patch(t.id, { enabled: !t.enabled })} title={t.enabled ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}
                    className={`mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors relative ${t.enabled ? 'bg-indigo-600' : 'bg-hover-strong'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${t.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>

                  <div className="min-w-0 flex-1">
                    {editId === t.id ? (
                      <div className="space-y-1.5">
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus
                          className="w-full h-9 rounded-lg px-2.5 text-sm text-foreground bg-surface-2 border border-indigo-500/40 focus:outline-none" />
                        <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Mô tả (tùy chọn)"
                          className="w-full h-8 rounded-lg px-2.5 text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/40" />
                        <div className="flex gap-1.5">
                          <button onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs text-white"><Check className="h-3 w-3" /> Lưu</button>
                          <button onClick={() => setEditId('')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-hover"><X className="h-3 w-3" /> Hủy</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                          {t.title}
                          {t.auto_type && <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-2xs text-amber-400"><Zap className="h-3 w-3" /> tự động</span>}
                          {t.is_system && <span title="Đầu mục hệ thống — không xóa được"><Lock className="h-3 w-3 text-muted-foreground" /></span>}
                        </p>
                        {t.description && <p className="text-2xs text-muted-foreground mt-0.5">{t.description}</p>}
                      </>
                    )}
                  </div>

                  {/* Assignee */}
                  <div className="shrink-0 flex items-center gap-1">
                    {t.assignee_name ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-1 text-2xs text-indigo-300 max-w-[100px]">
                        <UserCircle2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{t.assignee_name}</span>
                        <button onClick={() => patch(t.id, { assignee_id: null })} className="ml-0.5 hover:text-red-400"><X className="h-2.5 w-2.5" /></button>
                      </span>
                    ) : (
                      <UserSearchDropdown users={users} placeholder="+ Giao cho..."
                        onSelect={id => patch(t.id, { assignee_id: id })} />
                    )}
                  </div>

                  <button onClick={() => patch(t.id, { required: !t.required })}
                    className={`shrink-0 rounded-md px-2 py-1 text-2xs font-600 transition-colors ${t.required ? 'bg-rose-500/15 text-rose-400' : 'bg-hover text-muted-foreground'}`}>
                    {t.required ? 'Bắt buộc' : 'Tùy chọn'}
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={() => move(t, -1)} disabled={idx === 0} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => move(t, 1)} disabled={idx === list.length - 1} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronDown className="h-3.5 w-3.5" /></button>
                    {!t.auto_type && (
                      <button onClick={() => { setEditId(t.id); setEditTitle(t.title); setEditDesc(t.description || ''); }}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    )}
                    <button onClick={() => handleDelete(t)} className="rounded p-1 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {adding ? (
        <div className="rounded-2xl border border-indigo-500/30 p-4 space-y-3" style={{ background: 'var(--card)' }}>
          <p className="text-sm font-600 text-foreground">Thêm đầu mục mới</p>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus placeholder="Tên đầu mục, VD: Thu hồi thẻ ra vào tòa nhà"
            className="w-full h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Mô tả / hướng dẫn thực hiện (tùy chọn)"
            className="w-full h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
          <div className="flex flex-wrap items-center gap-3">
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
              className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none">
              {CATEGORIES.map((c) => <option key={c} value={c}>{OB_CATEGORY_LABELS[c].label}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} className="accent-indigo-600" />
              Bắt buộc hoàn thành trước khi đóng quy trình
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="rounded-xl px-3 py-1.5 text-sm text-muted-foreground hover:bg-hover">Hủy</button>
            <button onClick={handleAdd} disabled={saving || !newTitle.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-sm font-600 text-white disabled:opacity-50">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Thêm
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:border-indigo-500/40 transition-colors">
          <Plus className="h-4 w-4" /> Thêm đầu mục checklist
        </button>
      )}

      {/* Người nhận thông báo */}
      <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="border-b border-line-subtle px-4 py-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          <div>
            <p className="text-xs font-600 text-foreground">Người nhận thông báo</p>
            <p className="text-2xs text-muted-foreground">Được thông báo mỗi khi có quy trình nghỉ việc mới. Nếu để trống, hệ thống tự thông báo nhóm có quyền Nguồn Nhân Lực.</p>
          </div>
        </div>
        <div className="p-3 space-y-2">
          {notifyRecipients.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {notifyRecipients.map(r => (
                <span key={r.id} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-200">
                  <UserCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-500">{r.name}</span>
                  {r.department_name && <span className="text-amber-300/50">· {r.department_name}</span>}
                  <button onClick={() => removeNotifyRecipient(r.id)} className="ml-1 hover:text-red-400 transition-colors"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <UserSearchDropdown users={users} placeholder="+ Thêm người nhận thông báo..."
            excludeIds={notifyRecipients.map(r => r.id)}
            onSelect={addNotifyRecipient} />
        </div>
      </div>
    </div>
  );
}
