'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Plus, ClipboardPen, X, FileBarChart, Link2, Check, Copy, Settings2, Circle, CheckCircle2, PauseCircle,
} from 'lucide-react';
import { listForms, createForm, FormTemplate, fmtDateTime } from '@/lib/api/formApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import ErrorState from '@/components/ui/ErrorState';

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  draft:  { label: 'Nháp',      color: 'text-ink-muted bg-slate-500/15 border-slate-500/30', icon: Circle },
  active: { label: 'Đang mở',   color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', icon: CheckCircle2 },
  closed: { label: 'Đã đóng',   color: 'text-amber-400 bg-amber-500/15 border-amber-500/30', icon: PauseCircle },
};

/** Kho Biểu Mẫu nội bộ (Google Forms style) — danh sách + tạo mới. */
export default function FormsListClient() {
  const router = useRouter();
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try { setForms(await listForms()); } catch (e) { console.error(e); setLoadError(true); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const copyLink = async (f: FormTemplate) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/forms/${f.token}`);
      setCopiedId(f.id);
      setTimeout(() => setCopiedId(''), 2000);
    } catch { /* noop */ }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5">
            <ClipboardPen className="h-6 w-6 text-purple-400" /> Biểu Mẫu
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Tạo biểu mẫu nội bộ, chia sẻ link công khai và thu thập phản hồi
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-accent flex items-center gap-2">
          <Plus className="h-4 w-4" /> Tạo Biểu Mẫu
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <ErrorState onRetry={load} />
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <ClipboardPen className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có biểu mẫu nào</p>
          <p className="text-xs mt-1 opacity-60">Tạo biểu mẫu để thu thập thông tin nội bộ qua link công khai</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {forms.map(f => {
            const st = STATUS_META[f.status];
            const StIcon = st.icon;
            return (
              <div key={f.id} className="rounded-2xl border border-line-subtle p-5 flex flex-col gap-3 hover:border-indigo-500/30 transition-colors" style={{ background: 'var(--card)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 shrink-0">
                    <ClipboardPen className="h-5 w-5 text-purple-400" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {f.is_internal ? (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-600 bg-amber-500/15 text-amber-300 border-amber-500/30">🔒 Nội Bộ</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-600 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">🌐 Công Khai</span>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-600 ${st.color}`}>
                      <StIcon className="h-3 w-3" /> {st.label}
                    </span>
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-600 text-foreground leading-snug">{f.title}</h2>
                  {f.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.description}</p>}
                </div>
                <div className="flex items-center gap-3 text-2xs text-muted-foreground">
                  <span className="flex items-center gap-1"><FileBarChart className="h-3.5 w-3.5" /> {f.submission_count ?? 0} phản hồi</span>
                  <span className="flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" /> {f.field_count ?? 0} trường</span>
                </div>
                <div className="flex items-center gap-2 border-t border-line-subtle pt-3 mt-auto">
                  <button onClick={() => router.push(`/bieu-mau/${f.id}`)} className="flex-1 btn-ghost rounded-xl border border-line py-2 text-xs font-600 flex items-center justify-center gap-1.5">
                    <Settings2 className="h-3.5 w-3.5" /> Quản lý
                  </button>
                  <button onClick={() => copyLink(f)} className="btn-ghost rounded-xl border border-line px-3 py-2" title="Copy link công khai" aria-label="Copy link công khai">
                    {copiedId === f.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Link2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateFormModal onClose={() => setShowCreate(false)} onCreated={(f) => { setShowCreate(false); router.push(`/bieu-mau/${f.id}`); }} />}
    </div>
  );
}

function CreateFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: (f: FormTemplate) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  const handleSave = async () => {
    if (!title.trim()) { setError('Thiếu tiêu đề'); return; }
    setSaving(true);
    setError('');
    try {
      const f = await createForm({ title: title.trim(), description: description.trim() || undefined });
      markClean();
      onCreated(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Tạo Biểu Mẫu Mới</h2>
          <button onClick={guardedClose} aria-label="Đóng" className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tiêu đề *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" placeholder="VD: Khảo sát mức độ hài lòng nội bộ" />
          </div>
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Mô tả (tùy chọn)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none resize-none" placeholder="Mô tả ngắn về biểu mẫu" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <p className="text-2xs text-muted-foreground">Biểu mẫu mới có sẵn trường &quot;Họ và Tên&quot;. Bạn thêm các trường khác ở trang quản lý.</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={handleSave} disabled={saving || !title.trim()} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Tạo & Cấu Hình
          </button>
        </div>
      </div>
    </div>
  );
}
