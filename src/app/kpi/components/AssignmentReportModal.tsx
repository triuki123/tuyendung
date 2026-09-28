'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Printer } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { KpiAssignment, STATUS_LABEL, STATUS_COLOR, kpiGradeFromScore } from './kpiTypes';

interface Props {
  assignmentId: string;
  companyId?: string | null;
  onClose: () => void;
}

const TIER_LABEL: Record<string, string> = { self: 'Tự nhận xét', manager: 'Quản lý đánh giá', senior: 'Cấp cao xác nhận' };

/** Nhãn trạng thái riêng cho phiếu KPI (đổi "chốt" → "xác nhận" cho đúng văn phong văn phòng, không đổi STATUS_LABEL dùng chung toàn hệ thống). */
const FORM_STATUS_LABEL: Record<string, string> = {
  ...STATUS_LABEL,
  senior_review: 'Chờ cấp cao xác nhận',
  concluded: 'Đã xác nhận',
};

/** Xem biểu đồ/thống kê 1 phiếu KPI + in ra lưu hồ sơ nhân sự hoặc đem bàn luận. */
export default function AssignmentReportModal({ assignmentId, companyId, onClose }: Props) {
  const toast = useToast();
  const [data, setData] = useState<KpiAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = companyId ? `/api/kpi/assignments/${assignmentId}?company_id=${companyId}` : `/api/kpi/assignments/${assignmentId}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setData(j.data); })
      .catch((e) => toast.error(e.message || 'Lỗi tải phiếu KPI'))
      .finally(() => setLoading(false));
  }, [assignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const items = data.items || [];
  const maxScore = 100;
  const period = data.start_date && data.end_date ? `${data.start_date} → ${data.end_date}` : '';
  const isConcluded = data.status === 'concluded' && data.final_score != null;
  const finalGrade = kpiGradeFromScore(data.final_score);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 sticky top-0" style={{ background: 'var(--card)' }}>
          <div>
            <h2 className="text-base font-700 text-foreground">Biểu Đồ & Thống Kê Phiếu KPI</h2>
            <p className={`text-xs mt-0.5 ${STATUS_COLOR[data.status]}`}>{STATUS_LABEL[data.status]}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="btn-ghost rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5">
              <Printer className="h-3.5 w-3.5" /> In phiếu
            </button>
            <button onClick={onClose} className="btn-ghost rounded-lg p-2.5 -m-1"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* ── Xem trên màn hình ── */}
        <div className="p-6 space-y-5">
          <div>
            <p className="text-sm font-700 text-foreground">{data.employee_name}</p>
            <p className="text-xs text-muted-foreground">{data.cycle_name} · {data.company_name} {period && `· ${period}`}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Tự chấm" value={data.self_score} color="text-sky-400" />
            <StatTile label="Quản lý chấm" value={data.manager_score} color="text-amber-400" />
            <StatTile label="Điểm chính thức" value={data.final_score} color="text-emerald-400" big />
          </div>

          {items.length > 0 && (
            <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--background)' }}>
              <p className="text-sm font-700 text-foreground mb-3">So sánh điểm theo chỉ tiêu</p>
              <div className="flex items-center gap-4 mb-3 text-2xs">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-sky-400" /> Tự chấm</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-amber-400" /> Quản lý</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Chính thức</span>
              </div>
              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.id}>
                    <p className="text-xs text-foreground mb-1">{it.name} <span className="text-muted-foreground">· trọng số {it.weight}%</span></p>
                    {(['self_score', 'manager_score', 'final_score'] as const).map((k, i) => {
                      const v = it[k];
                      const color = i === 0 ? 'bg-sky-400' : i === 1 ? 'bg-amber-400' : 'bg-emerald-400';
                      return (
                        <div key={k} className="flex items-center gap-2 mb-0.5">
                          <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: v != null ? `${Math.max(2, (Number(v) / maxScore) * 100)}%` : '0%' }} />
                          </div>
                          <span className="text-2xs text-muted-foreground tabular-nums w-8 text-right">{v ?? '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(data.reviews || []).length > 0 && (
            <div className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--background)' }}>
              <p className="text-sm font-700 text-foreground mb-3">Lịch sử đánh giá</p>
              <div className="space-y-2">
                {(data.reviews || []).map((r, i) => (
                  <div key={i} className="text-xs border-l-2 border-indigo-500/40 pl-3">
                    <p className="text-foreground font-600">{TIER_LABEL[r.tier] || r.tier} — {r.reviewer_name || r.reviewer_id} {r.score != null && `· ${r.score} đ`}</p>
                    {r.note && <p className="text-muted-foreground">{r.note}</p>}
                    <p className="text-muted-foreground opacity-60">{new Date(r.created_at).toLocaleString('vi-VN')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Vùng in (ẩn trên màn hình, chỉ hiện khi in — #kpi-print-report ở tailwind.css) ── */}
        <div id="kpi-print-report" className="print-only">
          <p className={`kr-watermark ${isConcluded ? '' : 'kr-watermark-pending'}`}>
            {isConcluded ? 'Đã Hoàn Tất Đánh Giá' : 'Chưa Hoàn Tất Đánh Giá'}
          </p>

          <div className="kr-header">
            <p className="kr-title">Phiếu Đánh Giá KPI</p>
            <p className="kr-subtitle">{data.company_name}</p>
          </div>

          <div className="kr-meta">
            <div>
              <div className="kr-meta-row"><span className="kr-meta-label">Nhân viên</span><span className="kr-meta-value">{data.employee_name}</span></div>
              <div className="kr-meta-row"><span className="kr-meta-label">Thời gian</span><span className="kr-meta-value">{period}</span></div>
              <div className="kr-meta-row"><span className="kr-meta-label">Cấp cao xác nhận</span><span className="kr-meta-value">{data.senior_name || '—'}</span></div>
            </div>
            <div>
              <div className="kr-meta-row"><span className="kr-meta-label">Kỳ đánh giá</span><span className="kr-meta-value">{data.cycle_name}</span></div>
              <div className="kr-meta-row"><span className="kr-meta-label">Quản lý đánh giá</span><span className="kr-meta-value">{data.manager_name || '—'}</span></div>
              <div className="kr-meta-row">
                <span className="kr-meta-label">Trạng thái</span>
                <span className={`kr-status-pill kr-status-${data.status}`}>{FORM_STATUS_LABEL[data.status]}</span>
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Chỉ tiêu</th><th>Trọng số</th><th>Tự chấm</th><th>Quản lý chấm</th><th>Điểm xác nhận</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id} className={idx % 2 === 1 ? 'kr-row-alt' : ''}>
                  <td>{it.name}</td>
                  <td className="kr-num">{it.weight}%</td>
                  <td className="kr-num"><PrintScoreCell value={it.self_score} tone="self" /></td>
                  <td className="kr-num"><PrintScoreCell value={it.manager_score} tone="manager" /></td>
                  <td className="kr-num"><PrintScoreCell value={it.final_score} tone="final" /></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="kr-final-box">
            <span className="kr-final-label">Điểm chính thức</span>
            <span className={`kr-final-badge kr-final-${finalGrade?.grade ?? 'pending'}`}>{data.final_score ?? '—'}</span>
            <span className="kr-final-grade">{finalGrade ? `Xếp loại ${finalGrade.grade} · ${finalGrade.label}` : 'Chưa Hoàn Tất Đánh Giá'}</span>
          </div>

          <div className="kr-sign">
            <p className="kr-sign-date">Ngày ..... tháng ..... năm .....</p>
            <div className="kr-sign-cols">
              <div><p>Nhân viên</p><div className="kr-sign-line" /><p>{data.employee_name}</p></div>
              <div><p>Quản lý đánh giá</p><div className="kr-sign-line" /><p>{data.manager_name || ''}</p></div>
              <div><p>Cấp cao xác nhận</p><div className="kr-sign-line" /><p>{data.senior_name || ''}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintScoreCell({ value, tone }: { value: number | null; tone: 'self' | 'manager' | 'final' }) {
  return (
    <span className="kr-score-cell">
      <span className="kr-score-num">{value ?? '—'}</span>
      {value != null && (
        <span className="kr-score-bar-track">
          <span className={`kr-score-bar-fill kr-tone-${tone}`} style={{ width: `${Math.max(4, Math.min(100, Number(value)))}%` }} />
        </span>
      )}
    </span>
  );
}

function StatTile({ label, value, color, big }: { label: string; value: number | null; color: string; big?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/5 p-2.5 sm:p-3 text-center" style={{ background: 'var(--background)' }}>
      <p className="text-2xs text-muted-foreground uppercase tracking-wider truncate">{label}</p>
      <p className={`${big ? 'text-lg sm:text-2xl' : 'text-base sm:text-lg'} font-800 tabular-nums mt-1 ${color}`}>{value ?? '—'}</p>
    </div>
  );
}
