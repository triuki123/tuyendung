'use client';

/**
 * Tab "Tổng quan" — phân tích chi phí + cảnh báo.
 *
 * Quy tắc trực quan hoá (đã chạy validator, xem dataviz skill):
 *  - Bảng màu categorical CỐ ĐỊNH 8 slot, KHÔNG lấy màu tự đặt trong DB, KHÔNG sinh màu thứ 9
 *    (dư → gộp "Khác"). Slot gán theo id ⇒ màu bám THỰC THỂ, không bám thứ hạng.
 *  - Dark: CVD ΔE 10.3 (dải sàn) ⇒ BẮT BUỘC mã hoá phụ: legend + khe 2px giữa các lớp + bảng số.
 *  - Light: 3 slot < 3:1 ⇒ BẮT BUỘC bảng số kèm theo (đã có bảng "Theo loại").
 *  - Màu trạng thái (cảnh báo) là bộ RIÊNG, luôn đi kèm icon + nhãn chữ, không bao giờ chỉ dùng màu.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  Loader2, AlertTriangle, Clock3, FileWarning, ArrowUp, ArrowDown, Wallet, Receipt, Inbox,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { formatVND } from '@/lib/format';
import { useToast } from '@/context/ToastContext';

interface ChartSeries { key: string; name: string }
interface CategoryRow {
  category_id: string | null; name: string; current: number; median6: number;
  diffPct: number | null; spark: number[]; slot: number | null;
}
interface Warning {
  kind: string; severity: 'high' | 'medium' | 'low';
  title: string; detail: string; amount?: number; expenseId?: string;
}
interface Analytics {
  month: string;
  kpi: {
    total: number; median6: number; diffPct: number | null;
    pendingCount: number; pendingAmount: number;
    unsettledAdvanceCount: number; unsettledAdvanceAmount: number;
    noAttachmentCount: number;
  };
  chartSeries: ChartSeries[];
  series: Array<Record<string, number | string>>;
  categories: CategoryRow[];
  topSuppliers: Array<{ supplier_name: string; total: number; count: number }>;
  warnings: Warning[];
}

/** Rút gọn cho trục Y. Số tiền CHÍNH XÁC luôn đi qua formatVND (tooltip/bảng). */
function compactVND(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
  if (a >= 1_000_000) return `${Math.round(n / 1_000_000)} tr`;
  if (a >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (m: string) => `${m.slice(5)}/${m.slice(2, 4)}`;

/** Bộ trạng thái RIÊNG (không đụng bảng màu series) — luôn kèm icon + nhãn chữ. */
const SEVERITY = {
  high: { label: 'Cần xử lý', cls: 'text-red-400 border-red-500/30 bg-red-500/10', Icon: AlertTriangle },
  medium: { label: 'Theo dõi', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10', Icon: Clock3 },
  low: { label: 'Ghi chú', cls: 'text-orange-300 border-orange-500/30 bg-orange-500/10', Icon: FileWarning },
} as const;

/** Sparkline 6 tháng — một chuỗi, không cần legend. */
function Sparkline({ values }: { values: number[] }) {
  if (!values.length || values.every((v) => v === 0)) return <span className="text-2xs text-muted-foreground">—</span>;
  const w = 72, h = 20, max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground" />
    </svg>
  );
}

function Variance({ pct: p }: { pct: number | null }) {
  if (p === null) return <span className="text-2xs text-muted-foreground">—</span>;
  const up = p >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${up ? 'text-amber-400' : 'text-sky-400'}`}>
      <Icon size={12} /> {Math.abs(Math.round(p * 100))}%
    </span>
  );
}

function KpiTile({ label, value, sub, Icon }: { label: string; value: string; sub?: React.ReactNode; Icon: React.ElementType }) {
  return (
    <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={14} /><span className="text-2xs font-600 uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-800 text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, names }: any) {
  if (!active || !Array.isArray(payload) || !payload.length) return null;
  const rows = payload.filter((p: any) => Number(p.value) > 0);
  const total = rows.reduce((s: number, p: any) => s + Number(p.value), 0);
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 text-xs shadow-xl" style={{ background: 'var(--card)' }}>
      <p className="mb-1 font-600 text-foreground">Tháng {label}</p>
      {rows.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span className="flex-1">{names[p.dataKey] ?? p.dataKey}</span>
          <span className="tabular-nums text-foreground">{formatVND(Number(p.value))}</span>
        </p>
      ))}
      <p className="mt-1 flex items-center gap-2 border-t border-white/10 pt-1 font-700 text-foreground">
        <span className="flex-1">Tổng</span><span className="tabular-nums">{formatVND(total)}</span>
      </p>
    </div>
  );
}

export default function ExpenseDashboardTab({
  companies, onOpenExpense,
}: { companies: Array<{ id: string; name: string }>; onOpenExpense?: (id: string) => void }) {
  const toast = useToast();
  const user = useMemo(() => getCurrentUser() as any, []);
  const [companyId, setCompanyId] = useState('');
  const [month, setMonth] = useState(thisMonth);
  const [includePending, setIncludePending] = useState(false);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Mặc định: công ty của user nếu nằm trong danh sách, không thì công ty đầu tiên.
  useEffect(() => {
    if (companyId || !companies.length) return;
    const mine = companies.find((c) => c.id === user?.company_id);
    setCompanyId(mine?.id || companies[0].id);
  }, [companies, companyId, user?.company_id]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setErr('');
    try {
      const qs = new URLSearchParams({ company_id: companyId, month });
      if (includePending) qs.set('include_pending', '1');
      const r = await fetch(`/api/expenses/analytics?${qs}`, { headers: { 'x-current-user-id': user?.id || '' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error || 'Không tải được số liệu'); setData(null); return; }
      setData(j.data);
    } catch { toast.error('Lỗi kết nối'); } finally { setLoading(false); }
  }, [companyId, month, includePending, toast, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const names = useMemo(() => Object.fromEntries((data?.chartSeries ?? []).map((s) => [s.key, s.name])), [data]);
  const hasData = !!data && data.series.some((row) => (data.chartSeries).some((s) => Number(row[s.key]) > 0));

  return (
    <div className="space-y-5">
      {/* Bảng màu chart — đã chạy validator cho từng nền (dark #0f1c2e, light #ffffff). */}
      <style jsx global>{`
        .viz-root {
          --viz-1: #3987e5; --viz-2: #199e70; --viz-3: #c98500; --viz-4: #008300;
          --viz-5: #9085e9; --viz-6: #e66767; --viz-7: #d55181; --viz-8: #d95926;
          --viz-surface: #0f1c2e;
          --viz-grid: rgba(255,255,255,0.08);
        }
        html.light .viz-root {
          --viz-1: #2a78d6; --viz-2: #1baf7a; --viz-3: #eda100; --viz-4: #008300;
          --viz-5: #4a3aa7; --viz-6: #e34948; --viz-7: #e87ba4; --viz-8: #eb6834;
          --viz-surface: #ffffff;
          --viz-grid: rgba(15,23,42,0.08);
        }
      `}</style>

      {/* Bộ lọc — một hàng, phía trên biểu đồ */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#162033] px-3 py-1.5 text-xs text-foreground outline-none">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())}
          className="rounded-xl border border-white/10 bg-[#162033] px-3 py-1.5 text-xs text-foreground outline-none" />
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          <input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} className="accent-indigo-500" />
          Gồm phiếu chờ duyệt
        </label>
        <span className="ml-auto text-2xs text-muted-foreground">
          Mặc định chỉ tính phiếu đã duyệt trở đi · so với trung vị 6 tháng
        </span>
      </div>

      {err && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</p>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data ? null : (
        <div className="viz-root space-y-5">
          {/* 1. KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Tổng chi tháng này" value={formatVND(data.kpi.total)} Icon={Receipt}
              sub={<span className="inline-flex items-center gap-1">so trung vị 6T <Variance pct={data.kpi.diffPct} /></span>} />
            <KpiTile label="Chờ duyệt" value={`${data.kpi.pendingCount} phiếu`} Icon={Clock3}
              sub={formatVND(data.kpi.pendingAmount)} />
            <KpiTile label="Tạm ứng chưa quyết toán" value={`${data.kpi.unsettledAdvanceCount} phiếu`} Icon={Wallet}
              sub={formatVND(data.kpi.unsettledAdvanceAmount)} />
            <KpiTile label="Thiếu chứng từ" value={`${data.kpi.noAttachmentCount} phiếu`} Icon={FileWarning}
              sub="đã duyệt nhưng chưa đính kèm" />
          </div>

          {/* 2. CẢNH BÁO — đặt cao, actionable */}
          <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-600 uppercase tracking-wider text-muted-foreground">
              <AlertTriangle size={13} /> Cảnh báo ({data.warnings.length})
            </p>
            {data.warnings.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">Không có bất thường trong tháng này.</p>
            ) : (
              <div className="space-y-2">
                {data.warnings.map((w, i) => {
                  const s = SEVERITY[w.severity];
                  const clickable = !!w.expenseId && !!onOpenExpense;
                  return (
                    <div key={i}
                      onClick={() => clickable && onOpenExpense!(w.expenseId!)}
                      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 ${s.cls} ${clickable ? 'cursor-pointer hover:brightness-110' : ''}`}>
                      <s.Icon size={15} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-600 text-foreground">{w.title}</p>
                        <p className="text-2xs text-muted-foreground">{w.detail}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-2xs font-600">{s.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Xu hướng 12 tháng × loại chi phí */}
          <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
            <p className="mb-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Chi phí 12 tháng theo loại</p>
            {!hasData ? (
              <div className="flex flex-col items-center py-14 text-muted-foreground">
                <Inbox className="mb-2 h-8 w-8 opacity-30" />
                <p className="text-sm">Chưa có phiếu chi nào trong 12 tháng</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <YAxis tickFormatter={compactVND} tickLine={false} axisLine={false} width={56}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTooltip names={names} />} />
                  {/* ≥2 chuỗi: legend luôn hiện (identity không chỉ dựa vào màu). 1 chuỗi: tiêu đề đã đủ. */}
                  {data.chartSeries.length >= 2 && (
                    <Legend iconType="square" iconSize={9}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(v) => <span style={{ color: 'var(--muted-foreground)' }}>{v}</span>} />
                  )}
                  {data.chartSeries.map((s, i) => (
                    <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" maxBarSize={28}
                      fill={`var(--viz-${i + 1})`}
                      /* khe 2px màu nền giữa các lớp — mã hoá phụ bắt buộc cho dải CVD sàn */
                      stroke="var(--viz-surface)" strokeWidth={2}
                      radius={i === data.chartSeries.length - 1 ? [4, 4, 0, 0] : undefined} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 4. Bảng số (bắt buộc kèm biểu đồ) + Top NCC */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-white/5 p-4 lg:col-span-3" style={{ background: 'var(--card)' }}>
              <p className="mb-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Theo loại chi phí</p>
              {data.categories.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">Chưa có dữ liệu.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-2xs uppercase text-muted-foreground">
                        <th className="py-2 text-left">Loại</th>
                        <th className="py-2 text-right">Tháng này</th>
                        <th className="py-2 text-right">Trung vị 6T</th>
                        <th className="py-2 text-right">Lệch</th>
                        <th className="py-2 pl-3 text-right">6 tháng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.categories.map((c) => (
                        <tr key={c.category_id ?? c.name} className="border-b border-white/5">
                          <td className="py-2">
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                style={{ background: c.slot !== null ? `var(--viz-${c.slot + 1})` : 'var(--muted-foreground)' }} />
                              <span className="truncate text-foreground">{c.name}</span>
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums text-foreground">{formatVND(c.current)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">{formatVND(c.median6)}</td>
                          <td className="py-2 text-right"><Variance pct={c.diffPct} /></td>
                          <td className="py-2 pl-3 text-right"><Sparkline values={c.spark} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/5 p-4 lg:col-span-2" style={{ background: 'var(--card)' }}>
              <p className="mb-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Top nhà cung cấp (tháng này)</p>
              {data.topSuppliers.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">Chưa có nhà cung cấp nào.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.topSuppliers.map((s) => (
                    <div key={s.supplier_name} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-foreground">{s.supplier_name}</span>
                      <span className="shrink-0 text-2xs text-muted-foreground">{s.count} phiếu</span>
                      <span className="shrink-0 tabular-nums font-600 text-foreground">{formatVND(s.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
