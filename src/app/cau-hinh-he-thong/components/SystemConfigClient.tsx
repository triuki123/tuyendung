'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, SlidersHorizontal, Save, Bell, ShieldCheck, AlertCircle, Clock, Users2, X, Send, RefreshCw, LogIn, KeyRound, FileText, ChevronRight, ArrowLeft, Package, Trash2, Megaphone, Building2, ListChecks, Plus } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import {
  ReminderType, ReminderSetting, SecurityConfig, SchedulerConfig, HrAutomationConfig, TicketConfig,
  RecipientRuleType, RecipientRule, SchedulerJob, SchedulerJobKey, AccountEmailConfig, LegalReminderConfig,
  DEFAULT_REMINDERS, DEFAULT_SECURITY, DEFAULT_SCHEDULER, DEFAULT_HR_AUTOMATION, DEFAULT_RECIPIENT_RULES, DEFAULT_TICKET,
  DEFAULT_SCHEDULER_JOBS, SCHEDULER_JOB_LABELS, DEFAULT_ACCOUNT_EMAIL, DEFAULT_LEGAL_REMINDER,
} from '@/lib/config/systemConfig';
import { TEMPLATE_MODULES, moduleForCategory } from '@/lib/notifications/templates';
import OrgPersonPicker, { OrgPersonValue } from '@/components/ui/OrgPersonPicker';
import ErrorState from '@/components/ui/ErrorState';
import SsoConfigCard from './SsoConfigCard';

// Icon + màu cho từng module mẫu thông báo (khớp key trong TEMPLATE_MODULES)
const TPL_MODULE_ICON: Record<string, { icon: typeof Bell; tint: string; color: string }> = {
  'cham-cong':        { icon: Clock,      tint: 'bg-teal-500/15',    color: 'text-teal-400' },
  'hr':               { icon: FileText,   tint: 'bg-sky-500/15',     color: 'text-sky-400' },
  'hr-resources':     { icon: Users2,     tint: 'bg-orange-500/15',  color: 'text-orange-400' },
  'tasks':            { icon: ListChecks, tint: 'bg-cyan-500/15',    color: 'text-cyan-400' },
  'tickets':          { icon: Bell,       tint: 'bg-rose-500/15',    color: 'text-rose-400' },
  'asset-management': { icon: Package,    tint: 'bg-emerald-500/15', color: 'text-emerald-400' },
  'delete-requests':  { icon: Trash2,     tint: 'bg-red-500/15',     color: 'text-red-400' },
  'announcements':    { icon: Megaphone,  tint: 'bg-amber-500/15',   color: 'text-amber-400' },
  'room-bookings':    { icon: Building2,  tint: 'bg-pink-500/15',    color: 'text-pink-400' },
  'custom':           { icon: Send,       tint: 'bg-violet-500/15',  color: 'text-violet-400' },
};

const RECIPIENT_LABELS: Record<RecipientRuleType, { label: string; desc: string; usersOnly?: boolean }> = {
  evaluation:        { label: 'Nhắc đánh giá thử việc',  desc: 'Ai nhận thông báo khi sắp tới hạn / tự tạo thẻ đánh giá' },
  asset_maintenance: { label: 'Nhắc bảo trì tài sản',    desc: 'Ai nhận thông báo bảo hành/bảo trì cho tài sản không có người dùng' },
  hr_general:        { label: 'Thông báo Quản Lý Hồ Sơ', desc: 'Ai nhận thông báo nghiệp vụ HR (bản nháp thỏa thuận onboarding…)', usersOnly: true },
  room_booking:      { label: 'Thông báo Đặt Phòng Họp', desc: 'Ai nhận thông báo khi có yêu cầu đặt phòng họp mới chờ duyệt', usersOnly: true },
  birthday:          { label: 'Thông báo Sinh Nhật',     desc: 'Ai nhận danh sách sinh nhật đầu tháng + nhắc BOD & Leader đúng ngày' },
  legal:             { label: 'Nhắc hạn Pháp Chế',        desc: 'Ai nhận nhắc giấy phép/hợp đồng sắp hết hạn. Chỉ người CÓ quyền Pháp Chế mới thực nhận (tự lọc, chống lộ thông tin)' },
};
const RECIPIENT_ORDER: RecipientRuleType[] = ['evaluation', 'asset_maintenance', 'hr_general', 'room_booking', 'birthday', 'legal'];
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Quản lý' },
  { value: 'user', label: 'Người dùng' },
];

interface PickUser { id: string; name: string; role: string }

interface TemplateView {
  key: string; category: string; label: string;
  title: string; message: string; icon: string;
  telegram: string; hasTelegramDefault: boolean;
  placeholders: string[]; isOverridden: boolean;
  enabled: boolean; isCustom: boolean;
}

interface OutboxStats { pending: number; sent: number; failed: number }
interface ReadStat { type: string; total: number; read: number }
interface OutboxRecent {
  id: string; status: string; chat_id: string; text: string;
  attempts: number; last_error: string | null; created_at: string; sent_at: string | null;
}

const REMINDER_LABELS: Record<ReminderType, { label: string; desc: string }> = {
  contract:          { label: 'Hợp đồng sắp hết hạn',     desc: 'Nhắc C&B chuẩn bị gia hạn hợp đồng lao động' },
  leave_balance:     { label: 'Phép năm sắp hết hạn',     desc: 'Nhắc nhân viên dùng phép chuyển năm trước khi hết hạn' },
  asset_maintenance: { label: 'Bảo trì / bảo hành tài sản', desc: 'Nhắc trước khi tài sản tới hạn bảo trì hoặc hết bảo hành' },
  evaluation:        { label: 'Đánh giá thử việc',        desc: 'Nhắc C&B/quản lý khi sắp tới hạn đánh giá thử việc' },
  requisition:       { label: 'Yêu cầu tuyển dụng',       desc: 'Nhắc bộ phận tuyển dụng khi yêu cầu sắp tới hạn đóng' },
  legal_document:    { label: 'Giấy phép / văn bản pháp lý', desc: 'Nhắc nhóm pháp chế trước khi giấy phép, ủy quyền hết hạn' },
  legal_contract:    { label: 'Hợp đồng thương mại',      desc: 'Nhắc trước khi hợp đồng với đối tác hết hiệu lực (chuẩn bị tái ký/thanh lý)' },
};

const REMINDER_ORDER: ReminderType[] = ['contract', 'leave_balance', 'asset_maintenance', 'evaluation', 'requisition', 'legal_document', 'legal_contract'];

type SectionKey = 'reminder' | 'automation' | 'recipients' | 'templates' | 'delivery' | 'security';
const SECTIONS: { key: SectionKey; label: string; desc: string; icon: typeof Bell; tint: string; iconColor: string }[] = [
  { key: 'reminder',   label: 'Nhắc nhở',       desc: 'Mốc ngày nhắc trước hạn cho từng loại sự kiện',     icon: Bell,        tint: 'bg-indigo-500/15',  iconColor: 'text-indigo-400' },
  { key: 'automation', label: 'Tự động hoá',    desc: 'Khung giờ chạy nhắc, ngưỡng đánh giá thử việc & vòng đời ticket',     icon: Clock,       tint: 'bg-cyan-500/15',    iconColor: 'text-cyan-400' },
  { key: 'recipients', label: 'Người nhận',     desc: 'Ai nhận thông báo cho từng loại nhắc nhở',           icon: Users2,      tint: 'bg-emerald-500/15', iconColor: 'text-emerald-400' },
  { key: 'templates',  label: 'Mẫu thông báo',  desc: 'Tuỳ chỉnh tiêu đề & nội dung thông báo gửi đi',      icon: FileText,    tint: 'bg-violet-500/15',  iconColor: 'text-violet-400' },
  { key: 'delivery',   label: 'Trạng thái gửi', desc: 'Theo dõi hộp thư đi Telegram & tỷ lệ đọc',          icon: Send,        tint: 'bg-sky-500/15',     iconColor: 'text-sky-400' },
  { key: 'security',   label: 'Bảo mật',        desc: 'Thời hạn phiên & hạn link đặt lại mật khẩu',         icon: ShieldCheck, tint: 'bg-amber-500/15',   iconColor: 'text-amber-400' },
];

function authHeaders(json = false): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const stored = localStorage.getItem('assetflow_auth');
  const h: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  if (stored) {
    try {
      const u = JSON.parse(stored);
      if (u.id) h['x-current-user-id'] = u.id;
      if (u.role) h['x-current-user-role'] = u.role;
    } catch { /* noop */ }
  }
  return h;
}

export default function SystemConfigClient() {
  const [role, setRole] = useState('');
  const [tab, setTab] = useState<SectionKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // reminders: text dạng "30, 15, 5, 1" cho dễ sửa
  const [reminderText, setReminderText] = useState<Record<ReminderType, string>>(
    () => Object.fromEntries(REMINDER_ORDER.map(t => [t, DEFAULT_REMINDERS[t].milestones.join(', ')])) as Record<ReminderType, string>
  );
  const [security, setSecurity] = useState<SecurityConfig>(DEFAULT_SECURITY);
  // Nhắc Pháp Chế nâng cao — giữ dạng CHUỖI như reminderText để gõ thoải mái, parse lúc lưu.
  const [legalOverdueText, setLegalOverdueText] = useState(DEFAULT_LEGAL_REMINDER.overdueMilestones.join(', '));
  const [legalComplianceText, setLegalComplianceText] = useState(DEFAULT_LEGAL_REMINDER.complianceMilestones.join(', '));
  const [scheduler, setScheduler] = useState<SchedulerConfig>(DEFAULT_SCHEDULER);
  const [hrAutomation, setHrAutomation] = useState<HrAutomationConfig>(DEFAULT_HR_AUTOMATION);
  const [ticket, setTicket] = useState<TicketConfig>(DEFAULT_TICKET);
  const [accountEmail, setAccountEmail] = useState<AccountEmailConfig>(DEFAULT_ACCOUNT_EMAIL);
  const [schedulerJobs, setSchedulerJobs] = useState<Record<SchedulerJobKey, SchedulerJob>>(
    () => JSON.parse(JSON.stringify(DEFAULT_SCHEDULER_JOBS))
  );
  const [recipientRules, setRecipientRules] = useState<Record<RecipientRuleType, RecipientRule>>(
    () => JSON.parse(JSON.stringify(DEFAULT_RECIPIENT_RULES))
  );
  const [users, setUsers] = useState<PickUser[]>([]);
  const [pickerOpen, setPickerOpen] = useState<RecipientRuleType | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  // Mẫu thông báo (endpoint riêng, lazy-load khi mở tab)
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [tplModule, setTplModule] = useState<string | null>(null); // null = đang xem lưới thẻ module
  const [tplLoaded, setTplLoaded] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplMsg, setTplMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  // Mẫu tùy chỉnh: modal tạo mới + modal gửi thủ công
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ label: '', title: '', message: '', telegram: '' });
  const [createSaving, setCreateSaving] = useState(false);
  const [sendTpl, setSendTpl] = useState<TemplateView | null>(null); // mẫu đang mở modal gửi
  const [sendRecipients, setSendRecipients] = useState<{ id: string; name: string }[]>([]);

  const createGuard = useUnsavedGuard(() => setCreateOpen(false));
  useEscapeKey(createGuard.guardedClose, createOpen);
  useEscapeKey(() => setSendTpl(null), sendTpl !== null);
  const [sendAllActive, setSendAllActive] = useState(false);
  const [sendPicker, setSendPicker] = useState<OrgPersonValue>({ companyId: null, departmentId: null, subDepartmentId: null, userId: null });
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  // Trạng thái gửi (outbox)
  const [outboxStats, setOutboxStats] = useState<OutboxStats>({ pending: 0, sent: 0, failed: 0 });
  const [outboxRecent, setOutboxRecent] = useState<OutboxRecent[]>([]);
  const [readStats, setReadStats] = useState<ReadStat[]>([]);
  const [outboxLoaded, setOutboxLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) { try { setRole(JSON.parse(stored).role ?? ''); } catch { /* noop */ } }
  }, []);

  const isSuperAdmin = role === 'super_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/system-config', { headers: authHeaders(), cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        const rem = json.data.reminders as Record<ReminderType, ReminderSetting>;
        setReminderText(Object.fromEntries(
          REMINDER_ORDER.map(t => [t, (rem[t]?.milestones ?? DEFAULT_REMINDERS[t].milestones).join(', ')])
        ) as Record<ReminderType, string>);
        setSecurity(json.data.security as SecurityConfig);
        if (json.data.scheduler) setScheduler(json.data.scheduler as SchedulerConfig);
        if (json.data.hrAutomation) setHrAutomation(json.data.hrAutomation as HrAutomationConfig);
        if (json.data.ticket) setTicket(json.data.ticket as TicketConfig);
        if (json.data.accountEmail) setAccountEmail(json.data.accountEmail as AccountEmailConfig);
        if (json.data.schedulerJobs) setSchedulerJobs(json.data.schedulerJobs as Record<SchedulerJobKey, SchedulerJob>);
        if (json.data.recipientRules) setRecipientRules(json.data.recipientRules as Record<RecipientRuleType, RecipientRule>);
        if (json.data.legalReminder) {
          const lr = json.data.legalReminder as LegalReminderConfig;
          setLegalOverdueText((lr.overdueMilestones ?? DEFAULT_LEGAL_REMINDER.overdueMilestones).join(', '));
          setLegalComplianceText((lr.complianceMilestones ?? DEFAULT_LEGAL_REMINDER.complianceMilestones).join(', '));
        }
      } else {
        setLoadError(true);
      }
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (role) load(); }, [role, load]);

  // Danh sách user cho picker người nhận (chỉ tải 1 lần khi super_admin)
  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const res = await fetch('/api/users', { headers: authHeaders(), cache: 'no-store' });
        const json = await res.json();
        const list: PickUser[] = (Array.isArray(json) ? json : json.data || []).map((u: { id: string; name: string; role: string }) => ({ id: u.id, name: u.name, role: u.role }));
        setUsers(list);
      } catch { /* noop */ }
    })();
  }, [isSuperAdmin]);

  const userName = (id: string) => users.find(u => u.id === id)?.name || id;

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/notification-templates', { headers: authHeaders(), cache: 'no-store' });
      const json = await res.json();
      if (json.success) { setTemplates(json.data as TemplateView[]); setTplLoaded(true); }
    } catch { /* noop */ }
  }, []);

  useEffect(() => { if (tab === 'templates' && !tplLoaded && isSuperAdmin) loadTemplates(); }, [tab, tplLoaded, isSuperAdmin, loadTemplates]);
  // Quay về lưới thẻ module mỗi lần đổi tab
  useEffect(() => { setTplModule(null); }, [tab]);

  const loadOutbox = useCallback(async () => {
    try {
      const res = await fetch('/api/notification-outbox', { headers: authHeaders(), cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setOutboxStats(json.data.stats); setOutboxRecent(json.data.recent);
        setReadStats(json.data.readStats || []); setOutboxLoaded(true);
      }
    } catch { /* noop */ }
  }, []);
  useEffect(() => { if (tab === 'delivery' && isSuperAdmin) loadOutbox(); }, [tab, isSuperAdmin, loadOutbox]);

  const retryOutbox = async (id: string) => {
    try {
      const res = await fetch('/api/notification-outbox', {
        method: 'POST', headers: authHeaders(true), body: JSON.stringify({ action: 'retry', id }),
      });
      const json = await res.json();
      if (json.success) { setOutboxStats(json.data.stats); setOutboxRecent(json.data.recent); }
    } catch { /* noop */ }
  };

  const editTemplate = (key: string, field: 'title' | 'message' | 'telegram', value: string) => {
    setTemplates(prev => prev.map(t => t.key === key ? { ...t, [field]: value } : t));
  };

  const saveTemplates = async () => {
    setTplSaving(true); setTplMsg(null);
    try {
      const payload = templates.map(t => ({ key: t.key, title: t.title, message: t.message, icon: t.icon, telegram: t.telegram, label: t.label }));
      const res = await fetch('/api/notification-templates', {
        method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ templates: payload }),
      });
      const json = await res.json();
      if (!json.success) { setTplMsg({ type: 'err', text: json.error || 'Lỗi lưu mẫu' }); return; }
      setTemplates(json.data as TemplateView[]);
      setTplMsg({ type: 'ok', text: 'Đã lưu mẫu thông báo. Áp dụng từ lần gửi kế tiếp.' });
    } catch { setTplMsg({ type: 'err', text: 'Lỗi kết nối' }); }
    finally { setTplSaving(false); }
  };

  const resetTemplate = async (key: string) => {
    try {
      const res = await fetch('/api/notification-templates', {
        method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ templates: [{ key, reset: true }] }),
      });
      const json = await res.json();
      if (json.success) {
        setTemplates(json.data as TemplateView[]);
        setTplMsg({ type: 'ok', text: 'Đã khôi phục mẫu mặc định' });
      } else {
        setTplMsg({ type: 'err', text: json.error ?? 'Khôi phục mẫu thất bại' });
      }
    } catch {
      setTplMsg({ type: 'err', text: 'Lỗi kết nối, không khôi phục được mẫu. Vui lòng thử lại.' });
    }
  };

  // Bật/tắt 1 mẫu — cập nhật lạc quan, gọi API ngầm
  const toggleTemplate = async (key: string, enabled: boolean) => {
    setTemplates(prev => prev.map(t => t.key === key ? { ...t, enabled } : t));
    try {
      await fetch('/api/notification-templates', {
        method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ templates: [{ key, enabled }] }),
      });
    } catch {
      setTemplates(prev => prev.map(t => t.key === key ? { ...t, enabled: !enabled } : t)); // hoàn tác
    }
  };

  // Tạo mẫu tùy chỉnh
  const createCustom = async () => {
    if (!createForm.label.trim() || !createForm.title.trim() || !createForm.message.trim()) {
      setTplMsg({ type: 'err', text: 'Tên mẫu, tiêu đề và nội dung không được để trống' }); return;
    }
    setCreateSaving(true);
    try {
      const res = await fetch('/api/notification-templates', {
        method: 'POST', headers: authHeaders(true), body: JSON.stringify(createForm),
      });
      const json = await res.json();
      if (!json.success) { setTplMsg({ type: 'err', text: json.error || 'Lỗi tạo mẫu' }); return; }
      setTemplates(json.data as TemplateView[]);
      createGuard.markClean();
      setCreateOpen(false);
      setCreateForm({ label: '', title: '', message: '', telegram: '' });
      setTplMsg({ type: 'ok', text: 'Đã tạo mẫu tùy chỉnh.' });
    } catch { setTplMsg({ type: 'err', text: 'Lỗi kết nối' }); }
    finally { setCreateSaving(false); }
  };

  // Xoá mẫu tùy chỉnh
  const deleteCustom = async (key: string) => {
    if (!confirm('Xoá mẫu tùy chỉnh này? Không thể hoàn tác.')) return;
    try {
      const res = await fetch(`/api/notification-templates?key=${encodeURIComponent(key)}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        setTemplates(json.data as TemplateView[]);
        setTplMsg({ type: 'ok', text: 'Đã xoá mẫu tùy chỉnh' });
      } else {
        setTplMsg({ type: 'err', text: json.error ?? 'Xoá mẫu thất bại' });
      }
    } catch {
      setTplMsg({ type: 'err', text: 'Lỗi kết nối, không xoá được mẫu. Vui lòng thử lại.' });
    }
  };

  // Mở modal gửi thủ công
  const openSend = (t: TemplateView) => {
    setSendTpl(t); setSendRecipients([]); setSendAllActive(false);
    setSendPicker({ companyId: null, departmentId: null, subDepartmentId: null, userId: null });
    setSendMsg(null);
  };
  const addRecipient = (v: OrgPersonValue) => {
    setSendPicker(v);
    if (v.userId && !sendRecipients.some(r => r.id === v.userId)) {
      setSendRecipients(prev => [...prev, { id: v.userId as string, name: v.userName || 'Nhân sự' }]);
    }
  };
  const sendCustom = async () => {
    if (!sendTpl) return;
    if (!sendAllActive && sendRecipients.length === 0) {
      setSendMsg({ type: 'err', text: 'Chọn người nhận hoặc bật "Toàn bộ người dùng".' }); return;
    }
    setSending(true); setSendMsg(null);
    try {
      const res = await fetch('/api/notification-templates/send', {
        method: 'POST', headers: authHeaders(true),
        body: JSON.stringify({ key: sendTpl.key, recipientIds: sendRecipients.map(r => r.id), allActive: sendAllActive }),
      });
      const json = await res.json();
      if (!json.success) { setSendMsg({ type: 'err', text: json.error || 'Lỗi gửi' }); return; }
      setSendMsg({ type: 'ok', text: `Đã gửi tới ${json.recipients} người (${json.sent} thông báo).` });
      setTimeout(() => setSendTpl(null), 1200);
    } catch { setSendMsg({ type: 'err', text: 'Lỗi kết nối' }); }
    finally { setSending(false); }
  };

  const toggleRole = (type: RecipientRuleType, roleValue: string) => {
    setRecipientRules(prev => {
      const cur = prev[type];
      const has = cur.roles.includes(roleValue);
      return { ...prev, [type]: { ...cur, roles: has ? cur.roles.filter(r => r !== roleValue) : [...cur.roles, roleValue] } };
    });
  };
  const toggleHrEditors = (type: RecipientRuleType) => {
    setRecipientRules(prev => ({ ...prev, [type]: { ...prev[type], includeHrEditors: !prev[type].includeHrEditors } }));
  };
  const addUserId = (type: RecipientRuleType, id: string) => {
    setRecipientRules(prev => {
      const cur = prev[type];
      if (cur.userIds.includes(id)) return prev;
      return { ...prev, [type]: { ...cur, userIds: [...cur.userIds, id] } };
    });
  };
  const removeUserId = (type: RecipientRuleType, id: string) => {
    setRecipientRules(prev => ({ ...prev, [type]: { ...prev[type], userIds: prev[type].userIds.filter(u => u !== id) } }));
  };

  const parseMilestones = (text: string): number[] =>
    text.split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => Number.isInteger(n) && n >= 0 && n <= 365);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const reminders = REMINDER_ORDER.map(t => ({ type: t, milestones: parseMilestones(reminderText[t]) }));
      // Không bao giờ lưu 0/NaN (ô nhập bị xoá trống) — sessionDays=0 làm cookie phiên
      // hết hạn ngay → toàn hệ thống không đăng nhập được.
      const safeSecurity = {
        sessionDays: Math.min(365, Math.max(1, Math.floor(Number(security.sessionDays)) || DEFAULT_SECURITY.sessionDays)),
        resetTokenHours: Math.min(168, Math.max(1, Math.floor(Number(security.resetTokenHours)) || DEFAULT_SECURITY.resetTokenHours)),
      };
      const res = await fetch('/api/system-config', {
        method: 'PUT', headers: authHeaders(true),
        body: JSON.stringify({
          reminders, security: safeSecurity, scheduler, hrAutomation, ticket, accountEmail,
          schedulerJobs: (Object.keys(DEFAULT_SCHEDULER_JOBS) as SchedulerJobKey[]).map(k => ({ key: k, ...schedulerJobs[k] })),
          recipientRules: RECIPIENT_ORDER.map(t => ({ type: t, ...recipientRules[t] })),
          legalReminder: {
            // Quá hạn không nhận 0 ("quá hạn 0 ngày" = đúng hạn, đã có nhắc trước hạn lo)
            overdueMilestones: parseMilestones(legalOverdueText).filter(n => n >= 1),
            complianceMilestones: parseMilestones(legalComplianceText),
          },
        }),
      });
      const json = await res.json();
      if (!json.success) { setMsg({ type: 'err', text: json.error || 'Lỗi lưu cấu hình' }); return; }
      setMsg({ type: 'ok', text: 'Đã lưu. Nhắc nhở áp dụng từ lần chạy kế tiếp; thời hạn phiên áp cho đăng nhập mới.' });
      load();
    } catch { setMsg({ type: 'err', text: 'Lỗi kết nối' }); }
    finally { setSaving(false); }
  };

  if (role && !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm">Trang này chỉ dành cho Super Admin</p>
      </div>
    );
  }

  // Thanh lưu dùng chung cho các tab cấu hình (reminder/automation/recipients/security).
  // Cùng gọi handleSave (lưu toàn bộ state đang nạp) nhưng đặt riêng trong mỗi tab.
  const SaveBar = () => (
    <div className="space-y-2">
      {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-600 text-white disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {tab !== null && (
        <button onClick={() => { setTab(null); setMsg(null); }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Cấu Hình Hệ Thống
        </button>
      )}
      <div>
        <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5 text-foreground">
          <SlidersHorizontal className="h-6 w-6 text-indigo-400" /> {tab === null ? 'Cấu Hình Hệ Thống' : SECTIONS.find(s => s.key === tab)?.label}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {tab === null ? 'Chọn một mục để cấu hình quy tắc nhắc nhở và chính sách bảo mật toàn hệ thống' : SECTIONS.find(s => s.key === tab)?.desc}
        </p>
      </div>

      {tab === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => { setTab(s.key); setMsg(null); }}
              className="group flex items-start gap-4 text-left rounded-2xl border border-line-subtle p-5 hover:border-indigo-500/40 transition-colors" style={{ background: 'var(--card)' }}>
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.tint}`}>
                <s.icon className={`h-6 w-6 ${s.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-600 text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 mt-1 text-muted-foreground/40 group-hover:text-indigo-400 transition-colors" />
            </button>
          ))}
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <ErrorState onRetry={load} />
      ) : tab === 'reminder' ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
            Nhập các <span className="text-foreground font-600">mốc nhắc</span> (số ngày trước hạn), cách nhau bằng dấu phẩy.
            VD <span className="text-foreground">30, 15, 5, 1</span> = nhắc khi còn 30/15/5/1 ngày. Để trống = tắt nhắc theo mốc.
            Thay đổi áp dụng từ lần chạy nhắc kế tiếp (không cần khởi động lại).
          </div>
          {REMINDER_ORDER.map(t => (
            <div key={t} className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-600 text-foreground">{REMINDER_LABELS[t].label}</p>
                  <p className="text-xs text-muted-foreground">{REMINDER_LABELS[t].desc}</p>
                </div>
                <input
                  value={reminderText[t]}
                  onChange={(e) => setReminderText(prev => ({ ...prev, [t]: e.target.value }))}
                  placeholder="VD: 30, 15, 5, 1"
                  className="h-9 w-full sm:w-56 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60"
                />
              </div>
            </div>
          ))}

          {/* Pháp chế — 2 mốc nâng cao (trước đây hardcode trong legalReminderService) */}
          <div className="rounded-2xl border border-line-subtle p-4 space-y-3" style={{ background: 'var(--card)' }}>
            <p className="text-sm font-600 text-foreground">Pháp Chế — nâng cao</p>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground">Nhắc lại khi ĐÃ quá hạn</p>
                <p className="text-xs text-muted-foreground">Số ngày SAU hạn sẽ nhắc lại (giấy phép/hợp đồng quá hạn chưa xử lý). Để trống = chỉ nhắc trước hạn.</p>
              </div>
              <input
                value={legalOverdueText}
                onChange={(e) => setLegalOverdueText(e.target.value)}
                placeholder="VD: 1, 7, 30"
                className="h-9 w-full sm:w-56 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground">Nghĩa vụ tuân thủ đến kỳ</p>
                <p className="text-xs text-muted-foreground">Số ngày TRƯỚC hạn nộp sẽ nhắc (0 = nhắc đúng ngày hạn). Áp cho báo cáo lao động, BHXH...</p>
              </div>
              <input
                value={legalComplianceText}
                onChange={(e) => setLegalComplianceText(e.target.value)}
                placeholder="VD: 7, 3, 1, 0"
                className="h-9 w-full sm:w-56 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60"
              />
            </div>
          </div>
          <SaveBar />
        </div>
      ) : tab === 'automation' ? (
        <div className="space-y-4 max-w-lg">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
            Khung giờ chạy các nhắc nhở HR (hợp đồng, đánh giá, tuyển dụng, phép, bảo trì tài sản).
            Hệ thống quét định kỳ; trùng <span className="text-foreground font-600">giờ sáng</span> hoặc{' '}
            <span className="text-foreground font-600">giờ chiều</span> trong cửa sổ phút thì gửi nhắc.
            Thay đổi áp dụng trong vòng một chu kỳ quét (không cần khởi động lại).
          </div>

          <div className="rounded-2xl border border-line-subtle p-4 space-y-4" style={{ background: 'var(--card)' }}>
            <p className="text-sm font-600 text-foreground">Khung giờ chạy nhắc</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Giờ sáng (0–23)</label>
                <input type="number" min={0} max={23} value={scheduler.morningHour}
                  onChange={(e) => setScheduler(s => ({ ...s, morningHour: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
              </div>
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Giờ chiều (0–23)</label>
                <input type="number" min={0} max={23} value={scheduler.eveningHour}
                  onChange={(e) => setScheduler(s => ({ ...s, eveningHour: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
              </div>
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Cửa sổ phút (1–59)</label>
                <input type="number" min={1} max={59} value={scheduler.windowMinutes}
                  onChange={(e) => setScheduler(s => ({ ...s, windowMinutes: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
              </div>
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Chu kỳ quét (phút)</label>
                <input type="number" min={1} max={60} value={scheduler.checkIntervalMinutes}
                  onChange={(e) => setScheduler(s => ({ ...s, checkIntervalMinutes: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
              </div>
            </div>
            <p className="text-2xs text-muted-foreground">Giờ sáng ≠ giờ chiều. Cửa sổ phút không lớn hơn chu kỳ quét. Mặc định: 9h / 15h / 15 phút / 10 phút.</p>
          </div>

          <div className="rounded-2xl border border-line-subtle p-4 space-y-4" style={{ background: 'var(--card)' }}>
            <p className="text-sm font-600 text-foreground">Ngưỡng đánh giá thử việc</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tự tạo thẻ trước hạn (ngày)</label>
                <input type="number" min={1} max={90} value={hrAutomation.evaluationAutoCreateDaysBefore}
                  onChange={(e) => setHrAutomation(s => ({ ...s, evaluationAutoCreateDaysBefore: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                <p className="text-2xs text-muted-foreground mt-1">Tự tạo thẻ đánh giá khi nhân viên còn ngần này ngày hết thử việc.</p>
              </div>
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Quét đánh giá sắp hạn (ngày)</label>
                <input type="number" min={1} max={90} value={hrAutomation.evaluationLookupDays}
                  onChange={(e) => setHrAutomation(s => ({ ...s, evaluationLookupDays: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                <p className="text-2xs text-muted-foreground mt-1">Tìm các đánh giá sắp tới hạn trong ngần này ngày để nhắc.</p>
              </div>
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tự lưu trữ sau khi kết luận (ngày)</label>
                <input type="number" min={0} max={365} value={hrAutomation.evaluationAutoArchiveDays}
                  onChange={(e) => setHrAutomation(s => ({ ...s, evaluationAutoArchiveDays: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                <p className="text-2xs text-muted-foreground mt-1">Tự động lưu trữ thẻ đã kết luận (Đạt / Không đạt / Gia hạn) sau ngần này ngày kể từ ngày kết luận — thẻ được ẩn khỏi danh sách chính (không mất dữ liệu). <b>0 = tắt</b>.</p>
              </div>
            </div>

            <div className="border-t border-line-subtle pt-4">
              <p className="text-sm font-600 text-foreground mb-3">Tạo nháp hợp đồng onboarding</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tạo nháp trước ngày vào làm (ngày)</label>
                  <input type="number" min={1} max={30} value={hrAutomation.onboardingDraftLeadDays}
                    onChange={(e) => setHrAutomation(s => ({ ...s, onboardingDraftLeadDays: parseInt(e.target.value) || 0 }))}
                    className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                  <p className="text-2xs text-muted-foreground mt-1">Scheduler tạo bản nháp HĐ khi còn ≤ ngần này ngày tới ngày vào làm. Đặt 2–3 để mốc tạo không rơi vào cuối tuần (vd vào làm Thứ 2 → tạo sẵn từ Thứ 6). Mặc định 1.</p>
                </div>
                <div>
                  <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Báo cáo cấp trên sau (số lần nhắc)</label>
                  <input type="number" min={1} max={10} value={hrAutomation.contractReminderEscalateAfter}
                    onChange={(e) => setHrAutomation(s => ({ ...s, contractReminderEscalateAfter: parseInt(e.target.value) || 0 }))}
                    className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                  <p className="text-2xs text-muted-foreground mt-1">Nhắc ký HĐ đủ ngần này lần mà chưa ký → tự báo cáo lên quản lý của nhân sự & của Người Đồng Phụ Trách (một lần). Mặc định 3.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line-subtle p-4 space-y-4" style={{ background: 'var(--card)' }}>
            <div>
              <p className="text-sm font-600 text-foreground">Email cấp tài khoản nhân sự mới</p>
              <p className="text-xs text-muted-foreground">Gửi sau khi Quản trị viên duyệt người dùng mới (Duyệt Người Dùng).</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Mật khẩu Zimbra mặc định</label>
                <input type="text" value={accountEmail.zimbraDefaultPassword}
                  onChange={(e) => setAccountEmail(s => ({ ...s, zimbraDefaultPassword: e.target.value }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                <p className="text-2xs text-muted-foreground mt-1">Điền sẵn vào ô Password Zimbra trên form gửi email cấp tài khoản — QTV vẫn sửa được từng lần gửi.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line-subtle p-4 space-y-4" style={{ background: 'var(--card)' }}>
            <div>
              <p className="text-sm font-600 text-foreground">Vòng đời ticket</p>
              <p className="text-xs text-muted-foreground">Scheduler nền tự dọn dẹp ticket đã kết thúc theo các mốc dưới đây. Cũng sửa được tại Ticket → Quản trị → Cấu hình.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tự đóng sau (ngày)</label>
                <input type="number" min={1} max={365} value={ticket.autoCloseDays}
                  onChange={(e) => setTicket(s => ({ ...s, autoCloseDays: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                <p className="text-2xs text-muted-foreground mt-1">Ticket đã xử lý / từ chối quá số ngày này mà không phản hồi sẽ tự đóng.</p>
              </div>
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tự lưu trữ sau (ngày)</label>
                <input type="number" min={1} max={365} value={ticket.autoArchiveDays}
                  onChange={(e) => setTicket(s => ({ ...s, autoArchiveDays: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                <p className="text-2xs text-muted-foreground mt-1">Ticket đã kết thúc quá số ngày này sẽ được ẩn vào lưu trữ.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line-subtle p-4 space-y-4" style={{ background: 'var(--card)' }}>
            <div>
              <p className="text-sm font-600 text-foreground">Giờ chạy các tác vụ nền</p>
              <p className="text-xs text-muted-foreground">Khung giờ (0–23, giờ VN) mỗi scheduler nền kích hoạt. Thay đổi áp dụng trong vòng một chu kỳ quét, không cần khởi động lại.</p>
            </div>
            <div className="space-y-2.5">
              {(Object.keys(DEFAULT_SCHEDULER_JOBS) as SchedulerJobKey[]).map(k => {
                const meta = SCHEDULER_JOB_LABELS[k];
                const job = schedulerJobs[k] ?? DEFAULT_SCHEDULER_JOBS[k];
                return (
                  <div key={k} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-line-subtle p-3" style={{ background: 'var(--background)' }}>
                    <div className="min-w-0">
                      <p className="text-sm font-600 text-foreground">{meta.label}</p>
                      <p className="text-2xs text-muted-foreground">{meta.desc}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input type="number" min={0} max={23} value={job.hour}
                        onChange={(e) => setSchedulerJobs(s => ({ ...s, [k]: { ...s[k], hour: parseInt(e.target.value) || 0 } }))}
                        className="h-9 w-16 rounded-lg px-2 text-sm text-center text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                      {meta.ranged && (
                        <>
                          <span className="text-xs text-muted-foreground">→</span>
                          <input type="number" min={0} max={23} value={job.endHour ?? DEFAULT_SCHEDULER_JOBS[k].endHour ?? 0}
                            onChange={(e) => setSchedulerJobs(s => ({ ...s, [k]: { ...s[k], endHour: parseInt(e.target.value) || 0 } }))}
                            className="h-9 w-16 rounded-lg px-2 text-sm text-center text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                        </>
                      )}
                      <span className="text-xs text-muted-foreground">giờ</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <SaveBar />
        </div>
      ) : tab === 'recipients' ? (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
            Chọn ai nhận thông báo cho từng loại nhắc: theo <span className="text-foreground font-600">vai trò</span>,
            cộng thêm <span className="text-foreground font-600">người cụ thể</span>, và (tuỳ chọn) người có quyền sửa hồ sơ HR.
            Mặc định: Admin + Super Admin (đánh giá có thêm người có quyền sửa HR).
          </div>
          {RECIPIENT_ORDER.map(type => {
            const rule = recipientRules[type];
            return (
              <div key={type} className="rounded-2xl border border-line-subtle p-4 space-y-3" style={{ background: 'var(--card)' }}>
                <div>
                  <p className="text-sm font-600 text-foreground">{RECIPIENT_LABELS[type].label}</p>
                  <p className="text-xs text-muted-foreground">{RECIPIENT_LABELS[type].desc}</p>
                </div>

                {!RECIPIENT_LABELS[type].usersOnly && (
                  <>
                    <div>
                      <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Theo vai trò</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ROLE_OPTIONS.map(r => {
                          const on = rule.roles.includes(r.value);
                          return (
                            <button key={r.value} type="button" onClick={() => toggleRole(type, r.value)}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-600 transition-colors ${on ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={rule.includeHrEditors} onChange={() => toggleHrEditors(type)} className="accent-indigo-600" />
                      Cộng thêm người có quyền sửa hồ sơ HR
                    </label>
                  </>
                )}

                <div>
                  <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Người cụ thể</p>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {rule.userIds.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 rounded-lg border border-line bg-hover px-2 py-1 text-xs text-foreground">
                        {userName(id)}
                        <button type="button" onClick={() => removeUserId(type, id)} className="text-muted-foreground hover:text-red-300"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    {rule.userIds.length === 0 && <span className="text-xs text-muted-foreground/60">Chưa chọn ai</span>}
                  </div>
                  <div className="relative">
                    <button type="button" onClick={() => { setPickerOpen(pickerOpen === type ? null : type); setPickerSearch(''); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1.5 text-xs font-600 text-muted-foreground hover:text-foreground hover:border-indigo-500/40">
                      + Thêm người
                    </button>
                    {pickerOpen === type && (
                      <div className="absolute left-0 z-20 mt-1.5 w-72 rounded-xl border border-line shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
                        <div className="p-2 border-b border-line-subtle">
                          <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Tìm người dùng..." autoFocus
                            className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {users.filter(u => !rule.userIds.includes(u.id) && u.name.toLowerCase().includes(pickerSearch.toLowerCase())).slice(0, 50).map(u => (
                            <button key={u.id} type="button" onClick={() => { addUserId(type, u.id); setPickerOpen(null); }}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-hover">
                              <span className="text-xs text-foreground truncate">{u.name}</span>
                              <span className="text-2xs text-muted-foreground shrink-0">{u.role}</span>
                            </button>
                          ))}
                          {users.length === 0 && <p className="px-3 py-3 text-center text-xs text-muted-foreground">Đang tải danh sách...</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <SaveBar />
        </div>
      ) : tab === 'delivery' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
            Trạng thái gửi Telegram (qua hộp thư đi). Tin lỗi mạng sẽ <span className="text-foreground font-600">tự thử lại</span> theo back-off;
            tin <span className="text-red-300 font-600">thất bại</span> đã hết lượt — bạn có thể bấm gửi lại thủ công.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
              <p className="text-2xs text-muted-foreground uppercase tracking-wider">Đang chờ</p>
              <p className="text-2xl font-700 text-amber-300">{outboxStats.pending}</p>
            </div>
            <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
              <p className="text-2xs text-muted-foreground uppercase tracking-wider">Đã gửi (7 ngày)</p>
              <p className="text-2xl font-700 text-emerald-300">{outboxStats.sent}</p>
            </div>
            <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
              <p className="text-2xs text-muted-foreground uppercase tracking-wider">Thất bại</p>
              <p className="text-2xl font-700 text-red-300">{outboxStats.failed}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={loadOutbox} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-hover">
              <RefreshCw className="h-3.5 w-3.5" /> Làm mới
            </button>
          </div>
          {!outboxLoaded ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : outboxRecent.length === 0 ? (
            <p className="text-center py-10 text-sm text-muted-foreground">Chưa có tin nào trong hộp thư đi.</p>
          ) : (
            <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
              {outboxRecent.map(o => (
                <div key={o.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-line-subtle last:border-b-0">
                  <span className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-md text-2xs font-600 ${
                    o.status === 'sent' ? 'bg-emerald-500/15 text-emerald-300'
                    : o.status === 'failed' ? 'bg-red-500/15 text-red-300'
                    : 'bg-amber-500/15 text-amber-300'
                  }`}>
                    {o.status === 'sent' ? 'Đã gửi' : o.status === 'failed' ? 'Thất bại' : 'Đang chờ'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground truncate">{o.text.replace(/[*_]/g, '').split('\n')[0]}</p>
                    <p className="text-2xs text-muted-foreground">
                      {o.attempts > 0 && `${o.attempts} lần thử · `}{o.created_at?.slice(0, 16).replace('T', ' ')}
                      {o.last_error && <span className="text-red-300/70"> · {o.last_error.slice(0, 60)}</span>}
                    </p>
                  </div>
                  {o.status === 'failed' && (
                    <button onClick={() => retryOutbox(o.id)} className="shrink-0 inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-2xs font-600 text-foreground hover:bg-hover">
                      <RefreshCw className="h-3 w-3" /> Gửi lại
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Phân tích: tỷ lệ đọc in-app */}
          {readStats.length > 0 && (
            <div className="rounded-2xl border border-line-subtle p-4 space-y-2.5" style={{ background: 'var(--card)' }}>
              <p className="text-sm font-600 text-foreground">Tỷ lệ đọc thông báo in-app (30 ngày)</p>
              <p className="text-2xs text-muted-foreground -mt-1">Telegram không có xác nhận đã đọc; số liệu này tính theo thông báo trong ứng dụng.</p>
              {readStats.map(s => {
                const rate = s.total > 0 ? Math.round((s.read / s.total) * 100) : 0;
                return (
                  <div key={s.type} className="space-y-1">
                    <div className="flex items-center justify-between text-2xs">
                      <span className="text-foreground font-500 truncate">{s.type}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{s.read}/{s.total} · {rate}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-hover overflow-hidden">
                      <div className={`h-full rounded-full ${rate >= 60 ? 'bg-emerald-500/60' : rate >= 30 ? 'bg-amber-500/60' : 'bg-red-500/60'}`} style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : tab === 'templates' ? (
        <div className="space-y-4">
          {!tplLoaded ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : tplModule === null ? (
            <>
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
                Mẫu thông báo được gom theo <span className="text-foreground font-600">module</span> (giống thanh điều hướng).
                Chọn một module để xem và chỉnh các mẫu bên trong.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {TEMPLATE_MODULES.map(m => {
                  const list = templates.filter(t => moduleForCategory(t.category) === m.key);
                  if (list.length === 0 && m.key !== 'custom') return null;
                  const overridden = list.filter(t => t.isOverridden).length;
                  const ic = TPL_MODULE_ICON[m.key] ?? { icon: FileText, tint: 'bg-hover', color: 'text-muted-foreground' };
                  return (
                    <button key={m.key} onClick={() => setTplModule(m.key)}
                      className="group flex items-start gap-4 text-left rounded-2xl border border-line-subtle p-5 hover:border-indigo-500/40 transition-colors" style={{ background: 'var(--card)' }}>
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${ic.tint}`}>
                        <ic.icon className={`h-6 w-6 ${ic.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-600 text-foreground">{m.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {list.length} mẫu{overridden > 0 && <span className="text-amber-300/80"> · {overridden} đã chỉnh</span>}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 mt-1 text-muted-foreground/40 group-hover:text-indigo-400 transition-colors" />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setTplModule(null)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Mẫu thông báo
              </button>
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  {(() => {
                    const ic = TPL_MODULE_ICON[tplModule] ?? { icon: FileText, tint: 'bg-hover', color: 'text-muted-foreground' };
                    return <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${ic.tint}`}><ic.icon className={`h-5 w-5 ${ic.color}`} /></div>;
                  })()}
                  <p className="text-base font-700 text-foreground">{TEMPLATE_MODULES.find(m => m.key === tplModule)?.label}</p>
                </div>
                {tplModule === 'custom' && (
                  <button onClick={() => { setCreateForm({ label: '', title: '', message: '', telegram: '' }); setCreateOpen(true); }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 px-3.5 py-2 text-sm font-600 text-white transition-colors">
                    <Plus className="h-4 w-4" /> Thêm mẫu
                  </button>
                )}
              </div>
              {tplModule === 'custom' && templates.filter(t => moduleForCategory(t.category) === 'custom').length === 0 && (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <Send className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Chưa có mẫu tùy chỉnh nào</p>
                  <p className="text-xs mt-1 opacity-60">Bấm “Thêm mẫu” để tạo mẫu gửi thủ công cho người dùng.</p>
                </div>
              )}
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
                Sửa <span className="text-foreground font-600">tiêu đề</span> và <span className="text-foreground font-600">nội dung</span> thông báo.
                Dùng biến dạng <code className="text-indigo-300">{'{{tên}}'}</code> — hệ thống thay bằng dữ liệu thật khi gửi.
                Để trống ô sẽ không lưu được. Thay đổi áp dụng từ lần gửi kế tiếp.
              </div>

              {Object.entries(
                templates.filter(t => moduleForCategory(t.category) === tplModule).reduce<Record<string, TemplateView[]>>((acc, t) => {
                  (acc[t.category] ||= []).push(t); return acc;
                }, {})
              ).map(([cat, list]) => (
                <div key={cat} className="space-y-2">
                  <p className="text-2xs font-700 text-muted-foreground uppercase tracking-wider">{cat}</p>
                  {list.map(t => (
                    <div key={t.key} className={`rounded-2xl border p-4 space-y-2.5 ${t.enabled ? 'border-line-subtle' : 'border-line-subtle opacity-60'}`} style={{ background: 'var(--card)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-600 text-foreground">
                          {t.label}
                          {t.isCustom && <span className="ml-2 text-2xs text-violet-300/90 bg-violet-500/15 rounded px-1.5 py-0.5">tùy chỉnh</span>}
                          {!t.enabled && <span className="ml-2 text-2xs text-red-300/80">(đang tắt)</span>}
                          {t.isOverridden && t.enabled && <span className="ml-2 text-2xs text-amber-300/80">(đã chỉnh)</span>}
                        </p>
                        <div className="flex items-center gap-3 shrink-0">
                          {t.isCustom && (
                            <button type="button" onClick={() => openSend(t)} disabled={!t.enabled}
                              className="inline-flex items-center gap-1 text-2xs font-600 text-indigo-400 hover:text-indigo-300 disabled:opacity-40">
                              <Send className="h-3 w-3" /> Gửi
                            </button>
                          )}
                          {t.isOverridden && !t.isCustom && (
                            <button type="button" onClick={() => resetTemplate(t.key)} className="text-2xs text-muted-foreground hover:text-foreground underline">Khôi phục</button>
                          )}
                          {t.isCustom && (
                            <button type="button" onClick={() => deleteCustom(t.key)} className="inline-flex items-center text-2xs text-red-400 hover:text-red-300">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Công tắc bật/tắt */}
                          <button type="button" onClick={() => toggleTemplate(t.key, !t.enabled)} title={t.enabled ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}
                            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${t.enabled ? 'bg-indigo-600' : 'bg-white/15'}`}>
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${t.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                          </button>
                        </div>
                      </div>
                      <input value={t.title} onChange={e => editTemplate(t.key, 'title', e.target.value)} placeholder="Tiêu đề"
                        className="h-9 w-full rounded-lg px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                      <textarea value={t.message} onChange={e => editTemplate(t.key, 'message', e.target.value)} placeholder="Nội dung" rows={2}
                        className="w-full rounded-lg px-3 py-2 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-y" />
                      <div>
                        <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Telegram (tuỳ chọn — Markdown nhiều dòng; để trống = tự dùng tiêu đề + nội dung)</label>
                        <textarea value={t.telegram} onChange={e => editTemplate(t.key, 'telegram', e.target.value)} placeholder="Bỏ trống nếu dùng chung với nội dung in-app" rows={2}
                          className="mt-1 w-full rounded-lg px-3 py-2 text-xs text-foreground bg-[#0e1626] border border-line focus:outline-none focus:border-cyan-500/60 resize-y font-mono" />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {t.placeholders.map(p => (
                          <code key={p} className="text-2xs text-indigo-300/80 bg-indigo-500/10 rounded px-1.5 py-0.5">{`{{${p}}}`}</code>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {tplMsg && <p className={`text-sm ${tplMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{tplMsg.text}</p>}
              <div className="flex justify-end">
                <button onClick={saveTemplates} disabled={tplSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-600 text-white disabled:opacity-50 transition-colors">
                  {tplSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {tplSaving ? 'Đang lưu...' : 'Lưu mẫu thông báo'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
            Chính sách bảo mật toàn hệ thống. <span className="text-foreground font-600">Thời hạn phiên</span> chỉ áp cho
            các lần đăng nhập mới — phiên đang mở giữ nguyên hạn cũ. <span className="text-foreground font-600">Hạn link đặt lại
            mật khẩu</span> áp ngay cho link tạo sau khi lưu.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Thẻ: Thời hạn phiên đăng nhập */}
            <div className="rounded-2xl border border-line-subtle p-5 flex flex-col gap-4" style={{ background: 'var(--card)' }}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15">
                  <LogIn className="h-5 w-5 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-600 text-foreground">Thời hạn phiên đăng nhập</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Số ngày một phiên còn hiệu lực trước khi buộc đăng nhập lại.</p>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <input type="number" min={1} max={365} value={security.sessionDays}
                  onChange={(e) => setSecurity(s => ({ ...s, sessionDays: parseInt(e.target.value) || 0 }))}
                  className="h-11 w-28 rounded-xl px-3 text-lg font-700 text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                <span className="pb-2.5 text-xs font-600 text-muted-foreground">ngày</span>
              </div>
              <p className="text-2xs text-muted-foreground -mt-1">Chỉ áp dụng cho các lần đăng nhập MỚI; phiên hiện tại giữ hạn cũ. Mặc định: 7 ngày.</p>
            </div>

            {/* Thẻ: Hạn link đặt lại mật khẩu */}
            <div className="rounded-2xl border border-line-subtle p-5 flex flex-col gap-4" style={{ background: 'var(--card)' }}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                  <KeyRound className="h-5 w-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-600 text-foreground">Hạn link đặt lại mật khẩu</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Link đặt lại mật khẩu sẽ hết hiệu lực sau khoảng thời gian này.</p>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <input type="number" min={1} max={168} value={security.resetTokenHours}
                  onChange={(e) => setSecurity(s => ({ ...s, resetTokenHours: parseInt(e.target.value) || 0 }))}
                  className="h-11 w-28 rounded-xl px-3 text-lg font-700 text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                <span className="pb-2.5 text-xs font-600 text-muted-foreground">giờ</span>
              </div>
              <p className="text-2xs text-muted-foreground -mt-1">Áp ngay cho các link tạo sau khi lưu. Mặc định: 24 giờ.</p>
            </div>
          </div>

          <SsoConfigCard />

          <SaveBar />
        </div>
      )}

      {/* Modal: Tạo mẫu tùy chỉnh */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={createGuard.guardedClose}>
          <div className="w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Thêm mẫu tùy chỉnh</h2>
              <button onClick={createGuard.guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4" onChange={createGuard.markDirty}>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Mẫu này dùng để <span className="text-foreground font-600">gửi thủ công</span> tới người dùng (in-app + Telegram).
                Có thể chèn biến cố định như <code className="text-indigo-300">{'{{appName}}'}</code> nếu muốn.
              </p>
              <div>
                <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Tên mẫu (chỉ hiển thị nội bộ)</label>
                <input value={createForm.label} onChange={e => setCreateForm(f => ({ ...f, label: e.target.value }))} maxLength={120} placeholder="VD: Thông báo bảo trì hệ thống"
                  className="mt-1 h-9 w-full rounded-lg px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-violet-500/60" />
              </div>
              <div>
                <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Tiêu đề thông báo</label>
                <input value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} maxLength={300} placeholder="Tiêu đề hiển thị cho người nhận"
                  className="mt-1 h-9 w-full rounded-lg px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-violet-500/60" />
              </div>
              <div>
                <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Nội dung</label>
                <textarea value={createForm.message} onChange={e => setCreateForm(f => ({ ...f, message: e.target.value }))} maxLength={1000} rows={3} placeholder="Nội dung thông báo"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-violet-500/60 resize-y" />
              </div>
              <div>
                <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Telegram (tuỳ chọn — để trống = dùng tiêu đề + nội dung)</label>
                <textarea value={createForm.telegram} onChange={e => setCreateForm(f => ({ ...f, telegram: e.target.value }))} maxLength={2000} rows={2} placeholder="Markdown nhiều dòng"
                  className="mt-1 w-full rounded-lg px-3 py-2 text-xs text-foreground bg-[#0e1626] border border-line focus:outline-none focus:border-cyan-500/60 resize-y font-mono" />
              </div>
              {tplMsg && tplMsg.type === 'err' && <p className="text-sm text-red-400">{tplMsg.text}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={createGuard.guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={createCustom} disabled={createSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
                {createSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Tạo mẫu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Gửi thủ công */}
      {sendTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setSendTpl(null)}>
          <div className="w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Gửi: {sendTpl.label}</h2>
              <button onClick={() => setSendTpl(null)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-line-subtle p-3 text-xs" style={{ background: 'var(--background)' }}>
                <p className="font-600 text-foreground">{sendTpl.title}</p>
                <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{sendTpl.message}</p>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={sendAllActive} onChange={e => setSendAllActive(e.target.checked)} className="h-4 w-4 rounded accent-indigo-600" />
                Gửi cho <span className="font-600">toàn bộ người dùng đang hoạt động</span>
              </label>
              {!sendAllActive && (
                <div className="space-y-2.5">
                  <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Chọn người nhận</label>
                  <OrgPersonPicker value={sendPicker} onChange={addRecipient} />
                  {sendRecipients.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sendRecipients.map(r => (
                        <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 text-indigo-300 text-2xs px-2.5 py-1">
                          {r.name}
                          <button onClick={() => setSendRecipients(prev => prev.filter(x => x.id !== r.id))} className="hover:text-white"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {sendMsg && <p className={`text-sm ${sendMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{sendMsg.text}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={() => setSendTpl(null)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
              <button onClick={sendCustom} disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
