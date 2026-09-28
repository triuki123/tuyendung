'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import {
  ArrowLeft, MapPin, Camera, CheckCircle2, Clock,
  AlertCircle, Loader2, RefreshCw, X, AlertTriangle,
  Smartphone, Fingerprint, History,
} from 'lucide-react';

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

interface TodayStatus {
  checked_in: boolean;
  checked_out: boolean;
  check_in_time: string | null;
  check_out_time: string | null;
  last_event_type: 'check_in' | 'check_out' | null;
  last_event_lat: number | null;
  last_event_lng: number | null;
  records: AttendanceRecord[];
  yesterday_missing_checkout: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readCurrentUser(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (!raw) return null;
    const u = JSON.parse(raw);
    return { id: u.id ?? '', name: u.name ?? 'Nhân sự' };
  } catch { return null; }
}

/** Tính khoảng cách km giữa 2 tọa độ (Haversine) */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function fmtTimeFull(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

/** Tính tổng phút làm giữa check_in và check_out gần nhất */
function calcWorkMinutes(records: AttendanceRecord[]): number {
  const checkIn  = records.find(r => r.event_type === 'check_in');
  const checkOut = records.filter(r => r.event_type === 'check_out').pop();
  if (!checkIn || !checkOut) return 0;
  const mins = Math.round(
    (new Date(checkOut.recorded_at).getTime() - new Date(checkIn.recorded_at).getTime()) / 60000
  );
  return Math.max(0, mins);
}

function fmtMinutes(mins: number): string {
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} tiếng`;
  return `${h}g${String(m).padStart(2, '0')}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChamCongClient() {
  const router = useRouter();
  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAnomaly, setGpsAnomaly] = useState<string | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('Nhân sự');
  const [now, setNow] = useState<Date | null>(null);
  const [confirmDoubleIn, setConfirmDoubleIn] = useState(false);
  const [showRedirectConfirm, setShowRedirectConfirm] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(0);
  const [lastEventDetails, setLastEventDetails] = useState<{ action: string; time: string; gps: boolean; photo: boolean } | null>(null);
  const [shouldShowModal, setShouldShowModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ESC đóng modal xác nhận sau khi chấm công (giữ lại trang)
  const closeRedirect = useCallback(() => setShowRedirectConfirm(false), []);
  useEscapeKey(closeRedirect, showRedirectConfirm);

  /** Vẽ watermark thời gian + GPS lên ảnh, trả về File mới */
  async function applyWatermark(file: File, gpsCoords: { lat: number; lng: number } | null): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        const timeStr = new Date().toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        const gpsStr = gpsCoords
          ? `GPS: ${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}`
          : 'GPS: không có';

        const lines = [timeStr, gpsStr];
        const fontSize = Math.max(20, Math.round(canvas.width * 0.03));
        const padding  = Math.round(fontSize * 0.6);
        const lineH    = Math.round(fontSize * 1.5);
        const boxH     = lineH * lines.length + padding * 2;
        const boxY     = canvas.height - boxH - padding;

        // Nền mờ phía dưới
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, boxY, canvas.width, boxH + padding);

        ctx.font      = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        lines.forEach((line, i) => {
          ctx.fillText(line, padding, boxY + padding + i * lineH);
        });

        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.88);
      };
      img.onerror = () => resolve(file); // fallback: giữ ảnh gốc
      img.src = url;
    });
  }

  // Clock — chỉ khởi động ở client
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Countdown redirect
  useEffect(() => {
    if (redirectCountdown <= 0) return;
    const timer = setTimeout(() => setRedirectCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown]);

  // Auto redirect khi countdown = 0
  useEffect(() => {
    if (redirectCountdown === 0 && showRedirectConfirm) {
      setShowRedirectConfirm(false);
      router.push('/tra-cuu/du-lieu-cong/tra-cuu?tab=app');
    }
  }, [redirectCountdown, showRedirectConfirm, router]);

  // Show modal khi status updated + check_in_time có data
  useEffect(() => {
    if (shouldShowModal && status?.check_in_time) {
      setShowRedirectConfirm(true);
      setRedirectCountdown(5);
      setShouldShowModal(false);
    }
  }, [shouldShowModal, status]);

  // Load user
  useEffect(() => {
    const u = readCurrentUser();
    if (u) { setUserId(u.id); setUserName(u.name); }
    else    { setLoadingStatus(false); }
  }, []);

  // Fetch status sau khi có userId + auto-refresh 15s (bắt dữ liệu máy vân tay về)
  useEffect(() => {
    if (!userId) return;
    fetchTodayStatus();
    requestGPS();
    // Tự động cập nhật mỗi 15s để bắt record từ máy vân tay
    const interval = setInterval(() => fetchTodayStatus(), 15000);
    return () => clearInterval(interval);
  }, [userId]);

  // Kiểm tra GPS anomaly khi có cả coords và last event
  useEffect(() => {
    if (!coords || !status?.last_event_lat || !status?.last_event_lng) {
      setGpsAnomaly(null);
      return;
    }
    const dist = distanceKm(
      coords.lat, coords.lng,
      status.last_event_lat, status.last_event_lng
    );
    // Nếu cách xa hơn 50km so với lần chấm trước → cảnh báo
    if (dist > 50) {
      setGpsAnomaly(
        `Vị trí hiện tại cách lần chấm trước ${dist.toFixed(0)}km — có thể bất thường`
      );
    } else {
      setGpsAnomaly(null);
    }
  }, [coords, status]);

  async function fetchTodayStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/attendance/today', {
        headers: { 'x-current-user-id': userId },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStatus(json.data);
      }
    } catch { /* giữ default */ }
    finally { setLoadingStatus(false); }
  }

  function requestGPS() {
    if (!navigator.geolocation) { setGpsState('error'); return; }
    // Safari yêu cầu HTTPS — nếu đang HTTP thì geolocation bị block im lặng
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setGpsState('error');
      setGpsDenied(false);
      return;
    }
    setGpsState('loading');
    setGpsDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsState('ok');
        setGpsDenied(false);
      },
      (err) => {
        setGpsState('error');
        // PERMISSION_DENIED = 1 (user từ chối hoặc Safari chặn)
        if (err.code === 1) setGpsDenied(true);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  }

  async function doRecord(eventType: 'check_in' | 'check_out') {
    if (submitting || !userId) {
      console.warn('[ChamCong] Early return - submitting:', submitting, 'userId:', userId);
      return;
    }
    setSubmitting(true);
    try {
      // Chấm công app BẮT BUỘC cả ảnh lẫn vị trí (GPS) — gửi multipart cho cả vào/ra
      const fd = new FormData();
      if (coords) { fd.append('lat', String(coords.lat)); fd.append('lng', String(coords.lng)); }
      if (photo)  fd.append('photo', photo);
      const url = eventType === 'check_in' ? '/api/attendance/check-in' : '/api/attendance/check-out';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-current-user-id': userId, 'x-current-user-name': encodeURIComponent(userName) },
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        const action = eventType === 'check_in' ? 'Vào' : 'Ra';
        const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

        showToast(`✅ Điểm Danh ${action} thành công!`, true);
        setPhoto(null);
        setPhotoPreview(null);
        setConfirmDoubleIn(false);
        setLastEventDetails({
          action,
          time,
          gps: !!coords,
          photo: !!photo,
        });

        // Fetch status
        await fetchTodayStatus();

        // Flag để show modal sau khi status updated
        setShouldShowModal(true);
      } else {
        showToast(json.error ?? 'Lỗi khi điểm danh', false);
      }
    } catch (err) {
      console.error('[ChamCong] doRecord error:', err);
      showToast('Lỗi kết nối — vui lòng thử lại', false);
    }
    finally { setSubmitting(false); }
  }

  // Chấm công app BẮT BUỘC: ảnh + vị trí (GPS). Thiếu cái nào chặn lại + nhắc bật.
  function ensurePhotoAndGPS(): boolean {
    if (!photo) { showToast('Vui lòng chụp ảnh xác nhận trước khi điểm danh', false); return false; }
    if (!coords) {
      showToast('Vui lòng bật định vị (GPS) để điểm danh — đang thử lấy lại vị trí…', false);
      requestGPS();
      return false;
    }
    return true;
  }

  function handleCheckIn() {
    if (!ensurePhotoAndGPS()) return;
    // Nếu sự kiện cuối là check_in → cảnh báo sắp chấm vào lần 2
    if (status?.last_event_type === 'check_in' && !confirmDoubleIn) {
      setConfirmDoubleIn(true);
      return;
    }
    doRecord('check_in');
  }

  function handleCheckOut() {
    if (!ensurePhotoAndGPS()) return;
    doRecord('check_out');
  }

  // Tính toán hiển thị
  const timeStr = now
    ? now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';
  const dateStr = now
    ? now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  const lastIsCheckIn   = status?.last_event_type === 'check_in';
  const lastIsCheckOut  = status?.last_event_type === 'check_out';
  const noRecordsToday  = !!status && !status.last_event_type; // có status nhưng chưa có record nào hôm nay
  const currentHour     = now?.getHours() ?? 12;
  const suggestCheckOut = noRecordsToday && currentHour >= 12; // sau 12h → gợi ý RA
  const totalMins       = status ? calcWorkMinutes(status.records) : 0;

  return (
    <div className="animate-fadeIn mx-auto max-w-md">
      {/* Back */}
      <Link href="/tra-cuu/du-lieu-cong" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Dữ Liệu Chấm Công
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Chấm Công</h1>
        <p className="mt-1 text-sm text-muted-foreground">Điểm danh vào / ra ca làm việc</p>
      </div>

      {/* ─── Cảnh báo hôm qua quên ra ─── */}
      {status?.yesterday_missing_checkout && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-600 text-amber-400">Quên chấm ra hôm qua</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              Hôm qua bạn đã chấm vào nhưng không có chấm ra. Liên hệ quản lý để bổ sung nếu cần.
            </p>
          </div>
        </div>
      )}

      {/* ─── Cảnh báo GPS bất thường ─── */}
      {gpsAnomaly && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-600 text-red-400">Vị trí bất thường</p>
            <p className="text-xs text-red-400/80 mt-0.5">{gpsAnomaly}</p>
          </div>
        </div>
      )}

      {/* ─── Đồng hồ ─── */}
      <div className="mb-5 rounded-2xl border border-line-subtle p-5 text-center" style={{ background: 'var(--card)' }}>
        <p suppressHydrationWarning className="text-4xl font-700 tabular-nums tracking-tight text-foreground">{timeStr}</p>
        <p suppressHydrationWarning className="mt-1.5 text-sm capitalize text-muted-foreground">{dateStr}</p>
        {userName && <p className="mt-1 text-xs text-indigo-400">👤 {userName}</p>}
      </div>

      {/* ─── Giờ vào / ra hôm nay ─── */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className={`rounded-2xl border p-4 text-center transition-all ${
          status?.checked_in ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-line-subtle'
        }`} style={!status?.checked_in ? { background: 'var(--card)' } : {}}>
          <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Giờ Vào</p>
          {loadingStatus
            ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
            : <p className={`text-xl font-700 tabular-nums ${status?.checked_in ? 'text-emerald-400' : 'text-muted-foreground/40'}`}>
                {fmtTime(status?.check_in_time ?? null)}
              </p>
          }
        </div>
        <div className={`rounded-2xl border p-4 text-center transition-all ${
          status?.checked_out ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-line-subtle'
        }`} style={!status?.checked_out ? { background: 'var(--card)' } : {}}>
          <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Giờ Ra</p>
          {loadingStatus
            ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
            : <p className={`text-xl font-700 tabular-nums ${status?.checked_out ? 'text-indigo-400' : 'text-muted-foreground/40'}`}>
                {fmtTime(status?.check_out_time ?? null)}
              </p>
          }
        </div>
      </div>

      {/* Thống kê giờ làm hôm nay — NỔI BẬT */}
      {totalMins > 0 && (
        <div className="mb-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/15 to-indigo-500/5 px-5 py-4" style={{ boxShadow: '0 4px 12px rgba(99,102,241,0.15)' }}>
          <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-2">📊 Thống Kê Hôm Nay</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tổng giờ làm:</span>
              <span className="text-xl font-700 text-indigo-300">{fmtMinutes(totalMins)}</span>
            </div>
            {status?.check_in_time && status?.check_out_time && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Từ {fmtTime(status.check_in_time)} → {fmtTime(status.check_out_time)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── GPS ─── */}
      <div className={`mb-4 rounded-xl border px-3 py-2.5 transition-colors ${!coords ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
        <div className="mb-1.5 flex items-center gap-1.5">
          <p className="text-xs font-600 text-muted-foreground">VỊ TRÍ (GPS)</p>
          <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-600 text-red-400">Bắt buộc</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            {gpsState === 'loading' && <><Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /><span className="text-muted-foreground">Đang lấy vị trí...</span></>}
            {gpsState === 'ok'      && <><MapPin className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">GPS: {coords?.lat.toFixed(5)}, {coords?.lng.toFixed(5)}</span></>}
            {(gpsState === 'error' || gpsState === 'idle') && <><AlertCircle className="h-3.5 w-3.5 text-amber-400" /><span className="text-muted-foreground">Chưa có vị trí GPS</span></>}
          </div>
          <button onClick={requestGPS} className="btn-ghost rounded-lg p-1" title="Lấy lại GPS">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Hướng dẫn khi bị từ chối — đặc biệt hữu ích trên Safari iOS */}
        {gpsDenied && (
          <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <p className="text-xs font-600 text-amber-400 mb-1">Quyền truy cập vị trí bị từ chối</p>
            <p className="text-[11px] text-amber-400/80 leading-relaxed">
              <strong>Safari iPhone/iPad:</strong> Vào <em>Cài đặt → Safari → Vị trí</em> → chọn <em>Hỏi</em> hoặc <em>Cho phép</em>, sau đó tải lại trang.
            </p>
            <p className="text-[11px] text-amber-400/80 leading-relaxed mt-1">
              <strong>Safari Mac:</strong> Vào <em>Cài đặt Safari → Trang web → Vị trí</em> → cho phép trang này.
            </p>
          </div>
        )}
        {gpsState === 'error' && !gpsDenied && location.protocol !== 'https:' && location.hostname !== 'localhost' && (
          <p className="mt-1.5 text-[11px] text-red-400">Safari yêu cầu kết nối HTTPS để dùng GPS.</p>
        )}
      </div>

      {/* ─── Ảnh selfie ─── */}
      <div className={`mb-5 rounded-xl border p-3 transition-colors ${!photo ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-xs font-600 text-muted-foreground">ẢNH XÁC NHẬN</p>
          <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-600 text-red-400">Bắt buộc</span>
        </div>
        {/* capture="user" = camera trước; không có fallback gallery trên mobile */}
        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          // Hiện preview ảnh gốc ngay, watermark xử lý nền
          setPhotoPreview(URL.createObjectURL(file));
          const watermarked = await applyWatermark(file, coords);
          setPhoto(watermarked);
          setPhotoPreview(URL.createObjectURL(watermarked));
          // Reset input để có thể chụp lại cùng ảnh
          e.target.value = '';
        }} />
        {photoPreview ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Ảnh selfie" className="h-20 w-20 rounded-xl border border-line object-cover" />
            <div className="flex flex-col gap-2">
              <p className="text-xs text-emerald-400 font-600">✅ Đã chụp ảnh</p>
              <button onClick={() => fileRef.current?.click()} className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs">
                <Camera className="h-3.5 w-3.5" /> Chụp lại
              </button>
              <button onClick={() => { setPhoto(null); setPhotoPreview(null); }} className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-400 hover:text-red-300">
                <X className="h-3.5 w-3.5" /> Xóa ảnh
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 py-3 text-sm font-600 text-amber-400 hover:bg-amber-500/20 transition-colors">
              <Camera className="h-4 w-4" /> Chụp ảnh xác nhận
            </button>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Phải chụp ảnh trước khi điểm danh</p>
          </div>
        )}
      </div>

      {/* ─── NÚT HÀNH ĐỘNG ─── */}
      <div className="space-y-3">

        {/* Xác nhận chấm vào lần 2 */}
        {confirmDoubleIn && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="mb-3 text-sm font-600 text-amber-400">
              ⚠️ Bạn đã chấm vào lúc {fmtTime(status?.check_in_time ?? null)}.
              Bạn có muốn ghi nhận thêm lần vào mới không?
            </p>
            <div className="flex gap-2">
              <button onClick={() => { if (!ensurePhotoAndGPS()) return; doRecord('check_in'); }} disabled={submitting} className="flex-1 rounded-xl bg-amber-500/20 border border-amber-500/30 py-2 text-sm font-600 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-40">
                Có, chấm thêm
              </button>
              <button onClick={() => setConfirmDoubleIn(false)} className="flex-1 btn-ghost rounded-xl py-2 text-sm">
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* ── Nút chính ── */}
        {!confirmDoubleIn && !loadingStatus && (
          <>

            {/* ═══ CASE 1: Chưa có record nào hôm nay ═══
                App không biết chắc → hiện cả 2 nút
                Gợi ý dựa trên giờ hiện tại              */}
            {noRecordsToday && (
              <>
                {/* Cảnh báo chiều mà chưa có dữ liệu vào */}
                {suggestCheckOut && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                    <p className="text-xs text-amber-400">
                      Chưa có dữ liệu chấm vào hôm nay trên app.
                      Nếu bạn đã chấm bằng máy vân tay, hãy chọn <strong>Điểm Danh RA</strong>.
                    </p>
                  </div>
                )}

                <p className="text-center text-xs text-muted-foreground">
                  {suggestCheckOut
                    ? 'Lần đầu dùng app hôm nay — bạn đang:'
                    : 'Chọn loại điểm danh:'}
                </p>

                {/* Nút RA — nổi bật hơn nếu sau 12h */}
                <button
                  onClick={handleCheckOut}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-lg font-700 text-white transition-all active:scale-[0.98] disabled:opacity-50"
                  style={suggestCheckOut
                    ? { background: 'linear-gradient(135deg,#4f46e5 0%,#6366f1 100%)', boxShadow: '0 6px 24px rgba(99,102,241,0.35)' }
                    : { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }
                  }
                >
                  {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Clock className="h-6 w-6" />}
                  {submitting ? 'Đang xử lý...' : 'Điểm Danh RA'}
                  {suggestCheckOut && <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-500">Gợi ý</span>}
                </button>

                {/* Nút VÀO — nổi bật hơn nếu trước 12h */}
                <button
                  onClick={handleCheckIn}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-lg font-700 text-white transition-all active:scale-[0.98] disabled:opacity-50"
                  style={!suggestCheckOut
                    ? { background: 'linear-gradient(135deg,#059669 0%,#10b981 100%)', boxShadow: '0 6px 24px rgba(16,185,129,0.35)' }
                    : { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' }
                  }
                >
                  {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle2 className="h-6 w-6" />}
                  {submitting ? 'Đang xử lý...' : 'Điểm Danh VÀO'}
                  {!suggestCheckOut && <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-500">Gợi ý</span>}
                </button>
              </>
            )}

            {/* ═══ CASE 2: Last event là check_in → nút RA chính + VÀO bị disable ═══ */}
            {lastIsCheckIn && (
              <>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-600 text-emerald-400">✅ Đã chấm vào lúc {fmtTime(status?.check_in_time ?? null)}</p>
                    <p className="text-xs text-emerald-400/80 mt-0.5">Hãy chấm ra khi kết thúc ca làm việc</p>
                  </div>
                </div>

                <button
                  onClick={handleCheckOut}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-lg font-700 text-white transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#4f46e5 0%,#6366f1 100%)', boxShadow: '0 6px 24px rgba(99,102,241,0.35)' }}
                >
                  {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Clock className="h-6 w-6" />}
                  {submitting ? 'Đang xử lý...' : 'Điểm Danh RA'}
                </button>

                <button onClick={handleCheckIn} disabled={true} className="btn-ghost flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm opacity-50 cursor-not-allowed">
                  <CheckCircle2 className="h-4 w-4" /> Chấm vào ca mới (disabled)
                </button>
              </>
            )}

            {/* ═══ CASE 3: Last event là check_out → nút VÀO để bắt đầu ca mới ═══ */}
            {lastIsCheckOut && (
              <>
                <button
                  onClick={handleCheckIn}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-lg font-700 text-white transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#059669 0%,#10b981 100%)', boxShadow: '0 6px 24px rgba(16,185,129,0.35)' }}
                >
                  {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle2 className="h-6 w-6" />}
                  {submitting ? 'Đang xử lý...' : 'Điểm Danh VÀO'}
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  Đã chấm ra lúc {fmtTime(status?.check_out_time ?? null)} · Bấm để bắt đầu ca mới nếu cần
                </p>
              </>
            )}

          </>
        )}

        {/* Chưa đăng nhập */}
        {!userId && !loadingStatus && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 py-4">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            <p className="text-sm text-amber-400">Vui lòng đăng nhập để chấm công</p>
          </div>
        )}
      </div>

      {/* ─── Lịch sử hôm nay ─── */}
      {status && status.records.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">
              Lịch sử hôm nay ({status.records.length} lần)
            </p>
          </div>
          <div className="space-y-2">
            {status.records.map((rec, idx) => (
              <div key={rec.id} className="flex items-center gap-3 rounded-xl border border-line-subtle px-3 py-2.5" style={{ background: 'var(--card)' }}>
                {/* Index */}
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-hover text-xs text-muted-foreground">
                  {idx + 1}
                </span>

                {/* Event type badge */}
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 flex-shrink-0 ${
                  rec.event_type === 'check_in'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                }`}>
                  {rec.event_type === 'check_in' ? '▶ Vào' : '■ Ra'}
                </span>

                {/* Source badge */}
                <span className={`hidden sm:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-500 flex-shrink-0 ${
                  rec.type === 'machine'
                    ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                    : 'bg-slate-500/15 text-ink-muted border-slate-500/30'
                }`}>
                  {rec.type === 'machine'
                    ? <><Fingerprint className="h-3 w-3" /> Máy</>
                    : <><Smartphone className="h-3 w-3" /> App</>
                  }
                </span>

                {/* Time */}
                <span className="ml-auto text-sm font-700 tabular-nums text-foreground">
                  {fmtTimeFull(rec.recorded_at)}
                </span>

                {/* Indicators */}
                <div className="flex gap-1.5">
                  {rec.photo_mime && (
                    <Camera className="h-3.5 w-3.5 text-muted-foreground" aria-label="Có ảnh" />
                  )}
                  {rec.lat && (
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-label="Có GPS" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hướng dẫn */}
      <div className="mt-6 rounded-xl border border-line-subtle p-4 space-y-1.5" style={{ background: 'var(--secondary)' }}>
        <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Lưu ý</p>
        <p className="text-xs text-muted-foreground">• Sau khi chấm, Telegram sẽ gửi thông báo xác nhận ngay lập tức</p>
        <p className="text-xs text-muted-foreground">• Mọi lần bấm đều được ghi lại — không lo nhấn nhầm, quản lý sẽ kiểm tra</p>
        <p className="text-xs text-muted-foreground">• GPS và ảnh giúp xác minh vị trí chấm công</p>
        <p className="text-xs text-muted-foreground">• Quên chấm ra → báo quản lý để bổ sung</p>
      </div>

      {/* Modal confirm redirect (4) */}
      {showRedirectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowRedirectConfirm(false); }}>
          <div className="w-full max-w-sm rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 border-b border-line-subtle px-6 py-5">
              <h2 className="text-lg font-700 text-emerald-300">✅ Chấm Công Thành Công</h2>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {lastEventDetails && (
                <div className="space-y-3 rounded-xl border border-line-subtle p-4" style={{ background: 'var(--secondary)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Loại:</span>
                    <span className="text-sm font-600 text-emerald-400">Điểm Danh {lastEventDetails.action}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Giờ:</span>
                    <span className="text-sm font-600 text-foreground">{lastEventDetails.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {lastEventDetails.gps && <span className="text-xs text-emerald-400">✅ GPS</span>}
                    {lastEventDetails.photo && <span className="text-xs text-emerald-400">✅ Ảnh</span>}
                    {!lastEventDetails.gps && !lastEventDetails.photo && <span className="text-xs text-muted-foreground">Không có GPS/ảnh</span>}
                  </div>
                </div>
              )}

              <p className="text-sm text-muted-foreground text-center">
                Xem Tra Cứu Dữ Liệu Công ngay không?
                {redirectCountdown > 0 && <span className="ml-1 font-600 text-indigo-400">(Tự động trong {redirectCountdown}s)</span>}
              </p>
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-line-subtle px-6 py-4">
              <button
                onClick={() => setShowRedirectConfirm(false)}
                className="flex-1 btn-ghost rounded-xl px-4 py-2.5 text-sm font-600 hover:bg-hover"
              >
                Ở Lại
              </button>
              <button
                onClick={() => {
                  setShowRedirectConfirm(false);
                  router.push('/tra-cuu/du-lieu-cong/tra-cuu?tab=app');
                }}
                className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-600 text-white transition-colors"
              >
                Xem Ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 max-w-sm rounded-2xl border px-5 py-3.5 text-sm font-500 shadow-2xl text-center animate-slideUp ${
          toast.ok
            ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
            : 'border-red-500/30 bg-red-500/20 text-red-300'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Confetti animation (7) */}
      {showRedirectConfirm && <Confetti />}
    </div>
  );
}

// Confetti component (7)
function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confetti: Array<{ x: number; y: number; vx: number; vy: number; size: number; color: string; rotation: number; rotationSpeed: number }> = [];

    // Generate confetti
    const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899'];
    for (let i = 0; i < 50; i++) {
      confetti.push({
        x: Math.random() * canvas.width,
        y: -10,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 5 + 3,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
      });
    }

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;

      confetti.forEach((c, idx) => {
        c.y += c.vy;
        c.vy += 0.1; // gravity
        c.x += c.vx;
        c.rotation += c.rotationSpeed;

        // Fade out
        const alpha = Math.max(0, 1 - (c.y / canvas.height) * 1.5);
        ctx.globalAlpha = alpha;

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rotation);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
        ctx.restore();

        // Remove if off-screen
        if (c.y > canvas.height) {
          confetti.splice(idx, 1);
        }
      });

      if (confetti.length > 0) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-40"
      style={{ background: 'transparent' }}
    />
  );
}
