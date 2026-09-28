'use client';

import { useState } from 'react';
import { X, Award, CalendarDays } from 'lucide-react';
import { DiligenceUserRow, GRADE_STYLE, fmtMinutes } from './types';
import DiligenceDayLog from './DiligenceDayLog';

interface DiligenceDetailProps {
  row: DiligenceUserRow;
  from: string;
  to: string;
  onClose: () => void;
}

function fmtVN(d: string): string {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

/** Modal chi tiết chuyên cần 1 nhân sự. */
export default function DiligenceDetail({ row, from, to, onClose }: DiligenceDetailProps) {
  const m = row.metrics;
  const gs = GRADE_STYLE[m.grade];
  const [tab, setTab] = useState<'overview' | 'daylog'>('overview');

  const groups: { title: string; items: { label: string; value: string; tone?: string }[] }[] = [
    {
      title: 'Ngày công',
      items: [
        { label: 'Ngày công chuẩn', value: String(m.workDays) },
        { label: 'Ngày có chấm công', value: String(m.presentDays) },
        { label: 'Ngày đủ giờ công', value: String(m.fullDays) },
        { label: 'Tổng giờ làm', value: `${Math.round((m.totalMinutes / 60) * 10) / 10}h` },
        { label: 'Tỷ lệ hiện diện', value: `${m.attendanceRate}%` },
      ],
    },
    {
      title: 'Đúng giờ & vi phạm',
      items: [
        { label: 'Đi đúng giờ', value: `${m.onTimeDays} ngày (${m.onTimeRate}%)`, tone: 'text-emerald-400' },
        { label: 'Đến sớm hơn giờ chuẩn', value: `${m.earlyArriveDays} ngày`, tone: 'text-teal-400' },
        { label: 'Ở lại muộn hơn giờ chuẩn', value: `${m.stayLateDays} ngày`, tone: 'text-teal-400' },
        { label: 'Đi trễ', value: `${m.lateDays} lần · tổng ${fmtMinutes(m.lateMinutesTotal)}`, tone: m.lateDays ? 'text-amber-400' : undefined },
        { label: 'Về sớm', value: `${m.earlyLeaveDays} lần · tổng ${fmtMinutes(m.earlyLeaveMinutesTotal)}`, tone: m.earlyLeaveDays ? 'text-orange-400' : undefined },
        { label: 'Quên chấm công', value: `${m.missingPunchDays} ngày`, tone: m.missingPunchDays ? 'text-sky-400' : undefined },
        { label: 'Vắng không phép', value: `${m.absentDays} ngày`, tone: m.absentDays ? 'text-rose-400' : undefined },
        { label: 'Giờ vào trung bình', value: m.avgCheckIn ?? '—' },
        { label: 'Giờ ra trung bình', value: m.avgCheckOut ?? '—' },
      ],
    },
    {
      title: 'Tăng ca & bù công',
      items: [
        { label: 'Tăng ca đã duyệt', value: `${m.overtimeCount} lần · ${m.overtimeHours}h` },
        { label: 'Bù công đã duyệt', value: `${m.adjustmentCount} lần` },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <h2 className="text-base font-700 text-foreground">{row.name}</h2>
            <p className="text-xs text-muted-foreground">
              {[row.employee_code, row.department_name, row.company_name].filter(Boolean).join(' · ') || row.email}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10 px-6">
          <button
            onClick={() => setTab('overview')}
            className={`border-b-2 px-1 py-2.5 text-xs font-600 transition-colors ${
              tab === 'overview' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Tổng quan
          </button>
          <button
            onClick={() => setTab('daylog')}
            className={`border-b-2 px-1 py-2.5 text-xs font-600 transition-colors ${
              tab === 'daylog' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Chi tiết ngày
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {tab === 'daylog' ? (
            <DiligenceDayLog userId={row.user_id} from={from} to={to} />
          ) : (
          <>
          {/* Điểm tổng */}
          <div className="rounded-2xl border border-white/5 p-4 flex items-center gap-4 bg-white/5">
            <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${gs.badge.replace('border-', 'border ')} border`}>
              <Award className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-700 text-foreground">{m.score}</span>
                <span className="text-xs text-muted-foreground">/ 100 điểm chuyên cần</span>
                <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-600 ${gs.badge}`}>{m.grade} · {gs.label}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${gs.bar}`} style={{ width: `${m.score}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Kỳ {fmtVN(from)} – {fmtVN(to)}
              </p>
            </div>
          </div>

          {/* Các nhóm chỉ số */}
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-xs font-600 uppercase tracking-wider text-muted-foreground">{g.title}</h3>
              <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
                {g.items.map((it) => (
                  <div key={it.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground text-xs">{it.label}</span>
                    <span className={`font-600 ${it.tone ?? 'text-foreground'}`}>{it.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Nghỉ phép theo loại */}
          <div>
            <h3 className="mb-2 text-xs font-600 uppercase tracking-wider text-muted-foreground">Nghỉ phép theo loại</h3>
            {m.leaveByType.length === 0 ? (
              <p className="rounded-2xl border border-white/5 px-4 py-3 text-xs text-muted-foreground">
                Không có đơn nghỉ phép được duyệt trong kỳ
              </p>
            ) : (
              <div className="rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
                {m.leaveByType.map((lt) => (
                  <div key={lt.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-xs text-muted-foreground">{lt.name} <span className="opacity-60">({lt.count} đơn)</span></span>
                    <span className="font-600 text-teal-400">
                      {lt.days > 0 && `${Math.round(lt.days * 10) / 10} ngày`}
                      {lt.days > 0 && lt.hours > 0 && ' · '}
                      {lt.hours > 0 && `${Math.round(lt.hours * 10) / 10} giờ`}
                      {lt.days === 0 && lt.hours === 0 && '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
        </div>
      </div>
    </div>
  );
}
