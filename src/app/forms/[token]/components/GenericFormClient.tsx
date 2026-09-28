'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Send, FileText } from 'lucide-react';
import { sanitizeHtml, looksLikeHtml } from '@/lib/sanitizeHtml';

interface VisibleCond { field: string; op: string; value?: string }
interface VisibleIf { mode: 'all' | 'any'; conditions: VisibleCond[] }
interface FieldDef {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  help_text: string | null;
  options: string[] | null;
  visible_if?: VisibleIf | null;
}

/** Đánh giá 1 điều kiện với giá trị hiện tại. */
function evalCond(c: VisibleCond, values: Record<string, string>): boolean {
  const v = (values[c.field] ?? '').toString();
  const target = (c.value ?? '').toString();
  switch (c.op) {
    case 'equals': return v === target;
    case 'not_equals': return v !== target;
    case 'includes': return v.toLowerCase().includes(target.toLowerCase());
    case 'not_empty': return v.trim() !== '';
    case 'empty': return v.trim() === '';
    default: return true;
  }
}
/** Trường có hiển thị không, theo visible_if + giá trị hiện tại. */
function isFieldVisible(f: FieldDef, values: Record<string, string>): boolean {
  const vi = f.visible_if;
  if (!vi || !vi.conditions?.length) return true;
  return vi.mode === 'any'
    ? vi.conditions.some(c => evalCond(c, values))
    : vi.conditions.every(c => evalCond(c, values));
}

type PageState = 'loading' | 'form' | 'submitted' | 'closed' | 'error';

const inputCls =
  'w-full h-11 px-3.5 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 placeholder:text-muted-foreground/50';

/** Trang điền biểu mẫu nội bộ PUBLIC (Google Forms style) — không cần tài khoản. */
export default function GenericFormClient({ token }: { token: string }) {
  const [state, setState] = useState<PageState>('loading');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/forms/${token}`);
        if (res.status === 404) { setState('error'); return; }
        const json = await res.json().catch(() => ({}));
        // Biểu mẫu Nội Bộ + chưa đăng nhập → redirect sang trang đăng nhập,
        // sau khi đăng nhập sẽ quay lại đúng /forms/<token>.
        if (res.status === 401 && json?.reason === 'internal') {
          const back = encodeURIComponent(`/forms/${token}`);
          window.location.href = `/sign-up-login-screen?redirect=${back}`;
          return;
        }
        if (!res.ok) { setState('error'); return; }
        if (json.data.status !== 'active') { setState('closed'); return; }
        setTitle(json.data.title);
        setDescription(json.data.description || '');
        setFields(json.data.fields);
        setState('form');
      } catch {
        setState('error');
      }
    })();
  }, [token]);

  const setValue = (key: string, v: any) => {
    setValues(prev => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    for (const f of fields) {
      if (!f.required || f.field_type === 'file') continue;
      if (!isFieldVisible(f, values)) continue; // trường đang ẩn → không bắt buộc
      const v = values[f.field_key];
      if (v === undefined || v === null || String(v).trim() === '') newErrors[f.field_key] = `Vui lòng điền ${f.label}`;
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) { setSubmitError('Vui lòng điền đầy đủ trường bắt buộc (*)'); return; }

    setSubmitting(true);
    setSubmitError('');
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify(values));
      files.forEach(f => fd.append('files', f));
      const res = await fetch(`/api/public/forms/${token}`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gửi thất bại');
      setState('submitted');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Gửi thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (f: FieldDef) => {
    const label = (
      <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">
        {f.label}{f.required && <span className="text-red-400"> *</span>}
      </label>
    );
    const err = errors[f.field_key] ? <p className="mt-1 text-xs text-red-400">{errors[f.field_key]}</p> : null;
    const help = f.help_text ? <p className="mt-1 text-2xs text-muted-foreground">{f.help_text}</p> : null;

    let control;
    if (f.field_type === 'select') {
      control = (
        <select value={values[f.field_key] || ''} onChange={e => setValue(f.field_key, e.target.value)} className={`${inputCls} ${errors[f.field_key] ? 'border-red-500/60' : ''}`}>
          <option value="">-- Chọn --</option>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    } else if (f.field_type === 'textarea') {
      control = (
        <textarea value={values[f.field_key] || ''} onChange={e => setValue(f.field_key, e.target.value)} rows={3}
          className={`w-full px-3.5 py-2.5 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none ${errors[f.field_key] ? 'border-red-500/60' : ''}`}
          placeholder={f.label} />
      );
    } else {
      const typeMap: Record<string, string> = { email: 'email', date: 'date', number: 'number', tel: 'tel' };
      control = (
        <input type={typeMap[f.field_type] || 'text'} value={values[f.field_key] ?? ''} onChange={e => setValue(f.field_key, e.target.value)}
          className={`${inputCls} ${errors[f.field_key] ? 'border-red-500/60' : ''}`} placeholder={f.field_type === 'date' ? '' : f.label} />
      );
    }
    return <div key={f.id}>{label}{control}{help}{err}</div>;
  };

  if (state === 'loading') {
    return <Shell><div className="flex flex-col items-center py-24"><Loader2 className="h-7 w-7 animate-spin text-indigo-400" /><p className="mt-3 text-sm text-muted-foreground">Đang tải biểu mẫu...</p></div></Shell>;
  }
  if (state === 'error' || state === 'closed') {
    return <Shell><Status icon={<AlertTriangle className="h-10 w-10 text-amber-400" />} title={state === 'closed' ? 'Biểu mẫu đã đóng' : 'Biểu mẫu không tồn tại'} desc={state === 'closed' ? 'Biểu mẫu này hiện không nhận thêm phản hồi.' : 'Link không đúng hoặc biểu mẫu đã bị xóa.'} /></Shell>;
  }
  if (state === 'submitted') {
    return <Shell><Status icon={<CheckCircle2 className="h-10 w-10 text-emerald-400" />} title="Gửi phản hồi thành công!" desc="Cảm ơn bạn đã dành thời gian điền biểu mẫu." /></Shell>;
  }

  return (
    <Shell>
      <div className="rounded-3xl border border-line overflow-hidden mb-6" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(168,85,247,0.16))' }}>
        <div className="px-6 sm:px-8 py-7">
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">{title}</h1>
          {description && (
            looksLikeHtml(description)
              ? <div className="rich-content mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-xl" dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }} />
              : <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-xl whitespace-pre-line">{description}</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-line-subtle p-5 sm:p-6 space-y-4" style={{ background: 'var(--card)' }}>
        {fields.filter(f => isFieldVisible(f, values)).map(renderField)}

        <div>
          <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Đính kèm tệp (tùy chọn)</label>
          <label className="flex items-center gap-2.5 rounded-xl border border-dashed border-line hover:border-indigo-500/40 px-3.5 py-3 cursor-pointer">
            <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)].slice(0, 10)); e.target.value = ''; }} />
            <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
            <span className="text-sm text-muted-foreground">{files.length > 0 ? `${files.length} tệp đã chọn` : 'Bấm để chọn tệp'}</span>
          </label>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line-subtle p-5 sm:p-6" style={{ background: 'var(--card)' }}>
        {submitError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" /><p className="text-sm text-red-300">{submitError}</p>
          </div>
        )}
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full h-12 rounded-xl text-sm font-700 text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? 'Đang gửi...' : 'Gửi Phản Hồi'}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12">
        {children}
        <p className="mt-8 text-center text-2xs text-muted-foreground/60">© 2026 FADO Group — AssetFlow Pro</p>
      </div>
    </div>
  );
}

function Status({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-3xl border border-line px-6 py-14 flex flex-col items-center text-center" style={{ background: 'var(--card)' }}>
      {icon}
      <h1 className="mt-4 text-xl font-700 text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
