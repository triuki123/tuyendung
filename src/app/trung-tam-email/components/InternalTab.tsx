'use client';

import { useEffect, useState } from 'react';
import { Mail, MessageSquare, MessageCircleQuestion, Paperclip, Plus, X, ImagePlus, Loader2, Send } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { getCurrentUser } from '@/lib/authStore';
import AudiencePicker, { AudiencePerson } from './AudiencePicker';

const INPUT = 'w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500';
const LABEL = 'block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

/** Vehicle template hệ thống (mig 276) — subject/body luôn bị override bởi nội dung soạn tay. */
const FREEFORM_TEMPLATE_ID = 'et_internal_freeform';

/** Thay {{name}} bằng tên người nhận — cá nhân hoá đơn giản cho soạn tự do. */
function mailMerge(text: string, name: string): string {
  return text.replace(/\{\{\s*name\s*\}\}/gi, name);
}

/**
 * Tab "Nội Bộ" — 3 khối gửi RÕ RÀNG, tách biệt, mỗi khối 1 nút gửi riêng:
 *  A. Gửi Email Nội Bộ (To/CC/BCC, đính kèm, nhắm đối tượng theo tổ chức)
 *  B. Gửi Tin Nhắn Telegram (thường, Markdown + ảnh)
 *  C. Gửi Telegram hỏi RSVP (giữ nguyên composer cũ, chỉ nâng cấp chọn người nhận)
 * Kết quả gửi/lịch sử xem ở tab "Đã Gửi" (kênh Email/Telegram) và tab "RSVP Nội Bộ" (theo session).
 */
export default function InternalTab({ onSent }: { onSent: () => void }) {
  const [people, setPeople] = useState<AudiencePerson[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const defaultCompanyId: string | null = (getCurrentUser() as any)?.company_id || null;

  useEffect(() => {
    fetch('/api/users').then((r) => r.json()).then((list) => {
      const arr = Array.isArray(list) ? list.map((u: any) => ({ id: u.id, name: u.name, email: u.email, has_telegram: !!u.telegram_chat_id })) : [];
      setPeople(arr);
    });
    fetch('/api/organizations/companies').then((r) => r.json()).then((j) => setCompanies(j.data || j || []));
  }, []);

  return (
    <div className="space-y-5 sm:space-y-6">
      <EmailPanel people={people} companies={companies} defaultCompanyId={defaultCompanyId} onSent={onSent} />
      <TelegramPanel people={people} companies={companies} defaultCompanyId={defaultCompanyId} onSent={onSent} />
      <RsvpPanel people={people} companies={companies} defaultCompanyId={defaultCompanyId} onSent={onSent} />
    </div>
  );
}

interface PanelProps {
  people: AudiencePerson[];
  companies: { id: string; name: string }[];
  defaultCompanyId: string | null;
  onSent: () => void;
}

// ── Khối A — Gửi Email Nội Bộ ───────────────────────────────────────────────────
function EmailPanel({ people, companies, defaultCompanyId, onSent }: PanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [resolved, setResolved] = useState<AudiencePerson[]>([]);
  const [summary, setSummary] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Nhập tiêu đề và nội dung'); return; }
    if (resolved.length === 0) { toast.error('Chưa chọn người nhận'); return; }
    if (resolved.length > 20 && !(await confirm({
      title: 'Gửi email nội bộ?', confirmLabel: 'Gửi',
      message: `Gửi email tới ${resolved.length} người (${summary})?`,
    }))) return;

    setSending(true);
    try {
      const recipients = resolved.map((p) => ({
        to: p.email as string,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        variables: {},
        subject: mailMerge(subject, p.name),
        html: mailMerge(body, p.name).replace(/\n/g, '<br>'),
      }));
      const fd = new FormData();
      fd.append('templateId', FREEFORM_TEMPLATE_ID);
      fd.append('recipients', JSON.stringify(recipients));
      for (const f of files) fd.append('attachments', f);
      const r = await fetch('/api/email-center/send', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Lỗi');
      toast.success(`Đã gửi ${j.sent}/${j.sent + j.failed} email`);
      setSubject(''); setBody(''); setCc(''); setBcc(''); setFiles([]); setResolved([]); setSummary('');
      onSent();
    } catch (e: any) {
      toast.error(e?.message || 'Gửi thất bại');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 p-4 sm:p-5 space-y-3" style={{ background: 'var(--card)' }}>
      <h3 className="text-sm font-700 text-foreground flex items-center gap-2"><Mail size={15} className="text-indigo-400" /> Gửi Email Nội Bộ</h3>
      <p className="text-2xs text-muted-foreground">Email mời họp, thông báo nội bộ... Hỗ trợ <code>{'{{name}}'}</code> để tự thay tên từng người nhận.</p>

      <div>
        <label className={LABEL}>Tiêu đề</label>
        <input className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="VD: Mời họp toàn công ty tuần này" />
      </div>
      <div>
        <label className={LABEL}>Nội dung</label>
        <textarea className={`${INPUT} min-h-[140px]`} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={'Nội dung email...\nVD: Xin chào {{name}}, mời bạn tham dự cuộc họp...'} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>CC (tuỳ chọn)</label>
          <input className={INPUT} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cach.nhau@boi.dau, phay@vidu.com" />
        </div>
        <div>
          <label className={LABEL}>BCC (tuỳ chọn)</label>
          <input className={INPUT} value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="cach.nhau@boi.dau, phay@vidu.com" />
        </div>
      </div>

      <div>
        <label className={LABEL}>Đính kèm (file/ảnh)</label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-hover px-3 py-1.5 text-xs font-600 text-foreground hover:bg-hover-strong">
          <Plus size={13} /> Thêm file
          <input type="file" multiple className="hidden" onChange={(ev) => {
            const fs = Array.from(ev.target.files || []); setFiles((prev) => [...prev, ...fs]); ev.target.value = '';
          }} />
        </label>
        {files.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm">
                <Paperclip size={13} className="text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-2xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className={LABEL}>Người nhận</label>
        <AudiencePicker channel="email" allPeople={people} companyOptions={companies} defaultCompanyId={defaultCompanyId}
          onResolved={(p, s) => { setResolved(p); setSummary(s); }} />
      </div>

      <button onClick={send} disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 text-sm font-600 text-white">
        {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Gửi Email{resolved.length > 0 ? ` (${resolved.length})` : ''}
      </button>
    </div>
  );
}

// ── Khối B — Gửi Tin Nhắn Telegram (thường) ─────────────────────────────────────
/** Telegram: album tối đa 10 ảnh (giới hạn của sendMediaGroup). */
const TG_MAX_IMAGES = 10;

function TelegramPanel({ people, companies, defaultCompanyId, onSent }: PanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imgUploading, setImgUploading] = useState(false);
  const [resolved, setResolved] = useState<AudiencePerson[]>([]);
  const [summary, setSummary] = useState('');
  const [sending, setSending] = useState(false);

  const uploadImages = async (files: File[]) => {
    if (!files.length) return;
    const room = TG_MAX_IMAGES - imageUrls.length;
    if (room <= 0) { toast.error(`Tối đa ${TG_MAX_IMAGES} ảnh`); return; }
    if (files.length > room) toast.error(`Chỉ nhận thêm ${room} ảnh (tối đa ${TG_MAX_IMAGES})`);
    setImgUploading(true);
    const added: string[] = [];
    try {
      for (const file of files.slice(0, room)) {
        const fd = new FormData(); fd.append('file', file);
        const r = await fetch('/api/email-center/rsvp/image', { method: 'POST', body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Lỗi tải ảnh');
        added.push(j.data.url);
      }
      toast.success(`Đã tải ${added.length} ảnh`);
    } catch (e: any) {
      toast.error(e?.message || 'Lỗi tải ảnh');
    } finally {
      if (added.length) setImageUrls((prev) => [...prev, ...added]); // giữ ảnh đã tải xong
      setImgUploading(false);
    }
  };

  const send = async () => {
    if (!title.trim()) { toast.error('Nhập tiêu đề'); return; }
    // Chỉ gửi ảnh (không nội dung) là hợp lệ.
    if (!content.trim() && imageUrls.length === 0) { toast.error('Nhập nội dung hoặc đính kèm ít nhất 1 ảnh'); return; }
    if (resolved.length === 0) { toast.error('Chưa chọn người nhận'); return; }
    if (!(await confirm({
      title: 'Gửi tin nhắn Telegram?', confirmLabel: 'Gửi',
      message: `Gửi tới ${resolved.length} người đã liên kết Telegram (${summary})?`,
    }))) return;

    setSending(true);
    try {
      const r = await fetch('/api/email-center/internal-tg', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), imageUrls, personIds: resolved.map((p) => p.id), targetSummary: summary }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Lỗi');
      toast.success(`Gửi Telegram: ${j.sent} thành công, ${j.no_channel} chưa liên kết, ${j.failed} lỗi`);
      setTitle(''); setContent(''); setImageUrls([]); setResolved([]); setSummary('');
      onSent();
    } catch (e: any) {
      toast.error(e?.message || 'Gửi thất bại');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 p-4 sm:p-5 space-y-3" style={{ background: 'var(--card)' }}>
      <h3 className="text-sm font-700 text-foreground flex items-center gap-2"><MessageSquare size={15} className="text-cyan-400" /> Gửi Tin Nhắn Telegram</h3>
      <p className="text-2xs text-muted-foreground">Đăng thông báo tới nhân sự đã liên kết Telegram — hỗ trợ Markdown (*in đậm*, _nghiêng_). Đính kèm tới {TG_MAX_IMAGES} ảnh (từ 2 ảnh trở lên gửi dạng album).</p>

      <div>
        <label className={LABEL}>Tiêu đề (nội bộ, để nhận diện trong lịch sử)</label>
        <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Thông báo lịch nghỉ lễ" />
      </div>
      <div>
        <label className={LABEL}>Nội dung (Markdown) — bỏ trống được nếu đã đính kèm ảnh</label>
        <textarea className={`${INPUT} min-h-[120px]`} value={content} onChange={(e) => setContent(e.target.value)}
          placeholder={'Nội dung tin nhắn… Hỗ trợ *in đậm*, _nghiêng_ (Markdown). Để trống nếu chỉ gửi ảnh.'} />
      </div>
      <div>
        <label className={LABEL}>Ảnh (tuỳ chọn — tối đa {TG_MAX_IMAGES})</label>
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {imageUrls.map((url, i) => (
              <div key={url + i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`ảnh ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-white/10" />
                <button type="button" title="Gỡ ảnh"
                  onClick={() => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        {imageUrls.length < TG_MAX_IMAGES && (
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-white/15 bg-black/10 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-indigo-500/60">
            {imgUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {imgUploading ? 'Đang tải…' : (imageUrls.length ? 'Thêm ảnh nữa' : 'Thêm ảnh')}
            <input type="file" accept="image/*" multiple className="hidden" disabled={imgUploading}
              onChange={(ev) => { uploadImages(Array.from(ev.target.files || [])); ev.target.value = ''; }} />
          </label>
        )}
      </div>

      <div>
        <label className={LABEL}>Người nhận</label>
        <AudiencePicker channel="telegram" allPeople={people} companyOptions={companies} defaultCompanyId={defaultCompanyId}
          onResolved={(p, s) => { setResolved(p); setSummary(s); }} />
      </div>

      <button onClick={send} disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-5 py-2.5 text-sm font-600 text-white">
        {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Gửi Telegram{resolved.length > 0 ? ` (${resolved.length})` : ''}
      </button>
    </div>
  );
}

// ── Khối C — Gửi Telegram hỏi RSVP ──────────────────────────────────────────────
function RsvpPanel({ people, companies, defaultCompanyId, onSent }: PanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [eventKey, setEventKey] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [yesLabel, setYesLabel] = useState('✅ Có tham gia');
  const [noLabel, setNoLabel] = useState('❌ Không tham gia');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imgUploading, setImgUploading] = useState(false);
  const [resolved, setResolved] = useState<AudiencePerson[]>([]);
  const [summary, setSummary] = useState('');
  const [sending, setSending] = useState(false);

  const uploadImage = async (file: File | null) => {
    if (!file) return;
    setImgUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/email-center/rsvp/image', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Lỗi tải ảnh');
      setImageUrl(j.data.url);
      toast.success('Đã tải ảnh');
    } catch (e: any) { toast.error(e?.message || 'Lỗi tải ảnh'); }
    finally { setImgUploading(false); }
  };

  const send = async () => {
    if (!eventKey.trim() || !eventTitle.trim()) { toast.error('Nhập mã đợt + tiêu đề'); return; }
    if (!content.trim()) { toast.error('Nhập nội dung'); return; }
    if (resolved.length === 0) { toast.error('Chưa chọn người nhận'); return; }
    if (!(await confirm({
      title: 'Gửi hỏi RSVP?', confirmLabel: 'Gửi',
      message: `Gửi hỏi RSVP tới ${resolved.length} người đã liên kết Telegram (${summary})?`,
    }))) return;

    setSending(true);
    try {
      const r = await fetch('/api/email-center/rsvp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: FREEFORM_TEMPLATE_ID,
          eventKey: eventKey.trim(), eventTitle: eventTitle.trim(),
          personIds: resolved.map((p) => p.id),
          variables: {},
          yesLabel: yesLabel.trim() || undefined, noLabel: noLabel.trim() || undefined,
          content: content.trim(), imageUrl: imageUrl.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Lỗi');
      toast.success(`Gửi RSVP: ${j.sent} thành công, ${j.no_channel} chưa có Telegram, ${j.failed} lỗi`);
      setEventKey(''); setEventTitle(''); setContent(''); setImageUrl(''); setResolved([]); setSummary('');
      onSent();
    } catch (e: any) {
      toast.error(e?.message || 'Gửi thất bại');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 p-4 sm:p-5 space-y-3" style={{ background: 'var(--card)' }}>
      <h3 className="text-sm font-700 text-foreground flex items-center gap-2"><MessageCircleQuestion size={15} className="text-violet-400" /> Gửi Telegram Hỏi RSVP</h3>
      <p className="text-2xs text-muted-foreground">Gửi kèm 2 nút bấm — người nhận trả lời trực tiếp trên Telegram. Kết quả xem ở tab <b>RSVP Nội Bộ</b> (phân theo mã đợt/session).</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Mã đợt (event key) *</label>
          <input className={INPUT} value={eventKey} onChange={(e) => setEventKey(e.target.value.toLowerCase().replace(/[^a-z0-9:_-]/g, ''))} placeholder="birthday-2026-07" />
        </div>
        <div>
          <label className={LABEL}>Tiêu đề hiển thị *</label>
          <input className={INPUT} value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Sinh nhật tháng 7/2026" />
        </div>
        <div>
          <label className={LABEL}>Nhãn nút đồng ý</label>
          <input className={INPUT} value={yesLabel} onChange={(e) => setYesLabel(e.target.value)} placeholder="✅ Có tham gia" />
        </div>
        <div>
          <label className={LABEL}>Nhãn nút từ chối</label>
          <input className={INPUT} value={noLabel} onChange={(e) => setNoLabel(e.target.value)} placeholder="❌ Không tham gia" />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Nội dung tin nhắn *</label>
          <textarea className={`${INPUT} min-h-[96px]`} value={content} onChange={(e) => setContent(e.target.value)}
            placeholder={'Nội dung gửi qua Telegram.\nVí dụ: Chúc mừng sinh nhật! FADO GROUP gửi lời chúc tốt đẹp nhất tới bạn 🎉'} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Ảnh (tuỳ chọn)</label>
          {imageUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="ảnh RSVP" className="h-16 w-16 rounded-lg object-cover border border-white/10" />
              <button type="button" onClick={() => setImageUrl('')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-red-400">
                <X size={13} /> Gỡ ảnh
              </button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-white/15 bg-black/10 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-indigo-500/60">
              {imgUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              {imgUploading ? 'Đang tải…' : 'Thêm ảnh'}
              <input type="file" accept="image/*" className="hidden" disabled={imgUploading}
                onChange={(ev) => { uploadImage(ev.target.files?.[0] ?? null); ev.target.value = ''; }} />
            </label>
          )}
        </div>
      </div>

      <div>
        <label className={LABEL}>Người nhận</label>
        <AudiencePicker channel="telegram" allPeople={people} companyOptions={companies} defaultCompanyId={defaultCompanyId}
          onResolved={(p, s) => { setResolved(p); setSummary(s); }} />
      </div>

      <button onClick={send} disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-5 py-2.5 text-sm font-600 text-white">
        {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Gửi RSVP{resolved.length > 0 ? ` (${resolved.length})` : ''}
      </button>
    </div>
  );
}
