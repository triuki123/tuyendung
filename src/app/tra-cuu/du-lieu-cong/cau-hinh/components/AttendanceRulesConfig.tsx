'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, SlidersHorizontal, Save, Trash2, Pencil, Clock, CalendarRange, Plus, CalendarCheck } from 'lucide-react';
import {
  ResolvedAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG, mergeAttendanceConfig,
} from '@/lib/config/attendanceConfig';
import { useConfirm } from '@/context/ConfirmContext';

interface Company { id: string; name: string }
interface SettingRow {
  id: string;
  company_id: string | null;
  effective_from: string;
  note: string | null;
  created_at: string;
  config?: Partial<ResolvedAttendanceConfig> | null;
}

const DOW_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function pad(n: number) { return String(n).padStart(2, '0'); }
/** phút trong ngày → "HH:MM" (mod 1440) */
function minToTime(min: number): string { const m = ((min % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
function timeToMin(t: string): number { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); }

export default function AttendanceRulesConfig({ userRole, adminId }: { userRole: string; adminId: string }) {
  const confirm = useConfirm();
  const isSuperAdmin = userRole === 'super_admin';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [scope, setScope] = useState<string>(''); // '' = mặc định hệ thống
  const [versions, setVersions] = useState<SettingRow[]>([]);
  const [cfg, setCfg] = useState<ResolvedAttendanceConfig>(DEFAULT_ATTENDANCE_CONFIG);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const headers = useCallback(
    (json = false): Record<string, string> => ({
      'x-current-user-id': adminId,
      'x-current-user-role': userRole,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [adminId, userRole]
  );

  // Mặc định ngày hiệu lực = ngày bắt đầu kỳ công của kỳ kế tiếp (giờ VN).
  const defaultEffectiveFrom = useCallback((startDay: number): string => {
    const nowVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const [y, m, d] = nowVN.split('-').map(Number);
    // Nếu đã qua ngày bắt đầu kỳ trong tháng → kỳ sau là tháng kế; ngược lại tháng này.
    let ty = y, tm = m;
    if (d >= startDay) { tm = m + 1; if (tm > 12) { tm = 1; ty = y + 1; } }
    return `${ty}-${pad(tm)}-${pad(startDay)}`;
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch('/api/companies', { headers: headers() })
      .then(r => r.json()).then(j => { if (j.success) setCompanies(j.data); }).catch(() => {});
  }, [isSuperAdmin, headers]);

  const loadScope = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true); setMsg(null);
    try {
      const qs = scope ? `?companyId=${scope}` : '';
      const [vRes, cRes] = await Promise.all([
        fetch(`/api/attendance/settings${qs}`, { headers: headers(), cache: 'no-store' }),
        fetch(`/api/attendance/config${scope ? `?companyId=${scope}` : '?companyId='}`, { headers: headers(), cache: 'no-store' }),
      ]);
      const vJson = await vRes.json();
      const cJson = await cRes.json();
      if (vJson.success) setVersions(vJson.data);
      // Normalize qua merge để luôn có weeklySchedule/session (config cũ chưa có sẽ được dựng từ legacy).
      const resolved: ResolvedAttendanceConfig = mergeAttendanceConfig((cJson.success && cJson.data) ? cJson.data : null);
      setCfg(resolved);
      setEffectiveFrom(defaultEffectiveFrom(resolved.payrollStartDay));
      setNote('');
    } finally { setLoading(false); }
  }, [scope, isSuperAdmin, headers, defaultEffectiveFrom]);

  useEffect(() => { loadScope(); }, [loadScope]);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/attendance/settings', {
        method: 'POST', headers: headers(true),
        body: JSON.stringify({ companyId: scope || null, effectiveFrom, config: cfg, note: note || null }),
      });
      const json = await res.json();
      if (!json.success) { setMsg({ type: 'err', text: json.error || 'Lỗi lưu cấu hình' }); return; }
      setMsg({ type: 'ok', text: 'Đã lưu cấu hình. Áp dụng cho kỳ công từ ngày hiệu lực trở đi.' });
      loadScope();
    } catch { setMsg({ type: 'err', text: 'Lỗi kết nối' }); }
    finally { setSaving(false); }
  };

  // Nạp 1 phiên bản đã lưu vào form để SỬA (lưu lại cùng ngày hiệu lực = ghi đè).
  const handleEdit = (v: SettingRow) => {
    setCfg(mergeAttendanceConfig(v.config ?? null));
    setEffectiveFrom(v.effective_from);
    setNote(v.note ?? '');
    setMsg({ type: 'ok', text: `Đang sửa phiên bản hiệu lực từ ${v.effective_from}. Chỉnh xong bấm "Lưu phiên bản" để cập nhật.` });
    if (typeof window !== 'undefined') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: 'Xoá phiên bản cấu hình?', message: 'Xoá phiên bản cấu hình này? Hệ thống sẽ dùng phiên bản hiệu lực trước đó (hoặc mặc định).', confirmLabel: 'Xóa', danger: true }))) return;
    await fetch(`/api/attendance/settings/${id}`, { method: 'DELETE', headers: headers() });
    loadScope();
  };

  if (!isSuperAdmin) return null;

  // Helpers cập nhật cfg
  const set = (patch: Partial<ResolvedAttendanceConfig>) => setCfg(prev => ({ ...prev, ...patch }));
  const setNested = <K extends 'punchWindows' | 'adjustmentDeadline' | 'sheetSubmitDeadline' | 'overtimeBrackets' | 'morningSession' | 'afternoonSession'>(
    key: K, patch: Partial<ResolvedAttendanceConfig[K]>
  ) => setCfg(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // Cập nhật giờ làm của 1 thứ trong tuần (dow 0=CN..6=T7).
  const setDay = (dow: number, patch: Partial<ResolvedAttendanceConfig['weeklySchedule'][number]>) =>
    setCfg(prev => ({ ...prev, weeklySchedule: prev.weeklySchedule.map((s, i) => (i === dow ? { ...s, ...patch } : s)) }));
  const setAnnual = (patch: Partial<ResolvedAttendanceConfig['annualLeavePolicy']>) =>
    setCfg(prev => ({ ...prev, annualLeavePolicy: { ...prev.annualLeavePolicy, ...patch } }));

  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5 text-indigo-400" />
        <h2 className="text-lg font-bold text-foreground">Quy Tắc Chấm Công</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Tuỳ chỉnh giờ làm, kỳ công, deadline, khung tăng ca... theo từng công ty. Mỗi lần lưu tạo một
        <span className="text-foreground font-500"> phiên bản hiệu lực từ ngày chỉ định</span> — không ảnh hưởng số liệu kỳ đã chốt.
      </p>

      {/* Chọn phạm vi */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Phạm vi áp dụng</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none min-w-[240px]"
          >
            <option value="">🌐 Mặc định toàn hệ thống</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          {/* Lịch sử phiên bản */}
          <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="border-b border-line-subtle px-4 py-2.5 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Phiên bản đã lưu ({versions.length})</span>
            </div>
            {versions.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                Chưa có phiên bản riêng — đang dùng {scope ? 'cấu hình mặc định hệ thống' : 'giá trị mặc định trong hệ thống'}.
              </p>
            ) : (
              <div className="divide-y divide-line-subtle">
                {versions.map(v => (
                  <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">Hiệu lực từ <span className="font-600">{v.effective_from}</span></p>
                      {v.note && <p className="text-xs text-muted-foreground truncate">{v.note}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleEdit(v)} className="rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors" title="Sửa phiên bản">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(v.id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Xoá phiên bản">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form cấu hình */}
          <div className="rounded-2xl border border-indigo-500/20 p-4 space-y-5" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-2 text-sm font-600 text-foreground">
              <Plus className="h-4 w-4 text-indigo-400" /> Tạo / cập nhật phiên bản cấu hình
            </div>

            {/* Ngày hiệu lực */}
            <Field label="Ngày hiệu lực (nên là ngày bắt đầu kỳ công)">
              <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none" />
            </Field>

            {/* Kỳ công */}
            <Group title="Kỳ công">
              <NumField label={cfg.payrollStartDay <= 1 ? 'Ngày bắt đầu kỳ (= 1 → theo tháng)' : 'Ngày bắt đầu kỳ (tháng trước)'} value={cfg.payrollStartDay} onChange={(v) => set({ payrollStartDay: num(v) })} min={1} max={31} />
              {!cfg.payrollEndDayIsLastOfMonth && (
                <NumField label={cfg.payrollStartDay <= 1 ? 'Ngày cuối kỳ (cùng tháng)' : 'Ngày cuối kỳ (tháng này)'} value={cfg.payrollEndDay} onChange={(v) => set({ payrollEndDay: num(v) })} min={1} max={31} />
              )}
              <div className="col-span-full flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                  <input type="checkbox" checked={!!cfg.payrollEndDayIsLastOfMonth}
                    onChange={(e) => set({ payrollEndDayIsLastOfMonth: e.target.checked })}
                    className="h-4 w-4 accent-indigo-500" />
                  Kết thúc vào <b>ngày cuối tháng</b> (tự nhận 28/29/30/31)
                </label>
                <p className="text-2xs text-muted-foreground leading-relaxed">
                  💡 Đặt <b className="text-foreground">Ngày bắt đầu = 1</b> nếu kỳ công theo <b>tháng dương lịch</b> (1 → cuối tháng, cùng tháng).
                  Để <b>&gt; 1</b> (vd 28) thì kỳ công vắt qua 2 tháng (vd 28 tháng trước → 27 tháng này).
                </p>
              </div>
            </Group>

            {/* Giờ làm */}
            <Group title="Giờ làm & nghỉ trưa">
              <NumField label="Giờ bắt đầu nghỉ trưa" value={cfg.lunchStartHour} onChange={(v) => set({ lunchStartHour: num(v) })} min={0} max={23} />
              <NumField label="Giờ kết thúc nghỉ trưa" value={cfg.lunchEndHour} onChange={(v) => set({ lunchEndHour: num(v) })} min={0} max={24} />
              <NumField label="Ngưỡng đủ 1 ngày công (phút)" value={cfg.fullWorkdayMinutes} onChange={(v) => set({ fullWorkdayMinutes: num(v) })} min={1} max={1440} />
            </Group>

            {/* Phân loại chấm */}
            <Group title="Khung phân loại lượt chấm (giờ 0–23)">
              <NumField label="Bắt đầu khung VÀO" value={cfg.punchWindows.checkInStart} onChange={(v) => setNested('punchWindows', { checkInStart: num(v) })} min={0} max={23} />
              <NumField label="Kết thúc khung VÀO" value={cfg.punchWindows.checkInEnd} onChange={(v) => setNested('punchWindows', { checkInEnd: num(v) })} min={0} max={23} />
              <NumField label="Bắt đầu khung RA" value={cfg.punchWindows.checkOutStart} onChange={(v) => setNested('punchWindows', { checkOutStart: num(v) })} min={0} max={23} />
            </Group>

            {/* Deadline — thiết kế lại: 2 thẻ rõ ràng, giờ chọn cả phút */}
            <div>
              <p className="mb-2 text-xs font-600 text-indigo-300 uppercase tracking-wider">Deadline &amp; quy tắc bù công</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DeadlineCard
                  title="Hạn gửi Bù Công / Bù Giờ"
                  desc="Sau mốc này, nhân viên KHÔNG gửi được đề xuất bù công cho kỳ. Nếu rơi vào Chủ nhật / ngày lễ sẽ tự lùi về ngày làm trước đó."
                  day={cfg.adjustmentDeadline.day}
                  hour={cfg.adjustmentDeadline.hour}
                  minute={cfg.adjustmentDeadline.minute ?? 0}
                  nextMonth={cfg.adjustmentDeadline.nextMonth ?? false}
                  onDay={(d) => setNested('adjustmentDeadline', { day: d })}
                  onTime={(h, m) => setNested('adjustmentDeadline', { hour: h, minute: m })}
                  onNextMonth={(v) => setNested('adjustmentDeadline', { nextMonth: v })}
                />
                <DeadlineCard
                  title="Thời gian tự gửi Bảng Công"
                  desc="Tới mốc này, hệ thống tự chốt & gửi bảng công của kỳ cho Bộ Phận Chấm Công."
                  day={cfg.sheetSubmitDeadline.day}
                  hour={cfg.sheetSubmitDeadline.hour}
                  minute={cfg.sheetSubmitDeadline.minute ?? 0}
                  nextMonth={cfg.sheetSubmitDeadline.nextMonth ?? false}
                  onDay={(d) => setNested('sheetSubmitDeadline', { day: d })}
                  onTime={(h, m) => setNested('sheetSubmitDeadline', { hour: h, minute: m })}
                  onNextMonth={(v) => setNested('sheetSubmitDeadline', { nextMonth: v })}
                />
              </div>
              <div className="mt-3 max-w-sm">
                <NumField label="Giờ sớm nhất gửi bù công TRONG NGÀY (0–23)" value={cfg.adjustmentSameDayEarliestHour} onChange={(v) => set({ adjustmentSameDayEarliestHour: num(v) })} min={0} max={23} />
                <p className="text-2xs text-muted-foreground mt-1 leading-relaxed">
                  Bù Công / Bù Giờ Vào cho <b>chính ngày hôm nay</b> chỉ được gửi sau giờ này (tránh gửi khi chưa tan làm).
                </p>
              </div>
            </div>

            {/* Giờ làm trong tuần */}
            <Group title="Giờ làm trong tuần">
              <div className="col-span-full space-y-1.5">
                <p className="text-2xs text-muted-foreground leading-relaxed">
                  Bật/tắt ngày làm và đặt giờ vào–ra riêng cho từng thứ. Ngày tắt = nghỉ. Giờ làm dùng để tính đi trễ / về sớm.
                </p>
                {DOW_LABELS.map((lbl, dow) => {
                  const d = cfg.weeklySchedule[dow] ?? DEFAULT_ATTENDANCE_CONFIG.weeklySchedule[dow];
                  return (
                    <div key={dow} className="flex items-center gap-2.5">
                      <span className="w-8 text-xs font-600 text-muted-foreground">{lbl}</span>
                      <button type="button" onClick={() => setDay(dow, { open: !d.open })}
                        className={`w-14 px-2 py-1 rounded-lg text-2xs font-600 border transition-colors ${d.open ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-rose-500/15 border-rose-500/40 text-rose-300'}`}>
                        {d.open ? 'Làm' : 'Nghỉ'}
                      </button>
                      {d.open ? (
                        <div className="flex items-center gap-1.5">
                          <input type="time" value={minToTime(d.startMin)} onChange={(e) => setDay(dow, { startMin: timeToMin(e.target.value) })}
                            className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-foreground focus:border-indigo-500/60 focus:outline-none" />
                          <span className="text-xs text-muted-foreground">–</span>
                          <input type="time" value={minToTime(d.endMin)} onChange={(e) => setDay(dow, { endMin: timeToMin(e.target.value) })}
                            className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-foreground focus:border-indigo-500/60 focus:outline-none" />
                        </div>
                      ) : (
                        <span className="text-2xs text-muted-foreground italic">Ngày nghỉ</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Group>

            {/* Buổi sáng / chiều — cho nghỉ phép nửa buổi */}
            <Group title="Khung buổi sáng / chiều (nghỉ phép nửa buổi)">
              <TimeField label="Buổi sáng — bắt đầu" value={minToTime(cfg.morningSession.startMin)} onChange={(t) => setNested('morningSession', { startMin: timeToMin(t) })} />
              <TimeField label="Buổi sáng — kết thúc" value={minToTime(cfg.morningSession.endMin)} onChange={(t) => setNested('morningSession', { endMin: timeToMin(t) })} />
              <div className="hidden lg:block" />
              <TimeField label="Buổi chiều — bắt đầu" value={minToTime(cfg.afternoonSession.startMin)} onChange={(t) => setNested('afternoonSession', { startMin: timeToMin(t) })} />
              <TimeField label="Buổi chiều — kết thúc" value={minToTime(cfg.afternoonSession.endMin)} onChange={(t) => setNested('afternoonSession', { endMin: timeToMin(t) })} />
              <div className="col-span-full space-y-2 border-t border-line-subtle pt-3 mt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={cfg.halfDayLeaveValue != null}
                    onChange={(e) => set({ halfDayLeaveValue: e.target.checked ? 0.5 : null })}
                    className="h-4 w-4 accent-indigo-500" />
                  <span className="text-2xs text-muted-foreground">
                    Nghỉ phép <span className="text-foreground font-600">nửa buổi tính cố định</span> (không theo giờ thực) —
                    dùng khi 2 buổi lệch nhau nhưng muốn mỗi buổi trừ quỹ như nhau.
                  </span>
                </label>
                {cfg.halfDayLeaveValue != null && (
                  <div className="max-w-[200px]">
                    <label className="text-2xs text-muted-foreground">Số ngày phép trừ mỗi buổi</label>
                    <input type="number" step="0.05" min={0} max={1} value={cfg.halfDayLeaveValue}
                      onChange={(e) => set({ halfDayLeaveValue: e.target.value === '' ? 0 : Number(e.target.value) })}
                      className="h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none" />
                  </div>
                )}
              </div>
            </Group>

            {/* Chính sách phép năm — dùng chung phạm vi + ngày hiệu lực của phiên bản chấm công. */}
            <div className="rounded-2xl border border-teal-500/25 bg-teal-500/[0.04] p-4 space-y-4">
              <div className="flex items-start gap-2">
                <CalendarCheck className="mt-0.5 h-4 w-4 text-teal-400" />
                <div>
                  <p className="text-xs font-700 text-teal-300 uppercase tracking-wider">Chính sách phép năm</p>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    Áp dụng theo đúng phạm vi và ngày hiệu lực của phiên bản này. Phép được cấp hằng tháng vào ngày đã chọn.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={cfg.annualLeavePolicy.enabled}
                  onChange={(e) => setAnnual({ enabled: e.target.checked })}
                  className="h-4 w-4 accent-teal-500" />
                Tự động cấp phép năm
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NumField label="Hạn mức phép năm (ngày)" value={cfg.annualLeavePolicy.baseDaysPerYear}
                  onChange={(v) => setAnnual({ baseDaysPerYear: num(v) })} min={0} max={366} step="0.5" />
                <NumField label="Ngày cấp phép hằng tháng" value={cfg.annualLeavePolicy.accrualDay}
                  onChange={(v) => setAnnual({ accrualDay: num(v) })} min={1} max={31} />
                <div>
                  <label className="mb-1 block text-2xs text-muted-foreground">Số phép cấp mỗi tháng</label>
                  <div className="h-9 flex items-center rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground">
                    {(cfg.annualLeavePolicy.baseDaysPerYear / 12).toFixed(2)} ngày
                  </div>
                </div>
                <NumField label="Thưởng thâm niên (ngày)" value={cfg.annualLeavePolicy.seniorityBonusDays}
                  onChange={(v) => setAnnual({ seniorityBonusDays: num(v) })} min={0} max={366} step="0.5" />
                <NumField label="Mỗi số năm thâm niên" value={cfg.annualLeavePolicy.seniorityEveryYears}
                  onChange={(v) => setAnnual({ seniorityEveryYears: num(v) })} min={1} max={100} />
                <NumField label="Tối đa chuyển sang năm sau" value={cfg.annualLeavePolicy.carryoverMaxDays}
                  onChange={(v) => setAnnual({ carryoverMaxDays: num(v) })} min={0} max={366} step="0.5" />
                <Field label="Ngày hết hạn phép chuyển năm (MM-DD)">
                  <input value={cfg.annualLeavePolicy.carryoverExpiryMMDD}
                    onChange={(e) => setAnnual({ carryoverExpiryMMDD: e.target.value })}
                    placeholder="03-31" maxLength={5}
                    className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-teal-500/60 focus:outline-none" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line-subtle pt-3">
                <Check label="Cho phép nghỉ theo giờ" checked={cfg.annualLeavePolicy.allowHourly}
                  onChange={(v) => setAnnual({ allowHourly: v })} />
                <Check label="Cho phép nghỉ theo buổi" checked={cfg.annualLeavePolicy.allowHalfDay}
                  onChange={(v) => setAnnual({ allowHalfDay: v })} />
                <Check label="Tính cả Chủ nhật" checked={cfg.annualLeavePolicy.countSunday}
                  onChange={(v) => setAnnual({ countSunday: v })} />
              </div>
              <p className="text-2xs text-muted-foreground">
                Nếu chọn ngày 29–31 nhưng tháng ngắn hơn, hệ thống cấp vào ngày cuối cùng của tháng.
              </p>
            </div>

            {/* Tăng ca */}
            <Group title="Khung tăng ca (giờ VN)">
              <TimeField label="Bắt đầu khung tối" value={minToTime(cfg.overtimeBrackets.eveningStartMin)} onChange={(t) => setNested('overtimeBrackets', { eveningStartMin: timeToMin(t) })} />
              <TimeField label="Kết thúc khung tối" value={minToTime(cfg.overtimeBrackets.eveningEndMin)} onChange={(t) => setNested('overtimeBrackets', { eveningEndMin: timeToMin(t) })} />
              <TimeField label="Kết thúc khung đêm (sáng hôm sau)" value={minToTime(cfg.overtimeBrackets.nightEndMin)} onChange={(t) => setNested('overtimeBrackets', { nightEndMin: 1440 + timeToMin(t) })} />
            </Group>

            {/* Ghi chú */}
            <Field label="Ghi chú (tuỳ chọn)">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Áp dụng quy định mới từ Q3"
                className="h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none" />
            </Field>

            {msg && (
              <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
            )}

            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving || !effectiveFrom}
                className="btn-indigo inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-40">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Đang lưu...' : 'Lưu phiên bản'}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Cấu hình áp dụng cho kỳ công có ngày làm ≥ ngày hiệu lực. Bảng công đã nộp/duyệt không bị tính lại.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── UI con ──────────────────────────────────────────────────────────────────
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-600 text-indigo-300 uppercase tracking-wider">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-600 text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: string) => void; min?: number; max?: number; step?: number | string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-2xs text-muted-foreground">{label}</label>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none" />
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-teal-500" />
      {label}
    </label>
  );
}

/** Thẻ cấu hình 1 mốc deadline: Ngày trong kỳ + Giờ (HH:MM có phút). */
function DeadlineCard({ title, desc, day, hour, minute, nextMonth, onDay, onTime, onNextMonth }: {
  title: string; desc: string;
  day: number; hour: number; minute: number; nextMonth: boolean;
  onDay: (d: number) => void; onTime: (h: number, m: number) => void; onNextMonth: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-line-subtle p-3.5 space-y-3" style={{ background: 'var(--secondary)' }}>
      <div>
        <p className="text-sm font-600 text-foreground">{title}</p>
        <p className="text-2xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-2xs text-muted-foreground">Ngày ({nextMonth ? 'tháng kế tiếp' : 'trong kỳ'}, 1–31)</label>
          <input type="number" value={day} min={1} max={31} onChange={(e) => onDay(e.target.value === '' ? 0 : Number(e.target.value))}
            className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-2xs text-muted-foreground">Giờ hạn (giờ:phút)</label>
          <input type="time" value={`${pad(hour)}:${pad(minute)}`}
            onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); onTime(h || 0, m || 0); }}
            className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none" />
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={nextMonth} onChange={(e) => onNextMonth(e.target.checked)}
          className="h-4 w-4 accent-indigo-500" />
        <span className="text-2xs text-muted-foreground">
          Mốc rơi vào <span className="text-foreground font-600">tháng kế tiếp</span> của kỳ
          <span className="opacity-70"> (dùng khi kỳ theo tháng dương lịch, hạn là ngày đầu tháng sau)</span>
        </span>
      </label>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-2xs text-muted-foreground">{label}</label>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none" />
    </div>
  );
}
