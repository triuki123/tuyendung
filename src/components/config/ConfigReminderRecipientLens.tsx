'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import {
  ReminderType, ReminderSetting, RecipientRuleType, RecipientRule,
  DEFAULT_REMINDERS, DEFAULT_RECIPIENT_RULES,
} from '@/lib/config/systemConfig';

/**
 * Lens cấu hình Nhắc nhở + Người nhận, đọc/ghi CÙNG nguồn với
 * "Cấu Hình Hệ Thống" (/api/system-config → system_settings). Nhúng vào từng
 * module để admin cấu hình tại chỗ; mọi thay đổi đồng bộ ngay với CHHT.
 *
 * Chỉ render đúng các loại được truyền vào (reminderTypes / recipientTypes) —
 * khi PUT cũng chỉ gửi đúng subset đó, không đụng cấu hình của module khác.
 */

const REMINDER_LABELS: Record<ReminderType, { label: string; desc: string }> = {
  contract:          { label: 'Hợp đồng sắp hết hạn',       desc: 'Nhắc C&B chuẩn bị gia hạn hợp đồng lao động' },
  leave_balance:     { label: 'Phép năm sắp hết hạn',       desc: 'Nhắc nhân viên dùng phép chuyển năm trước khi hết hạn' },
  asset_maintenance: { label: 'Bảo trì / bảo hành tài sản', desc: 'Nhắc trước khi tài sản tới hạn bảo trì hoặc hết bảo hành' },
  evaluation:        { label: 'Đánh giá thử việc',          desc: 'Nhắc C&B/quản lý khi sắp tới hạn đánh giá thử việc' },
  requisition:       { label: 'Yêu cầu tuyển dụng',         desc: 'Nhắc bộ phận tuyển dụng khi yêu cầu sắp tới hạn đóng' },
  legal_document:    { label: 'Giấy phép / văn bản pháp lý', desc: 'Nhắc nhóm pháp chế trước khi giấy phép, ủy quyền hết hạn' },
  legal_contract:    { label: 'Hợp đồng thương mại',        desc: 'Nhắc trước khi hợp đồng với đối tác hết hiệu lực' },
};

const RECIPIENT_LABELS: Record<RecipientRuleType, { label: string; desc: string; usersOnly?: boolean }> = {
  evaluation:        { label: 'Nhắc đánh giá thử việc',  desc: 'Ai nhận thông báo khi sắp tới hạn / tự tạo thẻ đánh giá' },
  asset_maintenance: { label: 'Nhắc bảo trì tài sản',    desc: 'Ai nhận thông báo bảo hành/bảo trì cho tài sản không có người dùng' },
  hr_general:        { label: 'Thông báo Quản Lý Hồ Sơ', desc: 'Ai nhận thông báo nghiệp vụ HR (bản nháp thỏa thuận onboarding…)', usersOnly: true },
  room_booking:      { label: 'Thông báo Đặt Phòng Họp', desc: 'Ai nhận thông báo khi có yêu cầu đặt phòng họp mới chờ duyệt', usersOnly: true },
  birthday:          { label: 'Thông báo Sinh Nhật',     desc: 'Ai nhận danh sách sinh nhật đầu tháng + nhắc BOD & Leader đúng ngày' },
  legal:             { label: 'Nhắc hạn Pháp Chế',        desc: 'Ai nhận nhắc giấy phép/hợp đồng sắp hết hạn. Chỉ người CÓ quyền Pháp Chế mới thực nhận (tự lọc, chống lộ thông tin)' },
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Quản lý' },
  { value: 'user', label: 'Người dùng' },
];

interface PickUser { id: string; name: string; role: string }

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

interface Props {
  reminderTypes?: ReminderType[];
  recipientTypes?: RecipientRuleType[];
  /** Cho phép sửa (thường = super_admin). Mặc định true. */
  canEdit?: boolean;
}

export default function ConfigReminderRecipientLens({
  reminderTypes = [],
  recipientTypes = [],
  canEdit = true,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [reminderText, setReminderText] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<Record<string, RecipientRule>>({});
  const [users, setUsers] = useState<PickUser[]>([]);
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system-config', { headers: authHeaders(), cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        const rem = (json.data.reminders || {}) as Record<ReminderType, ReminderSetting>;
        setReminderText(Object.fromEntries(
          reminderTypes.map(t => [t, (rem[t]?.milestones ?? DEFAULT_REMINDERS[t].milestones).join(', ')])
        ));
        const rr = (json.data.recipientRules || {}) as Record<RecipientRuleType, RecipientRule>;
        setRules(Object.fromEntries(
          recipientTypes.map(t => [t, rr[t] ?? JSON.parse(JSON.stringify(DEFAULT_RECIPIENT_RULES[t]))])
        ));
      }
    } catch { /* noop */ } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (recipientTypes.length === 0) return;
    (async () => {
      try {
        const res = await fetch('/api/users', { headers: authHeaders(), cache: 'no-store' });
        const json = await res.json();
        const list: PickUser[] = (Array.isArray(json) ? json : json.data || [])
          .map((u: { id: string; name: string; role: string }) => ({ id: u.id, name: u.name, role: u.role }));
        setUsers(list);
      } catch { /* noop */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userName = (id: string) => users.find(u => u.id === id)?.name || id;
  const toggleRole = (t: string, role: string) => setRules(p => {
    const r = p[t]; const on = r.roles.includes(role);
    return { ...p, [t]: { ...r, roles: on ? r.roles.filter(x => x !== role) : [...r.roles, role] } };
  });
  const toggleHrEditors = (t: string) => setRules(p => ({ ...p, [t]: { ...p[t], includeHrEditors: !p[t].includeHrEditors } }));
  const addUserId = (t: string, id: string) => setRules(p => p[t].userIds.includes(id) ? p : ({ ...p, [t]: { ...p[t], userIds: [...p[t].userIds, id] } }));
  const removeUserId = (t: string, id: string) => setRules(p => ({ ...p, [t]: { ...p[t], userIds: p[t].userIds.filter(x => x !== id) } }));

  const parseMilestones = (text: string): number[] =>
    text.split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => Number.isInteger(n) && n >= 0 && n <= 365);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (reminderTypes.length) body.reminders = reminderTypes.map(t => ({ type: t, milestones: parseMilestones(reminderText[t] ?? '') }));
      if (recipientTypes.length) body.recipientRules = recipientTypes.map(t => ({ type: t, ...rules[t] }));
      const res = await fetch('/api/system-config', { method: 'PUT', headers: authHeaders(true), body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) { setMsg({ type: 'err', text: json.error || 'Lỗi lưu cấu hình' }); return; }
      setMsg({ type: 'ok', text: 'Đã lưu. Áp dụng từ lần chạy nhắc kế tiếp.' });
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Lỗi mạng' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-muted-foreground leading-relaxed">
        Cấu hình này dùng chung với <span className="text-foreground font-600">Cấu Hình Hệ Thống → Nhắc nhở / Người nhận</span>.
        Sửa ở đây hay ở đó đều cùng một nguồn. Thay đổi áp dụng từ lần chạy nhắc kế tiếp.
      </div>

      {reminderTypes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-600 text-foreground">Mốc nhắc trước hạn (ngày)</p>
          {reminderTypes.map(t => (
            <div key={t} className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-600 text-foreground">{REMINDER_LABELS[t].label}</p>
                  <p className="text-xs text-muted-foreground">{REMINDER_LABELS[t].desc}</p>
                </div>
                <input
                  value={reminderText[t] ?? ''} disabled={!canEdit}
                  onChange={(e) => setReminderText(prev => ({ ...prev, [t]: e.target.value }))}
                  placeholder="VD: 30, 15, 5, 1"
                  className="h-9 w-full sm:w-56 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {recipientTypes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-600 text-foreground">Người nhận thông báo</p>
          {recipientTypes.map(type => {
            const rule = rules[type];
            if (!rule) return null;
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
                            <button key={r.value} type="button" disabled={!canEdit} onClick={() => toggleRole(type, r.value)}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-600 transition-colors disabled:opacity-50 ${on ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input type="checkbox" disabled={!canEdit} checked={rule.includeHrEditors} onChange={() => toggleHrEditors(type)} className="accent-indigo-600" />
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
                        {canEdit && <button type="button" onClick={() => removeUserId(type, id)} className="text-muted-foreground hover:text-red-300"><X className="h-3 w-3" /></button>}
                      </span>
                    ))}
                    {rule.userIds.length === 0 && <span className="text-xs text-muted-foreground/60">Chưa chọn ai</span>}
                  </div>
                  {canEdit && (
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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-600 btn-accent disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
          {msg && <span className={`text-xs ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
