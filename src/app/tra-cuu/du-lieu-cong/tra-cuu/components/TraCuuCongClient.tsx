'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  AlertCircle, Download, RefreshCw,
  Smartphone, Fingerprint, Layers, Send,
} from 'lucide-react';
import { useAttendanceRealtimeContext } from '@/context/AttendanceRealtimeContext';
import { FingerprintMonthlyTable } from './FingerprintMonthlyTable';
import { AppMonthlyTable } from './AppMonthlyTable';
import TangCaModal from './TangCaModal';
import BuCongModal, { type BuCongType } from './BuCongModal';
import { fmtOTHours } from '@/lib/utils/overtimeUtils';
import { ResolvedAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG, getPayrollPeriodForDate, getPayrollPeriodDates } from '@/lib/config/attendanceConfig';

/** Hôm nay theo giờ VN dạng YYYY-MM-DD (để map vào kỳ công). */
function vnTodayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface AttendanceRecord {
  id: string;
  event_type: 'check_in' | 'check_out';
  type: 'app' | 'machine';
  recorded_at: string;
  lat: number | null;
  lng: number | null;
  photo_mime: string | null;
  notes: string | null;
}

interface DailyAttendance {
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_minutes: number;
  has_checkin: boolean;
  has_checkout: boolean;
  records: AttendanceRecord[];
}

interface Sheet {
  id: string;
  status: string;
  total_days: number;
  total_hours: number;
  submitted_at: string | null;
  comment: string | null;
}

interface OvertimeEntry {
  id: string;
  status: string;
  start_time: string;
  end_time: string;
  evening_hours: number;
  night_hours: number;
  reason: string | null;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TraCuuCongClient() {
  const searchParams = useSearchParams();
  const nowRef = new Date();
  // Mặc định mở KỲ CÔNG hiện tại (theo mốc 28→27), không phải tháng dương lịch.
  // VD ngày 28/6 → kỳ công tháng 7 (28/6–27/7). Dùng DEFAULT khi chưa fetch config (startDay=28 khớp).
  const initPeriod = getPayrollPeriodForDate(vnTodayStr(), DEFAULT_ATTENDANCE_CONFIG);
  const [month, setMonth]     = useState(initPeriod.month);
  const [year, setYear]       = useState(initPeriod.year);
  const [days, setDays]       = useState<DailyAttendance[]>([]);
  const [sheet, setSheet]     = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<'app' | 'machine' | 'all'>(
    (searchParams?.get('tab') as 'app' | 'machine' | 'all') ?? 'all'
  );
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [userId, setUserId]     = useState('');
  const [userRole, setUserRole] = useState('');
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SSE realtime — lắng nghe punch mới từ máy chấm công
  const { lastEvent, connected: sseConnected } = useAttendanceRealtimeContext();

  // Tăng Ca state
  const [config, setConfig] = useState<ResolvedAttendanceConfig>(DEFAULT_ATTENDANCE_CONFIG);
  const [overtimeMap,  setOvertimeMap]  = useState<Record<string, OvertimeEntry>>({});
  const [tangCaModal,  setTangCaModal]  = useState<string | null>(null); // date string
  // deep-link ?buCong= — kèm đơn hiện có của ngày đó (nếu có) để modal mở readonly thay vì form trắng dính 409
  const [buCongModal,  setBuCongModal]  = useState<{
    date: string;
    existing: { id: string; adjustment_type: string; status: string; reason: string | null;
                requested_checkin: string | null; requested_checkout: string | null } | null;
  } | null>(null);
  const deepLinkDone = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUserId(u.id ?? '');
        setUserRole(u.role ?? '');
      } catch { /* empty */ }
    }
  }, []);

  // Khi có punch mới từ SSE → refetch data (debounce 1.5s để gộp hàng loạt punch khi sync)
  useEffect(() => {
    if (!lastEvent) return;
    const cur = getPayrollPeriodForDate(vnTodayStr(), config);
    const isCurrentMonth = month === cur.month && year === cur.year;
    if (!isCurrentMonth) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData(true);
      fetchOvertimes();
    }, 1500);
  // fetchData/fetchOvertimes thay đổi khi userId/month/year đổi — không cần trong dep array của effect này
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  // Load overtime data của tháng
  const fetchOvertimes = useCallback(async () => {
    if (!userId) return;
    try {
      const { startDate, endDate } = getPayrollPeriodDates(month, year, config);
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await fetch(
        `/api/attendance/overtime?selfOnly=1&start_date=${fmtDate(startDate)}&end_date=${fmtDate(endDate)}`,
        { headers: { 'x-current-user-id': userId, 'x-current-user-role': userRole } }
      );
      const json = await res.json();
      if (json.success) {
        const map: Record<string, OvertimeEntry> = {};
        for (const ot of json.data) {
          // work_date từ DB có thể về dạng "2026-06-06T17:00:00.000Z" (UTC) nếu server UTC+7
          // → dùng timezone VN để lấy đúng ngày local, tránh lệch 1 ngày
          const dateKey = new Date(ot.work_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
          map[dateKey] = {
            id:            ot.id,
            status:        ot.status,
            start_time:    ot.start_time,
            end_time:      ot.end_time,
            evening_hours: Number(ot.evening_hours),
            night_hours:   Number(ot.night_hours),
            reason:        ot.reason ?? null,
          };
        }
        setOvertimeMap(map);
      }
    } catch { /* silent */ }
  }, [userId, userRole, month, year, config]);

  const fetchData = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      // Cấu hình theo kỳ (neo ngày 15) — để client tính giờ/CN/ngưỡng/khung khớp server.
      const anchor = `${year}-${String(month).padStart(2, '0')}-15`;
      fetch(`/api/attendance/config?date=${anchor}`, { headers: { 'x-current-user-id': userId } })
        .then(r => r.json())
        .then(j => {
          if (!j.success || !j.data) return;
          // Chỉ set khi nội dung thực sự đổi — tránh đổi reference vô ích gây
          // fetchOvertimes (dep: config) tạo lại → effect chạy lại → lặp vô hạn "Đang tải".
          setConfig(prev => JSON.stringify(prev) === JSON.stringify(j.data) ? prev : j.data);
        })
        .catch(() => {});

      const res = await fetch(`/api/attendance/my-records?month=${month}&year=${year}`, {
        headers: { 'x-current-user-id': userId },
      });
      const json = await res.json();
      if (json.success) {
        setDays(json.data.days);
        setSheet(json.data.sheet);
        setLastRefresh(new Date());
      }
    } finally { if (!silent) setLoading(false); }
  }, [userId, month, year]);

  // Read query param tab từ URL
  useEffect(() => {
    const tabParam = searchParams?.get('tab') as 'app' | 'machine' | 'all' | null;
    if (tabParam && (tabParam === 'app' || tabParam === 'machine' || tabParam === 'all')) {
      setTab(tabParam);
    }
  }, [searchParams]);

  // Deep-link từ trang Yêu Cầu Của Tôi: ?buCong=YYYY-MM-DD / ?tangCa=YYYY-MM-DD.
  // Trước khi mở modal phải: (1) chuyển kỳ công đang xem về đúng ngày, (2) nạp đơn/OT
  // HIỆN CÓ của ngày đó để modal biết trạng thái thật (mở form trắng sẽ dính 409),
  // (3) xóa query param để F5/Back không mở lại.
  useEffect(() => {
    if (!userId || deepLinkDone.current) return;
    const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const buCong = searchParams?.get('buCong') ?? null;
    const tangCa = searchParams?.get('tangCa') ?? null;
    if (!isDate(buCong) && !isDate(tangCa)) return;
    deepLinkDone.current = true;

    const target = (isDate(buCong) ? buCong : tangCa) as string;
    const period = getPayrollPeriodForDate(target, config);
    setMonth(period.month);
    setYear(period.year);
    const hdrs = { 'x-current-user-id': userId, 'x-current-user-role': userRole };

    (async () => {
      try {
        if (isDate(buCong)) {
          const res = await fetch(`/api/attendance/adjustments?selfOnly=1&month=${Number(buCong.slice(5, 7))}&year=${Number(buCong.slice(0, 4))}`, { headers: hdrs });
          const json = await res.json().catch(() => ({}));
          const rows: Array<{ id: string; adjustment_type: string; work_date: string; status: string; reason: string | null; requested_checkin: string | null; requested_checkout: string | null }> = json?.data ?? [];
          const found = rows.find(r => new Date(r.work_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === buCong) ?? null;
          setBuCongModal({ date: buCong, existing: found });
        } else if (isDate(tangCa)) {
          // Nạp OT của kỳ chứa ngày này TRƯỚC khi mở modal — overtimeMap của trang có thể
          // đang giữ kỳ khác / chưa nạp xong (race làm modal lật readonly giữa chừng).
          const { startDate, endDate } = getPayrollPeriodDates(period.month, period.year, config);
          const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const res = await fetch(`/api/attendance/overtime?selfOnly=1&start_date=${fmtDate(startDate)}&end_date=${fmtDate(endDate)}`, { headers: hdrs });
          const json = await res.json().catch(() => ({}));
          if (json?.success) {
            const map: Record<string, OvertimeEntry> = {};
            for (const ot of json.data) {
              const dateKey = new Date(ot.work_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
              map[dateKey] = { id: ot.id, status: ot.status, start_time: ot.start_time, end_time: ot.end_time, evening_hours: Number(ot.evening_hours), night_hours: Number(ot.night_hours), reason: ot.reason ?? null };
            }
            setOvertimeMap(prev => ({ ...prev, ...map }));
          }
          setTangCaModal(tangCa as string);
        }
      } finally {
        // Xóa query param (giữ nguyên path) — tránh F5/back tự mở lại modal
        window.history.replaceState(null, '', window.location.pathname);
      }
    })();
  }, [searchParams, userId, userRole, config]);

  useEffect(() => {
    fetchData();
    fetchOvertimes();
  }, [fetchData, fetchOvertimes, tab]); // Refresh khi tab thay đổi

  // Auto-refresh mỗi 30s khi ở tab "real-time" (all tab = tổng hợp auto-refresh)
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const cur = getPayrollPeriodForDate(vnTodayStr(), config);
    const isToday = month === cur.month && year === cur.year;
    if (isToday) {
      // Refresh cả dữ liệu chấm công lẫn tăng ca mỗi 30s
      intervalRef.current = setInterval(() => {
        fetchData(true);
        fetchOvertimes();
      }, 30000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData, month, year]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  // Export CSV
  function handleExport() {
    const header = 'Ngày,Loại,Sự kiện,Giờ,GPS,Ghi chú\n';
    const rows = days.flatMap(d =>
      d.records.map(r =>
        [
          d.date,
          r.type === 'machine' ? 'Máy' : 'App',
          r.event_type === 'check_in' ? 'Vào' : 'Ra',
          new Date(r.recorded_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          r.lat ? `${r.lat},${r.lng}` : '',
          r.notes ?? '',
        ].join(',')
      )
    ).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cong_${year}_${String(month).padStart(2,'0')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const curPeriod = getPayrollPeriodForDate(vnTodayStr(), config);
  const isCurrentMonth = month === curPeriod.month && year === curPeriod.year;

  // Tổng tăng ca tháng (cho stats)
  const totalOtHours = Object.values(overtimeMap)
    .filter(ot => ot.status === 'approved')
    .reduce((sum, ot) => sum + ot.evening_hours + ot.night_hours, 0);

  const TABS = [
    { key: 'all' as const,     label: 'Tổng Hợp',   icon: Layers,       desc: 'App + Máy chấm công' },
    { key: 'app' as const,     label: 'App',         icon: Smartphone,   desc: 'Chấm qua ứng dụng' },
    { key: 'machine' as const, label: 'Vân Tay',     icon: Fingerprint,  desc: 'Máy chấm công' },
  ];

  return (
    <div className="animate-fadeIn">
      {/* Back */}
      <Link href="/tra-cuu/du-lieu-cong" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Dữ Liệu Chấm Công
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tra Cứu Dữ Liệu Công</h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>Lịch sử chấm công · cập nhật lúc {lastRefresh.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
            {isCurrentMonth && (
              <span className="inline-flex items-center gap-1 text-xs">
                <span className={`h-1.5 w-1.5 rounded-full ${sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className={sseConnected ? 'text-emerald-400' : 'text-muted-foreground'}>
                  {sseConnected ? 'Realtime' : 'Đang kết nối...'}
                </span>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { fetchData(); fetchOvertimes(); }} className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm">
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
          <button onClick={handleExport} className="btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* Banner: khuyến khích liên kết bot FADO Notification qua Telegram */}
      <a
        href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'fadoaibot'}`}
        target="_blank" rel="noopener noreferrer"
        className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-sky-500/20 p-4 hover:border-sky-500/40 transition-colors"
        style={{ background: 'var(--card)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 shrink-0">
            <Send className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-600 text-foreground">Check &amp; Duyệt chấm công qua Telegram</p>
            <p className="text-xs text-muted-foreground">
              Mở bot <span className="font-600 text-sky-400">FADO Notification</span> và bấm <span className="font-mono">/start</span> để nhận thông báo, duyệt bù công · tăng ca · nghỉ phép ngay trên Telegram.
            </p>
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-sky-600 text-white hover:bg-sky-500">
          <Send className="h-4 w-4" /> Liên kết
        </span>
      </a>

      {/* Month selector */}
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-line-subtle px-4 py-3" style={{ background: 'var(--card)' }}>
        <button onClick={prevMonth} className="btn-ghost rounded-lg p-1.5"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-600 text-foreground">Tháng {month} / {year}</span>
        <button onClick={nextMonth} className="btn-ghost rounded-lg p-1.5"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Stats */}
      {sheet && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-line-subtle p-4 text-center" style={{ background: 'var(--card)' }}>
            <p className="text-3xl font-700 text-emerald-400">{sheet.total_days}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ngày có chấm công</p>
          </div>
          <div className="rounded-xl border border-line-subtle p-4 text-center" style={{ background: 'var(--card)' }}>
            <p className="text-3xl font-700 text-indigo-400">{sheet.total_hours}<span className="text-lg font-500 text-muted-foreground ml-1">giờ</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Tổng giờ làm</p>
          </div>
          <div className="rounded-xl border border-line-subtle p-4 text-center sm:col-span-1 col-span-2" style={{ background: 'var(--card)' }}>
            <p className="text-3xl font-700 text-violet-400">
              {totalOtHours > 0 ? fmtOTHours(totalOtHours) : <span className="text-2xl">—</span>}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Tăng ca đã duyệt</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-line p-1" style={{ background: 'var(--secondary)' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-500 transition-all ${
                tab === t.key
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      <p className="mb-3 text-xs text-muted-foreground">
        {TABS.find(t => t.key === tab)?.desc}
        {tab === 'all' && ' — hiển thị tất cả bản ghi từ cả 2 nguồn'}
        {tab === 'machine' && ' — dữ liệu được đẩy từ thiết bị chấm công'}
      </p>

      {/* Day list / Monthly table */}
      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            <span className="text-sm">Đang tải...</span>
          </div>
        </div>
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Chưa có dữ liệu chấm công</p>
        </div>
      ) : tab === 'machine' ? (
        <FingerprintMonthlyTable
          days={days}
          month={month}
          year={year}
          userId={userId}
          userRole={userRole}
          overtimeMap={overtimeMap}
          config={config}
          onOpenTangCa={setTangCaModal}
          onRefreshDays={() => fetchData(true)}
        />
      ) : (
        /* Tổng Hợp / App — bảng đầy đủ tháng */
        <AppMonthlyTable
          days={days}
          month={month}
          year={year}
          tabFilter={tab}
          userId={userId}
          userRole={userRole}
          overtimeMap={overtimeMap}
          config={config}
          onOpenTangCa={setTangCaModal}
        />
      )}

      {/* Modal Bù Công (deep-link ?buCong=) — ngày đã có đơn thì mở đúng đơn đó (readonly/hủy) */}
      {buCongModal && (
        <BuCongModal
          type={(buCongModal.existing?.adjustment_type ?? 'bu_cong') as BuCongType}
          workDate={buCongModal.date}
          userId={userId}
          userRole={userRole}
          existingId={buCongModal.existing?.id}
          existingStatus={buCongModal.existing?.status}
          existingReason={buCongModal.existing?.reason ?? undefined}
          existingCheckin={buCongModal.existing?.requested_checkin ?? null}
          existingCheckout={buCongModal.existing?.requested_checkout ?? null}
          onClose={() => setBuCongModal(null)}
          onSuccess={() => { setBuCongModal(null); fetchData(true); }}
        />
      )}

      {/* Modal Tăng Ca */}
      {tangCaModal && (
        <TangCaModal
          workDate={tangCaModal}
          userId={userId}
          userRole={userRole}
          existingId={overtimeMap[tangCaModal]?.id}
          existingStatus={overtimeMap[tangCaModal]?.status}
          existingStart={overtimeMap[tangCaModal]?.start_time}
          existingEnd={overtimeMap[tangCaModal]?.end_time}
          existingReason={overtimeMap[tangCaModal]?.reason ?? undefined}
          overtimeBrackets={config.overtimeBrackets}
          onClose={() => setTangCaModal(null)}
          onSuccess={() => {
            setTangCaModal(null);
            fetchOvertimes();
          }}
        />
      )}
    </div>
  );
}
