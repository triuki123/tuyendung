'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase, Users, ArrowRight, Loader2, Building2,
  UserPlus, TrendingUp, Clock, FolderKanban, TrendingDown, Globe,
} from 'lucide-react';

interface Bucket { label: string; value: number }
interface TrendPoint { month: string; value: number }
interface HrData {
  funnel: { invited: number; submitted: number; confirmed: number; sent_to_admin: number; approved: number; rejected: number };
  jd: { active: number; total: number };
  hiresByMonth: TrendPoint[];
  workforce: {
    headcount: number; newHires30d: number; newHires90d: number;
    byDepartment: Bucket[]; byEmploymentType: Bucket[]; byGender: Bucket[];
  };
  turnover: { leavers12m: number; turnoverRate: number; leaversByMonth: TrendPoint[] };
  requisitions: { open: number; onHold: number; filledThisMonth: number; avgTimeToFill: number };
  forecastNextMonth: number;
}

const BAR_COLORS = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899'];

/** Dải thanh ngang gọn (CSS, không cần thư viện chart) */
function MiniBars({ data, max }: { data: Bucket[]; max: number }) {
  if (data.length === 0) return <p className="text-2xs text-muted-foreground/60 py-2">Chưa có dữ liệu</p>;
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-24 sm:w-28 text-2xs text-muted-foreground truncate shrink-0" title={d.label}>{d.label}</span>
          <div className="flex-1 h-2 rounded-full bg-hover overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${max > 0 ? (d.value / max) * 100 : 0}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
          </div>
          <span className="w-8 text-2xs font-600 tabular-nums text-foreground text-right shrink-0">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function Tile({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: React.ReactNode; color: string; bg: string }) {
  return (
    <div className="rounded-xl border border-line-subtle p-3" style={{ background: 'var(--background)' }}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${bg}`}>
        <span className={color}>{icon}</span>
      </div>
      <p className="text-xl font-700 tabular-nums text-foreground leading-none">{value}</p>
      <p className="text-2xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function SectionCard({
  icon, iconBg, iconColor, title, subtitle, href, scopeLabel, children,
}: {
  icon: React.ReactNode; iconBg: string; iconColor: string; title: string; subtitle: string;
  href: string; scopeLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-line-subtle">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            <span className={iconColor}>{icon}</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-600 text-foreground leading-tight truncate">{title}</h3>
            <p className="text-2xs text-muted-foreground truncate">{subtitle}</p>
          </div>
        </div>
        <Link href={href} className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0">
          Chi tiết <ArrowRight size={13} />
        </Link>
      </div>
      <div className="px-4 sm:px-5 py-4 flex-1">
        <div className="mb-3 inline-flex items-center gap-1 text-2xs text-muted-foreground bg-hover border border-line rounded-full px-2 py-0.5">
          {scopeLabel === 'Toàn hệ thống' ? <Globe size={11} /> : <Building2 size={11} />}
          {scopeLabel}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Biểu đồ cột nhóm: tuyển mới (xanh) vs nghỉ việc (đỏ) — 6 tháng gần nhất. */
function TrendCard({ hires, leavers }: { hires: TrendPoint[]; leavers: TrendPoint[] }) {
  const hMap = new Map(hires.map(h => [h.month, h.value]));
  const lMap = new Map(leavers.map(l => [l.month, l.value]));
  const months = Array.from(new Set([...hMap.keys(), ...lMap.keys()])).sort().slice(-6);
  const rows = months.map(m => ({ m, hire: hMap.get(m) ?? 0, leave: lMap.get(m) ?? 0 }));
  const max = Math.max(...rows.map(r => Math.max(r.hire, r.leave)), 1);
  const totalHire = rows.reduce((a, r) => a + r.hire, 0);
  const totalLeave = rows.reduce((a, r) => a + r.leave, 0);

  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-line-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-purple-500/15 shrink-0">
            <TrendingUp size={16} className="text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-600 text-foreground leading-tight">Xu Hướng 6 Tháng</h3>
            <p className="text-2xs text-muted-foreground">Tuyển mới vs nghỉ việc</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-2xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-emerald-400" /> Tuyển {totalHire}</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-rose-400" /> Nghỉ {totalLeave}</span>
        </div>
      </div>
      <div className="px-4 sm:px-5 py-4">
        {rows.length === 0 ? (
          <p className="text-2xs text-muted-foreground/60 py-6 text-center">Chưa có dữ liệu xu hướng</p>
        ) : (
          <div className="flex items-end justify-between gap-2 h-28">
            {rows.map(r => (
              <div key={r.m} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-end justify-center gap-1 h-20">
                  <div className="w-2.5 sm:w-3 rounded-t bg-emerald-400/80" style={{ height: `${(r.hire / max) * 100}%` }} title={`Tuyển: ${r.hire}`} />
                  <div className="w-2.5 sm:w-3 rounded-t bg-rose-400/80" style={{ height: `${(r.leave / max) * 100}%` }} title={`Nghỉ: ${r.leave}`} />
                </div>
                <span className="text-2xs text-muted-foreground">T{parseInt(r.m.split('-')[1], 10)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Khối Dashboard: Tình Hình Tuyển Dụng + Tình Hình Sử Dụng Lao Động.
 * CHỈ hiển thị cho super_admin (toàn bộ) và admin (công ty của họ — scope ở backend).
 * Role khác: không render (dashboard giữ nguyên).
 */
export default function HrInsightsSection() {
  const [role, setRole] = useState<string | null>(null);
  const [data, setData] = useState<HrData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    let r = '', id = '', perms = '{}';
    if (stored) {
      try { const u = JSON.parse(stored); r = u.role ?? ''; id = u.id ?? ''; perms = JSON.stringify(u.module_permissions ?? {}); } catch { /* */ }
    }
    setRole(r);
    if (r !== 'super_admin' && r !== 'admin') { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch('/api/hr/recruitment-dashboard', {
          headers: { 'x-current-user-role': r, 'x-current-user-id': id, 'x-user-permissions': perms },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch { /* non-critical */ }
      finally { setLoading(false); }
    })();
  }, []);

  // Role khác super_admin/admin → không hiển thị khối này
  if (role !== null && role !== 'super_admin' && role !== 'admin') return null;

  if (loading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
        {[0, 1].map(i => <div key={i} className="rounded-2xl border border-line-subtle h-72 animate-pulse" style={{ background: 'var(--card)' }} />)}
      </div>
    );
  }
  if (!data) return null; // 403 hoặc lỗi → ẩn

  const scopeLabel = role === 'super_admin' ? 'Toàn hệ thống' : 'Công ty của bạn';
  const f = data.funnel;
  const funnelMax = Math.max(f.invited, 1);
  const funnel: Bucket[] = [
    { label: 'Đã mời', value: f.invited },
    { label: 'Đã nộp', value: f.submitted },
    { label: 'Xác nhận', value: f.confirmed },
    { label: 'Đã duyệt', value: f.approved },
  ];
  const deptTop = data.workforce.byDepartment.slice(0, 5);
  const deptMax = Math.max(...deptTop.map(d => d.value), 1);

  return (
    <div className="space-y-4 sm:space-y-5">
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 sm:gap-5">
      {/* ── Tình Hình Tuyển Dụng ── */}
      <SectionCard
        icon={<Briefcase size={16} />} iconBg="bg-indigo-500/15" iconColor="text-indigo-400"
        title="Tình Hình Tuyển Dụng" subtitle="Yêu cầu tuyển & phễu onboarding"
        href="/nguon-nhan-luc/tinh-hinh-tuyen-dung" scopeLabel={scopeLabel}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <Tile icon={<Briefcase size={14} />} label="Đang tuyển" value={data.requisitions.open} color="text-indigo-400" bg="bg-indigo-500/15" />
          <Tile icon={<Clock size={14} />} label="Tạm dừng" value={data.requisitions.onHold} color="text-amber-400" bg="bg-amber-500/15" />
          <Tile icon={<UserPlus size={14} />} label="Tuyển đủ/tháng" value={data.requisitions.filledThisMonth} color="text-emerald-400" bg="bg-emerald-500/15" />
          <Tile icon={<TrendingUp size={14} />} label="Dự báo tháng tới" value={data.forecastNextMonth} color="text-sky-400" bg="bg-sky-500/15" />
        </div>
        <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-2">Phễu tiếp nhận</p>
        <MiniBars data={funnel} max={funnelMax} />
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line-subtle text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><FolderKanban size={12} className="text-purple-400" /> {data.jd.active} vị trí JD đang mở</span>
          {data.requisitions.avgTimeToFill > 0 && (
            <span className="inline-flex items-center gap-1"><Clock size={12} className="text-amber-400" /> TB tuyển {data.requisitions.avgTimeToFill} ngày</span>
          )}
        </div>
      </SectionCard>

      {/* ── Tình Hình Sử Dụng Lao Động ── */}
      <SectionCard
        icon={<Users size={16} />} iconBg="bg-emerald-500/15" iconColor="text-emerald-400"
        title="Tình Hình Sử Dụng Lao Động" subtitle="Cơ cấu & biến động nhân sự"
        href="/nguon-nhan-luc/bien-dong-nhan-su" scopeLabel={scopeLabel}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <Tile icon={<Users size={14} />} label="Tổng nhân sự" value={data.workforce.headcount} color="text-emerald-400" bg="bg-emerald-500/15" />
          <Tile icon={<UserPlus size={14} />} label="Mới 30 ngày" value={data.workforce.newHires30d} color="text-indigo-400" bg="bg-indigo-500/15" />
          <Tile icon={<UserPlus size={14} />} label="Mới 90 ngày" value={data.workforce.newHires90d} color="text-sky-400" bg="bg-sky-500/15" />
          <Tile icon={<TrendingDown size={14} />} label="Tỉ lệ nghỉ" value={`${data.turnover.turnoverRate}%`} color="text-rose-400" bg="bg-rose-500/15" />
        </div>
        <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-2">Theo phòng ban (Top 5)</p>
        <MiniBars data={deptTop} max={deptMax} />
        {data.workforce.byEmploymentType.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-line-subtle">
            {data.workforce.byEmploymentType.slice(0, 5).map(t => (
              <span key={t.label} className="text-2xs text-muted-foreground bg-hover border border-line rounded-full px-2 py-0.5">
                {t.label} <span className="font-600 text-foreground">{t.value}</span>
              </span>
            ))}
          </div>
        )}
      </SectionCard>
    </div>

      {/* Xu hướng 6 tháng (dùng chung dữ liệu đã fetch) */}
      <TrendCard hires={data.hiresByMonth} leavers={data.turnover.leaversByMonth} />
    </div>
  );
}
