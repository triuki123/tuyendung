'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, BarChart3, Loader2, Download, TrendingUp, Receipt,
  Package, Wallet, Banknote, QrCode, CircleDollarSign, AlertCircle,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import type { UserModulePermissions } from '@/lib/modules';
import { formatVND, formatNumber } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import ErrorState from '@/components/ui/ErrorState';

interface ReportData {
  range: { from: string; to: string };
  revenue: {
    total_orders: number; gross_subtotal: number; discount_total: number; net_sales: number; total_revenue: number;
    cash_total: number; bankqr_total: number; wallet_total: number; unpaid_total: number;
  };
  cogs: { sale_cogs: number; waste_cost: number };
  gross_profit: number;
  margin_pct: number;
  pnl: {
    net_sales: number; cogs: number; gross_profit: number; waste_cost: number;
    operating_expense: number; net_profit: number; net_margin_pct: number;
    purchase_total: number; unpaid_total: number;
  };
  top_products: { product_id: string | null; name: string; qty: number; revenue: number }[];
  ingredient_usage: { ingredient_id: string; name: string; unit: string; qty_used: number; cost: number }[];
  daily: { business_date: string; orders: number; revenue: number }[];
  hourly: { hour: number; orders: number; revenue: number }[];
  shifts: {
    business_date: string; total_orders: number; total_revenue: number; cash_total: number;
    bankqr_total: number; wallet_total: number; unpaid_total: number;
    cash_counted: number | null; variance: number; closed_by_name: string | null; created_at: string;
  }[];
  shift_sessions: {
    id: string; business_date: string; shift_label: string | null; opened_by_name: string | null;
    opened_at: string; opening_float: number; total_orders: number; total_revenue: number;
    cash_total: number; expected_cash: number; cash_counted: number | null; variance: number;
  }[];
  staff_summary: {
    opened_by: string | null; name: string; shifts_count: number; total_orders: number;
    total_revenue: number; cash_total: number; bankqr_total: number; wallet_total: number; variance_total: number;
  }[];
}

type Preset = '7d' | '30d' | 'month' | 'custom';

function isoDaysAgo(days: number): string {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function isoToday(): string { return new Date().toISOString().slice(0, 10); }
function isoMonthStart(): string { return new Date().toISOString().slice(0, 8) + '01'; }

export default function BaoCaoClient({ embedded }: { embedded?: boolean } = {}) {
  const [perms, setPerms] = useState<UserModulePermissions | undefined>();
  const [role, setRole] = useState('');
  const [authLoading, setAuthLoading] = useState(true);

  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoToday());
  const [preset, setPreset] = useState<Preset>('30d');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getCurrentUser() as { role?: string; module_permissions?: UserModulePermissions } | null;
    setPerms(u?.module_permissions); setRole(u?.role ?? ''); setAuthLoading(false);
  }, []);

  const { canAccessInherited } = useUserPermissions(perms);
  const isSuperAdmin = role === 'super_admin';
  const canView = isSuperAdmin || canAccessInherited('solace-reports', 'view');
  const canExport = isSuperAdmin || canAccessInherited('solace-reports', 'export');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get<{ data: ReportData }>(`/api/solace/reports?from=${from}&to=${to}`);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải báo cáo');
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { if (!authLoading && canView) load(); }, [authLoading, canView, load]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === '7d') { setFrom(isoDaysAgo(6)); setTo(isoToday()); }
    else if (p === '30d') { setFrom(isoDaysAgo(29)); setTo(isoToday()); }
    else if (p === 'month') { setFrom(isoMonthStart()); setTo(isoToday()); }
  };

  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily.map(d => d.revenue) ?? [1])), [data]);
  const maxHourly = useMemo(() => Math.max(1, ...(data?.hourly.map(h => h.revenue) ?? [1])), [data]);

  const exportCsv = () => {
    if (!data) return;
    const rows: string[] = [];
    rows.push(`Báo cáo quán Solace,${data.range.from} → ${data.range.to}`);
    rows.push('');
    rows.push('TỔNG QUAN');
    rows.push(`Số đơn,${data.revenue.total_orders}`);
    rows.push(`Doanh thu (đã thu),${data.revenue.total_revenue}`);
    rows.push(`Tiền hàng,${data.revenue.gross_subtotal}`);
    rows.push(`Giảm giá,${data.revenue.discount_total}`);
    rows.push(`Tiền mặt,${data.revenue.cash_total}`);
    rows.push(`Chuyển khoản (VietQR),${data.revenue.bankqr_total}`);
    rows.push(`Ví nội bộ,${data.revenue.wallet_total}`);
    rows.push(`Chưa thu/Nợ,${data.revenue.unpaid_total}`);
    rows.push(`Giá vốn hàng bán,${data.cogs.sale_cogs}`);
    rows.push(`Hao hụt,${data.cogs.waste_cost}`);
    rows.push(`Lãi gộp,${data.gross_profit}`);
    rows.push(`Biên lãi (%),${data.margin_pct}`);
    rows.push('');
    rows.push('LÃI / LỖ');
    rows.push(`Doanh thu thuần,${data.pnl.net_sales}`);
    rows.push(`Giá vốn hàng bán,${data.pnl.cogs}`);
    rows.push(`Lãi gộp,${data.pnl.gross_profit}`);
    rows.push(`Hao hụt nguyên liệu,${data.pnl.waste_cost}`);
    rows.push(`Chi phí vận hành,${data.pnl.operating_expense}`);
    rows.push(`Lãi/Lỗ thuần,${data.pnl.net_profit}`);
    rows.push(`Biên lãi thuần (%),${data.pnl.net_margin_pct}`);
    rows.push(`(Tham khảo) Còn phải thu,${data.pnl.unpaid_total}`);
    rows.push(`(Tham khảo) Tiền mua nguyên liệu,${data.pnl.purchase_total}`);
    rows.push('');
    rows.push('MÓN BÁN CHẠY,SL,Doanh thu');
    data.top_products.forEach(p => rows.push(`${csv(p.name)},${p.qty},${p.revenue}`));
    rows.push('');
    rows.push('TIÊU HAO NGUYÊN LIỆU,Đơn vị,Lượng,Giá vốn');
    data.ingredient_usage.forEach(i => rows.push(`${csv(i.name)},${i.unit},${i.qty_used},${i.cost}`));
    rows.push('');
    rows.push('DOANH THU THEO NGÀY,Đơn,Doanh thu');
    data.daily.forEach(d => rows.push(`${d.business_date},${d.orders},${d.revenue}`));
    rows.push('');
    rows.push('DOANH THU THEO GIỜ,Đơn,Doanh thu');
    data.hourly.forEach(h => rows.push(`${String(h.hour).padStart(2, '0')}:00,${h.orders},${h.revenue}`));

    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bao-cao-solace_${data.range.from}_${data.range.to}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!canView) {
    return (
      <div className="flex flex-col items-center py-20 text-muted-foreground">
        <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Bạn không có quyền xem báo cáo quán</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {!embedded && (
        <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
        </Link>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-400" /> Báo Cáo Quán
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Doanh thu, giá vốn, tiêu hao nguyên liệu & kết ca</p>
        </div>
        {canExport && (
          <button onClick={exportCsv} disabled={!data || loading}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            <Download className="h-4 w-4" /> Xuất CSV
          </button>
        )}
      </div>

      {/* Bộ lọc khoảng ngày */}
      <div className="rounded-2xl border border-white/5 p-3 sm:p-4 space-y-3" style={{ background: 'var(--card)' }}>
        <div className="flex flex-wrap gap-2">
          {([['7d', '7 ngày'], ['30d', '30 ngày'], ['month', 'Tháng này'], ['custom', 'Tuỳ chọn']] as [Preset, string][]).map(([k, label]) => (
            <button key={k} onClick={() => applyPreset(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-600 border transition-colors ${
                preset === k ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' : 'border-white/10 text-muted-foreground hover:text-foreground'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Từ ngày</span>
            <input type="date" value={from} max={to}
              onChange={e => { setFrom(e.target.value); setPreset('custom'); }}
              className="rounded-lg px-2.5 py-1.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Đến ngày</span>
            <input type="date" value={to} min={from} max={isoToday()}
              onChange={e => { setTo(e.target.value); setPreset('custom'); }}
              className="rounded-lg px-2.5 py-1.5 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
          </label>
          <button onClick={load} disabled={loading}
            className="rounded-lg px-3 py-1.5 text-sm font-600 border border-white/10 text-foreground hover:bg-white/5 disabled:opacity-50">
            {loading ? 'Đang tải…' : 'Áp dụng'}
          </button>
        </div>
      </div>

      {error && data && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? null : (
        <>
          {/* Thẻ số liệu */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <Stat icon={<CircleDollarSign className="h-4 w-4" />} label="Doanh thu" value={formatVND(data.revenue.total_revenue)} accent="text-emerald-400" />
            <Stat icon={<Receipt className="h-4 w-4" />} label="Số đơn" value={formatNumber(data.revenue.total_orders)} />
            <Stat icon={<Package className="h-4 w-4" />} label="Giá vốn hàng bán" value={formatVND(data.cogs.sale_cogs)} accent="text-amber-400" />
            <Stat icon={<TrendingUp className="h-4 w-4" />} label={`Lãi gộp · ${data.margin_pct}%`} value={formatVND(data.gross_profit)} accent="text-indigo-400" />
          </div>

          {/* Phương thức thu */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <Stat icon={<Banknote className="h-4 w-4" />} label="Tiền mặt" value={formatVND(data.revenue.cash_total)} />
            <Stat icon={<QrCode className="h-4 w-4" />} label="Chuyển khoản" value={formatVND(data.revenue.bankqr_total)} />
            <Stat icon={<Wallet className="h-4 w-4" />} label="Ví nội bộ" value={formatVND(data.revenue.wallet_total)} />
            <Stat icon={<AlertCircle className="h-4 w-4" />} label="Chưa thu / Nợ" value={formatVND(data.revenue.unpaid_total)} accent={data.revenue.unpaid_total > 0 ? 'text-red-400' : undefined} />
          </div>

          {/* Lãi / Lỗ */}
          <Panel title="Lãi / Lỗ (kỳ đã chọn)">
            <div className="space-y-2">
              <PnlRow label="Doanh thu thuần" value={data.pnl.net_sales} />
              <PnlRow label="− Giá vốn hàng bán" value={-data.pnl.cogs} />
              <PnlRow label="= Lãi gộp" value={data.pnl.gross_profit} strong />
              <PnlRow label="− Hao hụt nguyên liệu" value={-data.pnl.waste_cost} />
              <PnlRow label="− Chi phí vận hành" value={-data.pnl.operating_expense} />
              <div className="border-t border-white/10 mt-2 pt-2">
                <PnlRow label={`${data.pnl.net_profit >= 0 ? 'Lãi' : 'Lỗ'} thuần · ${data.pnl.net_margin_pct}%`} value={data.pnl.net_profit} strong big />
              </div>
              <p className="text-2xs text-muted-foreground pt-1">
                Tham khảo: còn phải thu (nợ) {formatVND(data.pnl.unpaid_total)} · tiền đã chi mua nguyên liệu {formatVND(data.pnl.purchase_total)}.
              </p>
            </div>
          </Panel>

          {/* Doanh thu theo ngày */}
          <Panel title="Doanh thu theo ngày">
            {data.daily.length === 0 ? (
              <Empty text="Chưa có doanh thu trong khoảng này" />
            ) : (
              <div className="flex items-end gap-1 h-40 overflow-x-auto pb-1">
                {data.daily.map(d => (
                  <div key={d.business_date} className="flex flex-col items-center justify-end gap-1 min-w-[18px] flex-1 group relative">
                    <div className="w-full rounded-t bg-indigo-500/70 group-hover:bg-indigo-400 transition-colors"
                      style={{ height: `${Math.max(2, (d.revenue / maxDaily) * 100)}%` }} />
                    <span className="text-[9px] text-muted-foreground rotate-0 whitespace-nowrap">{d.business_date.slice(5)}</span>
                    <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 rounded-lg border border-white/10 px-2 py-1 text-2xs whitespace-nowrap" style={{ background: 'var(--card)' }}>
                      <div className="text-foreground font-600">{formatVND(d.revenue)}</div>
                      <div className="text-muted-foreground">{d.orders} đơn</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Doanh thu theo giờ (giờ cao điểm) */}
          <Panel title="Doanh thu theo giờ (giờ cao điểm)">
            {data.hourly.length === 0 ? (
              <Empty text="Chưa có dữ liệu theo giờ" />
            ) : (
              <div className="flex items-end gap-1 h-40 overflow-x-auto pb-1">
                {data.hourly.map(h => (
                  <div key={h.hour} className="flex flex-col items-center justify-end gap-1 min-w-[20px] flex-1 group relative">
                    <div className="w-full rounded-t bg-emerald-500/70 group-hover:bg-emerald-400 transition-colors"
                      style={{ height: `${Math.max(2, (h.revenue / maxHourly) * 100)}%` }} />
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">{String(h.hour).padStart(2, '0')}h</span>
                    <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 rounded-lg border border-white/10 px-2 py-1 text-2xs whitespace-nowrap" style={{ background: 'var(--card)' }}>
                      <div className="text-foreground font-600">{formatVND(h.revenue)}</div>
                      <div className="text-muted-foreground">{h.orders} đơn</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Món bán chạy */}
            <Panel title="Món bán chạy">
              {data.top_products.length === 0 ? <Empty text="Chưa có dữ liệu" /> : (
                <Table head={['Món', 'SL', 'Doanh thu']}>
                  {data.top_products.map((p, i) => (
                    <tr key={(p.product_id ?? 'x') + i} className="border-t border-white/5">
                      <td className="py-2 pr-2 text-foreground">{p.name}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{formatNumber(p.qty)}</td>
                      <td className="py-2 pl-2 text-right text-foreground tabular-nums">{formatVND(p.revenue)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>

            {/* Tiêu hao nguyên liệu */}
            <Panel title="Tiêu hao nguyên liệu">
              {data.ingredient_usage.length === 0 ? <Empty text="Chưa có dữ liệu" /> : (
                <Table head={['Nguyên liệu', 'Lượng', 'Giá vốn']}>
                  {data.ingredient_usage.map(i => (
                    <tr key={i.ingredient_id} className="border-t border-white/5">
                      <td className="py-2 pr-2 text-foreground">{i.name}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{formatNumber(i.qty_used)} {i.unit}</td>
                      <td className="py-2 pl-2 text-right text-foreground tabular-nums">{formatVND(i.cost)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>
          </div>

          {/* Doanh thu theo nhân viên trực ca */}
          <Panel title="Theo nhân viên trực ca">
            {data.staff_summary.length === 0 ? <Empty text="Chưa có phiên ca nào được chốt trong khoảng này" /> : (
              <div className="overflow-x-auto">
                <Table head={['Nhân viên', 'Số ca', 'Đơn', 'Doanh thu', 'Tiền mặt', 'Chuyển khoản', 'Ví', 'Lệch quỹ']}>
                  {data.staff_summary.map(s => (
                    <tr key={s.opened_by ?? s.name} className="border-t border-white/5">
                      <td className="py-2 pr-2 text-foreground whitespace-nowrap">{s.name}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{s.shifts_count}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{s.total_orders}</td>
                      <td className="py-2 px-2 text-right text-foreground tabular-nums">{formatVND(s.total_revenue)}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{formatVND(s.cash_total)}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{formatVND(s.bankqr_total)}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{formatVND(s.wallet_total)}</td>
                      <td className={`py-2 pl-2 text-right tabular-nums ${s.variance_total === 0 ? 'text-muted-foreground' : s.variance_total > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(s.variance_total > 0 ? '+' : '') + formatVND(s.variance_total)}
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Panel>

          {/* Chi tiết từng phiên ca */}
          <Panel title="Chi tiết phiên ca">
            {data.shift_sessions.length === 0 ? <Empty text="Chưa có phiên ca nào được chốt trong khoảng này" /> : (
              <div className="overflow-x-auto">
                <Table head={['Ngày', 'Ca', 'Nhân viên', 'Đơn', 'Doanh thu', 'Quỹ đầu', 'Phải có', 'Lệch quỹ']}>
                  {data.shift_sessions.map(s => (
                    <tr key={s.id} className="border-t border-white/5">
                      <td className="py-2 pr-2 text-foreground whitespace-nowrap">{s.business_date}</td>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{s.shift_label ?? '—'}</td>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{s.opened_by_name ?? '—'}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{s.total_orders}</td>
                      <td className="py-2 px-2 text-right text-foreground tabular-nums">{formatVND(s.total_revenue)}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{formatVND(s.opening_float)}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{formatVND(s.expected_cash)}</td>
                      <td className={`py-2 pl-2 text-right tabular-nums ${s.cash_counted == null ? 'text-muted-foreground' : s.variance === 0 ? 'text-muted-foreground' : s.variance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.cash_counted == null ? '—' : (s.variance > 0 ? '+' : '') + formatVND(s.variance)}
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Panel>

          {/* Lịch sử kết ca */}
          <Panel title="Lịch sử kết ca (theo ngày)">
            {data.shifts.length === 0 ? <Empty text="Chưa có ca nào được chốt trong khoảng này" /> : (
              <div className="overflow-x-auto">
                <Table head={['Ngày', 'Đơn', 'Doanh thu', 'Tiền mặt', 'Lệch quỹ', 'Người chốt']}>
                  {data.shifts.map(s => (
                    <tr key={s.business_date} className="border-t border-white/5">
                      <td className="py-2 pr-2 text-foreground whitespace-nowrap">{s.business_date}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{s.total_orders}</td>
                      <td className="py-2 px-2 text-right text-foreground tabular-nums">{formatVND(s.total_revenue)}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground tabular-nums">{formatVND(s.cash_total)}</td>
                      <td className={`py-2 px-2 text-right tabular-nums ${s.variance === 0 ? 'text-muted-foreground' : s.variance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.cash_counted == null ? '—' : (s.variance > 0 ? '+' : '') + formatVND(s.variance)}
                      </td>
                      <td className="py-2 pl-2 text-muted-foreground whitespace-nowrap">{s.closed_by_name ?? '—'}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function csv(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function PnlRow({ label, value, strong, big }: { label: string; value: number; strong?: boolean; big?: boolean }) {
  const color = value < 0 ? 'text-red-400' : value > 0 && strong ? 'text-emerald-400' : 'text-foreground';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`${big ? 'text-base' : 'text-sm'} ${strong ? 'font-700 text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`tabular-nums ${big ? 'text-lg font-700' : strong ? 'text-sm font-700' : 'text-sm'} ${color}`}>
        {value < 0 ? '−' : ''}{formatVND(Math.abs(value))}
      </span>
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 p-3 sm:p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-indigo-400">{icon}</span>
        <span className="text-2xs font-600 uppercase tracking-wider truncate">{label}</span>
      </div>
      <p className={`mt-1.5 text-base sm:text-lg font-700 tabular-nums ${accent ?? 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
      <h2 className="text-base font-600 text-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">
          {head.map((h, i) => (
            <th key={h} className={`pb-1 ${i === 0 ? 'text-left' : i === head.length - 1 ? 'text-right pl-2' : 'text-right px-2'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{text}</p>;
}
