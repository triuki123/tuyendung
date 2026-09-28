'use client';

import React, { useState } from 'react';
import { X, Loader2, Layers, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { bulkFieldsByGroup, BULK_FIELDS, type BulkField } from '@/lib/users/bulkFields';

interface Props {
  count: number;
  ids: string[];
  onClose: () => void;
  onApplied: (updated: number) => void;
}

/** Sửa hàng loạt: bật trường cần đổi, nhập 1 lần → áp cho tất cả người đã chọn. */
export default function BulkUserEditModal({ count, ids, onClose, onApplied }: Props) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, any>>({});
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  const groups = bulkFieldsByGroup();
  const enabledCount = enabled.size;

  const toggle = (f: BulkField) => {
    setError('');
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(f.key)) next.delete(f.key);
      else {
        next.add(f.key);
        // giá trị mặc định khi bật
        setValues(v => ({ ...v, [f.key]: v[f.key] ?? (f.type === 'boolean' ? true : f.type === 'money' ? 0 : '') }));
      }
      return next;
    });
  };

  const setVal = (key: string, val: any) => setValues(v => ({ ...v, [key]: val }));

  const buildChanges = (): Record<string, any> | null => {
    const changes: Record<string, any> = {};
    for (const f of BULK_FIELDS) {
      if (!enabled.has(f.key)) continue;
      const raw = values[f.key];
      if (f.type === 'boolean') changes[f.key] = !!raw;
      else if (f.type === 'money') changes[f.key] = raw === '' || raw === null || raw === undefined ? null : Number(raw);
      else {
        // select / text — bắt buộc chọn/nhập nếu là select
        if (f.type === 'select' && (raw === '' || raw == null)) { setError(`Hãy chọn giá trị cho "${f.label}".`); return null; }
        changes[f.key] = raw === '' ? null : raw;
      }
    }
    return changes;
  };

  const apply = async () => {
    setError('');
    if (enabledCount === 0) { setError('Hãy bật ít nhất một trường để cập nhật.'); return; }
    const changes = buildChanges();
    if (!changes) return;
    setApplying(true);
    try {
      const res = await fetch('/api/users/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, changes }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Cập nhật thất bại'); return; }
      onApplied(json.updated ?? ids.length);
    } catch {
      setError('Lỗi kết nối khi cập nhật.');
    } finally {
      setApplying(false);
    }
  };

  const control = (f: BulkField) => {
    const on = enabled.has(f.key);
    const cls = `w-full h-9 px-3 rounded-lg text-sm text-foreground bg-[#162033] border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-40`;
    if (f.type === 'select') {
      return (
        <select disabled={!on} value={values[f.key] ?? ''} onChange={e => setVal(f.key, e.target.value)} className={cls}>
          <option value="">-- Chọn --</option>
          {f.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (f.type === 'boolean') {
      return (
        <div className="flex gap-1.5">
          {[['true', 'Bật'], ['false', 'Tắt']].map(([v, lbl]) => {
            const active = String(!!values[f.key]) === v;
            return (
              <button key={v} type="button" disabled={!on} onClick={() => setVal(f.key, v === 'true')}
                className={`h-9 px-4 rounded-lg text-sm font-600 border transition-colors disabled:opacity-40 ${active && on ? 'bg-indigo-600 text-white border-indigo-500' : 'border-line text-muted-foreground hover:text-foreground'}`}>
                {lbl}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <div className="relative">
        <input type={f.type === 'money' ? 'number' : f.type === 'time' ? 'time' : 'text'} disabled={!on} step={f.step}
          value={values[f.key] ?? ''} onChange={e => setVal(f.key, e.target.value)}
          className={cls} />
        {f.hint && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-muted-foreground pointer-events-none">{f.hint}</span>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15"><Layers className="h-5 w-5 text-indigo-400" /></span>
            <div>
              <h2 className="text-base font-700 text-foreground">Sửa hàng loạt</h2>
              <p className="text-2xs text-muted-foreground">Áp cho <b className="text-foreground">{count}</b> người đã chọn</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-2xs text-amber-200/90 leading-relaxed">Chỉ trường bạn <b>bật</b> mới được ghi đè cho tất cả người đã chọn. Các trường còn lại giữ nguyên của từng người.</p>
          </div>

          {groups.map(({ group, fields }) => (
            <div key={group}>
              <h3 className="text-xs font-700 text-muted-foreground uppercase tracking-wider mb-2.5">{group}</h3>
              <div className="space-y-2.5">
                {fields.map(f => {
                  const on = enabled.has(f.key);
                  return (
                    <div key={f.key} className={`grid grid-cols-[auto_1fr] sm:grid-cols-[220px_1fr] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${on ? 'border-indigo-500/40 bg-indigo-500/[0.06]' : 'border-white/5'}`}>
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" checked={on} onChange={() => toggle(f)} className="w-4 h-4 rounded accent-indigo-500" />
                        <span className={`text-sm ${on ? 'text-foreground font-500' : 'text-muted-foreground'}`}>{f.label}</span>
                      </label>
                      <div>{control(f)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/5 px-6 py-4">
          <p className="text-2xs text-muted-foreground">
            {enabledCount > 0 ? <span className="text-indigo-300"><CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />{enabledCount} trường sẽ cập nhật cho {count} người</span> : 'Chưa bật trường nào'}
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
            <button onClick={apply} disabled={applying || enabledCount === 0}
              className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 inline-flex items-center gap-1.5 disabled:opacity-50">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />} Áp dụng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
