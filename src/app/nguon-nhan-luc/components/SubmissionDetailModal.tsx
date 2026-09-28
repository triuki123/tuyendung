'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Save, CheckCircle2, Send, FileText, AlertTriangle, XCircle, Download, FileSignature,
} from 'lucide-react';
import {
  getOnbSubmission, updateOnbSubmission, confirmOnbSubmission, sendOnbToAdmin, rejectOnbSubmission,
  loadOrgData, listOnbFields, downloadHrDoc, generateOnboardingDrafts,
  OnbSubmission, OnbFormField, ONB_STATUS_LABELS, fmtBytes, fmtDateTime,
} from '@/lib/api/onboardingApi';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const SECTION_TITLES: Record<string, string> = {
  personal: 'Thông Tin Cá Nhân', work: 'Thông Tin Công Việc', identity: 'Giấy Tờ Tùy Thân',
  bank: 'Tài Khoản Ngân Hàng', other: 'Thông Tin Khác',
  emergency: 'Người Thân Liên Hệ 1', emergency2: 'Người Thân Liên Hệ 2',
};
const SECTION_ORDER = ['personal', 'work', 'identity', 'bank', 'other', 'emergency', 'emergency2'];

type OrgData = Awaited<ReturnType<typeof loadOrgData>>;

interface Props {
  submissionId: string;
  onClose: () => void;
  onChanged: (s: OnbSubmission) => void;
}

/** Panel chi tiết: Tuyển dụng xem + chuẩn hóa toàn bộ field → Xác nhận → Gửi QTV. */
export default function SubmissionDetailModal({ submissionId, onClose, onChanged }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  useEscapeKey(onClose);
  const [sub, setSub] = useState<OnbSubmission | null>(null);
  const [fields, setFields] = useState<OnbFormField[]>([]);
  const [org, setOrg] = useState<OrgData | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<'' | 'save' | 'confirm' | 'send' | 'reject'>('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, f, o] = await Promise.all([getOnbSubmission(submissionId), listOnbFields(), loadOrgData()]);
        setSub(s);
        setFields(f.filter(x => x.enabled && x.field_type !== 'file'));
        setOrg(o);
        setValues(s.data || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không tải được dữ liệu');
      }
    })();
  }, [submissionId]);

  const editable = sub ? ['submitted', 'confirmed'].includes(sub.status) : false;

  const jobTitle = useMemo(() => {
    if (!org) return '';
    const pos = org.positions.find(p => p.id === values.position_id)?.name || '';
    const subDept = org.subDepartments.find(s => s.id === values.sub_department_id)?.name || '';
    const dept = org.departments.find(d => d.id === values.department_id)?.name || '';
    return [pos, subDept || dept].filter(Boolean).join(' · ');
  }, [org, values]);

  const sections = useMemo(() => {
    const by: Record<string, OnbFormField[]> = {};
    for (const f of fields) (by[f.section] ||= []).push(f);
    return SECTION_ORDER.filter(k => by[k]?.length).map(k => ({ key: k, items: by[k] }));
  }, [fields]);

  const setValue = (key: string, v: any) => {
    setValues(prev => {
      const next = { ...prev, [key]: v };
      if (key === 'company_id') { next.department_id = ''; next.sub_department_id = ''; next.position_id = ''; }
      if (key === 'department_id') next.sub_department_id = '';
      return next;
    });
    setDirty(true);
  };

  const doSave = async (): Promise<OnbSubmission | null> => {
    if (!sub) return null;
    const payload = { ...values, job_title: jobTitle };
    const updated = await updateOnbSubmission(sub.id, payload, String(values.full_name || sub.candidate_name));
    setSub(prev => prev ? { ...prev, ...updated, attachments: prev.attachments } : updated);
    setDirty(false);
    onChanged(updated);
    return updated;
  };

  const handleAction = async (action: 'save' | 'confirm' | 'send' | 'reject') => {
    if (!sub) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'save') {
        await doSave();
      } else if (action === 'confirm') {
        if (dirty) await doSave();
        const updated = await confirmOnbSubmission(sub.id);
        setSub(prev => prev ? { ...prev, ...updated, attachments: prev.attachments } : updated);
        onChanged(updated);
      } else if (action === 'send') {
        if (dirty) await doSave();
        const updated = await sendOnbToAdmin(sub.id);
        setSub(prev => prev ? { ...prev, ...updated, attachments: prev.attachments } : updated);
        onChanged(updated);
      } else if (action === 'reject') {
        const reason = window.prompt('Lý do từ chối hồ sơ này?');
        if (reason === null) { setBusy(''); return; }
        const updated = await rejectOnbSubmission(sub.id, reason);
        setSub(prev => prev ? { ...prev, ...updated, attachments: prev.attachments } : updated);
        onChanged(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác thất bại');
    } finally {
      setBusy('');
    }
  };

  /** Tạo NGAY các bản nháp HĐ onboarding cho nhân sự đã duyệt (đã có user). */
  const handleGenerateDrafts = async () => {
    if (!sub?.user_id || drafting) return;
    if (!await confirm({ title: 'Tạo nháp hợp đồng?', message: 'Tạo ngay các bản nháp hợp đồng onboarding cho nhân sự này? (Loại hợp đồng đã có sẽ được bỏ qua — không tạo trùng.)', confirmLabel: 'Tạo nháp' })) return;
    setDrafting(true);
    setDraftMsg('');
    setError('');
    try {
      const r = await generateOnboardingDrafts(sub.user_id);
      setDraftMsg(
        r.created > 0
          ? `Đã tạo ${r.created} bản nháp${r.skipped > 0 ? ` · bỏ qua ${r.skipped} loại đã có` : ''}. Xem ở Quản Lý Hợp Đồng.`
          : 'Nhân sự đã có đủ bản nháp — không tạo thêm.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được bản nháp');
    } finally {
      setDrafting(false);
    }
  };

  const inputCls = 'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-50';

  const renderField = (f: OnbFormField) => {
    if (f.field_key === 'job_title') {
      return (
        <div key={f.id}>
          <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">{f.label} (tự tính)</label>
          <div className="h-10 px-3 rounded-xl text-sm flex items-center bg-surface-2 border border-dashed border-indigo-500/30 text-indigo-300">
            {jobTitle || '—'}
          </div>
        </div>
      );
    }
    if (f.field_type === 'org' && org) {
      let options: { id: string; name: string }[] = [];
      if (f.field_key === 'company_id') options = org.companies;
      else if (f.field_key === 'department_id') options = org.departments.filter(d => d.company_id === values.company_id && !d.parent_department_id);
      else if (f.field_key === 'sub_department_id') options = org.subDepartments.filter(s => s.department_id === values.department_id);
      else if (f.field_key === 'position_id') options = org.positions.filter(p => p.company_id === values.company_id);
      return (
        <div key={f.id}>
          <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">{f.label}{f.required && ' *'}</label>
          <select disabled={!editable} value={values[f.field_key] || ''} onChange={e => setValue(f.field_key, e.target.value)} className={inputCls}>
            <option value="">-- Chọn --</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      );
    }
    if (f.field_type === 'select') {
      return (
        <div key={f.id}>
          <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">{f.label}{f.required && ' *'}</label>
          <select disabled={!editable} value={values[f.field_key] || ''} onChange={e => setValue(f.field_key, e.target.value)} className={inputCls}>
            <option value="">-- Chọn --</option>
            {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (f.field_type === 'textarea') {
      return (
        <div key={f.id} className="sm:col-span-2">
          <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">{f.label}{f.required && ' *'}</label>
          <textarea disabled={!editable} value={values[f.field_key] || ''} onChange={e => setValue(f.field_key, e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none disabled:opacity-50" />
        </div>
      );
    }
    const typeMap: Record<string, string> = { email: 'email', date: 'date', number: 'number', tel: 'tel' };
    return (
      <div key={f.id}>
        <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">{f.label}{f.required && ' *'}</label>
        <input disabled={!editable} type={typeMap[f.field_type] || 'text'} value={values[f.field_key] ?? ''}
          onChange={e => setValue(f.field_key, e.target.value)} className={inputCls} />
      </div>
    );
  };

  const st = sub ? ONB_STATUS_LABELS[sub.status] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-700 text-foreground truncate">
              {sub?.candidate_name || 'Đang tải...'}
            </h2>
            {st && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-2xs font-600 shrink-0 ${st.color}`}>
                {st.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5 shrink-0"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!sub || !org ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {sub.status === 'pending' && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-500/30 bg-slate-500/10 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-ink-muted shrink-0" />
                  <p className="text-xs text-ink-bright">Nhân sự chưa điền biểu mẫu. Link đã gửi tới {sub.candidate_email} (hết hạn {fmtDateTime(sub.expires_at)}).</p>
                </div>
              )}
              {sub.status === 'rejected' && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <p className="text-xs text-red-300">Đã từ chối{sub.reject_reason ? `: ${sub.reject_reason}` : ''}</p>
                </div>
              )}
              {sub.status === 'approved' && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-300">Đã duyệt — user đã được tạo trong hệ thống ({sub.data?.working_email || ''})</p>
                  </div>
                  {sub.user_id && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 pl-6">
                      <button onClick={handleGenerateDrafts} disabled={drafting}
                        className="inline-flex items-center gap-1.5 self-start rounded-xl px-3 py-2 text-xs font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
                        {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSignature className="h-3.5 w-3.5" />}
                        Tạo nháp hợp đồng ngay
                      </button>
                      <p className="text-2xs text-muted-foreground">
                        {draftMsg || 'Không chờ tới ngày vào làm — tạo nháp HĐ onboarding ngay (không tạo trùng).'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {sections.map(({ key, items }) => (
                <section key={key}>
                  <h3 className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-2.5">{SECTION_TITLES[key]}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {items.map(renderField)}
                  </div>
                </section>
              ))}

              {/* Hồ sơ đính kèm */}
              <section>
                <h3 className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-2.5">
                  Hồ Sơ Đính Kèm {sub.status !== 'approved' && <span className="text-amber-400/80 normal-case font-400">(nháp — chính thức sau khi duyệt)</span>}
                </h3>
                {(sub.attachments || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Không có tệp đính kèm</p>
                ) : (
                  <ul className="space-y-2">
                    {(sub.attachments || []).map(a => (
                      <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line-subtle bg-hover px-3.5 py-2.5">
                        <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-sm text-foreground truncate">{a.file_name}</p>
                          <p className="text-2xs text-muted-foreground">{fmtBytes(a.size_bytes)}</p>
                        </div>
                        <button
                          onClick={() => downloadHrDoc(a.id, a.file_name).catch(err => toast.error(err.message))}
                          className="btn-ghost rounded-lg p-1.5" title="Tải xuống"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer actions */}
        {sub && (
          <div className="border-t border-line-subtle px-6 py-4 shrink-0">
            {error && (
              <p className="mb-3 text-xs text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {['submitted', 'confirmed'].includes(sub.status) && (
                <button onClick={() => handleAction('reject')} disabled={!!busy}
                  className="rounded-xl px-4 py-2 text-sm font-500 text-red-400 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-50">
                  Từ chối
                </button>
              )}
              {editable && dirty && (
                <button onClick={() => handleAction('save')} disabled={!!busy}
                  className="btn-ghost rounded-xl px-4 py-2 text-sm font-500 border border-line flex items-center gap-2 disabled:opacity-50">
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu
                </button>
              )}
              {sub.status === 'submitted' && (
                <button onClick={() => handleAction('confirm')} disabled={!!busy}
                  className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
                  {busy === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Xác Nhận Thông Tin
                </button>
              )}
              {sub.status === 'confirmed' && (
                <button onClick={() => handleAction('send')} disabled={!!busy}
                  className="btn-accent rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
                  {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Gửi Quản Trị Viên
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
