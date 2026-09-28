'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, CalendarCheck, Plus, CheckCircle2, Circle, ExternalLink, Trash2, Pencil } from 'lucide-react';
import {
  inputCls, Field, Modal, ModalFooter, EmptyState, type Company, type LegalPerms,
} from './shared';
import { DeleteFooter } from './DocumentsTab';

interface Item {
  id: string; company_id: string | null; company_name: string | null;
  name: string; agency: string | null;
  frequency: 'yearly' | 'quarterly' | 'monthly' | 'once';
  due_month: number | null; due_day: number | null;
  link_url: string | null; note: string | null; active: boolean;
  done_periods: string[];
}

const FREQ_LABEL: Record<string, string> = {
  yearly: 'Hằng năm', quarterly: 'Hằng quý', monthly: 'Hằng tháng', once: 'Một lần',
};

/** Sinh danh sách kỳ của NĂM HIỆN TẠI cho 1 mốc (chuẩn hoá chuỗi khớp DB). */
function periodsOf(item: Item, year: number): { key: string; label: string }[] {
  switch (item.frequency) {
    case 'yearly': return [{ key: String(year), label: `Năm ${year}` }];
    case 'quarterly':
      return [1, 2, 3, 4].map((q) => ({ key: `${year}-Q${q}`, label: `Quý ${q}` }));
    case 'monthly':
      return Array.from({ length: 12 }, (_, i) => ({
        key: `${year}-${String(i + 1).padStart(2, '0')}`, label: `T${i + 1}`,
      }));
    case 'once': return [{ key: 'once', label: 'Hoàn thành' }];
  }
}

/** Tab Lịch tuân thủ — nghĩa vụ định kỳ theo luật, đánh dấu đã nộp từng kỳ. */
export default function ComplianceTab({ companies, perms }: { companies: Company[]; perms: LegalPerms }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Item | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<Item | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch('/api/legal/compliance').then((r) => r.json());
      setItems(j.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (item: Item, period: string, done: boolean) => {
    if (!perms.edit) return;
    setBusyKey(`${item.id}:${period}`);
    try {
      const res = await fetch('/api/legal/compliance/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, period, undo: done }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((i) => i.id === item.id
          ? { ...i, done_periods: done ? i.done_periods.filter((p) => p !== period) : [...i.done_periods, period] }
          : i));
      }
    } finally { setBusyKey(''); }
  };

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.due_month ?? 99) - (b.due_month ?? 99) || a.name.localeCompare(b.name, 'vi')),
    [items]
  );

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {items.length} nghĩa vụ định kỳ · năm {year}
        </p>
        {perms.create && (
          <button onClick={() => setEditItem('new')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 justify-center">
            <Plus className="h-4 w-4" /> Thêm nghĩa vụ
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={<CalendarCheck />} text="Chưa có nghĩa vụ nào"
          hint='Bấm "Thêm nghĩa vụ" — vd báo cáo lao động, lệ phí môn bài...' />
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
          {sorted.map((item) => {
            const periods = periodsOf(item, year);
            return (
              <div key={item.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-600 text-foreground">{item.name}</p>
                      <span className="px-1.5 py-0.5 rounded text-2xs font-600 bg-sky-500/15 text-sky-400">
                        {FREQ_LABEL[item.frequency]}
                      </span>
                      {item.link_url && (
                        <a href={item.link_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-2xs text-indigo-400 hover:underline">
                          Mở trang liên quan <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.company_name ?? 'Mọi công ty'}
                      {item.agency && <> · Nộp: {item.agency}</>}
                      {item.due_day && <> · Hạn: {item.due_day}{item.due_month ? `/${item.due_month}` : ' hằng kỳ'}</>}
                    </p>
                    {item.note && <p className="text-2xs text-muted-foreground/70 mt-0.5">{item.note}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {perms.edit && (
                      <button onClick={() => setEditItem(item)} className="p-1.5 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {perms.remove && (
                      <button onClick={() => setDeleteFor(item)} className="p-1.5 text-red-400/60 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Các kỳ trong năm — bấm để đánh dấu đã nộp / bỏ đánh dấu */}
                <div className="flex flex-wrap gap-1.5">
                  {periods.map((p) => {
                    const done = item.done_periods.includes(p.key);
                    const busy = busyKey === `${item.id}:${p.key}`;
                    return (
                      <button key={p.key}
                        onClick={() => toggle(item, p.key, done)}
                        disabled={!perms.edit || busy}
                        title={done ? 'Bấm để bỏ đánh dấu' : 'Bấm để đánh dấu đã nộp'}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-600 transition-colors ${
                          done
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                            : 'border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5'
                        } ${perms.edit ? '' : 'cursor-default'}`}>
                        {busy
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3 opacity-50" />}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editItem && (
        <ItemFormModal item={editItem === 'new' ? null : editItem} companies={companies}
          onClose={() => setEditItem(null)} onDone={() => { setEditItem(null); load(); }} />
      )}
      {deleteFor && (
        <Modal title="Xóa nghĩa vụ" onClose={() => setDeleteFor(null)}>
          <p className="text-sm text-foreground">
            Xóa <b>{deleteFor.name}</b> và toàn bộ lịch sử các kỳ đã nộp?
          </p>
          <DeleteFooter url={`/api/legal/compliance?id=${deleteFor.id}`}
            onClose={() => setDeleteFor(null)} onDone={() => { setDeleteFor(null); load(); }} />
        </Modal>
      )}
    </div>
  );
}

function ItemFormModal({ item, companies, onClose, onDone }: {
  item: Item | null; companies: Company[]; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({
    companyId: item?.company_id ?? '',
    name: item?.name ?? '',
    agency: item?.agency ?? '',
    frequency: item?.frequency ?? 'yearly',
    dueMonth: item?.due_month ? String(item.due_month) : '',
    dueDay: item?.due_day ? String(item.due_day) : '',
    linkUrl: item?.link_url ?? '',
    note: item?.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.name.trim()) { setErr('Nhập tên nghĩa vụ'); return; }
    setSaving(true); setErr('');
    try {
      const isNew = !item;
      const res = await fetch('/api/legal/compliance', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew
          ? { ...form, companyId: form.companyId || null }
          : {
              id: item!.id, company_id: form.companyId || null, name: form.name,
              agency: form.agency, frequency: form.frequency,
              due_month: form.dueMonth ? Number(form.dueMonth) : null,
              due_day: form.dueDay ? Number(form.dueDay) : null,
              link_url: form.linkUrl, note: form.note,
            }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi lưu'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={item ? 'Sửa nghĩa vụ' : 'Thêm nghĩa vụ'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Tên nghĩa vụ *">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Báo cáo tình hình sử dụng lao động" className={inputCls} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Áp dụng cho" hint="Để trống = mọi công ty">
            <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className={inputCls}>
              <option value="">Mọi công ty</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Chu kỳ">
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Item['frequency'] })} className={inputCls}>
              <option value="yearly">Hằng năm</option>
              <option value="quarterly">Hằng quý</option>
              <option value="monthly">Hằng tháng</option>
              <option value="once">Một lần</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {form.frequency === 'yearly' && (
            <Field label="Tháng đến hạn">
              <select value={form.dueMonth} onChange={(e) => setForm({ ...form, dueMonth: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
              </select>
            </Field>
          )}
          <Field label="Ngày đến hạn (trong kỳ)">
            <input inputMode="numeric" value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              placeholder="VD: 25" className={inputCls} />
          </Field>
        </div>
        <Field label="Nơi nộp / cơ quan">
          <input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })}
            placeholder="VD: Sở LĐ-TB&XH" className={inputCls} />
        </Field>
        <Field label="Link liên quan" hint="VD: /nguon-nhan-luc/bien-dong-nhan-su (trang xuất Mẫu 01/PLI)">
          <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Ghi chú">
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="VD: căn cứ pháp lý, hạn chi tiết" className={inputCls} />
        </Field>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={item ? 'Lưu' : 'Thêm'} />
    </Modal>
  );
}
