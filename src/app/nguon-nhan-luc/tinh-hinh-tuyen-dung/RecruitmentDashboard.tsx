'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, LayoutDashboard, UserPlus, FolderKanban, FileText,
  Users, Clock, TrendingUp, Building2, RefreshCw, Briefcase,
  ClipboardList, AlertTriangle, Award, TrendingDown,
  CalendarClock, Target, UserX, FileWarning, Crown,
  FileSpreadsheet, Printer,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { getRecruitmentDashboard, RecruitmentDashboardData, DashBucket } from '@/lib/api/onboardingApi';

const COLORS = ['#fafafa', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#e5e5e5', '#bdbdbd', '#8a8a8a', '#626262', '#404040'];
const AXIS = '#a3a3a3';
const GRID = 'rgba(255,255,255,0.10)';
const TOOLTIP_STYLE = { background: '#171717', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12, color: '#f5f5f5', fontSize: 12 } as const;

const CV_STAGE_LABELS: Record<string, string> = {
  new: 'Mới', screening: 'Sàng lọc', interviewed: 'Phỏng vấn',
  offered: 'Đã offer', hired: 'Đã Onboard', rejected: 'Loại', pool: 'Lưu kho',
};

const REC_LABELS: Record<string, string> = {
  strong_yes: 'Rất nên tuyển', yes: 'Nên tuyển', neutral: 'Trung lập',
  no: 'Không nên', strong_no: 'Hoàn toàn không',
};

/** Tạo trục tháng theo khoảng from→to (tối đa 24 tháng), lấp tháng trống = 0. */
function buildMonths(points: { month: string; value: number }[], from?: string, to?: string): { label: string; value: number }[] {
  const map = new Map(points.map(p => [p.month, p.value]));
  const start = from ? new Date(from.slice(0, 7) + '-01T00:00:00') : new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
  const end   = to   ? new Date(to.slice(0, 7) + '-01T00:00:00')   : new Date();
  const out: { label: string; value: number }[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  for (let i = 0; i < 24 && d <= end; i++, d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`, value: map.get(key) || 0 });
  }
  return out;
}

/** Preset khoảng thời gian → {from,to} (YYYY-MM-DD). */
function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const monthsAgo = (n: number) => new Date(now.getFullYear(), now.getMonth() - n, 1);
  switch (preset) {
    case '3m':  return { from: fmt(monthsAgo(2)),  to: fmt(now) };
    case '6m':  return { from: fmt(monthsAgo(5)),  to: fmt(now) };
    case 'ytd': return { from: `${now.getFullYear()}-01-01`,     to: fmt(now) };
    default:    return { from: fmt(monthsAgo(11)), to: fmt(now) }; // 12m
  }
}

export default function RecruitmentDashboard() {
  const [data, setData] = useState<RecruitmentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Bộ lọc ──
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [preset, setPreset] = useState<'12m' | '6m' | '3m' | 'ytd' | 'custom'>('12m');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try { setIsSuperAdmin(JSON.parse(stored).role === 'super_admin'); } catch { /* empty */ }
    }
  }, []);

  const filterOpts = useMemo(() => {
    const range = preset === 'custom' && dateFrom && dateTo ? { from: dateFrom, to: dateTo } : presetRange(preset);
    return { company: companyId || undefined, ...range };
  }, [companyId, preset, dateFrom, dateTo]);

  const load = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    getRecruitmentDashboard(filterOpts).then(setData).catch(console.error).finally(() => { setLoading(false); setRefreshing(false); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filterOpts]);

  const hiresSeries = useMemo(() => buildMonths(data?.hiresByMonth || [], data?.range?.from, data?.range?.to), [data]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return (
    <div className="flex flex-col items-center py-20 text-muted-foreground">
      <LayoutDashboard className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm">Không tải được số liệu</p>
      <button onClick={() => load()} className="mt-3 btn-ghost rounded-lg border border-line px-3 py-1.5 text-xs">Thử lại</button>
    </div>
  );

  const f = data.funnel;
  const req = data.requisitions;
  const planPct = req.totalTarget > 0 ? Math.round((req.totalFilled / req.totalTarget) * 100) : 0;
  const leaversSeries = buildMonths(data.turnover.leaversByMonth, data.range?.from, data.range?.to);
  const hiredThisMonth = hiresSeries[hiresSeries.length - 1]?.value || 0;
  const cvStageData: DashBucket[] = data.cvByStage.map(b => ({ label: CV_STAGE_LABELS[b.label] || b.label, value: b.value }));

  const kpis = [
    { label: 'Tổng nhân sự (active)', value: data.workforce.headcount, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/15' },
    { label: 'Vào làm tháng này', value: hiredThisMonth, icon: UserPlus, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    { label: 'Tuyển mới 90 ngày', value: data.workforce.newHires90d, icon: TrendingUp, color: 'text-sky-400', bg: 'bg-sky-500/15' },
    { label: 'TG tiếp nhận TB (ngày)', value: data.cycleTime.submitToApprove, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/15' },
    { label: 'Ứng viên trong kho', value: data.cvTotal, icon: FolderKanban, color: 'text-purple-400', bg: 'bg-purple-500/15' },
    { label: 'Vị trí đang tuyển', value: data.jd.active, icon: FileText, color: 'text-rose-400', bg: 'bg-rose-500/15' },
  ];

  // Phễu tiếp nhận (cumulative)
  const funnelStages = [
    { label: 'Đã mời', value: f.invited, color: '#fafafa' },
    { label: 'Đã nộp', value: f.submitted, color: '#d4d4d4' },
    { label: 'Đã xác nhận', value: f.confirmed, color: '#a3a3a3' },
    { label: 'Gửi QTV', value: f.sent_to_admin, color: '#737373' },
    { label: 'Đã duyệt', value: f.approved, color: '#525252' },
  ];
  const funnelTop = funnelStages[0].value || 1;

  const cycleSteps = [
    { label: 'Mời → Nộp', value: data.cycleTime.inviteToSubmit },
    { label: 'Nộp → Xác nhận', value: data.cycleTime.submitToConfirm },
    { label: 'Xác nhận → Gửi QTV', value: data.cycleTime.confirmToSent },
    { label: 'Gửi → Duyệt', value: data.cycleTime.sentToApprove },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5">
            <LayoutDashboard className="h-6 w-6 text-indigo-400" /> Tình Hình Tuyển Dụng Nhân Sự
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Kỳ {data.range?.from} → {data.range?.to} · {companyId ? (data.companies.find(c => c.id === companyId)?.name ?? '') : 'Toàn hệ thống'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link href="/nguon-nhan-luc/yeu-cau-tuyen-dung" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-600 text-muted-foreground hover:bg-hover hover:text-foreground">
            <Briefcase className="h-4 w-4" /> Yêu cầu tuyển
          </Link>
          <Link href="/nguon-nhan-luc/kho-ung-vien?add=1" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-500 px-3 text-sm font-700 text-white hover:bg-indigo-400">
            <UserPlus className="h-4 w-4" /> Thêm CV
          </Link>
          {/* Preset khoảng thời gian */}
          <select value={preset} onChange={e => setPreset(e.target.value as any)}
            className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none">
            <option value="12m">12 tháng gần nhất</option>
            <option value="6m">6 tháng gần nhất</option>
            <option value="3m">3 tháng gần nhất</option>
            <option value="ytd">Năm nay</option>
            <option value="custom">Tùy chỉnh…</option>
          </select>
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/50" />
              <span className="text-xs text-muted-foreground">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom || undefined}
                className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/50" />
            </div>
          )}
          {/* Bộ lọc công ty — chỉ super_admin */}
          {isSuperAdmin && (
            <select value={companyId} onChange={e => setCompanyId(e.target.value)}
              className="h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none max-w-[180px]">
              <option value="">Tất cả công ty</option>
              {data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button onClick={async () => {
            const { exportRecruitmentWorkbook } = await import('./exportRecruitmentWorkbook');
            exportRecruitmentWorkbook(data, companyId ? (data.companies.find(c => c.id === companyId)?.name ?? null) : null);
          }}
            title="Xuất báo cáo Excel"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm text-emerald-300 hover:bg-emerald-500/20">
            <FileSpreadsheet className="h-4 w-4" /><span className="hidden lg:inline">Excel</span>
          </button>
          <button onClick={() => window.print()} title="In / Lưu PDF (có đồ thị)"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-line px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-hover">
            <Printer className="h-4 w-4" /><span className="hidden lg:inline">In / PDF</span>
          </button>
          <button onClick={() => load(true)} disabled={refreshing}
            className="h-9 px-3 rounded-xl border border-line btn-ghost flex items-center gap-1.5 text-sm shrink-0 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* A. KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
              <div className={`mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl ${k.bg}`}>
                <Icon className={`h-5 w-5 ${k.color}`} />
              </div>
              <p className="text-2xl font-700 text-foreground">{k.value}</p>
              <p className="text-2xs text-muted-foreground mt-0.5 leading-tight">{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* B. Phễu tiếp nhận + thời gian xử lý */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Phễu tiếp nhận nhân sự" subtitle="Tỷ lệ chuyển đổi qua từng bước">
          <div className="space-y-2.5 pt-1">
            {funnelStages.map((s, i) => {
              const pctOfTop = Math.round((s.value / funnelTop) * 100);
              const prev = i > 0 ? funnelStages[i - 1].value : s.value;
              const conv = prev > 0 ? Math.round((s.value / prev) * 100) : 0;
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-foreground font-500">{s.label}</span>
                    <span className="text-muted-foreground">
                      <b className="text-foreground">{s.value}</b>
                      {i > 0 && <span className="ml-2 text-2xs">({conv}% ↓)</span>}
                    </span>
                  </div>
                  <div className="h-6 rounded-lg bg-hover overflow-hidden">
                    <div className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                      style={{ width: `${Math.max(pctOfTop, 4)}%`, background: s.color }}>
                      {pctOfTop >= 12 && <span className="text-2xs font-700 text-white/90">{pctOfTop}%</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            {f.rejected > 0 && (
              <p className="text-2xs text-rose-400 pt-1">Từ chối: {f.rejected}</p>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Thời gian xử lý trung bình" subtitle="Số ngày trung bình giữa các bước (phát hiện nghẽn)">
          <div className="space-y-3 pt-2">
            {cycleSteps.map((c) => {
              const max = Math.max(...cycleSteps.map(s => s.value), 1);
              return (
                <div key={c.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="text-foreground font-600">{c.value} ngày</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-hover overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${(c.value / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2.5">
              <p className="text-2xs text-muted-foreground">Tổng thời gian tiếp nhận (Nộp → Duyệt)</p>
              <p className="text-lg font-700 text-indigo-300">{data.cycleTime.submitToApprove} ngày</p>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* C. Xu hướng tuyển + pipeline ứng viên */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Nhân sự vào làm theo tháng" subtitle="12 tháng gần nhất (theo ngày vào làm)">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={hiresSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="hireGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${v} người`, 'Vào làm']} />
              <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#hireGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Kho CV theo giai đoạn" subtitle={`Kho ${data.cvTotal} ứng viên (toàn hệ thống — pipeline theo vị trí xem mục dưới)`}>
          {data.cvTotal === 0 ? <Empty text="Kho ứng viên trống" /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={cvStageData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {cvStageData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* C2. Tuyển theo vị trí (per-application) & Phỏng vấn */}
      {data.applications && data.interviews && (
        <div>
          <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-violet-400" /> Tuyển theo vị trí &amp; Phỏng vấn
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard title="Pipeline theo vị trí" subtitle={`${data.applications.total} lượt ứng tuyển (1 CV × N vị trí)`}>
              {data.applications.total === 0 ? <Empty text="Chưa có lượt ứng tuyển" /> : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data.applications.byStage.map(b => ({ label: CV_STAGE_LABELS[b.label] || b.label, value: b.value }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {data.applications.byStage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {data.applications.stageDurations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-line-subtle space-y-1.5">
                      <p className="text-2xs text-muted-foreground mb-1">Thời gian TB ở mỗi giai đoạn (ngày)</p>
                      {data.applications.stageDurations.map((s) => (
                        <div key={s.label} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{CV_STAGE_LABELS[s.label] || s.label}</span>
                          <span className="text-foreground font-600">{s.value} ngày</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </ChartCard>

            <ChartCard title="Offer 12 tháng" subtitle="Tỷ lệ ứng viên nhận offer (chất lượng chốt)">
              {data.applications.offer12m.offered === 0 ? <Empty text="Chưa có offer nào" /> : (
                <div className="pt-2">
                  <div className="flex items-center gap-4">
                    <div className="relative h-24 w-24 shrink-0">
                      <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="#a855f7" strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={`${data.applications.offer12m.acceptRate * 0.974} 100`} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-700 text-foreground">{data.applications.offer12m.acceptRate}%</span>
                      </div>
                    </div>
                    <div className="text-xs space-y-1.5">
                      <p className="text-muted-foreground">Đã gửi: <b className="text-foreground">{data.applications.offer12m.offered}</b></p>
                      <p className="text-emerald-400">✓ Nhận: <b className="text-foreground">{data.applications.offer12m.accepted}</b></p>
                      <p className="text-rose-400">✗ Từ chối: <b className="text-foreground">{data.applications.offer12m.declined}</b></p>
                      <p className="text-amber-400">⏳ Đang chờ: <b className="text-foreground">{data.applications.offer12m.pending}</b></p>
                    </div>
                  </div>
                  {data.applications.offer12m.acceptRate < 70 && data.applications.offer12m.accepted + data.applications.offer12m.declined >= 3 && (
                    <p className="mt-3 text-2xs text-amber-300 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
                      ⚠ Tỷ lệ nhận offer dưới 70% — nên rà lại mức lương/thương hiệu tuyển dụng
                    </p>
                  )}
                </div>
              )}
            </ChartCard>

            <ChartCard title="Phỏng vấn" subtitle="Lịch & scorecard (30 ngày / 12 tháng)">
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                  <div className="flex items-center gap-1.5 mb-1"><CalendarClock className="h-3.5 w-3.5 text-sky-400" /><span className="text-2xs text-muted-foreground">7 ngày tới</span></div>
                  <p className="text-2xl font-700 text-sky-300">{data.interviews.upcoming7d}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <span className="text-2xs text-muted-foreground">Đã PV 30 ngày</span>
                  <p className="text-2xl font-700 text-emerald-300">{data.interviews.done30d}</p>
                </div>
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                  <span className="text-2xs text-muted-foreground">Hủy 30 ngày</span>
                  <p className="text-2xl font-700 text-rose-300">{data.interviews.cancelled30d}</p>
                </div>
                <div className="rounded-xl border border-line-subtle bg-hover p-3">
                  <span className="text-2xs text-muted-foreground">Điểm PV TB /5</span>
                  <p className="text-2xl font-700 text-foreground">{data.interviews.avgOverall || '—'}</p>
                </div>
              </div>
              {data.interviews.byRecommendation.length > 0 && (
                <div className="mt-3 pt-3 border-t border-line-subtle space-y-1.5">
                  <p className="text-2xs text-muted-foreground mb-1">Khuyến nghị scorecard ({data.interviews.scorecards12m} phiếu)</p>
                  {data.interviews.byRecommendation.map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{REC_LABELS[r.label] || r.label}</span>
                      <span className="text-foreground font-600">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          </div>
        </div>
      )}

      {/* D. Cơ cấu lao động */}
      <div>
        <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-indigo-400" /> Tình hình sử dụng lao động</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BarBox title="Theo công ty" data={data.workforce.byCompany} vertical color="#6366f1" />
          <BarBox title="Theo phòng ban (Top 12)" data={data.workforce.byDepartment} vertical color="#a855f7" />
          {data.workforce.bySubDepartment?.length > 0 && (
            <BarBox title="Theo bộ phận (Top 12)" data={data.workforce.bySubDepartment} vertical color="#f59e0b" />
          )}
          {data.workforce.unitsMissingHead?.length > 0 && (
            <ChartCard title="⚠️ Phòng ban khuyết Trưởng phòng" subtitle="Chưa có phân công head đang hiệu lực — rủi ro vận hành & là nhu cầu tuyển/bổ nhiệm">
              <ul className="divide-y divide-line-subtle max-h-[240px] overflow-y-auto -mx-1">
                {data.workforce.unitsMissingHead.map((u, i) => (
                  <li key={i} className="flex items-center gap-3 px-1 py-2">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                      <Crown className="h-3.5 w-3.5 text-amber-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{u.department}</p>
                      <p className="text-2xs text-muted-foreground truncate">{u.company}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </ChartCard>
          )}
          <PieBox title="Theo loại hợp đồng" data={data.workforce.byEmploymentType} />
          <PieBox title="Theo giới tính" data={data.workforce.byGender} />
          <BarBox title="Theo độ tuổi" data={data.workforce.byAge} color="#0ea5e9" />
          <BarBox title="Theo thâm niên" data={data.workforce.byTenure} color="#14b8a6" />
        </div>
      </div>

      {/* E. Nguồn ứng viên + vị trí đang tuyển */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Nguồn ứng viên" subtitle="Hiệu quả theo nguồn CV">
          {data.cvBySource.length === 0 ? <Empty text="Chưa có dữ liệu nguồn" /> : (
            <ResponsiveContainer width="100%" height={Math.max(200, data.cvBySource.length * 34)}>
              <BarChart layout="vertical" data={data.cvBySource} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={120} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="value" fill="#a855f7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Vị trí đang tuyển" subtitle={`${data.jd.active} vị trí active / ${data.jd.total} JD`}>
          {data.jd.openList.length === 0 ? <Empty text="Không có vị trí đang tuyển" /> : (
            <ul className="divide-y divide-line-subtle max-h-[240px] overflow-y-auto -mx-1">
              {data.jd.openList.map((j, i) => (
                <li key={i} className="flex items-center gap-3 px-1 py-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/15">
                    <Briefcase className="h-4 w-4 text-rose-400" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{j.title}</p>
                    {j.department && <p className="text-2xs text-muted-foreground truncate">{j.department}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* F. Yêu cầu tuyển dụng & năng suất */}
      <div>
        <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-teal-400" /> Yêu cầu tuyển dụng &amp; năng suất</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <MiniStat label="Đang tuyển" value={req.open} />
          <MiniStat label="Tạm dừng" value={req.onHold} />
          <MiniStat label="Tuyển đủ tháng này" value={req.filledThisMonth} />
          <MiniStat label="Time-to-fill TB (ngày)" value={req.avgTimeToFill} />
        </div>

        <div className="mb-4"><ForecastCard f={data.forecast} /></div>

        {/* Kế hoạch tuyển 1/3/6 tháng + nhu cầu thay thế */}
        {data.hiringPlan && data.replacement && (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mb-4">
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5">
              <h3 className="text-sm font-700 text-foreground flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-indigo-400" /> Kế hoạch tuyển 1 · 3 · 6 tháng
              </h3>
              <p className="text-2xs text-muted-foreground mb-4">
                Nhu cầu = vị trí còn thiếu + dự báo nghỉ việc (attrition 12 tháng) − ứng viên đang gần chốt
              </p>
              <div className="grid grid-cols-3 gap-3">
                {data.hiringPlan.map((h) => (
                  <div key={h.horizonMonths} className="rounded-xl border border-line-subtle p-3.5" style={{ background: 'var(--card)' }}>
                    <p className="text-2xs text-muted-foreground mb-1">{h.horizonMonths} tháng tới</p>
                    <p className="text-3xl font-700 text-indigo-300 leading-none mb-2.5">{h.total}<span className="text-xs text-muted-foreground font-500 ml-1">người</span></p>
                    <div className="space-y-1 text-2xs text-muted-foreground">
                      <p>Còn thiếu: <b className="text-foreground">{h.openRemaining}</b></p>
                      <p>Dự báo nghỉ: <b className="text-foreground">{h.expectedAttrition}</b></p>
                      <p>Gần chốt: <b className="text-emerald-400">−{h.pipelineOffset}</b></p>
                      {h.contractRisk > 0 && <p className="text-amber-400">HĐ đáo hạn: +{h.contractRisk} <span className="opacity-70">(theo dõi)</span></p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ChartCard title="Nhu cầu thay thế tiềm năng" subtitle="HĐ sắp đáo hạn & nghỉ việc đang xử lý">
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground"><FileWarning className="h-3.5 w-3.5 text-amber-400" /> HĐ đáo hạn ≤ 90 ngày</span>
                  <span className="text-lg font-700 text-amber-300">{data.replacement.contractsExpiring90d}</span>
                </div>
                {data.replacement.contractsExpiringByWindow.map((w) => (
                  <div key={w.label} className="flex items-center justify-between text-xs px-1">
                    <span className="text-muted-foreground">{w.label}</span>
                    <span className="text-foreground font-600">{w.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground"><UserX className="h-3.5 w-3.5 text-rose-400" /> Đang làm thủ tục nghỉ</span>
                  <span className="text-lg font-700 text-rose-300">{data.replacement.offboardingInProgress}</span>
                </div>
              </div>
            </ChartCard>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Tiến độ tuyển (Plan vs Actual)" subtitle={`${req.totalFilled}/${req.totalTarget} vị trí đã lấp ở các yêu cầu đang mở`}>
            <div className="pt-1">
              <div className="h-3 rounded-full bg-hover overflow-hidden mb-1.5">
                <div className="h-full rounded-full bg-teal-500/70" style={{ width: `${planPct}%` }} />
              </div>
              <p className="text-2xs text-muted-foreground mb-4">{planPct}% nhu cầu đã được lấp</p>
              {req.byPriority.length > 0 && (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={req.byPriority.map(p => ({ label: PRIORITY_LABEL[p.label] || p.label, value: p.value }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="value" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>

          <ChartCard title="⚠️ Cần chú ý — vị trí tồn đọng" subtitle="Yêu cầu mở lâu nhất, nên ưu tiên xử lý">
            {req.aging.length === 0 ? <Empty text="Không có yêu cầu đang mở" /> : (
              <ul className="divide-y divide-line-subtle max-h-[220px] overflow-y-auto -mx-1">
                {req.aging.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-1 py-2">
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${a.days_open > 30 ? 'bg-rose-500/15' : 'bg-hover'}`}>
                      <AlertTriangle className={`h-3.5 w-3.5 ${a.days_open > 30 ? 'text-rose-400' : 'text-muted-foreground'}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{a.title}</p>
                      <p className="text-2xs text-muted-foreground truncate">{a.owner_name || 'Chưa giao'} · {a.filled_count}/{a.target_headcount} đã lấp</p>
                    </div>
                    <span className={`text-2xs font-700 shrink-0 ${a.days_open > 30 ? 'text-rose-400' : 'text-muted-foreground'}`}>{a.days_open} ngày</span>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>
      </div>

      {/* G. Chất lượng tuyển & giữ chân */}
      <div>
        <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2"><Award className="h-4 w-4 text-emerald-400" /> Chất lượng tuyển &amp; Giữ chân</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <ChartCard title="Tỷ lệ đậu thử việc" subtitle="12 tháng gần nhất">
            <div className="flex items-center gap-4 pt-2">
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${data.quality.probationPassRate * 0.974} 100`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-700 text-foreground">{data.quality.probationPassRate}%</span>
                </div>
              </div>
              <div className="text-xs space-y-1.5">
                <p className="text-emerald-400">✓ Đậu: <b className="text-foreground">{data.quality.probationPassed}</b></p>
                <p className="text-rose-400">✗ Trượt: <b className="text-foreground">{data.quality.probationFailed}</b></p>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Nghỉ sớm & Turnover" subtitle="Chỉ báo chất lượng & giữ chân (12 tháng)">
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-1"><TrendingDown className="h-3.5 w-3.5 text-rose-400" /><span className="text-2xs text-muted-foreground">Nghỉ &lt; 90 ngày</span></div>
                <p className="text-2xl font-700 text-rose-300">{data.quality.earlyAttrition90d}</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-1"><Users className="h-3.5 w-3.5 text-amber-400" /><span className="text-2xs text-muted-foreground">Tỷ lệ nghỉ việc</span></div>
                <p className="text-2xl font-700 text-amber-300">{data.turnover.turnoverRate}%</p>
              </div>
              <div className="col-span-2 rounded-xl border border-line-subtle bg-hover p-3">
                <span className="text-2xs text-muted-foreground">Tổng nghỉ việc 12 tháng</span>
                <p className="text-lg font-700 text-foreground">{data.turnover.leavers12m} người</p>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Nghỉ việc theo tháng" subtitle="Xu hướng 12 tháng">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={leaversSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="leaveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${v} người`, 'Nghỉ việc']} />
                <Area type="monotone" dataKey="value" stroke="#f43f5e" strokeWidth={2} fill="url(#leaveGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Giữ chân theo lứa vào làm" subtitle="Người vào trong kỳ còn làm việc đến nay">
            {(data.cohorts ?? []).length === 0 ? <Empty text="Không có lứa vào làm trong kỳ" /> : (
              <div className="max-h-[220px] overflow-y-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-2xs text-muted-foreground uppercase">
                      <th className="text-left px-1 pb-1.5">Tháng</th>
                      <th className="text-right px-1 pb-1.5">Vào</th>
                      <th className="text-right px-1 pb-1.5">Còn lại</th>
                      <th className="text-right px-1 pb-1.5">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {data.cohorts.map((c) => {
                      const pct = c.hired > 0 ? Math.round((c.still / c.hired) * 100) : 0;
                      return (
                        <tr key={c.month}>
                          <td className="px-1 py-1.5 text-foreground">{c.month}</td>
                          <td className="px-1 py-1.5 text-right text-foreground">{c.hired}</td>
                          <td className="px-1 py-1.5 text-right text-foreground">{c.still}</td>
                          <td className={`px-1 py-1.5 text-right font-600 ${pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

const PRIORITY_LABEL: Record<string, string> = { urgent: 'Khẩn cấp', high: 'Cao', normal: 'Bình thường', low: 'Thấp' };

function ForecastCard({ f }: { f: RecruitmentDashboardData['forecast'] }) {
  const conf = {
    high: { t: 'Tin cậy cao', c: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    medium: { t: 'Tin cậy vừa', c: 'text-amber-400', bg: 'bg-amber-500/15' },
    low: { t: 'Tin cậy thấp', c: 'text-rose-400', bg: 'bg-rose-500/15' },
  }[f.confidence];
  const span = Math.max(f.p90 - f.p10, 1);
  const pos = Math.min(100, Math.max(0, ((f.p50 - f.p10) / span) * 100));
  return (
    <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-700 text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-teal-400" /> Dự báo tuyển tháng tới
          </h3>
          <p className="text-2xs text-muted-foreground mt-0.5">Mô hình 3 góc nhìn: pipeline ứng viên · đơn tuyển · xu hướng</p>
        </div>
        <span className={`text-2xs font-600 px-2 py-1 rounded-lg shrink-0 ${conf.bg} ${conf.c}`}>{conf.t}</span>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-4xl font-700 text-teal-300 leading-none">{f.p50}</span>
        <span className="text-sm text-muted-foreground mb-0.5">người · khoảng <b className="text-foreground">{f.p10}–{f.p90}</b></span>
      </div>

      <div className="relative h-2 rounded-full bg-hover mt-4 mb-6">
        <div className="absolute inset-0 rounded-full bg-teal-500/30" />
        <div className="absolute -top-1 h-4 w-1.5 rounded bg-teal-300" style={{ left: `calc(${pos}% - 3px)` }} />
        <span className="absolute -bottom-4 left-0 text-2xs text-muted-foreground">P10 · {f.p10}</span>
        <span className="absolute -bottom-4 right-0 text-2xs text-muted-foreground">P90 · {f.p90}</span>
      </div>

      {f.drivers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {f.drivers.map((d, i) => (
            <p key={i} className={`text-xs ${d.startsWith('↑') ? 'text-emerald-300' : d.startsWith('↓') ? 'text-rose-300' : 'text-amber-300'}`}>{d}</p>
          ))}
        </div>
      )}

      <p className="text-2xs text-muted-foreground mt-3 pt-3 border-t border-line-subtle">
        Cơ sở ước lượng: pipeline <b className="text-foreground">{f.basis.pipeline}</b> · đơn tuyển <b className="text-foreground">{f.basis.demand}</b> · xu hướng <b className="text-foreground">{f.basis.trend}</b>
      </p>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-teal-500/30 bg-teal-500/5' : 'border-line-subtle'}`} style={!accent ? { background: 'var(--card)' } : undefined}>
      <p className={`text-2xl font-700 ${accent ? 'text-teal-300' : 'text-foreground'}`}>{value}</p>
      <p className="text-2xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-subtle p-5" style={{ background: 'var(--card)' }}>
      <h3 className="text-sm font-600 text-foreground">{title}</h3>
      {subtitle && <p className="text-2xs text-muted-foreground mb-3 mt-0.5">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground py-12 text-center">{text}</p>;
}

function BarBox({ title, data, color = '#6366f1', vertical = false }: { title: string; data: DashBucket[]; color?: string; vertical?: boolean }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <ChartCard title={title}>
      {total === 0 ? <Empty text="Chưa có dữ liệu" /> : vertical ? (
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 30)}>
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
            <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={120} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function PieBox({ title, data }: { title: string; data: DashBucket[] }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <ChartCard title={title}>
      {total === 0 ? <Empty text="Chưa có dữ liệu" /> : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="55%" height={200}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {data.map((_, i) => <Cell key={i} stroke="transparent" fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="flex-1 space-y-1.5 min-w-0">
            {data.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-muted-foreground truncate flex-1">{d.label}</span>
                <span className="text-foreground font-600">{d.value}</span>
                <span className="text-2xs text-muted-foreground w-9 text-right">{Math.round((d.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
