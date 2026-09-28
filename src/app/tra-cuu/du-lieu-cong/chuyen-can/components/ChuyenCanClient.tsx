'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Award, Search, Loader2, RefreshCw,
  Users, Clock3, AlertTriangle, CalendarOff,
} from 'lucide-react';
import { DiligenceUserRow, normalizeVN } from './types';
import DiligenceTable from './DiligenceTable';
import DiligenceDetail from './DiligenceDetail';

// ─── Kỳ thời gian ─────────────────────────────────────────────────────────────

// Không dùng preset "kỳ công" ở đây vì phạm vi có thể trải nhiều công ty với kỳ công KHÁC nhau
// → 1 khoảng ngày duy nhất không đại diện đúng. Dùng mốc lịch (tháng/quý/năm) hoặc tùy chỉnh.
type PresetKey = 'month' | 'month_prev' | 'quarter' | 'year' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'month',        label: 'Tháng này' },
  { key: 'month_prev',   label: 'Tháng trước' },
  { key: 'quarter',      label: 'Quý này' },
  { key: 'year',         label: 'Năm nay' },
  { key: 'custom',       label: 'Tùy chỉnh' },
];

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Tính [from, to] cho preset lịch (tháng/quý/năm). */
function presetRange(key: PresetKey): { from: string; to: string } {
  const today = vnToday();
  const [y, m] = today.split('-').map(Number);
  if (key === 'month') return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: fmt(new Date(y, m, 0)) };
  if (key === 'month_prev') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return { from: `${py}-${String(pm).padStart(2, '0')}-01`, to: fmt(new Date(py, pm, 0)) };
  }
  if (key === 'quarter') {
    const qs = Math.floor((m - 1) / 3) * 3 + 1;
    return { from: `${y}-${String(qs).padStart(2, '0')}-01`, to: fmt(new Date(y, qs + 2, 0)) };
  }
  if (key === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: today, to: today };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChuyenCanClient() {
  const [userId, setUserId] = useState('');
  const [preset, setPreset] = useState<PresetKey>('month');
  const initial = presetRange('month');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const [rows, setRows] = useState<DiligenceUserRow[]>([]);
  const [scopeRole, setScopeRole] = useState('user');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bộ lọc client-side
  const [q, setQ] = useState('');
  const [companyF, setCompanyF] = useState('all');
  const [deptF, setDeptF] = useState('all');
  const [gradeF, setGradeF] = useState('all');
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'late' | 'absent' | 'name'>('score_desc');

  const [detail, setDetail] = useState<DiligenceUserRow | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try { setUserId(JSON.parse(stored).id ?? ''); } catch { /* empty */ }
    }
  }, []);

  const load = useCallback(async () => {
    if (!userId || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance/diligence?from=${from}&to=${to}`, {
        headers: { 'x-current-user-id': userId },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lỗi tải dữ liệu');
      setRows(json.data ?? []);
      setScopeRole(json.scopeRole ?? 'user');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, from, to]);

  useEffect(() => { load(); }, [load]);

  function applyPreset(key: PresetKey) {
    setPreset(key);
    if (key !== 'custom') {
      const r = presetRange(key);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  // Option lọc suy ra từ dữ liệu
  const companies = useMemo(
    () => [...new Map(rows.filter(r => r.company_id).map(r => [r.company_id!, r.company_name ?? r.company_id!])).entries()],
    [rows]
  );
  const departments = useMemo(() => {
    const src = companyF === 'all' ? rows : rows.filter(r => r.company_id === companyF);
    return [...new Map(src.filter(r => r.department_id).map(r => [r.department_id!, r.department_name ?? r.department_id!])).entries()];
  }, [rows, companyF]);

  const filtered = useMemo(() => {
    const nq = normalizeVN(q.trim());
    let out = rows.filter(r => {
      if (companyF !== 'all' && r.company_id !== companyF) return false;
      if (deptF !== 'all' && r.department_id !== deptF) return false;
      if (gradeF !== 'all' && r.metrics.grade !== gradeF) return false;
      if (nq) {
        const hay = normalizeVN(`${r.name} ${r.email} ${r.employee_code ?? ''} ${r.department_name ?? ''} ${r.sub_department_name ?? ''}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sortBy) {
        case 'score_asc':  return a.metrics.score - b.metrics.score;
        case 'late':       return b.metrics.lateDays - a.metrics.lateDays;
        case 'absent':     return b.metrics.absentDays - a.metrics.absentDays;
        case 'name':       return a.name.localeCompare(b.name, 'vi');
        default:           return b.metrics.score - a.metrics.score;
      }
    });
    return out;
  }, [rows, q, companyF, deptF, gradeF, sortBy]);

  // Stats tổng quan trên tập đã lọc
  const stats = useMemo(() => {
    const n = filtered.length;
    const sum = (f: (r: DiligenceUserRow) => number) => filtered.reduce((s, r) => s + f(r), 0);
    return {
      people: n,
      avgOnTime: n ? Math.round(sum(r => r.metrics.onTimeRate) / n) : 0,
      totalLate: sum(r => r.metrics.lateDays),
      totalAbsent: sum(r => r.metrics.absentDays),
      totalLeave: Math.round(sum(r => r.metrics.leaveDays) * 10) / 10,
    };
  }, [filtered]);

  const isManagerView = scopeRole !== 'user';

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/tra-cuu/du-lieu-cong" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-700 text-foreground">
            <Award className="h-6 w-6 text-rose-400" /> Theo Dõi Chuyên Cần
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Tổng hợp đúng giờ, đi trễ, về sớm, nghỉ phép & điểm chuyên cần {isManagerView ? 'của nhân sự trong phạm vi quản lý' : 'của bạn'}
          </p>
        </div>
        <button onClick={load} className="btn-ghost inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {/* Chọn kỳ thời gian */}
      <div className="rounded-2xl border border-white/5 p-3 sm:p-4 space-y-3" style={{ background: 'var(--card)' }}>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-500 transition-colors ${
                preset === p.key
                  ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-400'
                  : 'border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs">
          <label className="flex items-center gap-2 text-muted-foreground">
            Từ ngày
            <input
              type="date" value={from} max={to}
              onChange={e => { setFrom(e.target.value); setPreset('custom'); }}
              className="rounded-lg border border-white/10 bg-[#162033] px-2.5 py-1.5 text-xs text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            Đến ngày
            <input
              type="date" value={to} min={from}
              onChange={e => { setTo(e.target.value); setPreset('custom'); }}
              className="rounded-lg border border-white/10 bg-[#162033] px-2.5 py-1.5 text-xs text-foreground"
            />
          </label>
        </div>
      </div>

      {/* Stats tổng quan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard icon={Users} color="text-indigo-400" bg="bg-indigo-500/15" label="Nhân sự" value={String(stats.people)} />
        <StatCard icon={Clock3} color="text-emerald-400" bg="bg-emerald-500/15" label="Tỷ lệ đúng giờ TB" value={`${stats.avgOnTime}%`} />
        <StatCard icon={AlertTriangle} color="text-amber-400" bg="bg-amber-500/15" label="Tổng lượt đi trễ" value={String(stats.totalLate)} />
        <StatCard icon={CalendarOff} color="text-rose-400" bg="bg-rose-500/15" label="Vắng không phép" value={String(stats.totalAbsent)} />
      </div>

      {/* Tìm kiếm + bộ lọc (chỉ hiện khi xem nhiều người) */}
      {isManagerView && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Tìm theo tên, email, mã NV, phòng ban… (không dấu)"
              className="w-full rounded-xl border border-white/10 bg-[#162033] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60"
            />
          </div>
          {companies.length > 1 && (
            <select value={companyF} onChange={e => { setCompanyF(e.target.value); setDeptF('all'); }}
              className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-xs text-foreground">
              <option value="all">Tất cả công ty</option>
              {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          <select value={deptF} onChange={e => setDeptF(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-xs text-foreground">
            <option value="all">Tất cả phòng ban</option>
            {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={gradeF} onChange={e => setGradeF(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-xs text-foreground">
            <option value="all">Mọi xếp loại</option>
            {['A+', 'A', 'B', 'C', 'D'].map(g => <option key={g} value={g}>Loại {g}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-xs text-foreground">
            <option value="score_desc">Điểm cao → thấp</option>
            <option value="score_asc">Điểm thấp → cao</option>
            <option value="late">Đi trễ nhiều nhất</option>
            <option value="absent">Vắng nhiều nhất</option>
            <option value="name">Theo tên A→Z</option>
          </select>
        </div>
      )}

      {/* Nội dung */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <AlertTriangle className="h-9 w-9 mb-3 text-amber-400/60" />
          <p className="text-sm">{error}</p>
          <button onClick={load} className="btn-ghost mt-3 rounded-xl border border-white/10 px-4 py-2 text-xs">Thử lại</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Award className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Không có dữ liệu chuyên cần trong khoảng thời gian này</p>
          <p className="text-xs mt-1 opacity-60">Thử đổi kỳ thời gian hoặc xóa bộ lọc</p>
        </div>
      ) : (
        <DiligenceTable rows={filtered} showRank={isManagerView} onSelect={setDetail} />
      )}

      {detail && (
        <DiligenceDetail row={detail} from={from} to={to} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

// ─── StatCard nội bộ ──────────────────────────────────────────────────────────
function StatCard({ icon: Icon, color, bg, label, value }: {
  icon: React.ComponentType<{ className?: string }>;
  color: string; bg: string; label: string; value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 p-3.5 sm:p-4" style={{ background: 'var(--card)' }}>
      <div className={`mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`h-4.5 w-4.5 ${color}`} />
      </div>
      <p className="text-lg sm:text-xl font-700 text-foreground leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
