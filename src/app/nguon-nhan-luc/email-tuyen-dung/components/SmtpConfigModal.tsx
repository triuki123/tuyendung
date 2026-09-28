'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, Save, Send, Server } from 'lucide-react';
import { getSmtpSettings, saveSmtpSettings, testSmtp } from '@/lib/api/emailTemplateApi';
import { useToast } from '@/context/ToastContext';

const labelCls = 'text-2xs font-600 text-muted-foreground uppercase tracking-wider';
const inputCls = 'mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none';

/** Cấu hình SMTP hộp thư Tuyển dụng (lưu DB qua UI, không env/hardcode). */
export default function SmtpConfigModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [hasPassword, setHasPassword] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState('Bộ phận Tuyển dụng');
  const [rejectUnauthorized, setRejectUnauthorized] = useState(false);

  useEffect(() => {
    getSmtpSettings().then((s) => {
      setEnabled(s.enabled); setHost(s.host); setPort(String(s.port || 587));
      setSecure(s.secure); setUser(s.user); setFromName(s.fromName || 'Bộ phận Tuyển dụng');
      setRejectUnauthorized(s.rejectUnauthorized); setHasPassword(s.hasPassword);
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Không tải được cấu hình'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    try {
      const s = await saveSmtpSettings({
        enabled, host: host.trim(), port: Number(port) || 587, secure, user: user.trim(),
        password: password || undefined, from_name: fromName, reject_unauthorized: rejectUnauthorized,
      });
      setHasPassword(s.hasPassword); setPassword('');
      toast.success('Đã lưu cấu hình SMTP');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không lưu được'); }
    finally { setSaving(false); }
  }

  async function test() {
    if (!testTo.trim()) { toast.error('Nhập email nhận thử'); return; }
    setTesting(true);
    try { await testSmtp(testTo.trim()); toast.success('Đã gửi email thử — kiểm tra hộp thư'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Gửi thử thất bại'); }
    finally { setTesting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 px-6 py-4" style={{ background: 'var(--card)' }}>
          <h2 className="text-base font-700 text-foreground flex items-center gap-2"><Server className="h-4 w-4 text-indigo-400" /> Cấu hình SMTP (hộp thư Tuyển dụng)</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="p-6 space-y-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
              Bật gửi email qua SMTP này
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>SMTP Host</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.congty.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cổng</label>
                <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Bảo mật</label>
                <select value={secure ? 'ssl' : 'starttls'} onChange={(e) => { const v = e.target.value === 'ssl'; setSecure(v); setPort(v ? '465' : '587'); }} className={inputCls}>
                  <option value="starttls" className="bg-surface-2">STARTTLS (587)</option>
                  <option value="ssl" className="bg-surface-2">SSL/TLS (465)</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Email tuyển dụng (đăng nhập SMTP)</label>
              <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="tuyendung@congty.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Mật khẩu {hasPassword && <span className="text-emerald-300 normal-case">· đã đặt (để trống nếu không đổi)</span>}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={hasPassword ? '••••••••' : 'Nhập mật khẩu'} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tên hiển thị người gửi</label>
              <input value={fromName} onChange={(e) => setFromName(e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={rejectUnauthorized} onChange={(e) => setRejectUnauthorized(e.target.checked)} className="h-4 w-4" />
              Yêu cầu cert TLS hợp lệ (tắt nếu Zimbra dùng cert tự ký)
            </label>

            <div className="rounded-xl border border-line bg-white/[0.02] p-3">
              <label className={labelCls}>Gửi thử</label>
              <div className="mt-1 flex gap-2">
                <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="email-nhan-thu@..." className="flex-1 h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
                <button onClick={test} disabled={testing} className="btn-ghost rounded-lg border border-line px-3 text-sm flex items-center gap-1 disabled:opacity-50">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi thử
                </button>
              </div>
              <p className="mt-1 text-2xs text-muted-foreground/70">Lưu cấu hình trước, rồi gửi thử để kiểm tra.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
          <button onClick={save} disabled={saving} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
