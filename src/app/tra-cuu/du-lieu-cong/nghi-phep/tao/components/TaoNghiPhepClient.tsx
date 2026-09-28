'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock, Loader2, Send, Sunrise } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import { fmtDays } from '@/lib/format';

interface LeaveTypeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  paid_by: 'company' | 'insurance' | 'unpaid';
  deducts_balance: boolean;
  max_days: number | null;
  max_days_scope: 'per_year' | 'per_occurrence';
  allow_hourly: boolean;
  allow_half_day: boolean;
  color: string;
}

function readCurrentUser(): { id: string; role: string } | null {
  try {
    const raw = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (!raw) return null;
    const u = JSON.parse(raw);
    return { id: u.id ?? '', role: u.role ?? 'user' };
  } catch {
    return null;
  }
}

const PAID_BY_LABEL: Record<LeaveTypeRow['paid_by'], string> = {
  company: 'Công ty trả lương',
  insurance: 'Hưởng chế độ BHXH',
  unpaid: 'Không hưởng lương',
};

/** Phút trong ngày → "HH:MM". */
function minToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
const DEFAULT_MORNING = { startMin: 8 * 60, endMin: 12 * 60 };
const DEFAULT_AFTERNOON = { startMin: 13 * 60, endMin: 17 * 60 };

export default function TaoNghiPhepClient() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('user');

  const [types, setTypes] = useState<LeaveTypeRow[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);

  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const [typeId, setTypeId] = useState('');
  // uiMode: 'day' | 'half' (buổi Sáng/Chiều) | 'hour' (theo giờ tự do). Backend chỉ có day/hour.
  const [uiMode, setUiMode] = useState<'day' | 'half' | 'hour'>('day');
  const mode: 'day' | 'hour' = uiMode === 'day' ? 'day' : 'hour';
  const [startDate, setStartDate] = useState(todayISO);
  const [endDate, setEndDate] = useState(todayISO);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [sessions, setSessions] = useState<{ morning: { startMin: number; endMin: number }; afternoon: { startMin: number; endMin: number } } | null>(null);
  const [halfDayLeaveValue, setHalfDayLeaveValue] = useState<number | null>(null);
  const [dayPart, setDayPart] = useState<'morning' | 'afternoon' | null>(null);
  const [reason, setReason] = useState('');

  const [previewDays, setPreviewDays] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = useMemo(() => types.find((t) => t.id === typeId) ?? null, [types, typeId]);

  useEffect(() => {
    const u = readCurrentUser();
    if (u) {
      setUserId(u.id);
      setRole(u.role);
    }
    // Deep-link ?date=YYYY-MM-DD (từ trang Yêu Cầu Của Tôi) → prefill ngày bắt đầu/kết thúc
    try {
      const d = new URLSearchParams(window.location.search).get('date');
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        setStartDate(d);
        setEndDate(d);
      }
    } catch { /* bỏ qua */ }
  }, []);

  // Khung buổi sáng / chiều theo cấu hình công ty (cho nút nghỉ nửa buổi)
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await fetch('/api/attendance/config', {
          headers: { 'x-current-user-id': userId, 'x-current-user-role': role },
        });
        const json = await res.json();
        if (res.ok && json.success && json.data?.morningSession && json.data?.afternoonSession) {
          setSessions({ morning: json.data.morningSession, afternoon: json.data.afternoonSession });
          setHalfDayLeaveValue(json.data.halfDayLeaveValue ?? null);
        }
      } catch { /* dùng mặc định 08:00–12:00 / 13:00–17:00 */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Load loại phép
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await fetch('/api/leave/types', {
          headers: { 'x-current-user-id': userId, 'x-current-user-role': role },
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setTypes(json.data);
          const annual = json.data.find((t: LeaveTypeRow) => t.deducts_balance);
          if (annual) setTypeId(annual.id);
          else if (json.data[0]) setTypeId(json.data[0].id);
        }
      } catch {
        /* hiện empty */
      } finally {
        setLoadingTypes(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Số dư phép năm (hiện khi chọn loại trừ quỹ)
  useEffect(() => {
    if (!userId || !selectedType?.deducts_balance) {
      setBalance(null);
      return;
    }
    (async () => {
      try {
        const year = Number(startDate.slice(0, 4));
        const res = await fetch(`/api/leave/balance?year=${year}`, {
          headers: { 'x-current-user-id': userId, 'x-current-user-role': role },
        });
        const json = await res.json();
        if (res.ok && json.success) setBalance(Number(json.data.balance));
      } catch {
        setBalance(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedType?.id, startDate.slice(0, 4)]);

  // Loại không cho hình thức đang chọn → ép về Theo ngày
  useEffect(() => {
    if (!selectedType) return;
    if (uiMode === 'hour' && !selectedType.allow_hourly) setUiMode('day');
    if (uiMode === 'half' && !selectedType.allow_half_day) setUiMode('day');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType?.id]);

  // Preview số ngày công bị trừ
  useEffect(() => {
    if (mode === 'hour') {
      // Nghỉ nửa buổi + công ty cấu hình giá trị cố định → trừ đúng giá trị đó.
      if (dayPart && halfDayLeaveValue != null) { setPreviewDays(halfDayLeaveValue); return; }
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const hours = (eh * 60 + em - sh * 60 - sm) / 60;
      setPreviewDays(hours > 0 ? Math.round((hours / 8) * 100) / 100 : null);
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      setPreviewDays(null);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/leave/preview?start=${startDate}&end=${endDate}${typeId ? `&leaveTypeId=${typeId}` : ''}`, {
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (res.ok && json.success) setPreviewDays(Number(json.days));
      } catch {
        /* bỏ qua */
      }
    })();
    return () => ctrl.abort();
  }, [mode, startDate, endDate, startTime, endTime, dayPart, halfDayLeaveValue, typeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!typeId || !reason.trim()) {
      setError('Vui lòng chọn loại phép và nhập lý do');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/leave/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-user-id': userId,
          'x-current-user-role': role,
        },
        body: JSON.stringify({
          leave_type_id: typeId,
          mode,
          day_part: uiMode === 'half' ? dayPart : undefined,
          start_date: startDate,
          end_date: mode === 'hour' ? startDate : endDate,
          start_time: mode === 'hour' ? startTime : undefined,
          end_time: mode === 'hour' ? endTime : undefined,
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        router.push('/tra-cuu/du-lieu-cong/nghi-phep');
      } else {
        setError(json.error ?? 'Không gửi được đơn');
      }
    } catch {
      setError('Lỗi kết nối — thử lại sau');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      <Link
        href="/tra-cuu/du-lieu-cong/nghi-phep"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Nghỉ Phép
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Tạo Nghỉ Phép</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Đơn sẽ được gửi đến Quản Lý Trực Tiếp của bạn để xét duyệt
        </p>
      </div>

      {loadingTypes ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
          {/* Loại phép */}
          <div
            className="rounded-2xl border border-line-subtle p-5 space-y-4"
            style={{ background: 'var(--card)' }}
          >
            <div>
              <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                Loại phép
              </label>
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {selectedType && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">{selectedType.description}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-line bg-hover px-2 py-0.5 text-xs text-muted-foreground">
                      {PAID_BY_LABEL[selectedType.paid_by]}
                    </span>
                    {selectedType.max_days != null && (
                      <span className="rounded-full border border-line bg-hover px-2 py-0.5 text-xs text-muted-foreground">
                        Tối đa {selectedType.max_days} ngày
                        {selectedType.max_days_scope === 'per_year' ? '/năm' : '/lần'}
                      </span>
                    )}
                    {selectedType.deducts_balance && balance != null && (
                      <span className="rounded-full border border-teal-500/30 bg-teal-500/15 px-2 py-0.5 text-xs font-500 text-teal-400">
                        Còn {fmtDays(balance)} ngày phép năm
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Hình thức nghỉ — Ngày / Buổi (Sáng-Chiều) / Giờ */}
            <div>
              <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                Hình thức nghỉ
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setUiMode('day'); setDayPart(null); }}
                  className={`flex-1 min-w-[110px] inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    uiMode === 'day'
                      ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300 font-600'
                      : 'border-line bg-hover text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <CalendarDays className="h-4 w-4" /> Theo ngày
                </button>
                {selectedType?.allow_half_day && (
                  <button
                    type="button"
                    onClick={() => {
                      setUiMode('half');
                      const mor = sessions?.morning ?? DEFAULT_MORNING;
                      setStartTime(minToHHMM(mor.startMin));
                      setEndTime(minToHHMM(mor.endMin));
                      setDayPart('morning');
                    }}
                    className={`flex-1 min-w-[110px] inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      uiMode === 'half'
                        ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300 font-600'
                        : 'border-line bg-hover text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sunrise className="h-4 w-4" /> Theo buổi
                  </button>
                )}
                {selectedType?.allow_hourly && (
                  <button
                    type="button"
                    onClick={() => { setUiMode('hour'); setDayPart(null); }}
                    className={`flex-1 min-w-[110px] inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      uiMode === 'hour'
                        ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300 font-600'
                        : 'border-line bg-hover text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Clock className="h-4 w-4" /> Theo giờ
                  </button>
                )}
              </div>
              {selectedType && !selectedType.allow_hourly && !selectedType.allow_half_day && (
                <p className="mt-1.5 text-xs text-muted-foreground">Loại phép này chỉ nghỉ trọn ngày</p>
              )}
            </div>

            {/* Thời gian */}
            {uiMode === 'day' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                    Từ ngày
                  </label>
                  <DateInputVN
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (e.target.value > endDate) setEndDate(e.target.value);
                    }}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                    Đến ngày
                  </label>
                  <DateInputVN
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    required
                  />
                </div>
              </div>
            ) : uiMode === 'half' ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                    Ngày nghỉ
                  </label>
                  <DateInputVN
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    required
                  />
                </div>
                {(() => {
                  const mor = sessions?.morning ?? DEFAULT_MORNING;
                  const aft = sessions?.afternoon ?? DEFAULT_AFTERNOON;
                  const pickHalf = (part: 'morning' | 'afternoon', s: { startMin: number; endMin: number }) => {
                    setStartTime(minToHHMM(s.startMin));
                    setEndTime(minToHHMM(s.endMin));
                    setDayPart(part);
                  };
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => pickHalf('morning', mor)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-600 transition-colors ${dayPart === 'morning' ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                        Buổi sáng<span className="block text-xs font-400 opacity-70">{minToHHMM(mor.startMin)}–{minToHHMM(mor.endMin)}</span>
                      </button>
                      <button type="button" onClick={() => pickHalf('afternoon', aft)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-600 transition-colors ${dayPart === 'afternoon' ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                        Buổi chiều<span className="block text-xs font-400 opacity-70">{minToHHMM(aft.startMin)}–{minToHHMM(aft.endMin)}</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                    Ngày nghỉ
                  </label>
                  <DateInputVN
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                    Từ giờ
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => { setStartTime(e.target.value); setDayPart(null); }}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                    Đến giờ
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => { setEndTime(e.target.value); setDayPart(null); }}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    required
                  />
                </div>
              </div>
            )}

            {/* Preview */}
            {previewDays != null && previewDays > 0 && (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-300">
                Đơn này sẽ tính <span className="font-700">{previewDays} ngày công</span>
                {mode === 'day' && ' (đã bỏ Chủ Nhật và ngày lễ)'}
                {selectedType?.deducts_balance && balance != null && (
                  <span className="text-indigo-400/80">
                    {' '}— quỹ phép năm còn lại sau khi duyệt: {fmtDays(balance - previewDays)} ngày
                  </span>
                )}
              </div>
            )}

            {/* Lý do */}
            <div>
              <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                Lý do
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Nhập lý do xin nghỉ..."
                className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none"
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Link
              href="/tra-cuu/du-lieu-cong/nghi-phep"
              className="btn-ghost rounded-xl px-4 py-2.5 text-sm"
            >
              Hủy
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="btn-indigo inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-600 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Gửi đơn
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
