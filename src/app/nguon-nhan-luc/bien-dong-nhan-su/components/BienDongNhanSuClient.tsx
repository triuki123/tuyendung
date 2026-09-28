'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, ArrowLeft, RefreshCw, Printer, TrendingUp, TrendingDown,
  Users, UserPlus, UserMinus, ArrowRightLeft, Percent, CalendarDays, Building2,
  FileSpreadsheet, ShieldAlert, Scale, Venus, Globe2, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, BarChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { exportLaborReportWorkbook, type LaborUsageReport } from './laborReportWorkbook';
import { useToast } from '@/context/ToastContext';

const COLORS = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#0ea5e9', '#f43f5e', '#14b8a6', '#eab308', '#ec4899', '#8b5cf6'];
const AXIS = '#94a3b8';
const GRID = 'rgba(255,255,255,0.06)';
const TOOLTIP_STYLE = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#e2e8f0', fontSize: 12 } as const;

interface Bucket { label: string; count: number }
interface MonthMovement { month: string; joined: number; left: number; net: number }
interface MoverRow { id: string; name: string; company: string | null; department: string | null; date: string | null; reason?: string | null }
interface Bhxh15Company { company_id: string | null; company: string; joinedBefore15: number; leftAfter15: number }
interface Bhxh15Month { month: string; companies: Bhxh15Company[]; totalJoinedBefore15: number; totalLeftAfter15: number }
interface FixedTermRisk {
  id: string; name: string; department: string; company: string;
  fixedCount: number; latestEnd: string | null; hasActive: boolean;
  severity: 'warning' | 'violation';
}
interface DeptGender { label: string; male: number; female: number; other: number; total: number; femaleRatio: number }
interface Compliance {
  totalActive: number; female: number; femaleRatio: number; foreign: number; foreignRatio: number;
  femalePolicyRequired: boolean; foreignHighRatio: boolean;
  byDeptGender: DeptGender[]; fixedTermRisk: FixedTermRisk[];
}
interface WfmData {
  year: number; companyId: string | null;
  dateFrom?: string | null; dateTo?: string | null;
  companies: { id: string; name: string }[];
  kpi: { headcount: number; joined: number; left: number; net: number; turnoverRate: number };
  monthly: MonthMovement[];
  structure: { byCompany: Bucket[]; byDepartment: Bucket[]; byGender: Bucket[]; byAge: Bucket[]; byTenure: Bucket[]; byEmploymentType: Bucket[] };
  leaveReasons: Bucket[];
  movers: { joined: MoverRow[]; left: MoverRow[] };
  bhxh15: Bhxh15Month[];
  compliance: Compliance;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u.id) h['x-current-user-id'] = u.id;
        if (u.role) h['x-current-user-role'] = u.role;
        if (u.module_permissions) h['x-user-permissions'] = JSON.stringify(u.module_permissions);
      } catch { /* noop */ }
    }
  }
  return h;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(d);
}

/** KPI card nhỏ. */
function KpiCard({ icon, label, value, tone, suffix }: { icon: React.ReactNode; label: string; value: number | string; tone: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl mb-2.5 ${tone}`}>{icon}</div>
      <p className="text-2xl font-700 text-foreground">{value}{suffix}</p>
      <p className="text-2xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

/** Khung biểu đồ. */
function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <p className="text-sm font-600 text-foreground mb-3">{title}</p>
      {children}
    </div>
  );
}

export default function BienDongNhanSuClient() {
  const toast = useToast();
  const nowYear = new Date().getFullYear();
  const [data, setData] = useState<WfmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [year, setYear] = useState(nowYear);
  const [companyId, setCompanyId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [filterMode, setFilterMode] = useState<'year' | 'range'>('year');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const exportReport = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ year: String(year) });
      if (companyId) qs.set('company_id', companyId);
      const res = await fetch(`/api/hr/workforce-movement/labor-report?${qs}`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success && json.data) {
        exportLaborReportWorkbook(json.data as LaborUsageReport);
      } else {
        toast.error(json.error || 'Không thể tạo báo cáo');
      }
    } catch (e) {
      console.error(e);
      toast.error('Lỗi khi tạo báo cáo sử dụng lao động');
    } finally {
      setExporting(false);
    }
  };

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterMode === 'range' && dateFrom && dateTo) {
        qs.set('date_from', dateFrom);
        qs.set('date_to', dateTo);
      } else {
        qs.set('year', String(year));
      }
      if (companyId) qs.set('company_id', companyId);
      const res = await fetch(`/api/hr/workforce-movement?${qs}`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => {
    if (filterMode === 'range' && (!dateFrom || !dateTo)) return; // chưa chọn đủ ngày
    load();
    // eslint-disable-next-line
  }, [year, companyId, filterMode, dateFrom, dateTo]);

  const years = Array.from({ length: 5 }, (_, i) => nowYear - i);

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="h-3.5 w-3.5" /> Nguồn Nhân Lực
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5">
            <ArrowRightLeft className="h-6 w-6 text-violet-400" /> Tình Hình Biến Động Nhân Sự
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Vào / ra / ròng, tỷ lệ nghỉ việc, cơ cấu lao động & báo cáo tăng giảm theo mốc ngày 15</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {/* Toggle chế độ lọc */}
          <div className="flex gap-1 bg-surface-2 border border-line rounded-lg p-0.5">
            <button
              onClick={() => setFilterMode('year')}
              className={`h-7 px-3 rounded-md text-xs font-600 transition-all ${filterMode === 'year' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-muted-foreground hover:text-foreground'}`}
            >Theo năm</button>
            <button
              onClick={() => setFilterMode('range')}
              className={`h-7 px-3 rounded-md text-xs font-600 transition-all ${filterMode === 'range' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-muted-foreground hover:text-foreground'}`}
            >Khoảng ngày</button>
          </div>

          {/* Bộ lọc theo năm */}
          {filterMode === 'year' && (
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none">
              {years.map(y => <option key={y} value={y}>Năm {y}</option>)}
            </select>
          )}

          {/* Bộ lọc khoảng ngày */}
          {filterMode === 'range' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/50"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                min={dateFrom || undefined}
                className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/50"
              />
              {dateFrom && dateTo && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-hover transition-colors text-xs"
                  title="Xoá bộ lọc ngày">✕</button>
              )}
            </div>
          )}

          <select value={companyId} onChange={e => setCompanyId(e.target.value)}
            className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none max-w-[180px]">
            <option value="">Tất cả công ty</option>
            {data?.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={exportReport} disabled={exporting} title="Xuất báo cáo sử dụng lao động (Mẫu 01/PLI — NĐ 145/2020)"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span className="hidden lg:inline">Xuất báo cáo lao động</span>
          </button>
          <button onClick={() => load(true)} disabled={refreshing}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-line px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-hover">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => window.print()} title="In báo cáo"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-line px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-hover">
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
            <KpiCard icon={<Users className="h-4.5 w-4.5 text-indigo-400" />} tone="bg-indigo-500/15" label="Quân số hiện tại" value={data.kpi.headcount} />
            <KpiCard icon={<UserPlus className="h-4.5 w-4.5 text-emerald-400" />} tone="bg-emerald-500/15" label={`Vào năm ${data.year}`} value={data.kpi.joined} />
            <KpiCard icon={<UserMinus className="h-4.5 w-4.5 text-rose-400" />} tone="bg-rose-500/15" label={`Ra năm ${data.year}`} value={data.kpi.left} />
            <KpiCard icon={data.kpi.net >= 0 ? <TrendingUp className="h-4.5 w-4.5 text-teal-400" /> : <TrendingDown className="h-4.5 w-4.5 text-amber-400" />}
              tone={data.kpi.net >= 0 ? 'bg-teal-500/15' : 'bg-amber-500/15'} label="Biến động ròng" value={`${data.kpi.net >= 0 ? '+' : ''}${data.kpi.net}`} />
            <KpiCard icon={<Percent className="h-4.5 w-4.5 text-purple-400" />} tone="bg-purple-500/15" label="Tỷ lệ nghỉ việc" value={data.kpi.turnoverRate} suffix="%" />
          </div>

          {/* Vào / ra theo tháng */}
          <ChartBox title={`Biến động vào / ra theo tháng — ${data.year}`}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data.monthly}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: AXIS, fontSize: 11 }} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar name="Vào" dataKey="joined" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar name="Ra" dataKey="left" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Line name="Ròng" type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartBox>

          {/* Cơ cấu lao động */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartBox title="Cơ cấu theo phòng ban">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.structure.byDepartment} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} width={110} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ChartBox title="Theo giới tính">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={data.structure.byGender} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.label}>
                      {data.structure.byGender.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartBox>
              <ChartBox title="Theo độ tuổi">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.structure.byAge}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} />
                    <YAxis tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartBox title="Theo thâm niên">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.structure.byTenure}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 9 }} />
                  <YAxis tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
            <ChartBox title="Theo loại hợp đồng">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.structure.byEmploymentType}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 9 }} />
                  <YAxis tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
            <ChartBox title="Nghỉ việc theo lý do">
              {data.leaveReasons.length === 0 ? (
                <div className="flex items-center justify-center h-[240px] text-xs text-muted-foreground">Chưa có dữ liệu nghỉ việc</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={data.leaveReasons} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label={(e: any) => e.label}>
                      {data.leaveReasons.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartBox>
          </div>

          {/* ── Tuân thủ pháp luật lao động ── */}
          <CompliancePanel c={data.compliance} />

          {/* Báo cáo tăng/giảm mốc ngày 15 */}
          <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="px-4 py-3 border-b border-line-subtle flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-600 text-foreground">Báo cáo tăng/giảm theo mốc ngày 15</span>
              <span className="text-2xs text-muted-foreground">(vào trước 15 · nghỉ sau 15{companyId ? '' : ' — theo từng công ty'})</span>
            </div>
            {data.bhxh15.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">Không có biến động trong năm {data.year}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.03] text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-600">Tháng</th>
                      <th className="text-left px-4 py-2.5 font-600">Công ty</th>
                      <th className="text-center px-4 py-2.5 font-600 text-emerald-400">Vào trước 15</th>
                      <th className="text-center px-4 py-2.5 font-600 text-rose-400">Nghỉ sau 15</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bhxh15.map(m => (
                      <React.Fragment key={m.month}>
                        {m.companies.map((c, ci) => (
                          <tr key={m.month + (c.company_id || ci)} className="border-t border-line-subtle">
                            {ci === 0 && <td rowSpan={m.companies.length + 1} className="px-4 py-2.5 font-600 text-foreground align-top">{m.month}</td>}
                            <td className="px-4 py-2.5 text-muted-foreground inline-flex items-center gap-1.5"><Building2 className="h-3 w-3" /> {c.company}</td>
                            <td className="px-4 py-2.5 text-center text-emerald-300">{c.joinedBefore15 || '—'}</td>
                            <td className="px-4 py-2.5 text-center text-rose-300">{c.leftAfter15 || '—'}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-line bg-white/[0.02] font-600">
                          <td className="px-4 py-2 text-foreground">Tổng {m.month}</td>
                          <td className="px-4 py-2 text-center text-emerald-400">{m.totalJoinedBefore15}</td>
                          <td className="px-4 py-2 text-center text-rose-400">{m.totalLeftAfter15}</td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Danh sách vào / ra */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MoverTable title={`Người vào năm ${data.year}`} icon={<UserPlus className="h-4 w-4 text-emerald-400" />} rows={data.movers.joined} />
            <MoverTable title={`Người nghỉ năm ${data.year}`} icon={<UserMinus className="h-4 w-4 text-rose-400" />} rows={data.movers.left} showReason />
          </div>
        </>
      )}
    </div>
  );
}

/** Khối tuân thủ pháp luật lao động: tỷ lệ giới/nước ngoài, HĐ xác định thời hạn lần 3+, giới tính theo phòng ban. */
function CompliancePanel({ c }: { c: Compliance }) {
  const violations = c.fixedTermRisk.filter(r => r.severity === 'violation');
  const warnings = c.fixedTermRisk.filter(r => r.severity === 'warning');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="h-4.5 w-4.5 text-amber-400" />
        <h2 className="text-base font-700 text-foreground">Tuân thủ pháp luật lao động</h2>
        <span className="text-2xs text-muted-foreground">Bộ luật Lao động 2019</span>
      </div>

      {/* Thẻ chỉ số tuân thủ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Lao động nữ */}
        <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-pink-500/15 mb-2.5">
                <Venus className="h-4.5 w-4.5 text-pink-400" />
              </div>
              <p className="text-2xl font-700 text-foreground">{c.female} <span className="text-base font-500 text-muted-foreground">({c.femaleRatio}%)</span></p>
              <p className="text-2xs text-muted-foreground mt-0.5">Lao động nữ / tổng {c.totalActive}</p>
            </div>
          </div>
          {c.femalePolicyRequired && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-2xs text-amber-200/90 leading-relaxed">
                Có <b>≥10 lao động nữ</b> — doanh nghiệp cần bảo đảm chính sách bình đẳng giới &amp; chế độ riêng cho lao động nữ (Điều 135–136 BLLĐ).
              </p>
            </div>
          )}
        </div>

        {/* Lao động nước ngoài */}
        <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 mb-2.5">
            <Globe2 className="h-4.5 w-4.5 text-sky-400" />
          </div>
          <p className="text-2xl font-700 text-foreground">{c.foreign} <span className="text-base font-500 text-muted-foreground">({c.foreignRatio}%)</span></p>
          <p className="text-2xs text-muted-foreground mt-0.5">Lao động nước ngoài (theo quốc tịch)</p>
          {c.foreignHighRatio ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-2xs text-amber-200/90 leading-relaxed">
                Tỷ lệ lao động nước ngoài cao (&gt;30%) — rà soát điều kiện sử dụng &amp; giấy phép lao động (Điều 151–152 BLLĐ, NĐ 152/2020).
              </p>
            </div>
          ) : (
            <p className="mt-3 text-2xs text-muted-foreground/70">Mỗi lao động nước ngoài cần có giấy phép lao động còn hiệu lực.</p>
          )}
        </div>
      </div>

      {/* Cảnh báo hợp đồng xác định thời hạn ký quá 2 lần (Điều 20) */}
      <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="px-4 py-3 border-b border-line-subtle flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-400" />
          <span className="text-sm font-600 text-foreground">Hợp đồng xác định thời hạn — rủi ro Điều 20</span>
          {c.fixedTermRisk.length > 0 && (
            <span className="ml-auto flex items-center gap-2">
              {violations.length > 0 && <span className="rounded-full bg-rose-500/20 text-rose-300 text-2xs font-700 px-2 py-0.5">{violations.length} vi phạm</span>}
              {warnings.length > 0 && <span className="rounded-full bg-amber-500/20 text-amber-300 text-2xs font-700 px-2 py-0.5">{warnings.length} cần lưu ý</span>}
            </span>
          )}
        </div>
        <div className="px-4 py-2.5 border-b border-line-subtle bg-white/[0.02]">
          <p className="text-2xs text-muted-foreground leading-relaxed">
            HĐLĐ xác định thời hạn chỉ được ký <b>tối đa 2 lần</b>; nếu người lao động vẫn tiếp tục làm việc thì lần ký kế tiếp <b>phải là HĐLĐ không xác định thời hạn</b> (khoản 2 Điều 20 BLLĐ 2019).
          </p>
        </div>
        {c.fixedTermRisk.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">Không có trường hợp rủi ro — tất cả hợp đồng đang trong giới hạn cho phép ✅</p>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: 'var(--card)' }}>
                <tr className="text-muted-foreground border-b border-line-subtle">
                  <th className="text-left px-4 py-2 font-600">Họ tên</th>
                  <th className="text-left px-4 py-2 font-600">Phòng ban</th>
                  <th className="text-center px-4 py-2 font-600">Số lần ký HĐ XĐTH</th>
                  <th className="text-left px-4 py-2 font-600">HĐ gần nhất hết hạn</th>
                  <th className="text-left px-4 py-2 font-600">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {c.fixedTermRisk.map(r => (
                  <tr key={r.id} className="border-t border-line-subtle">
                    <td className="px-4 py-2 text-foreground">{r.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.department}</td>
                    <td className="px-4 py-2 text-center font-700 text-foreground">{r.fixedCount}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(r.latestEnd)}</td>
                    <td className="px-4 py-2">
                      {r.severity === 'violation' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 text-rose-300 px-2 py-0.5 font-600">Vi phạm — đã ký ≥3 lần</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 text-amber-300 px-2 py-0.5 font-600">Lần ký tới phải vô thời hạn</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cơ cấu giới tính theo phòng ban */}
      {c.byDeptGender.length > 0 && (
        <ChartBox title="Cơ cấu giới tính theo phòng ban (Điều 135–136)">
          <ResponsiveContainer width="100%" height={Math.max(220, c.byDeptGender.length * 28)}>
            <BarChart data={c.byDeptGender} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar name="Nam" dataKey="male" stackId="g" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar name="Nữ" dataKey="female" stackId="g" fill="#ec4899" radius={[0, 4, 4, 0]} />
              <Bar name="Khác" dataKey="other" stackId="g" fill="#64748b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}
    </div>
  );
}

function MoverTable({ title, icon, rows, showReason }: { title: string; icon: React.ReactNode; rows: MoverRow[]; showReason?: boolean }) {
  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="px-4 py-3 border-b border-line-subtle flex items-center gap-2">
        {icon}<span className="text-sm font-600 text-foreground">{title}</span>
        <span className="text-2xs text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">Không có</p>
      ) : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ background: 'var(--card)' }}>
              <tr className="text-muted-foreground border-b border-line-subtle">
                <th className="text-left px-4 py-2 font-600">Họ tên</th>
                <th className="text-left px-4 py-2 font-600">Phòng ban</th>
                <th className="text-left px-4 py-2 font-600">Ngày</th>
                {showReason && <th className="text-left px-4 py-2 font-600">Lý do</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-line-subtle">
                  <td className="px-4 py-2 text-foreground">{r.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.department || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmtDate(r.date)}</td>
                  {showReason && <td className="px-4 py-2 text-muted-foreground">{r.reason || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
