'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Camera, MapPin, QrCode, CheckCircle2, LogIn, LogOut, X, Clock, Package } from 'lucide-react';
import { QRScannerModal } from '@/components/QRScannerModal';
import type { MeData } from './WarehouseApp';

/**
 * Chấm công: GPS trong bán kính kho + BẮT BUỘC chụp ảnh mặt (camera trước,
 * không cho chọn từ thư viện). Fallback quét QR động ở cổng khi GPS lỗi.
 *
 * 2 chế độ theo cấu hình kho:
 *  - 'shift': 1 đợt/ngày theo ca (hành vi cũ).
 *  - 'flex' : nhiều đợt/ngày — check-in mở đợt, check-out đóng đợt, tổng giờ cộng dồn.
 *    Quên check-out rồi check-in tiếp → khai giờ ra đợt trước (chờ quản lý duyệt).
 *    Lúc check-out có thể tự khai sản lượng của đợt (chờ quản lý duyệt).
 */
export default function CheckinView({ me, onChanged }: { me: MeData; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState<null | 'in' | 'out'>(null);
  const [shiftId, setShiftId] = useState(me.worker.shift_id || '');
  // flex: ảnh check-out đã chụp, đang hỏi sản lượng trước khi gửi
  const [outputAsk, setOutputAsk] = useState<null | { photo: string }>(null);
  // flex: server báo còn đợt chưa check-out — hỏi khai giờ ra rồi gửi lại
  const [declareAsk, setDeclareAsk] = useState<null | { photo: string; openSession: any }>(null);

  const isFlex = me.warehouse?.attendance_mode === 'flex';
  const sessions: any[] = me.today?.sessions ?? [];
  const open = me.today?.open ?? null;
  const hasAnyCheckin = sessions.some((s) => s.check_in_at);
  // shift: đã check-out là xong ngày; flex: lúc nào cũng có thể vào đợt mới
  const shiftDone = !isFlex && sessions.some((s) => s.check_out_at);

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

  const sessionHours = (s: any): string | null => {
    if (!s.check_in_at || !s.check_out_at) return null;
    return ((new Date(s.check_out_at).getTime() - new Date(s.check_in_at).getTime()) / 3600000).toFixed(1);
  };

  const getGps = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    });

  const submit = async (
    action: 'in' | 'out',
    photo: string,
    extra?: { declaredCheckoutAt?: string; outputs?: { productId: string; quantity: number }[] }
  ) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const gps = qrToken ? null : await getGps();
      const res = await fetch('/api/warehouse/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          photo,
          lat: gps?.lat ?? null,
          lng: gps?.lng ?? null,
          method: qrToken ? 'qr' : 'gps',
          qrToken: qrToken || undefined,
          shiftId: shiftId || undefined,
          declaredCheckoutAt: extra?.declaredCheckoutAt,
          outputs: extra?.outputs,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === 'OPEN_SESSION') {
          // Còn đợt chưa check-out → hỏi khai giờ ra rồi gửi lại (giữ nguyên ảnh đã chụp)
          setDeclareAsk({ photo, openSession: json.openSession });
          return;
        }
        setError(json.error || 'Chấm công thất bại');
        return;
      }
      setSuccess(action === 'in'
        ? `✅ Check-in thành công!${isFlex ? ` Đợt ${json.data?.session_no ?? ''} bắt đầu.` : ''}`
        : '✅ Check-out thành công! Hẹn gặp lại.');
      setQrToken(null);
      onChanged();
    } catch {
      setError('Lỗi kết nối, thử lại');
    } finally {
      setBusy(false);
    }
  };

  const handleScan = (data: string) => {
    // QR cổng dạng whqr:CODE:token
    const m = /^whqr:([^:]+):(.+)$/.exec(data.trim());
    if (!m) { setError('Mã QR không phải QR cổng kho'); return; }
    setQrToken(m[2]);
    setError('');
    setSuccess('Đã quét QR cổng — bấm Check-in/Check-out để chụp ảnh.');
  };

  // Sau khi chụp ảnh: check-out ở kho flex có sản phẩm → hỏi sản lượng trước khi gửi
  const handleCaptured = (action: 'in' | 'out', dataUrl: string) => {
    setCameraOpen(null);
    if (action === 'out' && isFlex && me.products.length > 0) {
      setOutputAsk({ photo: dataUrl });
      return;
    }
    void submit(action, dataUrl);
  };

  return (
    <div className="space-y-4">
      {/* Trạng thái hôm nay */}
      <div className="rounded-2xl border border-white/5 p-5" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">
            Hôm nay · {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' })}
          </p>
          {isFlex && (
            <span className="text-[11px] rounded-full bg-indigo-500/15 border border-indigo-500/20 px-2 py-0.5 text-indigo-300">
              Nhiều đợt/ngày
            </span>
          )}
        </div>

        {!isFlex ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Giờ vào</p>
              <p className={`text-lg font-700 ${hasAnyCheckin ? 'text-emerald-400' : 'text-foreground'}`}>{fmtTime(sessions[0]?.check_in_at ?? null)}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Giờ ra</p>
              <p className={`text-lg font-700 ${sessions[0]?.check_out_at ? 'text-emerald-400' : 'text-foreground'}`}>{fmtTime(sessions[0]?.check_out_at ?? null)}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">Chưa có đợt nào hôm nay</p>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                  <span className="text-[11px] text-muted-foreground">Đợt {s.session_no}</span>
                  <span className="text-sm text-foreground">{fmtTime(s.check_in_at)} → {fmtTime(s.check_out_at)}</span>
                  <span className="text-[11px]">
                    {!s.check_out_at ? (
                      <span className="text-emerald-400">đang làm</span>
                    ) : s.declared_status === 'pending' ? (
                      <span className="text-amber-400">tự khai · chờ duyệt</span>
                    ) : s.declared_status === 'rejected' ? (
                      <span className="text-red-400">bị từ chối</span>
                    ) : (
                      <span className="text-muted-foreground">{sessionHours(s)} giờ</span>
                    )}
                  </span>
                </div>
              ))
            )}
            {sessions.length > 0 && (
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Tổng giờ hôm nay (đã duyệt)</span>
                <span className="text-sm font-700 text-indigo-400">{me.today?.total_hours ?? 0} giờ</span>
              </div>
            )}
          </div>
        )}

        {me.worker.shift_name && !isFlex && (
          <p className="text-xs text-muted-foreground mt-3">Ca của bạn: <span className="text-foreground font-600">{me.worker.shift_name}</span></p>
        )}
        {!hasAnyCheckin && !isFlex && me.shifts.length > 0 && (
          <div className="mt-3">
            <label className="text-[11px] text-muted-foreground">Ca hôm nay</label>
            <select
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground"
            >
              <option value="">— Theo ca mặc định —</option>
              {me.shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Nút chấm công */}
      {!shiftDone && (
        <button
          onClick={() => setCameraOpen(open || (!isFlex && hasAnyCheckin) ? 'out' : 'in')}
          disabled={busy}
          className={`w-full rounded-2xl py-5 text-base font-700 text-white flex items-center justify-center gap-3 disabled:opacity-50 ${open || (!isFlex && hasAnyCheckin) ? 'bg-orange-600' : 'bg-indigo-600'}`}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (open || (!isFlex && hasAnyCheckin)) ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
          {open || (!isFlex && hasAnyCheckin)
            ? 'Check-out (chụp ảnh)'
            : isFlex && hasAnyCheckin ? 'Vào đợt mới (chụp ảnh)' : 'Check-in (chụp ảnh)'}
        </button>
      )}
      {/* flex + đang mở đợt: vẫn cho vào đợt mới (trường hợp quên check-out) */}
      {isFlex && open && (
        <button
          onClick={() => setCameraOpen('in')}
          disabled={busy}
          className="w-full rounded-2xl border border-white/10 py-3 text-sm font-600 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <LogIn className="h-4 w-4" /> Quên check-out đợt trước? Vào đợt mới &amp; khai giờ ra
        </button>
      )}
      {shiftDone && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">Hôm nay bạn đã hoàn thành chấm công. Nghỉ ngơi thôi!</p>
        </div>
      )}

      {/* GPS / QR helper */}
      <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-4 w-4 text-indigo-400 shrink-0" />
          {me.warehouse?.has_gps
            ? <span>Cần đứng trong phạm vi <b className="text-foreground">{me.warehouse.radius_m}m</b> quanh kho và bật định vị.</span>
            : <span>Kho chưa cấu hình GPS — chấm công không kiểm tra vị trí.</span>}
        </div>
        {qrToken ? (
          <div className="flex items-center justify-between rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5">
            <span className="text-xs text-indigo-300 flex items-center gap-2"><QrCode className="h-4 w-4" /> Đã quét QR cổng — GPS được bỏ qua</span>
            <button onClick={() => setQrToken(null)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button
            onClick={() => setScanOpen(true)}
            className="w-full rounded-xl border border-white/10 py-2.5 text-xs font-600 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <QrCode className="h-4 w-4" /> GPS lỗi? Quét QR tại cổng kho
          </button>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">{success}</div>}

      <QRScannerModal isOpen={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
      {cameraOpen && (
        <SelfieCapture
          onCancel={() => setCameraOpen(null)}
          onCapture={(dataUrl) => handleCaptured(cameraOpen, dataUrl)}
        />
      )}
      {outputAsk && (
        <OutputDeclareModal
          products={me.products}
          onSkip={() => { const p = outputAsk.photo; setOutputAsk(null); void submit('out', p); }}
          onSubmit={(outputs) => { const p = outputAsk.photo; setOutputAsk(null); void submit('out', p, { outputs }); }}
        />
      )}
      {declareAsk && (
        <DeclareCheckoutModal
          openSession={declareAsk.openSession}
          onCancel={() => setDeclareAsk(null)}
          onSubmit={(iso) => { const p = declareAsk.photo; setDeclareAsk(null); void submit('in', p, { declaredCheckoutAt: iso }); }}
        />
      )}
    </div>
  );
}

/** Popup nhập nhanh sản lượng của ĐỢT khi check-out — bỏ qua được; số liệu chờ quản lý duyệt. */
function OutputDeclareModal({
  products, onSkip, onSubmit,
}: {
  products: { id: string; name: string; unit: string }[];
  onSkip: () => void;
  onSubmit: (outputs: { productId: string; quantity: number }[]) => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});

  const collect = () => {
    const outputs = products
      .map((p) => ({ productId: p.id, quantity: Number(qty[p.id]) }))
      .filter((o) => Number.isFinite(o.quantity) && o.quantity > 0);
    onSubmit(outputs);
  };

  const hasAny = products.some((p) => Number(qty[p.id]) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-base font-700 text-foreground flex items-center gap-2"><Package className="h-4 w-4 text-indigo-400" /> Sản lượng đợt này</h2>
          <p className="text-[11px] text-muted-foreground mt-1">Nhập số lượng bạn đã làm trong đợt — quản lý sẽ duyệt lại. Không nhớ thì bỏ qua, quản lý nhập sau.</p>
        </div>
        <div className="p-5 space-y-3 max-h-[45vh] overflow-y-auto">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">{p.unit}</p>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={qty[p.id] ?? ''}
                onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))}
                placeholder="0"
                className="w-24 rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-right text-sm text-foreground"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 border-t border-white/5 px-5 py-4">
          <button onClick={onSkip} className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-600 text-muted-foreground">Bỏ qua</button>
          <button onClick={collect} disabled={!hasAny} className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-600 text-white disabled:opacity-40">
            Gửi &amp; Check-out
          </button>
        </div>
      </div>
    </div>
  );
}

/** Quên check-out đợt trước: khai giờ ra (chờ quản lý duyệt) rồi mới vào đợt mới. */
function DeclareCheckoutModal({
  openSession, onCancel, onSubmit,
}: {
  openSession: { check_in_at: string; session_no?: number } | null;
  onCancel: () => void;
  onSubmit: (iso: string) => void;
}) {
  const [time, setTime] = useState(''); // HH:MM
  const [err, setErr] = useState('');

  const inAt = openSession?.check_in_at ? new Date(openSession.check_in_at) : null;
  const fmtIn = inAt
    ? inAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
    : '—';

  const submit = () => {
    setErr('');
    if (!/^\d{2}:\d{2}$/.test(time)) { setErr('Chọn giờ ra của đợt trước'); return; }
    // Ghép giờ khai với NGÀY HÔM NAY giờ VN (đợt mở cùng ngày — ngày chốt 23:59)
    const todayVN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const iso = new Date(`${todayVN}T${time}:00+07:00`).toISOString();
    if (inAt && new Date(iso) <= inAt) { setErr(`Giờ ra phải sau giờ vào (${fmtIn})`); return; }
    if (new Date(iso) > new Date()) { setErr('Giờ ra không được ở tương lai'); return; }
    onSubmit(iso);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-base font-700 text-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-amber-400" /> Khai giờ ra đợt trước</h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            Bạn vào lúc <b className="text-foreground">{fmtIn}</b>{openSession?.session_no ? ` (đợt ${openSession.session_no})` : ''} nhưng chưa check-out.
            Khai giờ bạn đã ra — <b className="text-amber-300">quản lý sẽ duyệt</b> giờ này.
          </p>
        </div>
        <div className="p-5">
          <label className="text-[11px] text-muted-foreground">Giờ ra thực tế của đợt trước</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-3 text-base text-foreground"
          />
          {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
        </div>
        <div className="flex gap-3 border-t border-white/5 px-5 py-4">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-600 text-muted-foreground">Hủy</button>
          <button onClick={submit} className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-600 text-white">Khai &amp; vào đợt mới</button>
        </div>
      </div>
    </div>
  );
}

/** Modal camera trước — chỉ chụp trực tiếp, không cho chọn từ thư viện */
function SelfieCapture({ onCapture, onCancel }: { onCapture: (dataUrl: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [camError, setCamError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setCamError('Không mở được camera. Hãy cấp quyền camera cho trình duyệt.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const size = Math.min(video.videoWidth, video.videoHeight, 640);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.9)' }}>
      <div className="w-full max-w-sm">
        <div className="rounded-3xl overflow-hidden border border-white/10 aspect-square bg-black relative">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          {!ready && !camError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            </div>
          )}
          {camError && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="text-sm text-red-300 text-center">{camError}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-white/60 text-center mt-3">Đưa khuôn mặt vào giữa khung hình rồi bấm chụp</p>
        <div className="flex gap-3 mt-4">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-white/20 py-3 text-sm font-600 text-white/80">Hủy</button>
          <button
            onClick={capture}
            disabled={!ready}
            className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-600 text-white disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Camera className="h-4 w-4" /> Chụp & gửi
          </button>
        </div>
      </div>
    </div>
  );
}
