'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Plus, Pencil, Trash2, X, Save, Loader2, Eye, Power, Server, Send } from 'lucide-react';
import {
  listEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate,
  EMAIL_TEMPLATE_CATEGORIES, EMAIL_TEMPLATE_VARIABLES, type EmailTemplate,
} from '@/lib/api/emailTemplateApi';
import { getCurrentUser } from '@/lib/authStore';
import RichHtmlEditor from '@/components/ui/RichHtmlEditor';
import SmtpConfigModal from './SmtpConfigModal';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import ErrorState from '@/components/ui/ErrorState';

const CAT_LABEL = Object.fromEntries(EMAIL_TEMPLATE_CATEGORIES.map((c) => [c.code, c.label]));

export default function EmailTemplatesClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [smtpOpen, setSmtpOpen] = useState(false);
  const isAdmin = (() => { const u = getCurrentUser() as any; return u?.role === 'admin' || u?.role === 'super_admin'; })();

  const load = async () => {
    setLoading(true); setError(false);
    try { setItems(await listEmailTemplates()); }
    catch { setError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  async function toggleActive(t: EmailTemplate) {
    try { await updateEmailTemplate(t.id, { is_active: !t.is_active }); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  }
  async function remove(t: EmailTemplate) {
    if (!(await confirm({ title: 'Xoá mẫu email?', message: `Xoá mẫu "${t.name}"?`, confirmLabel: 'Xoá', danger: true }))) return;
    try { await deleteEmailTemplate(t.id); await load(); toast.success('Đã xoá mẫu'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
  }

  return (
    <div className="space-y-5">
      <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Tuyển Dụng
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5"><Mail className="h-6 w-6 text-indigo-400" /> Mẫu Email Tuyển Dụng</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Soạn & quản lý mẫu email gửi ứng viên (mời phỏng vấn, từ chối, mời nhận việc)</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {isAdmin && (
            <button onClick={() => setSmtpOpen(true)} className="btn-ghost h-10 rounded-xl border border-line px-3 text-sm font-600 flex items-center gap-2">
              <Server className="h-4 w-4" /> Cấu hình SMTP
            </button>
          )}
          <button onClick={() => setCreating(true)} className="btn-accent h-10 rounded-xl px-4 text-sm font-600 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Thêm mẫu
          </button>
        </div>
      </div>

      {smtpOpen && <SmtpConfigModal onClose={() => setSmtpOpen(false)} />}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <ErrorState message="Không tải được danh sách mẫu. Vui lòng thử lại." onRetry={load} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Mail className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có mẫu email</p>
          <p className="text-xs mt-1 opacity-60">Bấm &quot;Thêm mẫu&quot; để tạo mẫu đầu tiên</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((t) => (
            <div key={t.id} className="rounded-2xl border border-line-subtle p-4 flex flex-col gap-2" style={{ background: 'var(--card)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-600 text-foreground truncate">{t.name}</p>
                  <p className="text-2xs text-muted-foreground">{CAT_LABEL[t.category] || t.category}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs font-600 ${t.is_active ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-muted-foreground border-line'}`}>{t.is_active ? 'Bật' : 'Tắt'}</span>
              </div>
              <p className="text-2xs text-muted-foreground truncate">✉️ {t.subject}</p>
              <div className="flex items-center gap-1 mt-auto pt-2 border-t border-line-subtle">
                {t.is_active && (
                  <Link href={`/trung-tam-email?templateId=hr_${t.id}`} className="btn-ghost rounded-lg px-2 py-1 text-2xs flex items-center gap-1 text-indigo-300"><Send className="h-3 w-3" /> Gửi</Link>
                )}
                <button onClick={() => setEditing(t)} className="btn-ghost rounded-lg px-2 py-1 text-2xs flex items-center gap-1"><Pencil className="h-3 w-3" /> Sửa</button>
                <button onClick={() => toggleActive(t)} className="btn-ghost rounded-lg px-2 py-1 text-2xs flex items-center gap-1"><Power className="h-3 w-3" /> {t.is_active ? 'Tắt' : 'Bật'}</button>
                <button onClick={() => remove(t)} className="btn-ghost rounded-lg px-2 py-1 text-2xs text-muted-foreground hover:text-red-400 ml-auto"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <TemplateEditor
          tpl={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { setCreating(false); setEditing(null); await load(); toast.success('Đã lưu mẫu'); }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
}

function TemplateEditor({ tpl, onClose, onSaved, onError }: {
  tpl: EmailTemplate | null; onClose: () => void; onSaved: () => void | Promise<void>; onError: (m: string) => void;
}) {
  const [name, setName] = useState(tpl?.name ?? '');
  const [category, setCategory] = useState(tpl?.category ?? 'other');
  const [subject, setSubject] = useState(tpl?.subject ?? '');
  const [body, setBody] = useState(tpl?.body_html ?? '');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  async function save() {
    if (!name.trim() || !subject.trim() || !body.trim()) { onError('Nhập đủ tên / tiêu đề / nội dung'); return; }
    setSaving(true);
    try {
      if (tpl) await updateEmailTemplate(tpl.id, { name: name.trim(), category, subject, body_html: body });
      else await createEmailTemplate({ name: name.trim(), category, subject, body_html: body });
      await onSaved();
    } catch (e) { onError(e instanceof Error ? e.message : 'Không lưu được'); }
    finally { setSaving(false); }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 px-6 py-4" style={{ background: 'var(--card)' }}>
          <h2 className="text-base font-700 text-foreground">{tpl ? 'Sửa mẫu email' : 'Thêm mẫu email'}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Tên mẫu</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
            </div>
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Loại</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none">
                {EMAIL_TEMPLATE_CATEGORIES.map((c) => <option key={c.code} value={c.code} className="bg-surface-2">{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Tiêu đề</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Nội dung — soạn trực quan hoặc HTML thô</label>
              <button onClick={() => setShowPreview((v) => !v)} className="text-2xs text-indigo-300 inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {showPreview ? 'Ẩn xem trước' : 'Xem trước'}</button>
            </div>
            <div className="mt-1.5">
              <RichHtmlEditor value={body} onChange={setBody} variables={EMAIL_TEMPLATE_VARIABLES} minHeight={240} />
            </div>
          </div>

          {showPreview && (
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Xem trước (nền trắng như hộp thư)</label>
              <iframe title="preview" className="mt-1 w-full h-64 rounded-lg border border-line bg-white" srcDoc={body} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Huỷ</button>
          <button onClick={save} disabled={saving} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu mẫu
          </button>
        </div>
      </div>
    </div>
  );
}
