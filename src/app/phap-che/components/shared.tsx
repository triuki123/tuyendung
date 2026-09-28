'use client';

import { Loader2, X, AlertTriangle } from 'lucide-react';

/** Mảnh UI dùng chung cho các tab Pháp Chế — modal, field, badge hạn, format. */

export const inputCls = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground';

export interface Company { id: string; name: string }

export interface LegalPerms { view: boolean; create: boolean; edit: boolean; remove: boolean }

/** YYYY-MM-DD → dd/mm/yyyy; rỗng → '—'. */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const p = String(v).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
}

/** Badge cảnh báo theo days_left: quá hạn (đỏ đậm) / sắp hết hạn ≤60 ngày (đỏ) / còn xa (ẩn). */
export function ExpiryBadge({ daysLeft }: { daysLeft: number | null | undefined }) {
  if (daysLeft == null) return null;
  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-700 bg-red-500/25 text-red-300">
        <AlertTriangle className="h-3 w-3" /> Quá hạn {Math.abs(daysLeft)} ngày
      </span>
    );
  }
  if (daysLeft <= 60) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-600 bg-red-500/15 text-red-400">
        <AlertTriangle className="h-3 w-3" /> Còn {daysLeft} ngày
      </span>
    );
  }
  return null;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-2xs text-muted-foreground/60 mt-1">{hint}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden`}
        style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground truncate pr-2">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ModalFooter({ onClose, onSubmit, saving, label, danger, disabled }: {
  onClose: () => void; onSubmit: () => void; saving: boolean; label: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 -mx-6 -mb-6 mt-6">
      <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Hủy</button>
      <button onClick={onSubmit} disabled={saving || disabled}
        className={`rounded-xl px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2 ${danger ? 'bg-red-600' : 'bg-indigo-600'}`}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} {label}
      </button>
    </div>
  );
}

/** Dropdown lọc công ty — client-side (mô hình tập trung: dữ liệu đã là mọi công ty). */
export function CompanyFilter({ companies, value, onChange }: {
  companies: Company[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground">
      <option value="">Tất cả công ty</option>
      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

export function EmptyState({ icon, text, hint }: { icon: React.ReactNode; text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-muted-foreground">
      <span className="mb-3 opacity-30 [&>svg]:h-10 [&>svg]:w-10">{icon}</span>
      <p className="text-sm">{text}</p>
      {hint && <p className="text-xs mt-1 opacity-60">{hint}</p>}
    </div>
  );
}
