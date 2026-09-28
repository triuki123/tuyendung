'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CalendarDays, CalendarRange, ChevronLeft, ChevronRight,
  ClipboardList, List, Loader2,
} from 'lucide-react';
import { useConfirm } from '@/context/ConfirmContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import RequestsCalendar from './RequestsCalendar';
import BuCongModal, { type BuCongType } from '../../tra-cuu/components/BuCongModal';
import TangCaModal from '../../tra-cuu/components/TangCaModal';
import { ResolvedAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG } from '@/lib/config/attendanceConfig';
import RequestsList from './RequestsList';
import RequestDetailSheet from './RequestDetailSheet';
import { MyRequestItem, CANCEL_ENDPOINT, canCancel } from './types';

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

/** Trang "Yêu Cầu Của Tôi" — thống kê & lịch mọi đơn nghỉ phép / bù công / tăng ca của user. */
export default function MyRequestsClient() {
  const confirm = useConfirm();
  const isSmall = useMediaQuery('(max-width: 639px)');

  // Giờ VN cố định — new Date() trần sẽ lệch tháng giữa SSR (UTC) và client (bug date-offset kinh điển).
  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const [month, setMonth] = useState(Number(todayVN.slice(5, 7)));
  const [year, setYear] = useState(Number(todayVN.slice(0, 4)));
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('user');
  const [items, setItems] = useState<MyRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [viewTouched, setViewTouched] = useState(false);
  const [selected, setSelected] = useState<MyRequestItem | null>(null);
  // Tạo đơn NGAY TẠI TRANG: bù công + tăng ca mở modal tại chỗ (nghỉ phép vẫn đi trang riêng vì form lớn).
  const [buCong, setBuCong] = useState<{
    date: string;
    existing: { id: string; adjustment_type: string; status: string; reason: string | null;
                requested_checkin: string | null; requested_checkout: string | null } | null;
  } | null>(null);
  const [tangCa, setTangCa] = useState<{
    date: string;
    existing: { id: string; status: string; start_time: string; end_time: string; reason: string | null } | null;
  } | null>(null);
  const [config, setConfig] = useState<ResolvedAttendanceConfig>(DEFAULT_ATTENDANCE_CONFIG);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Mặc định: Danh sách trên màn < 640px, Lịch trên desktop (chỉ khi user chưa tự chọn)
  useEffect(() => {
    if (!viewTouched) setView(isSmall ? 'list' : 'calendar');
  }, [isSmall, viewTouched]);

  useEffect(() => {
    const u = readCurrentUser();
    if (u) {
      setUserId(u.id);
      setRole(u.role);
    } else {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/my-requests?month=${month}&year=${year}`, {
        headers: { 'x-current-user-id': userId, 'x-current-user-role': role },
      });
      const json = await res.json();
      if (res.ok && json.success) setItems(json.data);
    } catch {
      /* giữ dữ liệu cũ */
    } finally {
      setLoading(false);
    }
  }, [userId, role, month, year]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Config chấm công (khung giờ tăng ca...) — dùng cho TangCaModal.
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/attendance/config?date=${todayVN}`, { headers: { 'x-current-user-id': userId } })
      .then((r) => r.json())
      .then((j) => { if (j?.success && j.data) setConfig(j.data); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** Mở modal tạo/xem bù công hoặc tăng ca cho 1 ngày — nạp đơn HIỆN CÓ trước để không dính 409 form trắng. */
  async function openCreate(kind: 'adjustment' | 'overtime', date: string) {
    const hdrs = { 'x-current-user-id': userId, 'x-current-user-role': role };
    const m = Number(date.slice(5, 7));
    const y = Number(date.slice(0, 4));
    try {
      if (kind === 'adjustment') {
        const res = await fetch(`/api/attendance/adjustments?selfOnly=1&month=${m}&year=${y}`, { headers: hdrs });
        const json = await res.json().catch(() => ({}));
        const rows: Array<{ id: string; adjustment_type: string; work_date: string; status: string; reason: string | null; requested_checkin: string | null; requested_checkout: string | null }> = json?.data ?? [];
        const found = rows.find((r) => new Date(r.work_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === date) ?? null;
        setBuCong({ date, existing: found });
      } else {
        const first = `${y}-${String(m).padStart(2, '0')}-01`;
        const last = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
        const res = await fetch(`/api/attendance/overtime?selfOnly=1&start_date=${first}&end_date=${last}`, { headers: hdrs });
        const json = await res.json().catch(() => ({}));
        const rows: Array<{ id: string; work_date: string; status: string; start_time: string; end_time: string; reason: string | null }> = json?.data ?? [];
        const found = rows.find((r) => new Date(r.work_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === date) ?? null;
        setTangCa({ date, existing: found });
      }
    } catch {
      showToast('Không tải được dữ liệu ngày này, thử lại sau', false);
    }
  }

  // Tạo đơn qua deep-link mở trang khác → quay lại đây phải thấy đơn mới ngay.
  useEffect(() => {
    const onFocus = () => { void loadData(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleCancel(item: MyRequestItem) {
    const isApprovedLeave = item.kind === 'leave' && item.status === 'approved';
    const nDays = item.ids?.length ?? 1;
    const ok = await confirm({
      title: 'Hủy đơn?',
      message: isApprovedLeave
        ? `Đơn "${item.sub_label}" ĐÃ ĐƯỢC DUYỆT — hủy sẽ hoàn lại quỹ phép. Tiếp tục?`
        : nDays > 1
          ? `Đơn "${item.sub_label}" gồm ${nDays} ngày — hủy sẽ hủy TOÀN BỘ đợt. Tiếp tục?`
          : `Bạn chắc chắn muốn hủy đơn "${item.sub_label}" đang chờ duyệt?`,
      danger: true,
    });
    if (!ok) return;
    setCancellingId(item.id);
    try {
      // Đơn bù công theo LÔ = nhiều record — hủy tuần tự từng id (route hủy vốn per-record, chính chủ).
      const ids = item.ids?.length ? item.ids : [item.id];
      let failed = 0;
      for (const id of ids) {
        const res = await fetch(CANCEL_ENDPOINT[item.kind](id), {
          method: 'DELETE',
          headers: { 'x-current-user-id': userId, 'x-current-user-role': role },
        });
        const json = await res.json().catch(() => ({}));
        if (!(res.ok && json.success)) failed += 1;
      }
      if (failed === 0) {
        showToast(ids.length > 1 ? `Đã hủy đợt ${ids.length} ngày` : 'Đã hủy đơn', true);
      } else {
        showToast(`Hủy được ${ids.length - failed}/${ids.length} ngày — phần còn lại có thể đã được xử lý`, false);
      }
      setSelected(null);
      void loadData();
    } catch {
      showToast('Lỗi kết nối, thử lại sau', false);
    } finally {
      setCancellingId(null);
    }
  }

  const total = items.filter((i) => i.status !== 'cancelled').length;
  const pending = items.filter((i) => i.status === 'pending').length;
  const approved = items.filter((i) => i.status === 'approved').length;
  const rejected = items.filter((i) => i.status === 'rejected').length;

  const STATS = [
    { label: 'Tổng đơn', value: total, cls: 'text-indigo-400' },
    { label: 'Chờ duyệt', value: pending, cls: 'text-amber-400' },
    { label: 'Đã duyệt', value: approved, cls: 'text-emerald-400' },
    { label: 'Từ chối', value: rejected, cls: 'text-red-400' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      {/* Back link */}
      <Link
        href="/tra-cuu/du-lieu-cong"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Yêu Cầu Của Tôi</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Lịch &amp; trạng thái mọi đơn nghỉ phép, bù công, tăng ca của bạn
          </p>
        </div>
        {/* Toggle chế độ xem */}
        <div className="flex gap-1 rounded-xl border border-white/5 p-1 self-start sm:self-auto" style={{ background: 'var(--card)' }}>
          {([
            { key: 'calendar' as const, label: 'Lịch', icon: CalendarRange },
            { key: 'list' as const, label: 'Danh sách', icon: List },
          ]).map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                onClick={() => { setView(v.key); setViewTouched(true); }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-500 transition-colors ${
                  view === v.key ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chuyển tháng */}
      <div className="flex items-center justify-between rounded-2xl border border-white/5 px-4 py-3" style={{ background: 'var(--card)' }}>
        <button onClick={prevMonth} className="btn-ghost rounded-lg p-1.5"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-600 text-foreground inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-indigo-400" /> Tháng {month} / {year}
        </span>
        <button onClick={nextMonth} className="btn-ghost rounded-lg p-1.5"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/5 p-4 text-center" style={{ background: 'var(--card)' }}>
            <p className={`text-2xl sm:text-3xl font-700 ${s.cls}`}>{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Nội dung */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 && view === 'list' ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Tháng này bạn chưa có yêu cầu nào</p>
          <p className="text-xs mt-1 opacity-60">Chuyển sang chế độ Lịch và bấm vào một ngày để tạo đơn mới</p>
        </div>
      ) : view === 'calendar' ? (
        <>
          <RequestsCalendar month={month} year={year} items={items} compact={isSmall} onSelectItem={setSelected} onCreate={openCreate} />
          {items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Tháng này bạn chưa có yêu cầu nào — bấm vào một ngày trên lịch để tạo đơn mới
            </p>
          )}
          {/* Chú giải màu */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Nghỉ phép</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" /> Bù công / công đặc biệt</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Tăng ca</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded border border-dashed border-white/40" /> Chờ duyệt</span>
          </div>
        </>
      ) : (
        <RequestsList items={items} cancellingId={cancellingId} onSelectItem={setSelected} onCancel={handleCancel} />
      )}

      {/* Chi tiết đơn */}
      {selected && (
        <RequestDetailSheet
          item={selected}
          cancelling={cancellingId === selected.id}
          onCancel={handleCancel}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Modal Bù Công tại chỗ — ngày đã có đơn thì mở đúng đơn đó (readonly/hủy) */}
      {buCong && (
        <BuCongModal
          type={(buCong.existing?.adjustment_type ?? 'bu_cong') as BuCongType}
          workDate={buCong.date}
          userId={userId}
          userRole={role}
          existingId={buCong.existing?.id}
          existingStatus={buCong.existing?.status}
          existingReason={buCong.existing?.reason ?? undefined}
          existingCheckin={buCong.existing?.requested_checkin ?? null}
          existingCheckout={buCong.existing?.requested_checkout ?? null}
          onClose={() => setBuCong(null)}
          onSuccess={() => { setBuCong(null); showToast('Đã gửi đề xuất', true); void loadData(); }}
        />
      )}

      {/* Modal Tăng Ca tại chỗ */}
      {tangCa && (
        <TangCaModal
          workDate={tangCa.date}
          userId={userId}
          userRole={role}
          existingId={tangCa.existing?.id}
          existingStatus={tangCa.existing?.status}
          existingStart={tangCa.existing?.start_time}
          existingEnd={tangCa.existing?.end_time}
          existingReason={tangCa.existing?.reason ?? undefined}
          overtimeBrackets={config.overtimeBrackets}
          onClose={() => setTangCa(null)}
          onSuccess={() => { setTangCa(null); showToast('Đã gửi đề xuất tăng ca', true); void loadData(); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm font-500 shadow-lg ${
            toast.ok
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
              : 'border-red-500/30 bg-red-500/15 text-red-300'
          }`}
          style={{ background: 'var(--card)' }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
