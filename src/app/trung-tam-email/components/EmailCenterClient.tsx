'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, FileText, Users, Key, PartyPopper, Inbox, Loader2, Eye, X, Plus, Paperclip,
  ChevronDown, Check, AlertCircle, Search, Users2, Trash2, ExternalLink, Copy,
  Settings, Pencil, Save, MailCheck, AtSign, Star, MessageSquare, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { getCurrentUser } from '@/lib/authStore';
import InternalTab from './InternalTab';

type Cat = 'payment' | 'hr' | 'account' | 'internal';
type TabKey = Cat | 'outbox' | 'rsvp';

interface RowColumn { key: string; label: string; type: 'text' | 'number' | 'money'; formula?: string; default?: string | number }
interface TemplateField { key: string; label: string; type: 'text' | 'number' | 'date' | 'textarea' | 'money' | 'rows'; required?: boolean; default?: string; help?: string; formula?: string; columns?: RowColumn[]; defaultRows?: Record<string, any>[] }
interface Template { id: string; category: Cat | 'other'; key: string; name: string; description: string | null; subject_tpl: string; body_html_tpl: string; schema: TemplateField[]; is_active: boolean; is_system: boolean; default_sender_id: string | null; engine: 'ses' | 'smtp' }
interface Sender { id: string; name: string; from_addr: string; from_name: string | null; reply_to: string | null; engine: 'ses' | 'smtp'; ses_region: string | null; ses_access_key: string | null; smtp_host: string | null; smtp_port: number | null; smtp_secure: boolean | null; smtp_user: string | null; smtp_reject_unauth: boolean | null; is_default: boolean; is_active: boolean; has_secret: boolean }
interface OutboxRow { id: string; template_id: string | null; category: string | null; subject: string; to_addr: string; status: 'pending' | 'sent' | 'failed'; error: string | null; sent_at: string | null; created_at: string; body_html?: string }
interface Person { id: string; name: string; email?: string; has_telegram?: boolean }
interface Recipient { to: string; variables: Record<string, any>; label?: string }

const CATS: { key: TabKey; label: string; icon: any; hint: string }[] = [
  { key: 'payment', label: 'Đề Nghị Thanh Toán', icon: FileText, hint: 'Gửi đề nghị thanh toán cho khách hàng' },
  { key: 'hr', label: 'Nhân Sự', icon: Users, hint: 'Onboarding / mời phỏng vấn / hợp đồng' },
  { key: 'account', label: 'Tài Khoản', icon: Key, hint: 'Gửi thông tin tài khoản nội bộ' },
  { key: 'internal', label: 'Nội Bộ', icon: PartyPopper, hint: 'Sinh nhật / mời họp / thông báo' },
  { key: 'rsvp', label: 'RSVP Nội Bộ', icon: MessageSquare, hint: 'Kết quả tham gia sự kiện qua Telegram' },
  { key: 'outbox', label: 'Đã Gửi', icon: Inbox, hint: 'Log email đã gửi' },
];

const INPUT = 'w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500';
const LABEL = 'block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

function formatMoney(v: string): string {
  const n = String(v).replace(/[^\d]/g, '');
  if (!n) return String(v);
  return Number(n).toLocaleString('vi-VN');
}

/**
 * Đánh giá công thức đơn giản.
 * Hỗ trợ:
 *  - Tham chiếu cột trong cùng dòng: sl * don_gia
 *  - Aggregate cross-row: SUM(fieldKey.colKey)
 *  - Tham chiếu biến ngoài loop: fieldKey
 *  - Toán tử: + - * / ( ) và hằng số.
 * @param formula công thức
 * @param rowCtx nếu đang trong 1 dòng của rows → context = row hiện tại
 * @param globalCtx toàn bộ variables (payment single) hoặc recipient.variables (bulk)
 */
function evalFormula(formula: string, rowCtx: Record<string, any> | null, globalCtx: Record<string, any>): number {
  if (!formula) return 0;
  // 1) SUM(rowsKey.colKey) → sum cột colKey của mảng globalCtx[rowsKey]
  let expr = formula.replace(/SUM\(\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\)/g, (_m, arrKey, colKey) => {
    const arr = globalCtx?.[arrKey];
    if (!Array.isArray(arr)) return '0';
    const sum = arr.reduce((s: number, r: any) => s + toNum(r?.[colKey]), 0);
    return String(sum);
  });
  // 2) Thay identifier còn lại bằng số
  expr = expr.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (name) => {
    if (rowCtx && name in rowCtx) return String(toNum(rowCtx[name]));
    if (globalCtx && name in globalCtx) return String(toNum(globalCtx[name]));
    return '0';
  });
  // 3) Whitelist chars rồi eval
  if (!/^[0-9+\-*/(). ]+$/.test(expr)) return 0;
  try { const v = Function(`"use strict"; return (${expr})`)(); return Number.isFinite(v) ? Number(v) : 0; } catch { return 0; }
}

/** Số → chữ tiếng Việt (dùng cho "bằng chữ" trong đề nghị thanh toán). */
export function numberToVietnameseWords(input: number | string): string {
  const n = Math.floor(Math.abs(toNum(input)));
  if (n === 0) return 'Không đồng';
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const scales = ['', 'nghìn', 'triệu', 'tỷ'];
  // Đọc 3 chữ số
  function read3(num: number, full: boolean): string {
    const tram = Math.floor(num / 100);
    const chuc = Math.floor((num % 100) / 10);
    const dv = num % 10;
    const parts: string[] = [];
    if (tram > 0 || full) parts.push(`${digits[tram]} trăm`);
    if (chuc > 1) {
      parts.push(digits[chuc] + ' mươi');
      if (dv === 1) parts.push('mốt');
      else if (dv === 5) parts.push('lăm');
      else if (dv > 0) parts.push(digits[dv]);
    } else if (chuc === 1) {
      parts.push('mười');
      if (dv === 5) parts.push('lăm');
      else if (dv > 0) parts.push(digits[dv]);
    } else if (chuc === 0) {
      if (dv > 0) {
        if (tram > 0 || full) parts.push('lẻ');
        parts.push(digits[dv]);
      }
    }
    return parts.join(' ').trim();
  }
  // Tách theo nhóm 3 chữ số từ phải sang
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) { groups.unshift(rest % 1000); rest = Math.floor(rest / 1000); }
  const totalGroups = groups.length;
  let result = '';
  for (let i = 0; i < totalGroups; i++) {
    const g = groups[i];
    const scaleIdx = totalGroups - 1 - i;
    if (g === 0) continue;
    const isFirst = result === '';
    const words = read3(g, !isFirst);
    result += (result ? ' ' : '') + words + (scales[scaleIdx] ? ' ' + scales[scaleIdx] : '');
  }
  result = result.trim().replace(/\s+/g, ' ') + ' đồng';
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function toNum(v: any): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  // Chuẩn vi-VN: '.' = ngăn cách hàng nghìn, ',' = thập phân.
  // Bỏ dấu chấm rồi đổi ',' → '.' để "5.800.000" → 5800000, "1,5" → 1.5.
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

/** Tính lại tất cả cell có formula trong toàn bộ variables (in place). */
function applyFormulas(schema: TemplateField[], vars: Record<string, any>): Record<string, any> {
  const out = { ...vars };
  // Bước 1: recompute formula trong mỗi row của mỗi field type=rows
  for (const f of schema) {
    if (f.type === 'rows' && Array.isArray(out[f.key])) {
      const cols = f.columns || [];
      out[f.key] = out[f.key].map((row: any) => {
        const nr = { ...row };
        for (const c of cols) if (c.formula) nr[c.key] = evalFormula(c.formula, nr, out);
        return nr;
      });
    }
  }
  // Bước 2: recompute formula field cấp cao (2 lần để field phụ thuộc field khác hội tụ)
  for (let pass = 0; pass < 2; pass++) {
    for (const f of schema) {
      if (!f.formula) continue;
      // Formula đặc biệt cho text: toWords(x) → chữ tiếng Việt.
      const mw = /^\s*toWords\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*$/.exec(f.formula);
      if (mw) { out[f.key] = numberToVietnameseWords(out[mw[1]]); continue; }
      out[f.key] = evalFormula(f.formula, null, out);
    }
  }
  return out;
}

const DRAFT_KEY = 'email-center-draft';
interface EmailDraft {
  savedAt: number; tab: string; tplId: string; tplName?: string;
  selSenderId: string; globalVars: Record<string, any>; recipients: Recipient[];
}

export default function EmailCenterClient() {
  const toast = useToast();
  const [allowed, setAllowed] = useState<Cat[] | null>(null);
  const [manageAllowed, setManageAllowed] = useState(false);
  const [tab, setTab] = useState<TabKey>('payment');

  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplId, setTplId] = useState<string>('');
  const tpl = useMemo(() => templates.find(t => t.id === tplId) || null, [templates, tplId]);

  // Recipients (bulk): mỗi phần tử = 1 người nhận + bộ biến riêng.
  const [recipients, setRecipients] = useState<Recipient[]>([{ to: '', variables: {} }]);
  const [globalVars, setGlobalVars] = useState<Record<string, any>>({}); // dùng cho template thuần cấu trúc (payment) — 1 email
  const [subjectOverride, setSubjectOverride] = useState(''); // ô Tiêu đề tùy chỉnh — rỗng = dùng tiêu đề mặc định của template

  // Attachments
  const [files, setFiles] = useState<File[]>([]);

  // Preview & send
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewData, setPreviewData] = useState<Array<{ subject: string; html: string; to: string }>>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editPreview, setEditPreview] = useState(false); // bật chế độ sửa nội dung ngay trên bản xem trước
  const previewIframe = useRef<HTMLIFrameElement>(null);

  // People picker for bulk (internal/account/hr)
  const [pplOpen, setPplOpen] = useState(false);
  const [ppl, setPpl] = useState<Person[]>([]);
  const [pplQ, setPplQ] = useState('');

  // Outbox — bộ lọc kênh Email/Telegram (Telegram = internal_tg_broadcasts, panel "Nội Bộ").
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [outboxDetail, setOutboxDetail] = useState<any | null>(null);
  const [outboxChannel, setOutboxChannel] = useState<'email' | 'telegram'>('email');
  const [tgBroadcasts, setTgBroadcasts] = useState<Array<{ id: string; title: string; content: string; target_summary: string | null; sent_count: number; failed_count: number; no_channel_count: number; created_at: string }>>([]);
  const [tgLoading, setTgLoading] = useState(false);

  // Sender chọn khi gửi (override template default)
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selSenderId, setSelSenderId] = useState<string>('');

  // Lưu nháp (localStorage): meta để hiện banner khôi phục; pendingDraft giữ nháp đang khôi phục.
  const [draftMeta, setDraftMeta] = useState<{ savedAt: number; tab: string; tplName?: string } | null>(null);
  const pendingDraft = useRef<EmailDraft | null>(null);

  // Deep-link: /trung-tam-email?tab=hr&templateId=hr_xxx — mở thẳng form soạn với template đã chọn.
  // Đọc từ location thay vì useSearchParams để không phải bọc Suspense.
  const pendingTplId = useRef<string | null>(null);

  // RSVP nội bộ — lịch sử theo session (composer đã chuyển sang InternalTab.tsx, tab "Nội Bộ").
  const [rsvpEvents, setRsvpEvents] = useState<Array<{ event_key: string; event_title: string; total: number; yes: number; no: number; pending: number; created_at: string }>>([]);
  const [rsvpEventsLoading, setRsvpEventsLoading] = useState(false);
  const [rsvpDetail, setRsvpDetail] = useState<any[] | null>(null);
  const [rsvpDetailTitle, setRsvpDetailTitle] = useState<string>('');

  // Cấu hình modal
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgTab, setCfgTab] = useState<'senders' | 'templates'>('senders');

  // Load permissions
  useEffect(() => {
    const u = getCurrentUser() as any;
    if (u?.role === 'super_admin') {
      setAllowed(['payment', 'hr', 'account', 'internal']);
      setManageAllowed(true);
    } else {
      const arr: string[] = Array.isArray(u?.module_permissions?.['email-center']) ? u.module_permissions['email-center'] : [];
      setAllowed(arr.filter((x): x is Cat => ['payment', 'hr', 'account', 'internal'].includes(x)));
      setManageAllowed(arr.includes('manage'));
    }
    fetch('/api/users').then(r => r.json()).then(list => {
      const arr = Array.isArray(list) ? list.map((u: any) => ({ id: u.id, name: u.name, email: u.email, has_telegram: !!u.telegram_chat_id })) : [];
      setPpl(arr);
    });
    loadSenders();
  }, []);

  const loadRsvpEvents = () => {
    setRsvpEventsLoading(true);
    fetch('/api/email-center/rsvp').then(r => r.json()).then(j => setRsvpEvents(Array.isArray(j?.data) ? j.data : []))
      .finally(() => setRsvpEventsLoading(false));
  };
  const openRsvpDetail = async (eventKey: string, title: string) => {
    const r = await fetch(`/api/email-center/rsvp?eventKey=${encodeURIComponent(eventKey)}`);
    const j = await r.json();
    setRsvpDetail(Array.isArray(j?.data) ? j.data : []);
    setRsvpDetailTitle(title);
  };

  const loadSenders = () => {
    fetch('/api/email-center/senders').then(r => r.json()).then(j => {
      const list: Sender[] = Array.isArray(j?.data) ? j.data : [];
      setSenders(list);
    });
  };

  useEffect(() => {
    if (allowed === null) return;
    if (allowed.length === 0 && !manageAllowed) return;
    // Set default tab
    if (allowed.length > 0 && !allowed.includes(tab as Cat) && tab !== 'outbox' && tab !== 'rsvp') setTab(allowed[0]);
  }, [allowed, manageAllowed, tab]);

  // Đọc deep-link 1 lần khi mở trang. Nếu chỉ có templateId (không có tab) thì hỏi API để biết
  // template thuộc nhóm nào — mẫu tuyển dụng cũ có thể được map sang 'hr' hoặc 'account'.
  useEffect(() => {
    let tid: string | null = null, t: string | null = null;
    try {
      const q = new URLSearchParams(window.location.search);
      t = q.get('tab'); tid = q.get('templateId');
    } catch { return; }
    if (!tid) { if (t && CATS.some(c => c.key === t)) setTab(t as TabKey); return; }
    pendingTplId.current = tid;
    if (t && CATS.some(c => c.key === t)) { setTab(t as TabKey); return; }
    fetch('/api/email-center/templates').then(r => r.json()).then(j => {
      const found = (Array.isArray(j?.data) ? j.data : []).find((x: Template) => x.id === tid);
      if (found && CATS.some(c => c.key === found.category)) setTab(found.category as TabKey);
    }).catch(() => { /* không resolve được thì giữ tab mặc định */ });
  }, []);

  // Load templates when tab changes
  useEffect(() => {
    if (tab === 'outbox') { loadOutbox(); loadTgBroadcasts(); return; }
    if (tab === 'rsvp') { loadRsvpEvents(); return; }
    if (tab === 'internal') return; // InternalTab.tsx tự quản lý dữ liệu riêng (3 khối gửi)
    fetch(`/api/email-center/templates?category=${tab}`).then(r => r.json()).then(j => {
      const list: Template[] = Array.isArray(j?.data) ? j.data : [];
      setTemplates(list);
      // Chỉ tiêu thụ pendingTplId khi tab hiện tại thật sự chứa template đó (tab mặc định load
      // trước khi resolve xong nhóm — xoá sớm sẽ mất deep-link).
      const wanted = pendingTplId.current && list.some(t => t.id === pendingTplId.current) ? pendingTplId.current : null;
      if (wanted) pendingTplId.current = null;
      setTplId(wanted || list[0]?.id || '');
      setRecipients([{ to: '', variables: {} }]);
      setGlobalVars({});
      setFiles([]);
    });
  }, [tab]);

  const loadOutbox = () => {
    setOutboxLoading(true);
    fetch('/api/email-center/outbox').then(r => r.json()).then(j => setOutbox(Array.isArray(j?.data) ? j.data : []))
      .finally(() => setOutboxLoading(false));
  };

  const loadTgBroadcasts = () => {
    setTgLoading(true);
    fetch('/api/email-center/internal-tg').then(r => r.json()).then(j => setTgBroadcasts(Array.isArray(j?.data) ? j.data : []))
      .finally(() => setTgLoading(false));
  };

  // Reset selSenderId khi đổi template → chọn default của template.
  useEffect(() => {
    if (!tpl) return;
    setSelSenderId(tpl.default_sender_id || '');
  }, [tplId, tpl]);

  // Init variables khi đổi template — bao gồm defaultRows cho field type=rows.
  useEffect(() => {
    if (!tpl) return;
    const defs: Record<string, any> = {};
    for (const f of tpl.schema) {
      if (f.type === 'rows') defs[f.key] = (f.defaultRows || []).map(r => ({ ...r }));
      else if (f.default !== undefined) defs[f.key] = f.default;
    }
    const withCalc = applyFormulas(tpl.schema, defs);
    const single = tab === 'payment' || tpl.schema.some(f => f.type === 'rows');
    if (single) setGlobalVars(withCalc);
    else setRecipients(rs => rs.map(r => ({ ...r, variables: applyFormulas(tpl.schema, { ...withCalc, ...r.variables }) })));
    setSubjectOverride(tpl.subject_tpl || ''); // prefill tiêu đề mặc định để sửa
    // eslint-disable-next-line
  }, [tplId]);

  // ───── Lưu nháp ─────────────────────────────────────────────────────────────
  // Đọc nháp đã lưu khi mở trang → hiện banner khôi phục.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) { const d = JSON.parse(raw) as EmailDraft; setDraftMeta({ savedAt: d.savedAt, tab: d.tab, tplName: d.tplName }); }
    } catch { /* bỏ qua nháp hỏng */ }
  }, []);

  const saveDraft = () => {
    const draft: EmailDraft = {
      savedAt: Date.now(), tab, tplId, tplName: tpl?.name,
      selSenderId, globalVars, recipients,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftMeta({ savedAt: draft.savedAt, tab: draft.tab, tplName: draft.tplName });
      toast.success('Đã lưu nháp' + (files.length ? ' (đính kèm không lưu vào nháp)' : ''));
    } catch { toast.error('Không lưu được nháp'); }
  };

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ } setDraftMeta(null); };

  const applyDraftVars = (d: EmailDraft) => {
    if (d.selSenderId) setSelSenderId(d.selSenderId);
    if (d.tab === 'payment') setGlobalVars(d.globalVars || {});
    else setRecipients(d.recipients?.length ? d.recipients : [{ to: '', variables: {} }]);
    pendingDraft.current = null;
    clearDraft();
    toast.success('Đã khôi phục nháp');
  };

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) { setDraftMeta(null); return; }
      const d = JSON.parse(raw) as EmailDraft;
      pendingDraft.current = d;
      if (tab !== d.tab) setTab(d.tab as TabKey);   // đổi tab → load lại template → effect dưới áp tiếp
      // cùng tab: 2 effect bên dưới sẽ tự chọn template + áp biến khi sẵn sàng
      else if (templates.length) {
        if (templates.some(t => t.id === d.tplId) && tplId !== d.tplId) setTplId(d.tplId);
        else applyDraftVars(d);
      }
    } catch { toast.error('Nháp hỏng, không khôi phục được'); setDraftMeta(null); }
  };

  // Sau khi template của tab đã tải xong → chọn đúng template của nháp.
  useEffect(() => {
    const d = pendingDraft.current;
    if (!d || tab !== d.tab || !templates.length) return;
    if (templates.some(t => t.id === d.tplId)) {
      if (tplId !== d.tplId) setTplId(d.tplId);
      else applyDraftVars(d);
    } else {
      applyDraftVars(d); // template không còn → vẫn áp biến vào template hiện tại
    }
    // eslint-disable-next-line
  }, [templates, tab]);

  // Áp biến của nháp SAU khi effect init-variables theo tplId đã chạy (khai báo sau nên chạy sau).
  useEffect(() => {
    const d = pendingDraft.current;
    if (!d || tplId !== d.tplId) return;
    applyDraftVars(d);
    // eslint-disable-next-line
  }, [tplId]);

  // 1 người nhận + 1 bộ variables: payment, HOẶC template có bảng động (rows) như "nhiều tài khoản".
  const isSingle = tab === 'payment' || (tpl?.schema?.some(f => f.type === 'rows') ?? false);

  const addPersonToRecipients = (p: Person) => {
    if (!p.email) return;
    const defs: Record<string, any> = {};
    for (const f of tpl?.schema || []) if (f.default !== undefined) defs[f.key] = f.default;
    setRecipients(rs => {
      const key = p.email as string;
      if (rs.some(r => r.to === key)) return rs;
      const auto: Record<string, any> = { ...defs, name: p.name };
      return [...rs.filter(r => r.to.trim()), { to: p.email as string, variables: auto, label: p.name }];
    });
  };

  /** Gửi toàn hệ thống: thêm TẤT CẢ nhân sự có email. */
  const addAllPeople = () => {
    const eligible = ppl.filter(p => !!p.email);
    if (!eligible.length) { toast.error('Chưa có nhân sự nào có email'); return; }
    const defs: Record<string, any> = {};
    for (const f of tpl?.schema || []) if (f.default !== undefined) defs[f.key] = f.default;
    setRecipients(eligible.map(p => ({
      to: p.email as string,
      variables: { ...defs, name: p.name },
      label: p.name,
    })));
    setPplOpen(false);
    toast.success(`Đã chọn toàn hệ thống — ${eligible.length} người`);
  };

  const previewAll = async () => {
    if (!tpl) { toast.error('Chọn template'); return; }
    setPreviewLoading(true);
    try {
      const list = isSingle
        ? [{ to: (recipients[0]?.to || '').trim(), variables: globalVars }]
        : recipients.filter(r => r.to.trim());
      if (list.length === 0) { toast.error('Chưa có người nhận'); setPreviewLoading(false); return; }
      // Validate required
      for (const r of list) {
        for (const f of tpl.schema.filter(f => f.required)) {
          const v = r.variables?.[f.key];
          if (v === undefined || v === null || String(v).trim() === '') {
            toast.error(`Thiếu trường "${f.label}" cho ${r.to}`);
            setPreviewLoading(false); return;
          }
        }
      }
      const results = await Promise.all(list.map(async r => {
        const rp = await fetch('/api/email-center/preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: tpl.id, variables: r.variables, subjectOverride }),
        });
        const j = await rp.json();
        return { to: r.to, subject: j?.data?.subject || '', html: j?.data?.html || '' };
      }));
      setPreviewData(results);
      setPreviewIdx(0);
      setEditPreview(false);
      setPreviewOpen(true);
    } catch { toast.error('Lỗi preview'); } finally { setPreviewLoading(false); }
  };

  /** Đọc HTML đang sửa trong iframe (chế độ Sửa) về previewData; trả về mảng đã cập nhật. */
  const captureEdit = (): typeof previewData => {
    if (!editPreview || !previewIframe.current?.contentDocument) return previewData;
    const doc = previewIframe.current.contentDocument;
    const html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    const next = previewData.map((p, i) => (i === previewIdx ? { ...p, html } : p));
    setPreviewData(next);
    return next;
  };

  const doSend = async () => {
    if (!tpl) return;
    // Gom nội dung đã sửa tay ở bản xem trước (nếu có) để gửi đúng bản đó.
    const pdata = captureEdit();
    setSending(true);
    try {
      const baseList = isSingle
        ? [{ to: recipients[0].to.trim(), variables: globalVars }]
        : recipients.filter(r => r.to.trim()).map(r => ({ to: r.to.trim(), variables: r.variables }));
      // previewData dựng cùng thứ tự với baseList → khớp theo index để gửi bản đã sửa.
      const list = baseList.map((r, i) => ({
        ...r,
        ...(pdata[i]?.subject ? { subject: pdata[i].subject } : {}),
        ...(pdata[i]?.html ? { html: pdata[i].html } : {}),
      }));
      const fd = new FormData();
      fd.append('templateId', tpl.id);
      if (selSenderId) fd.append('senderId', selSenderId);
      if (subjectOverride.trim()) fd.append('subjectOverride', subjectOverride);
      fd.append('recipients', JSON.stringify(list));
      for (const f of files) fd.append('attachments', f);
      const r = await fetch('/api/email-center/send', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Lỗi');
      toast.success(`Đã gửi ${j.sent}/${j.sent + j.failed} email`);
      if (j.failed > 0) console.warn('Failed:', j.results.filter((x: any) => x.status === 'failed'));
      setPreviewOpen(false);
      // Reset
      setRecipients([{ to: '', variables: {} }]);
      setGlobalVars(Object.fromEntries(tpl.schema.filter(f => f.default).map(f => [f.key, f.default])));
      setFiles([]);
      clearDraft();
    } catch (err: any) { toast.error(err?.message || 'Gửi thất bại'); } finally { setSending(false); }
  };

  // Guard states
  if (allowed === null) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (allowed.length === 0 && !manageAllowed) {
    return (
      <div className="flex flex-col items-center py-24 text-muted-foreground">
        <Send className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Bạn không có quyền vào Trung Tâm Email.</p>
        <p className="text-xs mt-1 opacity-60">Liên hệ quản trị để được cấp quyền.</p>
      </div>
    );
  }

  const filteredPpl = ppl.filter(p => !pplQ || p.name.toLowerCase().includes(pplQ.toLowerCase()) || (p.email || '').toLowerCase().includes(pplQ.toLowerCase()));

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2">
            <Send className="h-6 w-6 text-indigo-400" /> Trung Tâm Email
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Soạn & gửi email theo template — hỗ trợ đính kèm, gửi hàng loạt cá nhân hóa, preview trước khi gửi.</p>
        </div>
        {manageAllowed && (
          <button onClick={() => setCfgOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-foreground hover:bg-hover">
            <Settings size={15} /> Cấu Hình
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 overflow-x-auto">
        {CATS.filter(c => {
          if (c.key === 'outbox') return true;
          if (c.key === 'rsvp') return allowed.includes('internal') || manageAllowed;
          return allowed.includes(c.key as Cat) || manageAllowed;
        }).map(c => {
          const Icon = c.icon;
          const active = tab === c.key;
          return (
            <button key={c.key} onClick={() => setTab(c.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-600 whitespace-nowrap border-b-2 transition-colors ${
                active ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              <Icon size={15} /> {c.label}
            </button>
          );
        })}
      </div>

      {/* Banner khôi phục nháp */}
      {draftMeta && tab !== 'outbox' && tab !== 'rsvp' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <p className="text-xs sm:text-sm text-amber-200">
            <Save size={14} className="inline mb-0.5 mr-1.5" />
            Có bản nháp lưu lúc {new Date(draftMeta.savedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {draftMeta.tplName ? ` · ${draftMeta.tplName}` : ''}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={restoreDraft} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-500 px-3 py-1.5 text-xs font-600 text-black">
              Khôi phục
            </button>
            <button onClick={clearDraft} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Bỏ nháp
            </button>
          </div>
        </div>
      )}

      {(tab === 'payment' || tab === 'hr' || tab === 'account') && (
        <>
          {/* Template picker */}
          <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
            <label className={LABEL}>Chọn template</label>
            {templates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Chưa có template cho tab này.</p>
            ) : (
              <select className={INPUT} value={tplId} onChange={ev => setTplId(ev.target.value)}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {tpl?.description && <p className="mt-2 text-xs text-muted-foreground">{tpl.description}</p>}
            {tpl && senders.length > 0 && (
              <div className="mt-3">
                <label className={LABEL}>Gửi từ</label>
                <select className={INPUT} value={selSenderId} onChange={ev => setSelSenderId(ev.target.value)}>
                  {senders.filter(s => s.is_active).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.from_addr}{s.is_default ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tpl && (
              <div className="mt-3">
                <label className={LABEL}>Tiêu đề email</label>
                <input className={INPUT} value={subjectOverride} onChange={ev => setSubjectOverride(ev.target.value)}
                  placeholder="Tiêu đề gửi đi (có thể dùng {{biến}})" />
                <p className="mt-1 text-2xs text-muted-foreground">Sửa tiêu đề cho lần gửi này. Để trống = dùng tiêu đề mặc định của template.</p>
              </div>
            )}
          </div>

          {tpl && (
            <>
              {/* Recipients */}
              <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-700 text-foreground flex items-center gap-2"><Users2 size={15} className="text-indigo-400" /> Người nhận</h3>
                  {!isSingle && (
                    <div className="relative">
                      <button onClick={() => setPplOpen(v => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-hover px-3 py-1.5 text-xs font-600 text-foreground hover:bg-hover-strong">
                        <Plus size={13} /> Chọn từ nhân sự
                      </button>
                      {pplOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setPplOpen(false)} />
                          <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-white/10 shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
                            <div className="p-2 border-b border-white/5 space-y-2">
                              <div className="flex items-center gap-2 rounded-lg bg-[#162033] px-2.5">
                                <Search size={13} className="text-muted-foreground" />
                                <input autoFocus value={pplQ} onChange={ev => setPplQ(ev.target.value)} placeholder="Tìm tên / email…"
                                  className="w-full bg-transparent py-2 text-sm text-foreground outline-none" />
                              </div>
                              <button onClick={addAllPeople}
                                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-600 text-white">
                                <Plus size={13} /> Gửi toàn hệ thống ({ppl.filter(p => !!p.email).length})
                              </button>
                            </div>
                            <div className="max-h-64 overflow-y-auto py-1">
                              {filteredPpl.slice(0, 60).map(p => (
                                <button key={p.id} onClick={() => addPersonToRecipients(p)} disabled={!p.email}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-white/5 disabled:opacity-40">
                                  <span className="truncate">{p.name}</span>
                                  <span className="ml-auto truncate text-2xs text-muted-foreground">{p.email || '(chưa có email)'}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {isSingle ? (
                  <input className={INPUT} type="email" value={recipients[0]?.to || ''}
                    onChange={ev => setRecipients([{ to: ev.target.value, variables: {} }])} placeholder="email@khach-hang.com" />
                ) : (
                  <div className="space-y-2">
                    {recipients.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-white/10 p-2 bg-black/10">
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <input className={INPUT} type="email" value={r.to}
                              onChange={ev => setRecipients(rs => rs.map((x, j) => j === i ? { ...x, to: ev.target.value } : x))}
                              placeholder="email@nhan-su.com" />
                            <button onClick={() => setRecipients(rs => rs.filter((_, j) => j !== i))}
                              className="rounded-lg px-2 text-red-400 hover:bg-red-500/10" title="Xóa">
                              <Trash2 size={15} />
                            </button>
                          </div>
                          {/* Per-recipient variables (chỉ các field tự do, không có default) */}
                          <div className="grid grid-cols-2 gap-2">
                            {tpl.schema.map(f => (
                              <div key={f.key}>
                                <label className="text-2xs text-muted-foreground">{f.label}{f.required && ' *'}</label>
                                {f.type === 'textarea' ? (
                                  <textarea className={`${INPUT} min-h-[54px]`} value={r.variables?.[f.key] || ''}
                                    onChange={ev => setRecipients(rs => rs.map((x, j) => j === i ? { ...x, variables: { ...x.variables, [f.key]: ev.target.value } } : x))} />
                                ) : (
                                  <input className={INPUT} type={f.type === 'date' ? 'date' : 'text'} value={r.variables?.[f.key] || ''}
                                    onChange={ev => {
                                      const val = f.type === 'money' ? formatMoney(ev.target.value) : ev.target.value;
                                      setRecipients(rs => rs.map((x, j) => j === i ? { ...x, variables: { ...x.variables, [f.key]: val } } : x));
                                    }} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setRecipients(rs => [...rs, { to: '', variables: {} }])}
                      className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300">
                      <Plus size={14} /> Thêm người nhận
                    </button>
                  </div>
                )}
              </div>

              {/* Variables (chỉ hiện khi single mode) */}
              {isSingle && (
                <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
                  <h3 className="text-sm font-700 text-foreground mb-3">Thông tin điền vào template</h3>
                  <div className="space-y-4">
                    {/* Field thường (2 cột grid) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {tpl.schema.filter(f => f.type !== 'rows' && f.type !== 'textarea').map(f => (
                        <div key={f.key}>
                          <label className={LABEL}>
                            {f.label}{f.required && ' *'}
                            {f.formula && <span className="ml-1 text-2xs text-emerald-400" title={f.formula}>(tự tính)</span>}
                          </label>
                          <input className={`${INPUT} ${f.formula ? 'opacity-70 cursor-not-allowed' : ''}`}
                            type={f.type === 'date' ? 'date' : 'text'}
                            value={f.type === 'money' ? formatMoney(String(globalVars[f.key] ?? '')) : (globalVars[f.key] ?? '')}
                            readOnly={!!f.formula}
                            onChange={ev => {
                              const val = f.type === 'money' ? formatMoney(ev.target.value) : ev.target.value;
                              setGlobalVars(v => applyFormulas(tpl.schema, { ...v, [f.key]: val }));
                            }} placeholder={f.help} />
                          {f.help && <p className="text-2xs text-muted-foreground mt-0.5">{f.help}</p>}
                        </div>
                      ))}
                    </div>
                    {/* Field textarea (full width) — nếu có formula sẽ readonly, tự tính */}
                    {tpl.schema.filter(f => f.type === 'textarea').map(f => (
                      <div key={f.key}>
                        <label className={LABEL}>
                          {f.label}{f.required && ' *'}
                          {f.formula && <span className="ml-1 text-2xs text-emerald-400" title={f.formula}>(tự tính)</span>}
                        </label>
                        <textarea className={`${INPUT} min-h-[80px] ${f.formula ? 'opacity-70 cursor-not-allowed' : ''}`}
                          value={globalVars[f.key] || ''}
                          readOnly={!!f.formula}
                          onChange={ev => !f.formula && setGlobalVars(v => ({ ...v, [f.key]: ev.target.value }))} />
                      </div>
                    ))}
                    {/* Field rows: bảng động */}
                    {tpl.schema.filter(f => f.type === 'rows').map(f => (
                      <RowsEditor key={f.key} field={f} rows={globalVars[f.key] || []}
                        onChange={rows => setGlobalVars(v => applyFormulas(tpl.schema, { ...v, [f.key]: rows }))} />
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments */}
              <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-700 text-foreground flex items-center gap-2"><Paperclip size={15} className="text-indigo-400" /> Đính kèm</h3>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-hover px-3 py-1.5 text-xs font-600 text-foreground hover:bg-hover-strong">
                    <Plus size={13} /> Thêm file
                    <input type="file" multiple className="hidden" onChange={ev => {
                      const fs = Array.from(ev.target.files || []); setFiles(prev => [...prev, ...fs]); ev.target.value = '';
                    }} />
                  </label>
                </div>
                {files.length === 0 ? <p className="text-xs text-muted-foreground">Chưa có đính kèm.</p> : (
                  <div className="space-y-1.5">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm">
                        <Paperclip size={13} className="text-muted-foreground" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-2xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview + Lưu nháp */}
              <div className="flex justify-end gap-2">
                <button onClick={saveDraft}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 hover:bg-white/5 px-5 py-2.5 text-sm font-600 text-foreground">
                  <Save size={15} /> Lưu nháp
                </button>
                <button onClick={previewAll} disabled={previewLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 text-sm font-600 text-white">
                  {previewLoading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Xem trước & Gửi
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'internal' && <InternalTab onSent={loadOutbox} />}

      {tab === 'rsvp' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
            {rsvpEventsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : rsvpEvents.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Chưa có đợt RSVP nào.</p>
                <p className="text-xs mt-1 opacity-60">Vào tab Nội Bộ, bật "Gửi qua Telegram + hỏi RSVP".</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-black/20 text-2xs text-muted-foreground uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Ngày</th>
                    <th className="text-left px-4 py-2">Tiêu đề đợt</th>
                    <th className="text-left px-4 py-2">Event key</th>
                    <th className="text-right px-4 py-2">Tổng</th>
                    <th className="text-right px-4 py-2 text-emerald-400">Có</th>
                    <th className="text-right px-4 py-2 text-red-400">Không</th>
                    <th className="text-right px-4 py-2 text-amber-400">Chờ</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rsvpEvents.map(e => (
                    <tr key={e.event_key} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2 text-2xs text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-2">{e.event_title}</td>
                      <td className="px-4 py-2 text-2xs text-muted-foreground font-mono">{e.event_key}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{e.total}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-400 font-600">{e.yes}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-400 font-600">{e.no}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-400">{e.pending}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => openRsvpDetail(e.event_key, e.event_title)} className="text-indigo-400 hover:text-indigo-300"><ExternalLink size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* RSVP detail modal */}
      {rsvpDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-4xl h-[85vh] rounded-3xl border border-white/10 overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
              <h2 className="text-base font-700 text-foreground">{rsvpDetailTitle}</h2>
              <button onClick={() => setRsvpDetail(null)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/20 text-2xs text-muted-foreground uppercase sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Nhân sự</th>
                    <th className="text-left px-4 py-2">Trạng thái</th>
                    <th className="text-left px-4 py-2">Trả lời lúc</th>
                    <th className="text-left px-4 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {rsvpDetail.map((r: any) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="px-4 py-2"><div className="font-600">{r.person_name}</div><div className="text-2xs text-muted-foreground">{r.person_email || '—'}</div></td>
                      <td className="px-4 py-2">
                        {r.response === 'yes' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-2xs font-600"><CheckCircle2 size={11} /> Có tham gia</span>}
                        {r.response === 'no' && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-2xs font-600"><XCircle size={11} /> Không tham gia</span>}
                        {r.response === 'pending' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-2xs font-600"><Clock size={11} /> Chờ trả lời</span>}
                      </td>
                      <td className="px-4 py-2 text-2xs text-muted-foreground">{r.responded_at ? new Date(r.responded_at).toLocaleString('vi-VN') : '—'}</td>
                      <td className="px-4 py-2 text-2xs text-muted-foreground">{r.note || (r.chat_id ? '' : 'Chưa liên kết Telegram')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'outbox' && (
        <div className="space-y-3">
          {/* Bộ lọc kênh — Email (email_outbox) vs Telegram (internal_tg_broadcasts, tab Nội Bộ) */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1 w-fit" style={{ background: 'var(--background)' }}>
            {([['email', 'Email'], ['telegram', 'Telegram']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setOutboxChannel(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-600 transition-colors ${outboxChannel === k ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>

          {outboxChannel === 'email' ? (
            <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
              {outboxLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : outbox.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <Inbox className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Chưa có email nào đã gửi.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-black/20 text-2xs text-muted-foreground uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">Thời gian</th>
                      <th className="text-left px-4 py-2">Tiêu đề</th>
                      <th className="text-left px-4 py-2">Người nhận</th>
                      <th className="text-left px-4 py-2">Loại</th>
                      <th className="text-left px-4 py-2">Trạng thái</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {outbox.map(o => (
                      <tr key={o.id} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-4 py-2 text-2xs text-muted-foreground whitespace-nowrap">{new Date(o.created_at).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-2 truncate max-w-xs">{o.subject}</td>
                        <td className="px-4 py-2 text-2xs">{o.to_addr}</td>
                        <td className="px-4 py-2 text-2xs">{CATS.find(c => c.key === o.category)?.label || o.category}</td>
                        <td className="px-4 py-2">
                          {o.status === 'sent' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-2xs font-600"><Check size={11} /> Đã gửi</span>}
                          {o.status === 'failed' && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-2xs font-600" title={o.error || ''}><AlertCircle size={11} /> Lỗi</span>}
                          {o.status === 'pending' && <span className="rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-2xs font-600">Chờ</span>}
                        </td>
                        <td className="px-4 py-2">
                          <button onClick={async () => {
                            const r = await fetch(`/api/email-center/outbox/${o.id}`);
                            const j = await r.json();
                            if (j?.data) setOutboxDetail(j.data);
                          }} className="text-indigo-400 hover:text-indigo-300 text-2xs"><ExternalLink size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
              {tgLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : tgBroadcasts.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Chưa có tin nhắn Telegram nào đã gửi.</p>
                  <p className="text-xs mt-1 opacity-60">Vào tab Nội Bộ, khối &quot;Gửi Tin Nhắn Telegram&quot;.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-black/20 text-2xs text-muted-foreground uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">Thời gian</th>
                      <th className="text-left px-4 py-2">Tiêu đề</th>
                      <th className="text-left px-4 py-2">Đối tượng</th>
                      <th className="text-left px-4 py-2">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tgBroadcasts.map(b => (
                      <tr key={b.id} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-4 py-2 text-2xs text-muted-foreground whitespace-nowrap">{new Date(b.created_at).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-2 truncate max-w-xs" title={b.content}>{b.title}</td>
                        <td className="px-4 py-2 text-2xs text-muted-foreground">{b.target_summary || '—'}</td>
                        <td className="px-4 py-2 text-2xs">
                          <span className="text-emerald-400">{b.sent_count} gửi</span>
                          {b.no_channel_count > 0 && <span className="text-amber-400 ml-2">{b.no_channel_count} chưa liên kết</span>}
                          {b.failed_count > 0 && <span className="text-red-400 ml-2">{b.failed_count} lỗi</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview modal */}
      {previewOpen && previewData.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-4xl h-[90vh] rounded-3xl border border-white/10 overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-700 text-foreground">Xem trước email {previewIdx + 1}/{previewData.length}{editPreview && <span className="ml-2 text-2xs font-500 text-amber-400">• đang sửa</span>}</h2>
                {editPreview ? (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-2xs text-muted-foreground shrink-0">Tiêu đề:</span>
                    <input value={previewData[previewIdx].subject}
                      onChange={e => setPreviewData(pd => pd.map((p, i) => i === previewIdx ? { ...p, subject: e.target.value } : p))}
                      className="flex-1 rounded-lg border border-white/10 bg-[#162033] px-2 py-1 text-2xs text-foreground outline-none focus:border-indigo-500" />
                  </div>
                ) : (
                  <p className="text-2xs text-muted-foreground truncate">Người nhận: <b>{previewData[previewIdx].to}</b> · Tiêu đề: <b>{previewData[previewIdx].subject}</b></p>
                )}
              </div>
              <button onClick={() => setPreviewOpen(false)} className="btn-ghost rounded-lg p-1.5 shrink-0"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-hidden bg-white/5">
              <iframe ref={previewIframe} title="preview" srcDoc={previewData[previewIdx].html}
                className="w-full h-full bg-white" sandbox={editPreview ? 'allow-same-origin' : ''}
                onLoad={() => { if (editPreview && previewIframe.current?.contentDocument) { try { previewIframe.current.contentDocument.designMode = 'on'; } catch { /* noop */ } } }} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/5 px-6 py-3">
              <div className="flex items-center gap-2">
                <button disabled={previewIdx === 0} onClick={() => { captureEdit(); setPreviewIdx(i => Math.max(0, i - 1)); }}
                  className="rounded-lg btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">← Trước</button>
                <button disabled={previewIdx === previewData.length - 1} onClick={() => { captureEdit(); setPreviewIdx(i => Math.min(previewData.length - 1, i + 1)); }}
                  className="rounded-lg btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">Sau →</button>
                <button onClick={() => { if (editPreview) captureEdit(); setEditPreview(v => !v); }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-600 border ${editPreview ? 'border-amber-500/40 text-amber-400 bg-amber-500/10' : 'border-white/10 text-foreground hover:bg-white/5'}`}>
                  {editPreview ? <><Check size={13} /> Xong sửa</> : <><Pencil size={13} /> Sửa</>}
                </button>
                {files.length > 0 && <span className="text-2xs text-muted-foreground ml-2">+ {files.length} đính kèm</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPreviewOpen(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
                <button onClick={doSend} disabled={sending}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 text-sm font-600 text-white">
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Gửi cho {previewData.length} người
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cấu hình modal */}
      {cfgOpen && (
        <ConfigModal
          onClose={() => setCfgOpen(false)}
          onSendersChanged={loadSenders}
          senders={senders}
          initTab={cfgTab}
          onTabChange={setCfgTab}
        />
      )}

      {/* Outbox detail modal */}
      {outboxDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-3xl h-[85vh] rounded-3xl border border-white/10 overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
              <div>
                <h2 className="text-base font-700 text-foreground">{outboxDetail.subject}</h2>
                <p className="text-2xs text-muted-foreground">{outboxDetail.to_addr} · {new Date(outboxDetail.created_at).toLocaleString('vi-VN')}</p>
              </div>
              <button onClick={() => setOutboxDetail(null)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-hidden bg-white/5">
              <iframe title="detail" srcDoc={outboxDetail.body_html} className="w-full h-full" sandbox="" />
            </div>
            {Array.isArray(outboxDetail.attachments) && outboxDetail.attachments.length > 0 && (
              <div className="border-t border-white/5 px-6 py-3">
                <p className="text-2xs font-600 text-muted-foreground uppercase mb-1.5">Đính kèm</p>
                <div className="flex flex-wrap gap-2">
                  {outboxDetail.attachments.map((a: any) => (
                    <a key={a.id} href={`/api/email-center/attachment/${a.id}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-hover px-3 py-1.5 text-xs font-600 text-foreground hover:bg-hover-strong">
                      <Paperclip size={12} /> {a.filename}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ CẤU HÌNH MODAL ============ */

const INPUT_CFG = 'w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500';
const LABEL_CFG = 'block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

function ConfigModal({ onClose, onSendersChanged, senders, initTab, onTabChange }: {
  onClose: () => void;
  onSendersChanged: () => void;
  senders: Sender[];
  initTab: 'senders' | 'templates';
  onTabChange: (t: 'senders' | 'templates') => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-6xl h-[92vh] rounded-3xl border border-white/10 overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
          <h2 className="text-base font-700 text-foreground flex items-center gap-2"><Settings size={16} /> Cấu Hình Trung Tâm Email</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-2 px-6 pt-3 border-b border-white/5">
          <button onClick={() => onTabChange('senders')}
            className={`px-3 py-2 text-sm font-600 border-b-2 ${initTab === 'senders' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <AtSign size={14} className="inline mr-1.5" /> Sender ({senders.length})
          </button>
          <button onClick={() => onTabChange('templates')}
            className={`px-3 py-2 text-sm font-600 border-b-2 ${initTab === 'templates' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <FileText size={14} className="inline mr-1.5" /> Template
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {initTab === 'senders' ? <SendersPanel senders={senders} onChanged={onSendersChanged} /> : <TemplatesPanel senders={senders} />}
        </div>
      </div>
    </div>
  );
}

function emptySender(): any {
  return { name: '', from_addr: '', from_name: '', engine: 'ses', is_default: false, is_active: true, smtp_secure: false, smtp_reject_unauth: true };
}

function SendersPanel({ senders, onChanged }: { senders: Sender[]; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<any>(null);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const r = editing.id
        ? await fetch(`/api/email-center/senders/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) })
        : await fetch('/api/email-center/senders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Loi');
      toast.success('Da luu');
      onChanged();
      setEditing(null);
    } catch (err: any) { toast.error(err?.message || 'Loi luu'); } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Xoa sender nay?')) return;
    await fetch(`/api/email-center/senders/${id}`, { method: 'DELETE' });
    toast.success('Da xoa'); onChanged();
  };

  const sendTest = async () => {
    if (!editing?.id || !testTo.trim()) { toast.error('Nhap email nhan'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/email-center/senders/${editing.id}/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Loi');
      toast.success('Da gui email thu');
    } catch (err: any) { toast.error(err?.message || 'Loi'); } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-700 text-foreground">Danh sách sender</h3>
          <button onClick={() => setEditing(emptySender())} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 text-xs font-600 text-white">
            <Plus size={12} /> Thêm
          </button>
        </div>
        {senders.length === 0 && <p className="text-xs text-muted-foreground py-3">Chưa có sender nào.</p>}
        {senders.map(s => (
          <button key={s.id} onClick={() => setEditing({ ...s, ses_secret_key: '', smtp_password: '' })}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${editing?.id === s.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 bg-black/10 hover:bg-white/5'}`}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-600 text-foreground truncate flex items-center gap-1.5">
                {s.name}
                {s.is_default && <Star size={11} className="text-amber-400 fill-amber-400" />}
                {!s.is_active && <span className="text-2xs text-muted-foreground">(tắt)</span>}
              </div>
              <div className="text-2xs text-muted-foreground truncate">{s.from_addr}</div>
              <div className="text-2xs text-muted-foreground uppercase">{s.engine}</div>
            </div>
          </button>
        ))}
      </div>

      <div>
        {editing ? (
          <div className="rounded-2xl border border-white/10 p-5 space-y-4" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-700 text-foreground">{editing.id ? 'Sửa sender' : 'Thêm sender mới'}</h3>
              {editing.id && (
                <button onClick={() => del(editing.id)} className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                  <Trash2 size={12} /> Xóa
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CFG}>Tên hiển thị *</label>
                <input className={INPUT_CFG} value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="VD: Kế toán WOKA" />
              </div>
              <div>
                <label className={LABEL_CFG}>From (email) *</label>
                <input className={INPUT_CFG} type="email" value={editing.from_addr || ''} onChange={e => setEditing({ ...editing, from_addr: e.target.value })} placeholder="ketoan@woka.vn" />
              </div>
              <div>
                <label className={LABEL_CFG}>Tên người gửi</label>
                <input className={INPUT_CFG} value={editing.from_name || ''} onChange={e => setEditing({ ...editing, from_name: e.target.value })} placeholder="WOKA Việt Nam" />
              </div>
              <div>
                <label className={LABEL_CFG}>Reply-To</label>
                <input className={INPUT_CFG} type="email" value={editing.reply_to || ''} onChange={e => setEditing({ ...editing, reply_to: e.target.value })} placeholder="(tuỳ chọn)" />
              </div>
              <div>
                <label className={LABEL_CFG}>Engine *</label>
                <select className={INPUT_CFG} value={editing.engine} onChange={e => setEditing({ ...editing, engine: e.target.value })}>
                  <option value="ses">AWS SES</option>
                  <option value="smtp">SMTP</option>
                </select>
              </div>
              <div className="flex items-center gap-4 pt-6">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!editing.is_default} onChange={e => setEditing({ ...editing, is_default: e.target.checked })} />
                  Mặc định
                </label>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editing.is_active !== false} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                  Đang bật
                </label>
              </div>
            </div>

            {editing.engine === 'ses' && (
              <div className="rounded-xl border border-white/5 p-3 bg-black/10">
                <p className="text-2xs text-muted-foreground mb-2">Để trống nếu dùng credential mặc định của hệ thống (env).</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className={LABEL_CFG}>Region</label><input className={INPUT_CFG} value={editing.ses_region || ''} onChange={e => setEditing({ ...editing, ses_region: e.target.value })} placeholder="ap-southeast-2" /></div>
                  <div><label className={LABEL_CFG}>Access Key</label><input className={INPUT_CFG} value={editing.ses_access_key || ''} onChange={e => setEditing({ ...editing, ses_access_key: e.target.value })} /></div>
                  <div><label className={LABEL_CFG}>Secret Key {editing.has_secret && <span className="text-emerald-400">(đã có)</span>}</label>
                    <input className={INPUT_CFG} type="password" value={editing.ses_secret_key || ''} onChange={e => setEditing({ ...editing, ses_secret_key: e.target.value })} placeholder={editing.has_secret ? 'Để trống = giữ cũ' : ''} /></div>
                </div>
              </div>
            )}

            {editing.engine === 'smtp' && (
              <div className="rounded-xl border border-white/5 p-3 bg-black/10 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={LABEL_CFG}>SMTP Host *</label><input className={INPUT_CFG} value={editing.smtp_host || ''} onChange={e => setEditing({ ...editing, smtp_host: e.target.value })} placeholder="smtp.zimbra.com" /></div>
                  <div><label className={LABEL_CFG}>Port</label><input className={INPUT_CFG} type="number" value={editing.smtp_port || ''} onChange={e => setEditing({ ...editing, smtp_port: Number(e.target.value) || null })} placeholder="587" /></div>
                  <div><label className={LABEL_CFG}>Username</label><input className={INPUT_CFG} value={editing.smtp_user || ''} onChange={e => setEditing({ ...editing, smtp_user: e.target.value })} /></div>
                  <div><label className={LABEL_CFG}>Password {editing.has_secret && <span className="text-emerald-400">(đã có)</span>}</label>
                    <input className={INPUT_CFG} type="password" value={editing.smtp_password || ''} onChange={e => setEditing({ ...editing, smtp_password: e.target.value })} placeholder={editing.has_secret ? 'Để trống = giữ cũ' : ''} /></div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!editing.smtp_secure} onChange={e => setEditing({ ...editing, smtp_secure: e.target.checked })} />
                    SSL/TLS (465)
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={editing.smtp_reject_unauth !== false} onChange={e => setEditing({ ...editing, smtp_reject_unauth: e.target.checked })} />
                    Kiểm cert
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu
              </button>
              {editing.id && (
                <>
                  <input className={INPUT_CFG + ' max-w-xs'} placeholder="email để gửi thử" type="email" value={testTo} onChange={e => setTestTo(e.target.value)} />
                  <button onClick={sendTest} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                    <MailCheck size={14} /> Gửi thử
                  </button>
                  {editing.engine === 'smtp' && (
                    <button onClick={async () => {
                      setBusy(true);
                      try {
                        const r = await fetch(`/api/email-center/senders/${editing.id}/diag`, { method: 'POST' });
                        const j = await r.json();
                        console.log('SMTP DIAG:', j);
                        alert(JSON.stringify(j?.data || j, null, 2));
                      } finally { setBusy(false); }
                    }} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 hover:bg-hover px-3 py-2 text-sm text-foreground">
                      🩺 Chẩn đoán TCP
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <AtSign className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Chọn sender bên trái để sửa, hoặc bấm <b>Thêm</b>.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplatesPanel({ senders }: { senders: Sender[] }) {
  const toast = useToast();
  const [list, setList] = useState<Template[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const load = () => {
    fetch('/api/email-center/templates').then(r => r.json()).then(j => setList(Array.isArray(j?.data) ? j.data : []));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPreviewHtml(editing?.body_html_tpl || ''); }, [editing?.id, editing?.body_html_tpl]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name || !editing.subject_tpl || !editing.body_html_tpl) { toast.error('Thiếu tên/subject/body'); return; }
    setBusy(true);
    try {
      let schema: any = editing.schema;
      if (typeof schema === 'string') {
        try { schema = JSON.parse(schema); } catch { toast.error('Schema JSON không hợp lệ'); setBusy(false); return; }
      }
      const body = { ...editing, schema };
      const r = editing.id
        ? await fetch(`/api/email-center/templates/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/email-center/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Loi');
      toast.success('Đã lưu template');
      load();
      setEditing({ ...j.data, schema: JSON.stringify(j.data.schema, null, 2) });
    } catch (err: any) { toast.error(err?.message || 'Loi luu'); } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Xoa template nay?')) return;
    const r = await fetch(`/api/email-center/templates/${id}`, { method: 'DELETE' });
    if (r.ok) { toast.success('Đã xóa'); load(); setEditing(null); } else { toast.error('Không xóa được (có thể là template hệ thống)'); }
  };

  const openNew = () => setEditing({ category: 'payment', key: '', name: '', description: '', subject_tpl: '', body_html_tpl: '', schema: '[]', engine: 'ses', is_active: true, is_system: false, default_sender_id: null });
  const openEdit = (t: Template) => setEditing({ ...t, schema: JSON.stringify(t.schema, null, 2) });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-700 text-foreground">Templates</h3>
          <button onClick={openNew} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 text-xs font-600 text-white">
            <Plus size={12} /> Thêm
          </button>
        </div>
        {list.map(t => (
          <button key={t.id} onClick={() => openEdit(t)}
            className={`w-full text-left rounded-lg border p-2.5 transition-colors ${editing?.id === t.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 bg-black/10 hover:bg-white/5'}`}>
            <div className="text-sm font-600 text-foreground truncate">{t.name}</div>
            <div className="text-2xs text-muted-foreground flex items-center gap-2">
              <span className="uppercase">{t.category}</span>
              {t.is_system && <span className="text-amber-400">HT</span>}
              {!t.is_active && <span>(tắt)</span>}
            </div>
          </button>
        ))}
      </div>

      <div>
        {editing ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 p-4 space-y-3" style={{ background: 'var(--card)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-700 text-foreground">{editing.id ? 'Sửa template' : 'Template mới'}</h3>
                {editing.id && !editing.is_system && (
                  <button onClick={() => del(editing.id)} className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1">
                    <Trash2 size={12} /> Xóa
                  </button>
                )}
              </div>
              {editing.is_system && <p className="text-2xs text-amber-400">Template hệ thống — sửa cẩn thận, không thể xóa.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL_CFG}>Tên *</label><input className={INPUT_CFG} value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><label className={LABEL_CFG}>Key (định danh) *</label><input className={INPUT_CFG} value={editing.key || ''} onChange={e => setEditing({ ...editing, key: e.target.value })} disabled={!!editing.is_system} /></div>
                <div><label className={LABEL_CFG}>Category *</label>
                  <select className={INPUT_CFG} value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}>
                    <option value="payment">Đề Nghị Thanh Toán</option>
                    <option value="hr">Nhân Sự</option>
                    <option value="account">Tài Khoản</option>
                    <option value="internal">Nội Bộ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
                <div><label className={LABEL_CFG}>Sender mặc định</label>
                  <select className={INPUT_CFG} value={editing.default_sender_id || ''} onChange={e => setEditing({ ...editing, default_sender_id: e.target.value || null })}>
                    <option value="">— Dùng sender mặc định hệ thống —</option>
                    {senders.map(s => <option key={s.id} value={s.id}>{s.name} ({s.from_addr})</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={LABEL_CFG}>Mô tả</label>
                <input className={INPUT_CFG} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div>
                <label className={LABEL_CFG}>Subject template *</label>
                <input className={INPUT_CFG} value={editing.subject_tpl || ''} onChange={e => setEditing({ ...editing, subject_tpl: e.target.value })} />
              </div>
              <div>
                <label className={LABEL_CFG}>Body HTML template *</label>
                <textarea className={`${INPUT_CFG} font-mono text-2xs min-h-[240px]`} value={editing.body_html_tpl || ''} onChange={e => setEditing({ ...editing, body_html_tpl: e.target.value })} />
              </div>
              <div>
                <label className={LABEL_CFG}>Schema (JSON — mảng field) *</label>
                <textarea className={`${INPUT_CFG} font-mono text-2xs min-h-[160px]`} value={editing.schema || ''} onChange={e => setEditing({ ...editing, schema: e.target.value })}
                  placeholder='[{"key":"name","label":"Ten","type":"text","required":true}]' />
              </div>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editing.is_active !== false} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                Đang bật
              </label>
              <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
              <div className="border-b border-white/5 px-4 py-2 text-xs font-600 text-foreground flex items-center gap-2">
                <Eye size={13} /> Preview HTML (chưa render biến)
              </div>
              <iframe title="tpl-preview" srcDoc={previewHtml} className="flex-1 bg-white" sandbox="" style={{ minHeight: 400 }} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <FileText className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Chọn template bên trái để sửa, hoặc bấm <b>Thêm</b>.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ ROWS EDITOR — bảng động add/xóa dòng, formula tự tính ============ */

function RowsEditor({ field, rows, onChange }: {
  field: TemplateField;
  rows: Record<string, any>[];
  onChange: (rows: Record<string, any>[]) => void;
}) {
  const cols = field.columns || [];
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const label = (c: RowColumn) => labelOverrides[c.key] ?? c.label;

  const addRow = () => {
    const empty: Record<string, any> = {};
    for (const c of cols) empty[c.key] = c.default ?? '';
    onChange([...(rows || []), empty]);
  };
  const delRow = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const setCell = (i: number, key: string, val: any) => {
    onChange(rows.map((r, j) => j === i ? { ...r, [key]: val } : r));
  };

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between bg-black/20 px-3 py-2">
        <h4 className="text-xs font-700 text-foreground">{field.label}</h4>
        <button type="button" onClick={addRow}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 text-2xs font-600 text-white">
          <Plus size={11} /> Thêm dòng
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/10 text-2xs text-muted-foreground uppercase">
            <tr>
              {cols.map(c => (
                <th key={c.key} className="text-left px-2 py-2 min-w-[80px]">
                  {editingLabel === c.key ? (
                    <input autoFocus className="w-full bg-transparent border-b border-indigo-400 text-2xs uppercase text-foreground outline-none"
                      value={labelOverrides[c.key] ?? c.label}
                      onChange={ev => setLabelOverrides(o => ({ ...o, [c.key]: ev.target.value }))}
                      onBlur={() => setEditingLabel(null)}
                      onKeyDown={ev => ev.key === 'Enter' && setEditingLabel(null)} />
                  ) : (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setEditingLabel(c.key)}>
                      {label(c)}
                      {c.formula && <span className="text-emerald-400 text-2xs" title={c.formula}>ƒ</span>}
                      <Pencil size={9} className="opacity-40" />
                    </button>
                  )}
                </th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).length === 0 && (
              <tr><td colSpan={cols.length + 1} className="text-center py-3 text-xs text-muted-foreground">Chưa có dòng nào. Bấm "Thêm dòng".</td></tr>
            )}
            {(rows || []).map((row, i) => (
              <tr key={i} className="border-t border-white/5">
                {cols.map(c => (
                  <td key={c.key} className="px-2 py-1">
                    <input
                      className={`w-full bg-[#162033] border border-white/10 rounded px-2 py-1 text-sm text-foreground outline-none focus:border-indigo-500 ${c.formula ? 'opacity-70 cursor-not-allowed' : ''} ${c.type === 'number' || c.type === 'money' ? 'text-right tabular-nums' : ''}`}
                      readOnly={!!c.formula}
                      value={c.type === 'money' ? formatMoney(String(row[c.key] ?? '')) : (row[c.key] ?? '')}
                      onChange={ev => {
                        if (c.formula) return;
                        let v: any = ev.target.value;
                        if (c.type === 'money') v = formatMoney(v);
                        else if (c.type === 'number') v = v.replace(/[^\d.-]/g, '');
                        setCell(i, c.key, v);
                      }} />
                  </td>
                ))}
                <td className="px-1 py-1 text-center">
                  <button type="button" onClick={() => delRow(i)} className="text-red-400 hover:text-red-300" title="Xóa dòng">
                    <X size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-muted-foreground px-3 py-2 bg-black/10 border-t border-white/5">
        Ấn tên cột để đổi (chỉ hiển thị trên form, không đổi HTML gửi đi). Cột có ƒ là tự tính từ công thức.
      </p>
    </div>
  );
}
