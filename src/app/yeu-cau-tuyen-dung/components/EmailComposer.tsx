'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, Send, Eye, FileText, PenLine } from 'lucide-react';
import { sendRequisitionCandidateEmail } from '@/lib/api/requisitionApi';
import { listEmailTemplates, EMAIL_TEMPLATE_VARIABLES, type EmailTemplate } from '@/lib/api/emailTemplateApi';
import RichHtmlEditor from '@/components/ui/RichHtmlEditor';
import { useToast } from '@/context/ToastContext';
import { WORK_LOCATIONS, workLocationLabel } from '@/lib/constants/workLocations';

const labelCls = 'text-2xs font-600 text-muted-foreground uppercase tracking-wider';

const WEEKDAYS_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** yyyy-mm-dd + HH:MM → "14:00 Thứ Ba, 08/07/2026". Trống nếu thiếu ngày hoặc giờ. */
function formatVNDateTime(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return '';
  const d = new Date(`${dateStr}T${timeStr}:00`);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${timeStr} ${WEEKDAYS_VN[d.getDay()]}, ${dd}/${mm}/${d.getFullYear()}`;
}

/** Soạn & gửi email cho ứng viên — 2 kiểu: Theo mẫu / Tự soạn. Biến điền khi gửi (server render). */
export default function EmailComposer({ reqId, appId, candidateEmail, onClose, onSent }: {
  reqId: string; appId: string; candidateEmail: string; onClose: () => void; onSent: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<'template' | 'free'>('template');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [tplId, setTplId] = useState('');
  const [to, setTo] = useState(candidateEmail || '');
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // Thông tin phỏng vấn HR chọn (điền vào biến {{thoi_gian}}/{{hinh_thuc}}/{{dia_diem}}).
  const [itvDate, setItvDate] = useState('');
  const [itvHour, setItvHour] = useState('');
  const [itvMode, setItvMode] = useState<'onsite' | 'online' | ''>('');
  const [itvLink, setItvLink] = useState('');
  const [itvLocation, setItvLocation] = useState(''); // mã địa chỉ công tác
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(true);

  useEffect(() => {
    listEmailTemplates(true).then((t) => {
      setTemplates(t);
      if (t.length > 0) { setTplId(t[0].id); setSubject(t[0].subject); setBody(t[0].body_html); }
    }).catch(() => {});
  }, []);

  function pickTemplate(id: string) {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    if (t) { setSubject(t.subject); setBody(t.body_html); }
  }

  async function send() {
    if (!to.trim()) { toast.error('Nhập email người nhận'); return; }
    if (!subject.trim() || !body.trim()) { toast.error('Thiếu tiêu đề hoặc nội dung'); return; }
    const overrides: Record<string, string> = {};
    if (itvThoiGian) overrides.thoi_gian = itvThoiGian;
    if (itvHinhThuc) overrides.hinh_thuc = itvHinhThuc;
    if (itvDiaDiem) overrides.dia_diem = itvDiaDiem;
    setSending(true);
    try {
      await sendRequisitionCandidateEmail(reqId, appId, {
        to: to.trim(), cc: cc.trim() || undefined, subject, body_html: body,
        template_id: tab === 'template' ? (tplId || null) : null,
        render: true, // server điền biến {{...}} từ ngữ cảnh
        overrides: Object.keys(overrides).length ? overrides : undefined,
      });
      toast.success('Đã gửi email cho ứng viên');
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gửi email thất bại');
    } finally { setSending(false); }
  }

  const usesInterviewVars = /\{\{\s*(thoi_gian|hinh_thuc|dia_diem)\s*\}\}/.test(body + ' ' + subject);
  // Giá trị suy ra từ lựa chọn HR → điền vào các biến PV.
  const itvThoiGian = formatVNDateTime(itvDate, itvHour);
  const itvHinhThuc = itvMode === 'onsite' ? 'Trực tiếp' : itvMode === 'online' ? 'Online' : '';
  const itvDiaDiem = itvMode === 'online' ? itvLink.trim() : workLocationLabel(itvLocation);
  // Preview phản ánh giá trị HR vừa chọn (biến khác giữ nguyên {{...}}).
  const previewBody = body
    .replace(/\{\{\s*thoi_gian\s*\}\}/g, itvThoiGian || '{{thoi_gian}}')
    .replace(/\{\{\s*hinh_thuc\s*\}\}/g, itvHinhThuc || '{{hinh_thuc}}')
    .replace(/\{\{\s*dia_diem\s*\}\}/g, itvDiaDiem || '{{dia_diem}}');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 px-6 py-4" style={{ background: 'var(--card)' }}>
          <h2 className="text-base font-700 text-foreground">Gửi email cho ứng viên</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Tabs kiểu soạn */}
          <div className="flex gap-2">
            <button onClick={() => setTab('template')} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-600 ${tab === 'template' ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}><FileText className="h-3.5 w-3.5" /> Theo mẫu</button>
            <button onClick={() => setTab('free')} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-600 ${tab === 'free' ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}><PenLine className="h-3.5 w-3.5" /> Tự soạn</button>
          </div>

          {tab === 'template' && (
            templates.length === 0 ? (
              <p className="text-2xs text-amber-300/90">Chưa có mẫu nào đang bật. Vào Mẫu Email Tuyển Dụng để tạo, hoặc chuyển sang Tự soạn.</p>
            ) : (
              <div>
                <label className={labelCls}>Chọn mẫu</label>
                <select value={tplId} onChange={(e) => pickTemplate(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none">
                  {templates.map((t) => <option key={t.id} value={t.id} className="bg-surface-2">{t.name}</option>)}
                </select>
              </div>
            )
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className={labelCls}>Người nhận</label>
              {!showCc && (
                <button type="button" onClick={() => setShowCc(true)} className="text-2xs text-indigo-300 hover:text-indigo-200">+ CC</button>
              )}
            </div>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="email ứng viên" className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
            {!candidateEmail && <p className="mt-1 text-2xs text-amber-300/80">Ứng viên chưa có email trong hồ sơ — nhập tay.</p>}
          </div>
          {showCc && (
            <div>
              <label className={labelCls}>CC (nhận bản sao)</label>
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="email1@..., email2@... (cách nhau dấu phẩy)" className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
              <p className="mt-1 text-2xs text-muted-foreground">Nhiều email ngăn cách bằng dấu phẩy hoặc chấm phẩy.</p>
            </div>
          )}
          <div>
            <label className={labelCls}>Tiêu đề</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
          </div>

          {/* Thông tin phỏng vấn — chỉ hiện khi mẫu dùng các biến này */}
          {usesInterviewVars && (
            <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3 space-y-3">
              <p className="text-2xs font-600 text-indigo-300 uppercase tracking-wider">Thông tin phỏng vấn</p>

              {/* Ngày + giờ */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Ngày phỏng vấn</label>
                  <input type="date" value={itvDate} onChange={(e) => setItvDate(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
                </div>
                <div>
                  <label className={labelCls}>Giờ</label>
                  <input type="time" value={itvHour} onChange={(e) => setItvHour(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
                </div>
              </div>

              {/* Hình thức: Trực tiếp / Online */}
              <div>
                <label className={labelCls}>Hình thức</label>
                <div className="mt-1 flex gap-2">
                  <button type="button" onClick={() => setItvMode('onsite')}
                    className={`flex-1 h-9 rounded-lg border text-sm font-600 transition-colors ${itvMode === 'onsite' ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                    Trực tiếp
                  </button>
                  <button type="button" onClick={() => setItvMode('online')}
                    className={`flex-1 h-9 rounded-lg border text-sm font-600 transition-colors ${itvMode === 'online' ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                    Online
                  </button>
                </div>
              </div>

              {/* Online → link; Trực tiếp → chọn văn phòng */}
              {itvMode === 'online' && (
                <div>
                  <label className={labelCls}>Link họp</label>
                  <input value={itvLink} onChange={(e) => setItvLink(e.target.value)} placeholder="https://meet.google.com/..." className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none" />
                </div>
              )}
              {itvMode === 'onsite' && (
                <div>
                  <label className={labelCls}>Địa chỉ công tác</label>
                  <select value={itvLocation} onChange={(e) => setItvLocation(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none">
                    <option value="" className="bg-surface-2">— Chọn địa chỉ công tác —</option>
                    {WORK_LOCATIONS.map((w) => (
                      <option key={w.value} value={w.value} className="bg-surface-2">{w.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-2xs text-muted-foreground">Để trống sẽ tự lấy từ lịch phỏng vấn đã đặt (nếu có).</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className={labelCls}>Nội dung — soạn trực quan; biến {`{{...}}`} tự điền khi gửi</label>
              <button onClick={() => setPreview((v) => !v)} className="text-2xs text-indigo-300 inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {preview ? 'Ẩn xem trước' : 'Xem trước'}</button>
            </div>
            <div className="mt-1.5">
              <RichHtmlEditor value={body} onChange={setBody} variables={EMAIL_TEMPLATE_VARIABLES} minHeight={200} />
            </div>
          </div>

          {preview && (
            <div>
              <p className="mb-1 text-2xs text-muted-foreground">Xem trước (biến {`{{...}}`} sẽ điền khi gửi)</p>
              <iframe title="preview" className="w-full h-72 rounded-lg border border-line bg-white" srcDoc={previewBody} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Huỷ</button>
          <button onClick={send} disabled={sending} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi email
          </button>
        </div>
      </div>
    </div>
  );
}
