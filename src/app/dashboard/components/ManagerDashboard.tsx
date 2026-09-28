'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchTickets, fetchTasks } from '@/lib/api-client';
import {
  Users, CheckSquare, Ticket, ClipboardList, Loader2, ArrowRight,
  CalendarOff, UserX, CalendarClock, Clock, RefreshCw, CheckCircle2,
} from 'lucide-react';
import UserMyWork from './user/UserMyWork';
import RecentAnnouncementsCard from './RecentAnnouncementsCard';
import RecentDocumentsCard from './RecentDocumentsCard';
import DashboardShell from './DashboardShell';
import ErrorState from '@/components/ui/ErrorState';

interface ManagerData {
  team: { headcount: number; checkedInToday: number; onLeaveToday: number; absentToday: number; tasksDueToday: number; ticketsToday: number };
  approvals: { leave: number; overtime: number; adjustment: number; total: number };
  work: { teamTicketsOpen: number; teamTasksOpen: number };
}

function Tile({ icon, label, value, color, bg, href }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; color: string; bg: string; href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between mb-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}><span className={color}>{icon}</span></span>
        {href && <ArrowRight size={15} className="text-muted-foreground/40 group-hover:text-foreground transition-colors" />}
      </div>
      <p className="text-2xl font-700 tabular-nums text-foreground">{value}</p>
      <p className="text-xs font-500 text-muted-foreground mt-0.5">{label}</p>
    </>
  );
  const cls = 'group rounded-2xl p-4 border border-line-subtle transition-colors';
  return href
    ? <Link href={href} className={`${cls} hover:bg-white/[0.04]`} style={{ background: 'var(--card)' }}>{inner}</Link>
    : <div className={cls} style={{ background: 'var(--card)' }}>{inner}</div>;
}

/** Dashboard cho role 'manager' — scope theo ĐỘI (cấp dưới qua manager_id). */
export default function ManagerDashboard() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [data, setData] = useState<ManagerData | null>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (u) { try { setCurrentUser(JSON.parse(u)); } catch { /* */ } }
  }, []);

  const loadTeam = async (cu: any) => {
    setTeamLoading(true);
    setTeamError(false);
    const h = { 'x-current-user-id': cu.id, 'x-current-user-role': cu.role ?? '' };
    try {
      const res = await fetch('/api/dashboard/manager', { headers: h });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) setData(json.data);
      else throw new Error('Phản hồi không hợp lệ');
    } catch (e) {
      console.error('Error loading manager team data:', e);
      setTeamError(true);
    } finally { setTeamLoading(false); }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadTeam(currentUser);
    (async () => {
      try {
        const [tk, ts] = await Promise.all([
          fetchTickets({ userId: currentUser.id, userRole: currentUser.role }),
          fetchTasks({ assigned_to: currentUser.id }),
        ]);
        setTickets(tk || []);
        setTasks(Array.isArray(ts) ? ts : []);
      } catch { /* */ } finally { setLoading(false); }
    })();
  }, [currentUser]);

  if (!currentUser) return null;

  const t = data?.team;
  const ap = data?.approvals;
  const approvalRows = [
    { key: 'leave', label: 'Đơn nghỉ phép', count: ap?.leave ?? 0, icon: <CalendarOff size={15} />, color: 'text-violet-400', bg: 'bg-violet-500/15' },
    { key: 'overtime', label: 'Tăng ca', count: ap?.overtime ?? 0, icon: <Clock size={15} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
    { key: 'adjustment', label: 'Bù công / điều chỉnh', count: ap?.adjustment ?? 0, icon: <RefreshCw size={15} />, color: 'text-teal-400', bg: 'bg-teal-500/15' },
  ].filter(r => r.count > 0);

  /* ── Các khối widget (inline cũ) — đưa vào registry qua elements map ── */

  const kpiStrip = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <Tile icon={<Users size={20} />} label="Quân số nhóm" value={teamLoading ? '—' : t?.headcount ?? 0} color="text-emerald-400" bg="bg-emerald-500/15" />
      <Tile icon={<CheckSquare size={20} />} label="Chờ tôi duyệt" value={teamLoading ? '—' : ap?.total ?? 0} color="text-amber-400" bg="bg-amber-500/15" href="/duyet-yeu-cau" />
      <Tile icon={<Ticket size={20} />} label="Ticket nhóm mở" value={teamLoading ? '—' : data?.work.teamTicketsOpen ?? 0} color="text-red-400" bg="bg-red-500/15" href="/tickets" />
      <Tile icon={<ClipboardList size={20} />} label="Công việc nhóm" value={teamLoading ? '—' : data?.work.teamTasksOpen ?? 0} color="text-indigo-400" bg="bg-indigo-500/15" href="/tasks" />
    </div>
  );

  const approvalsCard = (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-line-subtle">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/15 shrink-0"><CheckSquare size={16} className="text-amber-400" /></div>
              <div>
                <h3 className="text-base font-600 text-foreground leading-tight">Cần Tôi Duyệt</h3>
                <p className="text-2xs text-muted-foreground">{teamLoading ? 'Đang tải…' : (ap?.total ?? 0) > 0 ? `${ap?.total} đơn của cấp dưới` : 'Không có đơn chờ duyệt'}</p>
              </div>
            </div>
            {teamLoading ? (
              <div className="h-16 animate-pulse bg-white/[0.02]" />
            ) : teamError ? (
              <ErrorState onRetry={() => loadTeam(currentUser)} />
            ) : approvalRows.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-400/60" />
                <p className="text-sm">Không có đơn nào chờ duyệt 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-line-subtle">
                {approvalRows.map(r => (
                  <Link key={r.key} href="/duyet-yeu-cau" className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-white/[0.04] transition-colors group">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.bg}`}><span className={r.color}>{r.icon}</span></span>
                    <span className="flex-1 text-sm text-foreground">{r.label}</span>
                    <span className={`text-sm font-700 tabular-nums ${r.color}`}>{r.count}</span>
                    <ArrowRight size={14} className="text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </Link>
                ))}
              </div>
            )}
          </div>
  );

  const teamTodayCard = (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5 border-b border-line-subtle">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/15 shrink-0"><Users size={16} className="text-emerald-400" /></div>
              <div>
                <h3 className="text-base font-600 text-foreground leading-tight">Đội Ngũ Hôm Nay</h3>
                <p className="text-2xs text-muted-foreground">Tình hình chấm công &amp; nghỉ phép của nhóm</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4">
              {[
                { label: 'Ticket nhóm hôm nay', value: t?.ticketsToday ?? 0, icon: <Ticket size={14} />, color: 'text-red-400', bg: 'bg-red-500/15' },
                { label: 'Task đến hạn hôm nay', value: t?.tasksDueToday ?? 0, icon: <CalendarClock size={14} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
                { label: 'Nghỉ phép', value: t?.onLeaveToday ?? 0, icon: <CalendarOff size={14} />, color: 'text-violet-400', bg: 'bg-violet-500/15' },
                { label: 'Vắng/chưa chấm', value: t?.absentToday ?? 0, icon: <UserX size={14} />, color: 'text-rose-400', bg: 'bg-rose-500/15' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-line-subtle p-3" style={{ background: 'var(--background)' }}>
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${s.bg}`}><span className={s.color}>{s.icon}</span></span>
                  <p className="text-xl font-700 tabular-nums text-foreground leading-none">{teamLoading ? '—' : s.value}</p>
                  <p className="text-2xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
  );

  return (
    <DashboardShell
      role="manager"
      header={
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Xin chào, {currentUser.name}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Tổng quan đội ngũ của bạn — số liệu theo nhân viên cấp dưới</p>
        </div>
      }
      elements={{
        'manager-kpi': kpiStrip,
        'manager-approvals': approvalsCard,
        'manager-team-today': teamTodayCard,
        'user-my-work': <UserMyWork tickets={tickets} tasks={tasks} loading={loading} />,
        announcements: <RecentAnnouncementsCard />,
        documents: <RecentDocumentsCard />,
      }}
    />
  );
}
