'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, CalendarDays, X } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface Holiday {
  id: string;
  date: string;
  name: string;
  description: string | null;
}

interface Props {
  userRole: string;
  adminId: string;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function HolidayManager({ userRole, adminId }: Props) {
  const confirm = useConfirm();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading]   = useState(true);
  const [year, setYear]         = useState(CURRENT_YEAR);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ date: '', name: '', description: '' });
  const [saving, setSaving]     = useState(false);

  // UX modal "Thêm ngày lễ": ESC + cảnh báo thay đổi chưa lưu
  const closeForm = useCallback(() => setShowForm(false), []);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(closeForm);
  useEscapeKey(guardedClose, showForm);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/attendance/holidays?year=${year}`);
      const json = await res.json();
      if (json.success) setHolidays(json.data);
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  async function handleAdd() {
    if (!form.date || !form.name || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/attendance/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-role': userRole,
          'x-current-user-id': adminId,
        },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        markClean();
        setShowForm(false);
        setForm({ date: '', name: '', description: '' });
        fetchHolidays();
      }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Xóa ngày lễ?', message: 'Xóa ngày lễ này?', confirmLabel: 'Xóa', danger: true }))) return;
    await fetch(`/api/attendance/holidays/${id}`, {
      method: 'DELETE',
      headers: { 'x-current-user-role': userRole },
    });
    setHolidays(prev => prev.filter(h => h.id !== id));
  }

  function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-700 text-foreground">Ngày Lễ & Nghỉ Chính Phủ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cấu hình ngày nghỉ lễ để hệ thống tính đúng ngày làm việc và deadline bảng công
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Year selector */}
          <div className="flex items-center gap-1 rounded-xl border border-line px-1 py-1">
            <button onClick={() => setYear(y => y - 1)} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-hover-strong">◀</button>
            <span className="w-12 text-center text-sm font-600 text-foreground">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-hover-strong">▶</button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Thêm ngày lễ
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : holidays.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground rounded-2xl border border-line-subtle" style={{ background: 'var(--card)' }}>
          <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có ngày lễ nào trong năm {year}</p>
          <p className="text-xs mt-1 opacity-60">Thêm để hệ thống tính đúng deadline bảng công</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
          {holidays.map((h, i) => (
            <div key={h.id} className={`flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition-colors ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                <CalendarDays className="h-5 w-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-foreground">{h.name}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(h.date)}</p>
                {h.description && <p className="text-xs text-muted-foreground opacity-70 mt-0.5">{h.description}</p>}
              </div>
              <button
                onClick={() => handleDelete(h.id)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal thêm */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}>
          <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Thêm Ngày Lễ</h2>
              <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4" onChange={markDirty}>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Ngày *</label>
                <DateInputVN
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Tên ngày lễ *</label>
                <input
                  type="text"
                  placeholder="VD: Tết Nguyên Đán, Quốc Khánh..."
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú</label>
                <input
                  type="text"
                  placeholder="Tuỳ chọn"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button
                onClick={handleAdd}
                disabled={!form.date || !form.name || saving}
                className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-40"
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
