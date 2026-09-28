'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Printer, ChefHat, CheckCircle2, Check, X, Wallet, Trash2, Volume2, VolumeX, QrCode } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import { printInvoice, printKitchenTicket } from '../lib/printInvoice';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import CashPaymentModal from './CashPaymentModal';
import OrderDetailModal from './OrderDetailModal';
import VietQrModal from './VietQrModal';
import type { SolaceOrder, OrderStatus } from '@/lib/services/solaceOrderService';
import { useConfirm } from '@/context/ConfirmContext';

const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'ready']);
const QUEUE_FILTERS: Array<['all' | OrderStatus, string]> = [
  ['all', 'Tất cả'], ['pending', 'Chờ pha'], ['preparing', 'Đang pha'], ['ready', 'Sẵn sàng'],
];

/**
 * Bíp báo đơn mới (Web Audio API — không cần file âm thanh).
 * Dùng 1 AudioContext CHUNG, được "mở khoá" bởi thao tác chạm đầu tiên (ensureAudio()).
 * Trình duyệt/app chặn phát âm khi context còn 'suspended' (chưa có cử chỉ người dùng).
 */
let audioCtx: AudioContext | null = null;

/** Tạo (nếu chưa có) + resume AudioContext. PHẢI gọi trong 1 cử chỉ người dùng để mở khoá. */
function ensureAudio(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}

/** Chuông báo đơn (square, to & rõ trên loa điện thoại). short=true → 2 hồi ngắn (kèm giọng đọc). */
function beep(ctx: AudioContext, short = false): void {
  try {
    const now = ctx.currentTime;
    const notes = short
      ? [{ f: 988, t: 0, d: 0.18 }, { f: 1319, t: 0.20, d: 0.24 }]
      : [{ f: 988, t: 0, d: 0.26 }, { f: 1319, t: 0.30, d: 0.26 }, { f: 988, t: 0.62, d: 0.26 }, { f: 1319, t: 0.92, d: 0.40 }];
    const vol = short ? 0.4 : 0.55;
    for (const n of notes) {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square'; osc.frequency.value = n.f;
      const t0 = now + n.t;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
      osc.start(t0); osc.stop(t0 + n.d + 0.02);
    }
  } catch { /* bỏ qua */ }
}

function playDing(short = false): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === 'running') beep(ctx, short);
  else ctx.resume().then(() => beep(ctx, short)).catch(() => { /* chưa mở khoá → im lặng */ });
}

// ── Giọng đọc tiếng Việt (Web Speech API) ────────────────────────────────────
let viVoice: SpeechSynthesisVoice | null = null;
/** Nạp danh sách giọng + chọn giọng tiếng Việt (ưu tiên tên gợi ý nữ). Gọi lúc mở khoá. */
function warmVoices(): void {
  try {
    const synth = window.speechSynthesis; if (!synth) return;
    const pick = () => {
      const vs = synth.getVoices().filter(v => /^vi/i.test(v.lang));
      viVoice = vs.find(v => /female|nữ|f\b/i.test(v.name)) ?? vs[0] ?? null;
    };
    pick();
    synth.addEventListener('voiceschanged', pick);
  } catch { /* bỏ qua */ }
}
/** Đọc "Solace có đơn hàng mới". Trả false nếu máy không có giọng tiếng Việt. */
function speakNewOrder(): boolean {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !viVoice) return false;
    const u = new SpeechSynthesisUtterance('Solace, có đơn hàng mới');
    u.lang = 'vi-VN'; u.voice = viVoice; u.rate = 0.98; u.pitch = 1.05; u.volume = 1;
    synth.cancel();          // huỷ câu đang đọc (nếu nhiều đơn dồn)
    synth.speak(u);
    return true;
  } catch { return false; }
}

/** Báo đơn mới: có giọng Việt → chuông ngắn + đọc; không có → chuông to dài. */
function alertNewOrder(): void {
  if (speakNewOrder()) playDing(true);
  else playDing(false);
}

/** Ngày kinh doanh hôm nay theo giờ VN (YYYY-MM-DD). */
const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const STATUS_LABEL: Record<string, string> = { pending: 'Chờ pha', preparing: 'Đang pha', ready: 'Sẵn sàng', done: 'Hoàn tất', cancelled: 'Đã huỷ' };
const STATUS_CLS: Record<string, string> = {
  pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  preparing: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  ready: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  done: 'text-muted-foreground bg-white/5 border-white/10',
  cancelled: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const PAYSTATUS_LABEL: Record<string, string> = { paid: 'Đã thu', partial: 'Thu một phần', debt: 'Ghi nợ', unpaid: 'Chưa thu' };
const PAYSTATUS_CLS: Record<string, string> = {
  paid: 'text-emerald-400',
  partial: 'text-sky-400',
  debt: 'text-amber-400',
  unpaid: 'text-amber-400',
};

export default function OrderQueue({ reloadKey, canDelete = false, onActiveCountChange }: { reloadKey: number; canDelete?: boolean; onActiveCountChange?: (n: number) => void }) {
  const confirm = useConfirm();
  const [orders, setOrders] = useState<SolaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [soundOn, setSoundOn] = useState(true);
  const [err, setErr] = useState('');
  const [payOrder, setPayOrder] = useState<SolaceOrder | null>(null);
  const [paying, setPaying] = useState(false);
  const [qrOrder, setQrOrder] = useState<SolaceOrder | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  const soundRef = useRef(true);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  // Mở khoá âm thanh: trình duyệt/app chỉ cho phát sau cử chỉ người dùng.
  // Mỗi lần chạm → resume context (đủ để các tiếng bíp sau đó kêu được).
  useEffect(() => {
    const unlock = () => { ensureAudio(); warmVoices(); };
    warmVoices();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const qs = showAll ? `date=${todayVN()}&limit=200` : 'active=1';
      const r = await api.get<{ data: SolaceOrder[] }>(`/api/solace/orders?${qs}`);
      // Đơn mới (pending chưa từng thấy) → bíp báo.
      if (!firstLoad.current && soundRef.current && r.data.some(o => o.status === 'pending' && !seen.current.has(o.id))) {
        alertNewOrder();
      }
      r.data.forEach(o => seen.current.add(o.id));
      setOrders(r.data);
    } catch (e) { setErr((e as Error).message); }
    finally { if (!silent) setLoading(false); firstLoad.current = false; }
  }, [showAll]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => { load(); }, [load, reloadKey]);

  // Realtime: đơn mới / đổi trạng thái hiện NGAY (qua SSE). Fallback poll 7s để
  // luôn bắt được đơn (kể cả khi SSE rớt) — đủ nhanh để bíp báo đơn web/Telegram.
  const onRealtime = useCallback(() => { loadRef.current(true); }, []);
  useRealtimeData(['solace_orders'], { onUpdate: onRealtime });
  useEffect(() => {
    const t = setInterval(() => loadRef.current(true), 7000);
    return () => clearInterval(t);
  }, []);

  // Báo số đơn đang xử lý lên tab cha (badge).
  const activeCount = useMemo(() => orders.filter(o => ACTIVE_STATUSES.has(o.status)).length, [orders]);
  useEffect(() => { onActiveCountChange?.(activeCount); }, [activeCount, onActiveCountChange]);

  const shownOrders = useMemo(
    () => statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter),
    [orders, statusFilter]
  );

  const changeStatus = async (id: string, status: OrderStatus) => {
    try {
      await fetch(`/api/solace/orders/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
        .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Lỗi'); });
      load();
    } catch (e) { setErr((e as Error).message); }
  };
  const confirmPay = async () => {
    if (!payOrder) return;
    setPaying(true);
    try {
      await api.post(`/api/solace/orders/${payOrder.id}/pay`, { method: 'cash' });
      setPayOrder(null); load();
    } catch (e) { setErr((e as Error).message); }
    finally { setPaying(false); }
  };
  const openPrint = async (id: string) => {
    const r = await api.get<{ data: SolaceOrder }>(`/api/solace/orders/${id}`);
    printInvoice(r.data);
  };
  const openKitchen = async (id: string) => {
    const r = await api.get<{ data: SolaceOrder }>(`/api/solace/orders/${id}`);
    printKitchenTicket(r.data);
  };
  const delOrder = async (o: SolaceOrder) => {
    if (!(await confirm({ title: 'Xoá cứng đơn?', message: `XOÁ CỨNG đơn ${o.code}? Đơn sẽ bị xoá vĩnh viễn khỏi hệ thống, không thể hoàn tác.`, confirmLabel: 'Xoá vĩnh viễn', danger: true }))) return;
    try {
      const r = await fetch(`/api/solace/orders/${o.id}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) throw new Error((await r.json()).error || 'Lỗi');
      load();
    } catch (e) { setErr((e as Error).message); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{showAll ? 'Tất cả đơn hôm nay' : `Đơn đang xử lý${activeCount ? ` · ${activeCount}` : ''}`}</p>
        <div className="flex items-center gap-3">
          <button onClick={() => setSoundOn(v => { const nv = !v; if (nv) alertNewOrder(); return nv; })} title={soundOn ? 'Tắt âm báo đơn' : 'Bật âm báo đơn (bấm để nghe thử)'}
            className={`inline-flex items-center gap-1 text-xs ${soundOn ? 'text-indigo-400' : 'text-muted-foreground'}`}>
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} Âm báo
          </button>
          <button onClick={() => setShowAll(v => !v)} className="text-xs text-indigo-400 hover:text-indigo-300">
            {showAll ? 'Chỉ xem đang xử lý' : 'Xem tất cả hôm nay'}
          </button>
        </div>
      </div>

      {/* Lọc theo trạng thái */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {QUEUE_FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-500 border transition-colors ${statusFilter === k ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground'}`}>
            {label}{k !== 'all' ? ` (${orders.filter(o => o.status === k).length})` : ''}
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {shownOrders.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground"><span className="text-3xl opacity-30">🧾</span><p className="text-sm mt-3">Không có đơn nào</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {shownOrders.map(o => (
            <div key={o.id} className="rounded-2xl border border-white/5 p-3.5" style={{ background: 'var(--card)' }}>
              {/* Bấm vùng thông tin → xem chi tiết đơn */}
              <button onClick={() => setDetailId(o.id)} className="w-full text-left active:opacity-80">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-600 text-foreground">{o.code}</p>
                    <p className="text-2xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ·
                      {o.fulfillment_type === 'dine_in' ? ` Tại chỗ${o.floor_note ? ' · ' + o.floor_note : ''}` : ' Tại quầy'}
                      {o.customer_name ? ` · ${o.customer_name}` : ''}
                    </p>
                  </div>
                  <span className={`text-2xs font-600 px-2 py-0.5 rounded-full border ${STATUS_CLS[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                </div>

                <div className="mt-2 space-y-0.5">
                  {(o.items ?? []).map(it => (
                    <p key={it.id} className="text-xs text-muted-foreground">
                      {it.qty}× {it.name_snapshot}
                      {Array.isArray(it.options_json) && it.options_json.length ? ` (${(it.options_json as Array<{ name: string }>).map(x => x.name).join(', ')})` : ''}
                    </p>
                  ))}
                </div>
              </button>

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                <div>
                  <span className="text-sm font-700 text-foreground">{formatVND(o.total)}</span>
                  <span className={`ml-2 text-2xs ${PAYSTATUS_CLS[o.payment_status] ?? 'text-amber-400'}`}>
                    {PAYSTATUS_LABEL[o.payment_status] ?? o.payment_status}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {o.payment_status !== 'paid' && o.status !== 'cancelled' && (
                    <button onClick={() => setPayOrder(o)} title="Thu tiền mặt" className="btn-ghost rounded-lg p-1.5 text-emerald-400 hover:text-emerald-300"><Wallet className="h-4 w-4" /></button>
                  )}
                  {o.status !== 'cancelled' && (
                    <button onClick={() => setQrOrder(o)} title={o.payment_status === 'paid' ? 'Mã QR đơn' : 'Mã QR thu tiền chuyển khoản'}
                      className={`btn-ghost rounded-lg p-1.5 ${o.payment_status === 'paid' ? 'text-muted-foreground hover:text-foreground' : 'text-sky-400 hover:text-sky-300'}`}><QrCode className="h-4 w-4" /></button>
                  )}
                  <button onClick={() => openKitchen(o.id)} title="In vé bếp (pha chế)" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-amber-400"><ChefHat className="h-4 w-4" /></button>
                  <button onClick={() => openPrint(o.id)} title="In hoá đơn khách" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><Printer className="h-4 w-4" /></button>
                  {canDelete && (o.status === 'done' || o.status === 'cancelled') && (
                    <button onClick={() => delOrder(o)} title="Xoá cứng đơn (Super Admin)" className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </div>

              {o.status !== 'done' && o.status !== 'cancelled' && (
                <div className="flex items-center gap-1.5 mt-2">
                  {o.status === 'pending' && <Act onClick={() => changeStatus(o.id, 'preparing')} icon={<ChefHat className="h-3.5 w-3.5" />} label="Pha chế" />}
                  {o.status === 'preparing' && <Act onClick={() => changeStatus(o.id, 'ready')} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Sẵn sàng" />}
                  {(o.status === 'ready' || o.status === 'preparing') && <Act onClick={() => changeStatus(o.id, 'done')} icon={<Check className="h-3.5 w-3.5" />} label="Hoàn tất" primary />}
                  <button onClick={async () => { if (await confirm({ title: 'Huỷ đơn?', message: `Huỷ đơn ${o.code}? Kho sẽ được hoàn lại.`, confirmLabel: 'Huỷ đơn', danger: true })) changeStatus(o.id, 'cancelled'); }}
                    className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400"><X className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {payOrder && (
        <CashPaymentModal total={payOrder.total} busy={paying}
          onConfirm={confirmPay} onClose={() => setPayOrder(null)} />
      )}
      {qrOrder && (
        <VietQrModal orderId={qrOrder.id} orderCode={qrOrder.code} hideConfirm={qrOrder.payment_status === 'paid'}
          onPaid={() => { setQrOrder(null); load(); }} onClose={() => setQrOrder(null)} />
      )}
      {detailId && <OrderDetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={() => load()} />}
    </div>
  );
}

function Act({ onClick, icon, label, primary }: { onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-500 ${primary ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-white/10 text-muted-foreground hover:text-foreground'}`}>
      {icon} {label}
    </button>
  );
}
