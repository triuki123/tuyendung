'use client';

import { Trophy, ChevronRight } from 'lucide-react';
import { DiligenceUserRow, GRADE_STYLE } from './types';

interface DiligenceTableProps {
  rows: DiligenceUserRow[];
  /** Hiện cột thứ hạng (khi xem nhiều người). */
  showRank: boolean;
  onSelect: (row: DiligenceUserRow) => void;
}

/** Bảng xếp hạng chuyên cần — desktop dạng bảng, mobile dạng card. */
export default function DiligenceTable({ rows, showRank, onSelect }: DiligenceTableProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground">
                {showRank && <th className="px-4 py-3 w-12">#</th>}
                <th className="px-4 py-3">Nhân sự</th>
                <th className="px-4 py-3">Điểm chuyên cần</th>
                <th className="px-3 py-3 text-center">Đúng giờ</th>
                <th className="px-3 py-3 text-center">Đi trễ</th>
                <th className="px-3 py-3 text-center">Về sớm</th>
                <th className="px-3 py-3 text-center">Quên chấm</th>
                <th className="px-3 py-3 text-center">Vắng KP</th>
                <th className="px-3 py-3 text-center">Nghỉ phép</th>
                <th className="px-3 py-3 text-center">Chuyên cần</th>
                <th className="px-2 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const m = r.metrics;
                const gs = GRADE_STYLE[m.grade];
                return (
                  <tr
                    key={r.user_id}
                    onClick={() => onSelect(r)}
                    className="cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                  >
                    {showRank && (
                      <td className="px-4 py-3">
                        {i < 3 ? (
                          <Trophy className={`h-4 w-4 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : 'text-orange-400'}`} />
                        ) : (
                          <span className="text-xs text-muted-foreground">{i + 1}</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="font-600 text-foreground">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[r.department_name, r.company_name].filter(Boolean).join(' · ') || r.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 min-w-[150px]">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 min-w-[70px] rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full rounded-full ${gs.bar}`} style={{ width: `${m.score}%` }} />
                        </div>
                        <span className="text-sm font-700 text-foreground w-8 text-right">{m.score}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-600 ${gs.badge}`}>{m.grade}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-emerald-400 font-600">{m.onTimeDays}<span className="text-muted-foreground font-400 text-xs">/{m.presentDays}</span></td>
                    <td className={`px-3 py-3 text-center font-600 ${m.lateDays ? 'text-amber-400' : 'text-muted-foreground'}`}>{m.lateDays}</td>
                    <td className={`px-3 py-3 text-center font-600 ${m.earlyLeaveDays ? 'text-orange-400' : 'text-muted-foreground'}`}>{m.earlyLeaveDays}</td>
                    <td className={`px-3 py-3 text-center font-600 ${m.missingPunchDays ? 'text-sky-400' : 'text-muted-foreground'}`}>{m.missingPunchDays}</td>
                    <td className={`px-3 py-3 text-center font-600 ${m.absentDays ? 'text-rose-400' : 'text-muted-foreground'}`}>{m.absentDays}</td>
                    <td className="px-3 py-3 text-center text-teal-400 font-600">{m.leaveDays}</td>
                    <td className="px-3 py-3 text-center text-xs text-muted-foreground">{m.attendanceRate}%</td>
                    <td className="px-2 py-3 text-muted-foreground"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2.5">
        {rows.map((r, i) => {
          const m = r.metrics;
          const gs = GRADE_STYLE[m.grade];
          return (
            <button
              key={r.user_id}
              onClick={() => onSelect(r)}
              className="w-full rounded-2xl border border-white/5 p-4 text-left hover:bg-white/5 transition-colors"
              style={{ background: 'var(--card)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-600 text-foreground">
                    {showRank && <span className="mr-1.5 text-xs text-muted-foreground">#{i + 1}</span>}
                    {r.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.department_name, r.company_name].filter(Boolean).join(' · ') || r.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-base font-700 text-foreground">{m.score}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-600 ${gs.badge}`}>{m.grade}</span>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${gs.bar}`} style={{ width: `${m.score}%` }} />
              </div>
              <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center text-[11px]">
                <div><p className="font-600 text-emerald-400">{m.onTimeDays}</p><p className="text-muted-foreground">Đúng giờ</p></div>
                <div><p className={`font-600 ${m.lateDays ? 'text-amber-400' : 'text-muted-foreground'}`}>{m.lateDays}</p><p className="text-muted-foreground">Đi trễ</p></div>
                <div><p className={`font-600 ${m.absentDays ? 'text-rose-400' : 'text-muted-foreground'}`}>{m.absentDays}</p><p className="text-muted-foreground">Vắng KP</p></div>
                <div><p className="font-600 text-teal-400">{m.leaveDays}</p><p className="text-muted-foreground">Nghỉ phép</p></div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
