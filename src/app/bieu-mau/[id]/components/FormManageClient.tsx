'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, ArrowLeft, Plus, Trash2, X, Link2, Check, Asterisk, ToggleLeft, ToggleRight,
  ExternalLink, FileBarChart, Settings2, AlertTriangle, Download,
  Table2, LayoutGrid, ChevronLeft, ChevronRight, Clock, User, ChevronRight as ChevronRightSm,
  Columns3, ChevronDown, ChevronUp, Pencil, FileSpreadsheet, FileText, FileDown, Filter, Search,
} from 'lucide-react';
import { exportExcel, exportPdf } from '../lib/exportResponses';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { sanitizeHtml, looksLikeHtml } from '@/lib/sanitizeHtml';
import {
  getForm, updateForm, deleteForm, listFormFields, addFormField, updateFormFields, deleteFormField,
  getFormResponses, FormTemplate, FormField, FormResponse, FIELD_TYPE_LABELS, fmtDateTime,
} from '@/lib/api/formApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

export default function FormManageClient({ formId }: { formId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'fields' | 'responses'>('fields');
  const [respView, setRespView] = useState<'table' | 'cards'>('table');
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[] | null>(null); // cột hiện trong bảng (null = chưa khởi tạo)
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string[]>>({}); // field_key → giá trị được chọn (OR trong trường, AND giữa các trường)
  const [form, setForm] = useState<FormTemplate | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [savingDirty, setSavingDirty] = useState(false);
  const [dirty, setDirty] = useState<Record<string, { enabled?: boolean; required?: boolean; label?: string; sort_order?: number; visible_if?: import('@/lib/api/formApi').VisibleIf | null }>>({});
  const [logicOpenId, setLogicOpenId] = useState<string | null>(null);
  // Sửa tiêu đề/mô tả biểu mẫu
  const [editHeader, setEditHeader] = useState(false);
  const [hTitle, setHTitle] = useState('');
  const [hDesc, setHDesc] = useState('');
  const [hExpires, setHExpires] = useState(''); // datetime-local; rỗng = không giới hạn
  const [savingHeader, setSavingHeader] = useState(false);
  // Sửa nhãn từng trường (inline)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [f, ff, resp] = await Promise.all([getForm(formId), listFormFields(formId), getFormResponses(formId)]);
      setForm(f);
      setFields(ff);
      setResponses(resp.submissions);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [formId]);

  const publicLink = form ? `${typeof window !== 'undefined' ? window.location.origin : ''}/forms/${form.token}` : '';

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  };

  const toggleField = (id: string, key: 'enabled' | 'required') => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: !f[key] } : f));
    setDirty(prev => {
      const f = fields.find(x => x.id === id)!;
      return { ...prev, [id]: { ...(prev[id] || {}), [key]: !f[key] } };
    });
  };

  const saveDirty = async () => {
    const updates = Object.entries(dirty).map(([id, ch]) => ({ id, ...ch }));
    if (!updates.length) return;
    setSavingDirty(true);
    try {
      const updated = await updateFormFields(formId, updates as any);
      setFields(updated);
      setDirty({});
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); } finally { setSavingDirty(false); }
  };

  const handleDeleteField = async (fieldId: string) => {
    const ok = await confirm({ title: 'Xóa trường?', message: 'Xóa trường này?', confirmLabel: 'Xóa', danger: true });
    if (!ok) return;
    try { setFields(await deleteFormField(formId, fieldId)); } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };

  // Sửa tiêu đề + mô tả + hạn biểu mẫu
  const toLocalInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const openEditHeader = () => { if (!form) return; setHTitle(form.title); setHDesc(form.description || ''); setHExpires(toLocalInput(form.expires_at)); setEditHeader(true); };
  const saveHeader = async () => {
    if (!hTitle.trim()) { toast.error('Nhập tiêu đề biểu mẫu'); return; }
    setSavingHeader(true);
    try {
      const updated = await updateForm(formId, {
        title: hTitle.trim(), description: hDesc.trim() || null,
        expires_at: hExpires ? new Date(hExpires).toISOString() : null,
      } as any);
      setForm(updated);
      setEditHeader(false);
      toast.success('Đã cập nhật biểu mẫu');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); } finally { setSavingHeader(false); }
  };
  const formExpired = !!form?.expires_at && new Date(form.expires_at).getTime() < Date.now();

  // Đổi thứ tự trường: đánh lại sort_order rồi đưa các trường thay đổi vào dirty (bấm "Lưu thay đổi" để chốt).
  const moveField = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex(f => f.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= fields.length) return;
    const arr = [...fields];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    const renum = arr.map((f, i) => ({ ...f, sort_order: (i + 1) * 10 }));
    setFields(renum);
    setDirty(d => {
      const nd = { ...d };
      renum.forEach(f => {
        const old = fields.find(x => x.id === f.id);
        if (old && (old as any).sort_order !== f.sort_order) nd[f.id] = { ...(nd[f.id] || {}), sort_order: f.sort_order };
      });
      return nd;
    });
  };

  // Sửa nhãn trường (inline) → đưa vào dirty
  const startEditLabel = (f: FormField) => { setEditingFieldId(f.id); setLabelDraft(f.label); };
  const commitLabel = () => {
    const id = editingFieldId; if (!id) return;
    const val = labelDraft.trim();
    if (val) {
      setFields(prev => prev.map(f => f.id === id ? { ...f, label: val } : f));
      setDirty(d => ({ ...d, [id]: { ...(d[id] || {}), label: val } }));
    }
    setEditingFieldId(null);
  };

  // Điều kiện hiển thị (logic) của 1 trường → cập nhật state + đưa vào dirty (bấm "Lưu thay đổi").
  const setFieldVisibleIf = (id: string, vi: import('@/lib/api/formApi').VisibleIf | null) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, visible_if: vi } : f));
    setDirty(d => ({ ...d, [id]: { ...(d[id] || {}), visible_if: vi } }));
  };

  const changeStatus = async (status: string) => {
    if (!form) return;
    try { setForm(await updateForm(formId, { status })); } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };

  const toggleInternal = async () => {
    if (!form) return;
    try { setForm(await updateForm(formId, { is_internal: !form.is_internal } as any)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };

  const handleDeleteForm = async () => {
    const ok = await confirm({ title: 'Xóa biểu mẫu?', message: 'Xóa biểu mẫu này và toàn bộ phản hồi?', confirmLabel: 'Xóa', danger: true });
    if (!ok) return;
    try { await deleteForm(formId); router.push('/bieu-mau'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  };

  const doExport = async (kind: 'excel' | 'pdf') => {
    if (!form) return;
    try {
      const args = { form, responses: filteredResponses, hasRespondent };
      // Excel = toàn bộ trường (dữ liệu đầy đủ); PDF = các cột đang chọn (vừa khổ giấy).
      if (kind === 'excel') await exportExcel({ ...args, fields: enabledFields });
      else await exportPdf({ ...args, fields: visibleFields.length ? visibleFields : enabledFields });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xuất file');
    }
  };

  const exportCsv = () => {
    const cols = fields.map(f => f.field_key);
    const headers = ['Thời gian', ...fields.map(f => f.label)];
    const rows = filteredResponses.map(r => [fmtDateTime(r.created_at), ...cols.map(c => JSON.stringify(r.data?.[c] ?? ''))]);
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${form?.title || 'bieu-mau'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const dirtyCount = Object.keys(dirty).length;
  const enabledFields = useMemo(() => fields.filter(f => f.enabled), [fields]);
  const hasRespondent = useMemo(() => responses.some(r => r.candidate_name || r.candidate_email), [responses]);

  // Giá trị phân biệt mỗi trường (cho bộ lọc kiểu Excel).
  const distinctValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of enabledFields) {
      const set = new Set<string>();
      for (const r of responses) set.add(valStr(r.data?.[f.field_key]));
      map[f.field_key] = [...set].sort((a, b) => a.localeCompare(b, 'vi'));
    }
    return map;
  }, [enabledFields, responses]);

  // Lọc: trong 1 trường = OR (giá trị nào cũng được), giữa các trường = AND.
  const activeFilterCount = Object.values(filters).filter(v => v.length > 0).length;
  const filteredResponses = useMemo(() => {
    const entries = Object.entries(filters).filter(([, v]) => v.length > 0);
    if (entries.length === 0) return responses;
    return responses.filter(r => entries.every(([k, vals]) => vals.includes(valStr(r.data?.[k]))));
  }, [responses, filters]);

  const clearFilter = (key: string) => setFilters(prev => { const n = { ...prev }; delete n[key]; return n; });
  const clearAllFilters = () => setFilters({});

  const DEFAULT_COL_COUNT = 6;
  // Khởi tạo cột hiển thị 1 lần: từ localStorage, hoặc mặc định vài cột đầu (tránh 100 cột).
  useEffect(() => {
    if (visibleKeys !== null || enabledFields.length === 0) return;
    const enabledKeys = enabledFields.map(f => f.field_key);
    let init: string[] | null = null;
    try {
      const saved = localStorage.getItem(`bieumau:cols:${formId}`);
      if (saved) { const arr = JSON.parse(saved); if (Array.isArray(arr)) init = arr.filter((k: string) => enabledKeys.includes(k)); }
    } catch { /* noop */ }
    if (!init || init.length === 0) init = enabledKeys.slice(0, DEFAULT_COL_COUNT);
    setVisibleKeys(init);
  }, [enabledFields, formId, visibleKeys]);

  const setVisible = (keys: string[]) => {
    setVisibleKeys(keys);
    try { localStorage.setItem(`bieumau:cols:${formId}`, JSON.stringify(keys)); } catch { /* noop */ }
  };
  const toggleCol = (key: string) => {
    const cur = new Set(visibleKeys ?? []);
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    setVisible(enabledFields.map(f => f.field_key).filter(k => cur.has(k))); // giữ thứ tự trường
  };
  const visibleFields = useMemo(() => {
    if (visibleKeys === null) return enabledFields.slice(0, DEFAULT_COL_COUNT);
    const set = new Set(visibleKeys);
    return enabledFields.filter(f => set.has(f.field_key));
  }, [enabledFields, visibleKeys]);

  // Phân trang danh sách (đã lọc).
  const totalPages = Math.max(1, Math.ceil(filteredResponses.length / pageSize));
  const pageClamped = Math.min(page, totalPages);
  const pageStart = (pageClamped - 1) * pageSize;
  const pagedResponses = filteredResponses.slice(pageStart, pageStart + pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => { setPage(1); }, [filters]); // đổi lọc → về trang 1

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!form) return <div className="py-20 text-center text-muted-foreground">Không tìm thấy biểu mẫu</div>;

  return (
    <div className="space-y-5">
      <Link href="/bieu-mau" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Kho Biểu Mẫu
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-700 text-foreground">{form.title}</h1>
            <button onClick={openEditHeader} title="Sửa tiêu đề & mô tả" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
              <Pencil className="h-4 w-4" />
            </button>
            {form.is_internal ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-600 bg-amber-500/15 text-amber-300 border border-amber-500/30">🔒 Nội Bộ</span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-600 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">🌐 Công Khai</span>
            )}
          </div>
          {form.description && (
            looksLikeHtml(form.description)
              ? <div className="rich-content text-xs sm:text-sm text-muted-foreground mt-0.5" dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.description) }} />
              : <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 whitespace-pre-line">{form.description}</p>
          )}
          {form.expires_at && (
            <p className={`text-2xs mt-1 ${formExpired ? 'text-red-400 font-600' : 'text-muted-foreground'}`}>
              {formExpired ? '⛔ Đã hết hạn: ' : '⏳ Hết hạn: '}{fmtDateTime(form.expires_at)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Toggle Nội Bộ — không tick = Công khai (mặc định). Tick = chỉ user đăng nhập điền được. */}
          <label className="flex items-center gap-2 h-9 px-3 rounded-xl text-xs text-muted-foreground bg-surface-2 border border-line cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={form.is_internal}
              onChange={toggleInternal}
              className="w-4 h-4 rounded border-line-strong accent-amber-500"
            />
            Nội Bộ
          </label>
          <select value={form.status} onChange={e => changeStatus(e.target.value)}
            className="h-9 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none">
            <option value="draft">Nháp</option>
            <option value="active">Đang mở</option>
            <option value="closed">Đã đóng</option>
          </select>
          <button onClick={handleDeleteForm} className="btn-ghost rounded-xl border border-red-500/30 text-red-400 p-2" title="Xóa biểu mẫu">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Modal sửa tiêu đề & mô tả */}
      {editHeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setEditHeader(false)}>
          <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Sửa biểu mẫu</h2>
              <button onClick={() => setEditHeader(false)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Tiêu đề *</label>
                <input value={hTitle} onChange={e => setHTitle(e.target.value)} placeholder="Tiêu đề biểu mẫu"
                  className="mt-1 w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Mô tả</label>
                <div className="mt-1">
                  <RichTextEditor value={hDesc} onChange={setHDesc} placeholder="Mô tả ngắn (đậm, gạch đầu dòng, tiêu đề, liên kết…)" minHeight={120} />
                </div>
              </div>
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Thời gian hết hạn</label>
                <div className="mt-1 flex items-center gap-2">
                  <input type="datetime-local" value={hExpires} onChange={e => setHExpires(e.target.value)}
                    className="flex-1 h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500" />
                  {hExpires && <button onClick={() => setHExpires('')} className="btn-ghost rounded-lg px-2 py-1 text-2xs text-muted-foreground hover:text-foreground">Xóa hạn</button>}
                </div>
                <p className="mt-1 text-2xs text-muted-foreground">Sau thời điểm này, link công khai sẽ ngừng nhận phản hồi. Để trống = không giới hạn.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={() => setEditHeader(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={saveHeader} disabled={savingHeader} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
                {savingHeader && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link công khai */}
      <div className="rounded-2xl border border-line-subtle p-4 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: 'var(--card)' }}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Link2 className="h-4 w-4 text-indigo-400" /> Link công khai:
        </div>
        <input readOnly value={publicLink} className="flex-1 h-9 px-3 rounded-lg text-xs text-indigo-300 bg-surface-2 border border-line focus:outline-none min-w-0" />
        <div className="flex gap-2">
          <button onClick={copyLink} className="btn-ghost rounded-lg border border-line px-3 py-2 text-xs flex items-center gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Link2 className="h-3.5 w-3.5" />} Copy
          </button>
          <a href={publicLink} target="_blank" rel="noreferrer" className="btn-ghost rounded-lg border border-line px-3 py-2 text-xs flex items-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> Mở
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line">
        <button onClick={() => setTab('fields')} className={`px-3 py-2.5 text-sm font-500 border-b-2 flex items-center gap-1.5 ${tab === 'fields' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>
          <Settings2 className="h-4 w-4" /> Trường ({fields.length})
        </button>
        <button onClick={() => setTab('responses')} className={`px-3 py-2.5 text-sm font-500 border-b-2 flex items-center gap-1.5 ${tab === 'responses' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>
          <FileBarChart className="h-4 w-4" /> Phản hồi ({responses.length})
        </button>
      </div>

      {tab === 'fields' ? (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            {dirtyCount > 0 ? (
              <button onClick={saveDirty} disabled={savingDirty} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
                {savingDirty ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Lưu {dirtyCount} thay đổi
              </button>
            ) : <span />}
            <button onClick={() => setShowAddField(true)} className="btn-accent flex items-center gap-2"><Plus className="h-4 w-4" /> Thêm Trường</button>
          </div>
          <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <ul className="divide-y divide-line-subtle">
              {fields.map((f, i) => (
                <li key={f.id} className="px-5 py-3">
                 <div className="flex items-center gap-3">
                  {/* Đổi thứ tự */}
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => moveField(f.id, -1)} disabled={i === 0} title="Lên trên"
                      className="btn-ghost rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => moveField(f.id, 1)} disabled={i === fields.length - 1} title="Xuống dưới"
                      className="btn-ghost rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingFieldId === f.id ? (
                      <input autoFocus value={labelDraft} onChange={e => setLabelDraft(e.target.value)}
                        onBlur={commitLabel} onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditingFieldId(null); }}
                        className="w-full h-8 px-2 rounded-lg text-sm text-foreground bg-surface-2 border border-indigo-500/50 focus:outline-none" />
                    ) : (
                      <p className={`text-sm font-500 truncate flex items-center gap-1.5 ${f.enabled ? 'text-foreground' : 'text-muted-foreground/50 line-through'}`}>
                        <span className="truncate">{f.label}</span>
                        <button onClick={() => startEditLabel(f)} title="Sửa nhãn" className="btn-ghost rounded p-0.5 text-muted-foreground/60 hover:text-foreground shrink-0"><Pencil className="h-3 w-3" /></button>
                      </p>
                    )}
                    <p className="text-2xs text-muted-foreground">{FIELD_TYPE_LABELS[f.field_type] || f.field_type}{f.options?.length ? ` · ${f.options.length} lựa chọn` : ''}</p>
                  </div>
                  <button onClick={() => toggleField(f.id, 'required')} disabled={!f.enabled}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-600 border disabled:opacity-30 ${f.required ? 'border-red-500/40 bg-red-500/15 text-red-300' : 'border-line text-muted-foreground'}`}>
                    <Asterisk className="h-3 w-3" /> Bắt buộc
                  </button>
                  <button onClick={() => setLogicOpenId(id => id === f.id ? null : f.id)} disabled={!f.enabled}
                    title="Điều kiện hiển thị"
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-600 border disabled:opacity-30 ${f.visible_if?.conditions?.length ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground'}`}>
                    <Filter className="h-3 w-3" /> Điều kiện{f.visible_if?.conditions?.length ? ` (${f.visible_if.conditions.length})` : ''}
                  </button>
                  <button onClick={() => toggleField(f.id, 'enabled')} title={f.enabled ? 'Đang bật' : 'Đang tắt'}>
                    {f.enabled ? <ToggleRight className="h-6 w-6 text-emerald-400" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground/40" />}
                  </button>
                  {!f.is_system && (
                    <button onClick={() => handleDeleteField(f.id)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400" title="Xóa trường">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                 </div>
                 {logicOpenId === f.id && (
                   <FieldLogicEditor field={f} allFields={fields} onChange={vi => setFieldVisibleIf(f.id, vi)} />
                 )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {responses.length > 0 && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Toggle kiểu xem: Bảng / Thẻ */}
              <div className="inline-flex rounded-xl border border-line p-0.5 bg-surface-2">
                <button onClick={() => setRespView('table')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-600 ${respView === 'table' ? 'bg-indigo-500/15 text-indigo-300' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Table2 className="h-3.5 w-3.5" /> Bảng
                </button>
                <button onClick={() => setRespView('cards')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-600 ${respView === 'cards' ? 'bg-indigo-500/15 text-indigo-300' : 'text-muted-foreground hover:text-foreground'}`}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Thẻ
                </button>
              </div>
              <div className="flex items-center gap-2">
                <FilterMenu fields={enabledFields} distinct={distinctValues} filters={filters} onChange={setFilters} activeCount={activeFilterCount} />
                {respView === 'table' && enabledFields.length > 0 && (
                  <ColumnPicker fields={enabledFields} visibleKeys={visibleFields.map(f => f.field_key)}
                    onToggle={toggleCol}
                    onAll={() => setVisible(enabledFields.map(f => f.field_key))}
                    onFew={() => setVisible(enabledFields.slice(0, DEFAULT_COL_COUNT).map(f => f.field_key))} />
                )}
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {activeFilterCount > 0 ? <><span className="text-indigo-300 font-600">{filteredResponses.length}</span>/{responses.length}</> : responses.length} phản hồi
                </span>
                <ExportMenu onCsv={exportCsv} onExcel={() => doExport('excel')} onPdf={() => doExport('pdf')} />
              </div>
            </div>
          )}
          {/* Chips các bộ lọc đang áp */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {enabledFields.filter(f => (filters[f.field_key]?.length ?? 0) > 0).map(f => (
                <span key={f.id} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 pl-2.5 pr-1 py-1 text-2xs text-indigo-200">
                  <span className="font-600">{f.label}:</span>
                  <span className="max-w-[160px] truncate">{filters[f.field_key].map(v => v || '(Trống)').join(', ')}</span>
                  <button onClick={() => clearFilter(f.field_key)} className="rounded-full p-0.5 hover:bg-indigo-500/30"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <button onClick={clearAllFilters} className="text-2xs text-muted-foreground hover:text-foreground underline ml-1">Xóa tất cả lọc</button>
            </div>
          )}
          {responses.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-muted-foreground">
              <FileBarChart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Chưa có phản hồi nào</p>
              <p className="text-xs mt-1 opacity-60">Chia sẻ link công khai để bắt đầu thu thập phản hồi</p>
            </div>
          ) : filteredResponses.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Filter className="h-9 w-9 mb-3 opacity-30" />
              <p className="text-sm">Không có phản hồi khớp bộ lọc</p>
              <button onClick={clearAllFilters} className="text-xs mt-2 text-indigo-400 hover:text-indigo-300">Xóa bộ lọc</button>
            </div>
          ) : (
            <>
              {respView === 'table' ? (
                <ResponsesTable responses={pagedResponses} indexOffset={pageStart} fields={visibleFields} hasRespondent={hasRespondent} onOpen={setDetailIdx} />
              ) : (
                <ResponsesCards responses={pagedResponses} indexOffset={pageStart} fields={enabledFields} onOpen={setDetailIdx} />
              )}
              <Pagination
                total={filteredResponses.length} page={pageClamped} totalPages={totalPages} pageSize={pageSize}
                start={pageStart} count={pagedResponses.length}
                onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
              />
            </>
          )}
        </div>
      )}

      {showAddField && <AddFieldModal onClose={() => setShowAddField(false)} onAdded={(ff) => { setFields(ff); setShowAddField(false); }} formId={formId} />}

      {detailIdx !== null && filteredResponses[detailIdx] && (
        <ResponseDetailModal
          responses={filteredResponses}
          fields={enabledFields}
          index={detailIdx}
          onIndex={setDetailIdx}
          onClose={() => setDetailIdx(null)}
        />
      )}
    </div>
  );
}

/** Chuỗi giá trị thô để LỌC/đối chiếu (rỗng → '' để gom nhóm "(Trống)"). */
function valStr(v: any): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  return String(v).trim();
}

/** Hiển thị giá trị 1 trường (mảng → nối, rỗng → —). */
function renderValue(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  return String(v);
}

function respondentName(r: FormResponse): string {
  return r.candidate_name || r.candidate_email || '';
}

/** Menu xuất: CSV / Excel / PDF (PDF & Excel có thương hiệu webapp). */
function ExportMenu({ onCsv, onExcel, onPdf }: { onCsv: () => void; onExcel: () => Promise<void> | void; onPdf: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void> | void) => {
    setBusy(key); setOpen(false);
    try { await fn(); } finally { setBusy(null); }
  };
  const items = [
    { key: 'excel', label: 'Excel (.xlsx)', icon: <FileSpreadsheet className="h-4 w-4 text-emerald-400" />, fn: onExcel },
    { key: 'pdf', label: 'PDF', icon: <FileText className="h-4 w-4 text-rose-400" />, fn: onPdf },
    { key: 'csv', label: 'CSV', icon: <FileDown className="h-4 w-4 text-muted-foreground" />, fn: onCsv },
  ];
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={!!busy}
        className="btn-ghost rounded-xl border border-line px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Xuất
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-hidden tabIndex={-1} />
          <div className="absolute right-0 z-50 mt-2 w-48 rounded-2xl border border-line shadow-xl overflow-hidden py-1" style={{ background: 'var(--card)' }}>
            {items.map(it => (
              <button key={it.key} onClick={() => run(it.key, it.fn)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-hover">
                {it.icon} {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Dãy số trang gọn (có … khi nhiều trang). */
function pageRange(cur: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total - 1, total, cur - 1, cur, cur + 1]);
  const arr = [...set].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '...')[] = [];
  let prev = 0;
  for (const p of arr) { if (p - prev > 1) out.push('...'); out.push(p); prev = p; }
  return out;
}

/** Thanh phân trang: chọn số dòng/trang + điều hướng trang. */
function Pagination({ total, page, totalPages, pageSize, start, count, onPage, onPageSize }: {
  total: number; page: number; totalPages: number; pageSize: number; start: number; count: number;
  onPage: (p: number) => void; onPageSize: (n: number) => void;
}) {
  const sizes = [10, 20, 30, 40, 50, 100];
  const from = total === 0 ? 0 : start + 1;
  const to = start + count;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Hiển thị</span>
        <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}
          className="h-8 px-2 rounded-lg text-foreground bg-surface-2 border border-line focus:outline-none">
          {sizes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span>/ trang · <span className="text-foreground">{from}–{to}</span> trên {total}</span>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="btn-ghost rounded-lg border border-line p-1.5 disabled:opacity-30" title="Trang trước"><ChevronLeft className="h-4 w-4" /></button>
          {pageRange(page, totalPages).map((p, idx) => p === '...'
            ? <span key={`e${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
            : <button key={p} onClick={() => onPage(p)}
                className={`min-w-8 h-8 px-2 rounded-lg text-xs font-600 border ${p === page ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:text-foreground'}`}>{p}</button>)}
          <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="btn-ghost rounded-lg border border-line p-1.5 disabled:opacity-30" title="Trang sau"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

/** Lọc theo câu trả lời (kiểu Excel autofilter): tick giá trị ở nhiều trường, kết hợp AND. */
function FilterMenu({ fields, distinct, filters, onChange, activeCount }: {
  fields: FormField[]; distinct: Record<string, string[]>; filters: Record<string, string[]>;
  onChange: (f: Record<string, string[]>) => void; activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const toggleValue = (key: string, val: string) => {
    const cur = filters[key] ?? [];
    const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val];
    const nf = { ...filters };
    if (next.length) nf[key] = next; else delete nf[key];
    onChange(nf);
  };
  const setField = (key: string, vals: string[]) => { const nf = { ...filters }; if (vals.length) nf[key] = vals; else delete nf[key]; onChange(nf); };

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`rounded-xl border px-3 py-2 text-sm flex items-center gap-1.5 ${activeCount > 0 ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' : 'btn-ghost border-line'}`}>
        <Filter className="h-4 w-4" /> Lọc
        {activeCount > 0 && <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-2xs font-700 bg-indigo-600 text-white">{activeCount}</span>}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-hidden tabIndex={-1} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-line shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-line-subtle">
              <span className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Lọc theo câu trả lời</span>
              {activeCount > 0 && <button onClick={() => onChange({})} className="text-2xs text-indigo-400 hover:text-indigo-300">Xóa tất cả</button>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {fields.map(f => {
                const sel = filters[f.field_key] ?? [];
                const isOpen = expanded === f.field_key;
                const allVals = distinct[f.field_key] ?? [];
                const shown = !isOpen ? [] : (q ? allVals.filter(v => (v || '(trống)').toLowerCase().includes(q.toLowerCase())) : allVals);
                return (
                  <div key={f.id} className="border-b border-line-subtle last:border-0">
                    <button onClick={() => { setExpanded(isOpen ? null : f.field_key); setQ(''); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-hover">
                      <span className="flex-1 text-sm text-foreground truncate" title={f.label}>{f.label}</span>
                      {sel.length > 0 && <span className="text-2xs font-700 px-1.5 rounded-full bg-indigo-500/20 text-indigo-300">{sel.length}</span>}
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-2 pb-2">
                        {allVals.length > 8 && (
                          <div className="relative mb-1.5">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm giá trị…"
                              className="w-full h-8 pl-7 pr-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none" />
                          </div>
                        )}
                        <div className="flex items-center gap-2 px-1 pb-1 text-2xs">
                          <button onClick={() => setField(f.field_key, allVals)} className="text-indigo-400 hover:text-indigo-300">Chọn tất cả</button>
                          <span className="text-muted-foreground/30">·</span>
                          <button onClick={() => setField(f.field_key, [])} className="text-muted-foreground hover:text-foreground">Bỏ chọn</button>
                          <span className="ml-auto text-muted-foreground">{sel.length}/{allVals.length}</span>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {shown.map((v, idx) => {
                            const on = sel.includes(v);
                            return (
                              <button key={idx} onClick={() => toggleValue(f.field_key, v)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-hover rounded-lg">
                                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'bg-indigo-500 border-indigo-500' : 'border-line-strong'}`}>
                                  {on && <Check className="h-3 w-3 text-white" />}
                                </span>
                                <span className={`text-sm truncate ${v ? 'text-foreground' : 'text-muted-foreground italic'}`} title={v || '(Trống)'}>{v || '(Trống)'}</span>
                              </button>
                            );
                          })}
                          {shown.length === 0 && <p className="px-2 py-2 text-2xs text-muted-foreground">Không có giá trị khớp</p>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Chọn cột hiển thị trong bảng — tránh đổ hết 100 cột; nhớ theo form. */
function ColumnPicker({ fields, visibleKeys, onToggle, onAll, onFew }: {
  fields: FormField[]; visibleKeys: string[]; onToggle: (k: string) => void; onAll: () => void; onFew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const vis = new Set(visibleKeys);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="btn-ghost rounded-xl border border-line px-3 py-2 text-sm flex items-center gap-1.5">
        <Columns3 className="h-4 w-4" /> Cột <span className="text-xs text-muted-foreground">{visibleKeys.length}/{fields.length}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-hidden tabIndex={-1} />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-line shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-line-subtle">
              <span className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Cột hiển thị</span>
              <div className="flex items-center gap-1.5">
                <button onClick={onFew} className="text-2xs text-muted-foreground hover:text-foreground">Rút gọn</button>
                <span className="text-muted-foreground/30">·</span>
                <button onClick={onAll} className="text-2xs text-indigo-400 hover:text-indigo-300">Tất cả</button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {fields.map(f => {
                const on = vis.has(f.field_key);
                return (
                  <button key={f.id} onClick={() => onToggle(f.field_key)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-hover">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'bg-indigo-500 border-indigo-500' : 'border-line-strong'}`}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="text-sm text-foreground truncate" title={f.label}>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Bảng: cột Thời gian ghim trái, cuộn ngang phần còn lại, mỗi dòng bấm mở chi tiết. */
function ResponsesTable({ responses, fields, hasRespondent, onOpen, indexOffset = 0 }: {
  responses: FormResponse[]; fields: FormField[]; hasRespondent: boolean; onOpen: (i: number) => void; indexOffset?: number;
}) {
  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="sticky left-0 z-20 px-4 py-3 font-600 whitespace-nowrap border-b border-line-subtle" style={{ background: 'var(--card)' }}>Thời gian</th>
              {hasRespondent && <th className="px-4 py-3 font-600 whitespace-nowrap border-b border-line-subtle">Người gửi</th>}
              {fields.map(f => (
                <th key={f.id} title={f.label} className="px-4 py-3 font-600 border-b border-line-subtle">
                  <span className="block max-w-[180px] truncate normal-case">{f.label}</span>
                </th>
              ))}
              <th className="px-3 py-3 border-b border-line-subtle" />
            </tr>
          </thead>
          <tbody>
            {responses.map((r, i) => (
              <tr key={r.id} onClick={() => onOpen(indexOffset + i)} className="group cursor-pointer">
                <td className="sticky left-0 z-10 px-4 py-3 text-xs text-muted-foreground whitespace-nowrap border-b border-line-subtle group-hover:text-foreground" style={{ background: 'var(--card)' }}>
                  {fmtDateTime(r.created_at)}
                </td>
                {hasRespondent && <td className="px-4 py-3 text-foreground whitespace-nowrap border-b border-line-subtle max-w-[180px] truncate group-hover:bg-hover">{respondentName(r) || '—'}</td>}
                {fields.map(f => (
                  <td key={f.id} className="px-4 py-3 text-foreground max-w-[220px] truncate border-b border-line-subtle group-hover:bg-hover">{renderValue(r.data?.[f.field_key])}</td>
                ))}
                <td className="px-3 py-3 border-b border-line-subtle text-muted-foreground/40 group-hover:text-indigo-400">
                  <ChevronRightSm className="h-4 w-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Thẻ: mỗi phản hồi 1 thẻ, liệt kê dọc trường → giá trị (hợp mobile, đọc hết). */
function ResponsesCards({ responses, fields, onOpen, indexOffset = 0 }: {
  responses: FormResponse[]; fields: FormField[]; onOpen: (i: number) => void; indexOffset?: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {responses.map((r, i) => (
        <button key={r.id} onClick={() => onOpen(indexOffset + i)}
          className="text-left rounded-2xl border border-line-subtle p-4 hover:border-indigo-500/40 transition-colors" style={{ background: 'var(--card)' }}>
          <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-line-subtle">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{fmtDateTime(r.created_at)}</span>
            </div>
            {respondentName(r) && (
              <span className="inline-flex items-center gap-1 text-2xs text-indigo-300 bg-indigo-500/10 rounded-full px-2 py-0.5 shrink-0 max-w-[45%] truncate">
                <User className="h-3 w-3" /> {respondentName(r)}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {fields.slice(0, 5).map(f => (
              <div key={f.id} className="text-xs">
                <p className="text-muted-foreground">{f.label}</p>
                <p className="text-foreground line-clamp-2 break-words">{renderValue(r.data?.[f.field_key])}</p>
              </div>
            ))}
            {fields.length > 5 && <p className="text-2xs text-indigo-400">+{fields.length - 5} trường khác · bấm xem đầy đủ</p>}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Modal chi tiết 1 phản hồi: dọc theo trường, có ‹ › chuyển qua lại giữa các phản hồi. */
function ResponseDetailModal({ responses, fields, index, onIndex, onClose }: {
  responses: FormResponse[]; fields: FormField[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const r = responses[index];
  const go = (d: number) => { const n = index + d; if (n >= 0 && n < responses.length) onIndex(n); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        {/* Header + điều hướng */}
        <div className="flex items-center justify-between border-b border-line-subtle px-5 py-3.5 gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-700 text-foreground">Phản hồi {index + 1}/{responses.length}</h2>
            <div className="flex items-center gap-2 text-2xs text-muted-foreground mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDateTime(r.created_at)}</span>
              {respondentName(r) && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {respondentName(r)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => go(-1)} disabled={index === 0} className="btn-ghost rounded-lg p-1.5 disabled:opacity-30" title="Trước (←)"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => go(1)} disabled={index === responses.length - 1} className="btn-ghost rounded-lg p-1.5 disabled:opacity-30" title="Sau (→)"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={onClose} className="btn-ghost rounded-lg p-1.5 ml-1"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {/* Body: dọc theo trường */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {fields.map(f => {
            const v = renderValue(r.data?.[f.field_key]);
            const empty = v === '—';
            return (
              <div key={f.id}>
                <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">{f.label}</p>
                <p className={`text-sm whitespace-pre-wrap break-words ${empty ? 'text-muted-foreground/40 italic' : 'text-foreground'}`}>{empty ? 'Bỏ trống' : v}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AddFieldModal({ formId, onClose, onAdded }: { formId: string; onClose: () => void; onAdded: (fields: FormField[]) => void }) {
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [required, setRequired] = useState(false);
  const [optionsRaw, setOptionsRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  const handleSave = async () => {
    if (!label.trim()) { setError('Thiếu nhãn trường'); return; }
    setSaving(true);
    setError('');
    try {
      const options = fieldType === 'select'
        ? optionsRaw.split('\n').map(s => s.trim()).filter(Boolean)
        : undefined;
      if (fieldType === 'select' && (!options || options.length === 0)) {
        setError('Trường lựa chọn cần ít nhất 1 phương án'); setSaving(false); return;
      }
      const fields = await addFormField(formId, { label: label.trim(), field_type: fieldType, required, options });
      markClean();
      onAdded(fields);
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
          <h2 className="text-base font-700 text-foreground">Thêm Trường Mới</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Nhãn trường *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" placeholder="VD: Bạn đánh giá thế nào?" />
          </div>
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Loại trường</label>
            <select value={fieldType} onChange={e => setFieldType(e.target.value)} className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none">
              {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {fieldType === 'select' && (
            <div>
              <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Các lựa chọn (mỗi dòng 1 phương án)</label>
              <textarea value={optionsRaw} onChange={e => setOptionsRaw(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none resize-none" placeholder={'Rất hài lòng\nHài lòng\nBình thường'} />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} className="w-4 h-4 rounded accent-indigo-500" />
            <span className="text-sm text-foreground">Bắt buộc điền</span>
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={handleSave} disabled={saving || !label.trim()} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Thêm Trường
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Trình đặt ĐIỀU KIỆN HIỂN THỊ cho 1 trường (giống Tally) ─────────────────────
const OP_LABELS: Record<string, string> = {
  equals: 'bằng', not_equals: 'khác', includes: 'chứa', not_empty: 'đã điền', empty: 'để trống',
};
function FieldLogicEditor({ field, allFields, onChange }: {
  field: FormField;
  allFields: FormField[];
  onChange: (vi: import('@/lib/api/formApi').VisibleIf | null) => void;
}) {
  const vi = field.visible_if ?? { mode: 'all' as const, conditions: [] };
  // Chỉ cho tham chiếu trường KHÁC đang bật (tránh tự tham chiếu).
  const candidates = allFields.filter(f => f.id !== field.id && f.enabled);
  const set = (next: import('@/lib/api/formApi').VisibleIf) =>
    onChange(next.conditions.length ? next : null);
  const addCond = () => set({ ...vi, conditions: [...vi.conditions, { field: candidates[0]?.field_key ?? '', op: 'equals', value: '' }] });
  const updateCond = (idx: number, patch: any) =>
    set({ ...vi, conditions: vi.conditions.map((c, i) => i === idx ? { ...c, ...patch } : c) });
  const removeCond = (idx: number) => set({ ...vi, conditions: vi.conditions.filter((_, i) => i !== idx) });

  return (
    <div className="mt-2 ml-8 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2">
      <p className="text-2xs text-muted-foreground">
        Chỉ hiện trường này khi
        {vi.conditions.length > 1 && (
          <select value={vi.mode} onChange={e => set({ ...vi, mode: e.target.value as 'all' | 'any' })}
            className="mx-1 h-6 px-1 rounded bg-surface-2 border border-line text-foreground">
            <option value="all">TẤT CẢ</option>
            <option value="any">BẤT KỲ</option>
          </select>
        )}
        {vi.conditions.length > 1 ? 'điều kiện sau đúng:' : 'điều kiện sau đúng:'}
      </p>
      {vi.conditions.length === 0 && (
        <p className="text-2xs text-muted-foreground/60">Chưa có điều kiện — trường luôn hiển thị.</p>
      )}
      {vi.conditions.map((c, idx) => {
        const ref = candidates.find(f => f.field_key === c.field);
        const needsValue = c.op !== 'not_empty' && c.op !== 'empty';
        return (
          <div key={idx} className="flex flex-wrap items-center gap-1.5">
            <select value={c.field} onChange={e => updateCond(idx, { field: e.target.value })}
              className="h-7 px-2 rounded-lg text-2xs text-foreground bg-surface-2 border border-line max-w-[150px]">
              {candidates.map(f => <option key={f.id} value={f.field_key}>{f.label}</option>)}
            </select>
            <select value={c.op} onChange={e => updateCond(idx, { op: e.target.value })}
              className="h-7 px-2 rounded-lg text-2xs text-foreground bg-surface-2 border border-line">
              {Object.entries(OP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {needsValue && (
              ref?.options?.length ? (
                <select value={c.value ?? ''} onChange={e => updateCond(idx, { value: e.target.value })}
                  className="h-7 px-2 rounded-lg text-2xs text-foreground bg-surface-2 border border-line max-w-[150px]">
                  <option value="">— Chọn —</option>
                  {ref.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={c.value ?? ''} onChange={e => updateCond(idx, { value: e.target.value })}
                  placeholder="giá trị" className="h-7 px-2 rounded-lg text-2xs text-foreground bg-surface-2 border border-line w-32" />
              )
            )}
            <button onClick={() => removeCond(idx)} className="btn-ghost rounded p-1 text-red-400 hover:text-red-300"><X className="h-3 w-3" /></button>
          </div>
        );
      })}
      {candidates.length > 0 && (
        <button onClick={addCond} className="text-2xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          <Plus className="h-3 w-3" /> Thêm điều kiện
        </button>
      )}
    </div>
  );
}
