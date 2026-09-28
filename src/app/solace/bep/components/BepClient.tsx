'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, ChefHat, RefreshCw } from 'lucide-react';
import { api } from '../../quan-ly/lib/solaceApi';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import type { SolaceOrder, OrderStatus } from '@/lib/services/solaceOrderService';
import ErrorState from '@/components/ui/ErrorState';

const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

interface Column { key: OrderStatus; title: string; accent: string; next?: { status: OrderStatus; label: string }; }
const COLUMNS: Column[] = [
  { key: 'pending', title: '🆕 Chờ pha', accent: 'text-amber-400', next: { status: 'preparing', label: 'Bắt đầu pha →' } },
  { key: 'preparing', title: '👨‍🍳 Đang pha', accent: 'text-indigo-400', next: { status: 'ready', label: 'Pha xong → Sẵn sàng' } },
  { key: 'ready', title: '✅ Sẵn sàng', accent: 'text-emerald-400', next: { status: 'done', label: 'Đã giao → Hoàn tất' } },
];

/** Phút đã trôi kể từ lúc tạo đơn. */
function elapsedMin(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

/** Màn hình BẾP (KDS): đơn đang xử lý realtime, chữ to, đẩy trạng thái 1 chạm. */
export default function BepClient({ embedded }: { embedded?: boolean } = {}) {
  const [orders, setOrders] = useState<SolaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [loadErr, setLoadErr] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, setTick] = useState(0); // ép render lại mỗi 30s để cập nhật phút trôi

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.get<{ data: SolaceOrder[] }>('/api/solace/orders?active=1');
      setOrders(r.data); setErr(''); setLoadErr(false);
    } catch (e) { setErr((e as Error).message); if (!silent) setLoadErr(true); }
    finally { if (!silent) setLoading(false); }
  }, []);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => { load(); }, [load]);
  useRealtimeData(['solace_orders'], { onUpdate: useCallback(() => loadRef.current(true), []) });
  useEffect(() => {
    const t = setInterval(() => loadRef.current(true), 7000);
    const tk = setInterval(() => setTick(x => x + 1), 30000);
    return () => { clearInterval(t); clearInterval(tk); };
  }, []);

  const advance = async (id: string, status: OrderStatus) => {
    setBusyId(id);
    try {
      const r = await fetch(`/api/solace/orders/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error((await r.json()).error || 'Lỗi');
      await load(true);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusyId(null); }
  };

  const byStatus = useMemo(() => {
    const m: Record<string, SolaceOrder[]> = { pending: [], preparing: [], ready: [] };
    for (const o of orders) if (m[o.status]) m[o.status].push(o);
    // Cũ nhất lên trên (ưu tiên làm trước).
    for (const k of Object.keys(m)) m[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return m;
  }, [orders]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {!embedded && (
            <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
            </Link>
          )}
          <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2 mt-1">
            <ChefHat className="h-6 w-6 text-indigo-400" /> Màn hình Bếp
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Đơn đang xử lý · tự cập nhật theo thời gian thực · ngày {todayVN()}</p>
        </div>
        <button onClick={() => load()} className="inline-flex items-center gap-1.5 self-start rounded-xl px-3 py-2 text-sm font-600 border border-white/10 text-foreground hover:bg-white/5">
          <RefreshCw className="h-4 w-4" /> Tải lại
        </button>
      </div>

      {err && !loadErr && <p className="text-xs text-red-400">{err}</p>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadErr ? (
        <ErrorState message="Không tải được đơn bếp. Vui lòng thử lại." onRetry={() => load()} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {COLUMNS.map(col => (
            <div key={col.key} className="rounded-2xl border border-white/5 p-3" style={{ background: 'var(--card)' }}>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className={`text-base font-700 ${col.accent}`}>{col.title}</h2>
                <span className="text-sm font-700 text-muted-foreground tabular-nums">{byStatus[col.key].length}</span>
              </div>
              <div className="space-y-2.5">
                {byStatus[col.key].length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center opacity-60">— trống —</p>
                ) : byStatus[col.key].map(o => (
                  <OrderCard key={o.id} order={o} next={col.next} busy={busyId === o.id} onAdvance={advance} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, next, busy, onAdvance }: {
  order: SolaceOrder; next?: { status: OrderStatus; label: string }; busy: boolean; onAdvance: (id: string, s: OrderStatus) => void;
}) {
  const mins = elapsedMin(order.created_at);
  // Quá lâu → cảnh báo màu (>10' vàng, >20' đỏ).
  const ageCls = mins >= 20 ? 'text-red-400' : mins >= 10 ? 'text-amber-400' : 'text-muted-foreground';
  const place = order.fulfillment_type === 'dine_in' ? `🪑 Tại chỗ${order.floor_note ? ' · ' + order.floor_note : ''}`
    : order.fulfillment_type === 'delivery' ? `🚚 Giao${order.floor_note ? ' · ' + order.floor_note : ''}` : '🏪 Tại quầy';
  return (
    <div className="rounded-xl border border-white/10 p-3 bg-white/5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-800 text-foreground tracking-wide">{order.code}</span>
        <span className={`text-sm font-700 tabular-nums ${ageCls}`}>{mins}′</span>
      </div>
      <div className="text-2xs text-muted-foreground mb-2">{place}{order.customer_name ? ` · ${order.customer_name}` : ''}</div>
      <ul className="space-y-1.5">
        {(order.items ?? []).map(it => (
          <li key={it.id} className="leading-tight">
            <div className="flex gap-2">
              <span className="text-base font-800 text-indigo-300 min-w-[1.75rem]">{it.qty}×</span>
              <span className="text-base font-700 text-foreground">{it.name_snapshot}</span>
            </div>
            {Array.isArray(it.options_json) && it.options_json.length > 0 &&
              <p className="text-xs text-muted-foreground pl-7">{(it.options_json as Array<{ name: string }>).map(x => x.name).join(' · ')}</p>}
            {it.note && <p className="text-xs font-700 text-amber-300 pl-7">⚠ {it.note}</p>}
          </li>
        ))}
      </ul>
      {order.note && <p className="text-xs font-700 text-amber-300 mt-2 border-t border-white/10 pt-1.5">📝 {order.note}</p>}
      {next && (
        <button onClick={() => onAdvance(order.id, next.status)} disabled={busy}
          className="w-full mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-700 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : next.label}
        </button>
      )}
    </div>
  );
}
