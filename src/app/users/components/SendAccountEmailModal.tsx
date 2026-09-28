'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Send, Mail, KeyRound, Eye } from 'lucide-react';
import { listEmailTemplates, type EmailTemplate } from '@/lib/api/emailTemplateApi';
import { getCurrentUser } from '@/lib/authStore';
import { useToast } from '@/context/ToastContext';

const labelCls = 'block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1';
const inputCls = 'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60';

export interface AccountEmailDefaults {
  /** Email cá nhân của nhân sự mới (người nhận) */
  to: string;
  ung_vien: string;
  cong_ty: string;
  assetflow_user: string;
  assetflow_pass: string;
  zimbra_user: string;
  zimbra_pass: string;
}

/**
 * Form gửi "Email cấp tài khoản cho nhân sự mới" sau khi QTV duyệt người dùng.
 * Rút gọn: chỉ xác nhận/sửa 2 khối tài khoản (AssetFlow + Zimbra) rồi gửi;
 * nội dung lấy từ mẫu loại "Cấp tài khoản nhân sự mới" trong kho Mẫu Email Tuyển Dụng.
 */
export default function SendAccountEmailModal({ defaults, onClose }: {
  defaults: AccountEmailDefaults; onClose: () => void;
}) {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tplId, setTplId] = useState('');
  const [to, setTo] = useState(defaults.to);
  const [creds, setCreds] = useState({
    assetflow_user: defaults.assetflow_user,
    assetflow_pass: defaults.assetflow_pass,
    zimbra_user: defaults.zimbra_user,
    zimbra_pass: defaults.zimbra_pass,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listEmailTemplates(true)
      .then(all => {
        const list = all.filter(t => t.category === 'account_provision');
        setTemplates(list);
        if (list.length > 0) setTplId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Mật khẩu Zimbra mặc định lấy từ Cấu Hình Hệ Thống (chỉ điền khi ô còn trống)
  useEffect(() => {
    if (defaults.zimbra_pass) return;
    const u = getCurrentUser() as { id?: string; role?: string } | null;
    fetch('/api/system-config', {
      headers: {
        ...(u?.id ? { 'x-current-user-id': u.id } : {}),
        ...(u?.role ? { 'x-current-user-role': u.role } : {}),
      },
      cache: 'no-store',
    })
      .then(r => r.json())
      .then(j => {
        const p = j?.data?.accountEmail?.zimbraDefaultPassword;
        if (typeof p === 'string' && p) {
          setCreds(prev => (prev.zimbra_pass ? prev : { ...prev, zimbra_pass: p }));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Username AssetFlow & Zimbra là một — sửa ô AssetFlow thì Zimbra đi theo (nếu đang trùng). */
  const setAssetflowUser = (v: string) => {
    setCreds(p => ({
      ...p,
      assetflow_user: v,
      zimbra_user: p.zimbra_user === p.assetflow_user ? v : p.zimbra_user,
    }));
  };

  const tpl = templates.find(t => t.id === tplId) || null;

  const vars = useMemo(() => {
    const u = getCurrentUser() as { name?: string } | null;
    return {
      ung_vien: defaults.ung_vien,
      cong_ty: defaults.cong_ty,
      nguoi_gui: u?.name || 'Phòng Nhân sự',
      ...creds,
    };
  }, [defaults, creds]);

  const previewHtml = useMemo(() => {
    if (!tpl) return '';
    return tpl.body_html.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, key: string) => {
      const v = (vars as Record<string, string>)[key];
      return v ? v : m;
    });
  }, [tpl, vars]);

  async function send() {
    if (!tpl) { toast.error('Chưa có mẫu "Cấp tài khoản nhân sự mới" đang bật'); return; }
    if (!to.trim()) { toast.error('Nhập email người nhận'); return; }
    if (!creds.assetflow_user.trim() || !creds.assetflow_pass.trim()) {
      toast.error('Điền đủ Username & Password AssetFlow'); return;
    }
    if (!creds.zimbra_user.trim() || !creds.zimbra_pass.trim()) {
      toast.error('Điền đủ Username & Password Zimbra'); return;
    }
    setSending(true);
    try {
      const u = getCurrentUser() as { id?: string; role?: string } | null;
      const res = await fetch('/api/users/send-account-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(u?.id ? { 'x-current-user-id': u.id } : {}),
          ...(u?.role ? { 'x-current-user-role': u.role } : {}),
        },
        body: JSON.stringify({
          to: to.trim(), subject: tpl.subject, body_html: tpl.body_html,
          template_id: tpl.id, vars,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Gửi email thất bại');
      toast.success('Đã gửi email cấp tài khoản cho nhân sự mới');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gửi email thất bại');
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10"
        style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 px-6 py-4" style={{ background: 'var(--card)' }}>
          <h2 className="text-base font-700 text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4 text-indigo-400" /> Email cấp tài khoản cho nhân sự mới
          </h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-amber-300/90">
              Chưa có mẫu loại &quot;Cấp tài khoản nhân sự mới&quot; đang bật. Vào <b>Nguồn Nhân Lực → Mẫu Email Tuyển Dụng</b> tạo mẫu với loại này rồi quay lại.
            </p>
          ) : (
            <>
              {templates.length > 1 && (
                <div>
                  <label className={labelCls}>Chọn mẫu</label>
                  <select value={tplId} onChange={e => setTplId(e.target.value)} className={inputCls}>
                    {templates.map(t => <option key={t.id} value={t.id} className="bg-surface-2">{t.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls}>Người nhận (email cá nhân)</label>
                <input type="email" value={to} onChange={e => setTo(e.target.value)} className={inputCls} placeholder="email.canhan@gmail.com" />
              </div>

              {/* Khối 1: AssetFlow */}
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
                <p className="text-xs font-700 text-indigo-400 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> 1. Tài khoản FADO AssetFlow
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Username</label>
                    <input value={creds.assetflow_user} onChange={e => setAssetflowUser(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Password</label>
                    <input value={creds.assetflow_pass} onChange={e => setCreds(p => ({ ...p, assetflow_pass: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Khối 2: Zimbra */}
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
                <p className="text-xs font-700 text-sky-400 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> 2. Tài khoản Email (Zimbra)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Username</label>
                    <input value={creds.zimbra_user} onChange={e => setCreds(p => ({ ...p, zimbra_user: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Password</label>
                    <input value={creds.zimbra_pass} onChange={e => setCreds(p => ({ ...p, zimbra_pass: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              </div>

              <button onClick={() => setShowPreview(v => !v)} className="text-2xs text-indigo-300 inline-flex items-center gap-1">
                <Eye className="h-3 w-3" /> {showPreview ? 'Ẩn xem trước' : 'Xem trước email'}
              </button>
              {showPreview && (
                <iframe title="preview" className="w-full h-72 rounded-lg border border-line bg-white" srcDoc={previewHtml} />
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Không gửi</button>
          <button onClick={send} disabled={sending || !tpl}
            className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi email
          </button>
        </div>
      </div>
    </div>
  );
}
