'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Check, Minus } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import {
  KpiAssignment, KpiAssignmentItem, STATUS_LABEL, STATUS_COLOR,
  KPI_CATEGORY_ORDER, KPI_CATEGORY_LABEL, kpiGradeFromScore,
} from './kpiTypes';

type SummaryState = { strengths: string; improvements: string; next_goals: string; training_needs: string };

/** Nút chọn Đạt / Không đạt / (bỏ trống) cho 1 tiêu chí. */
function AchievedToggle({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(value === true ? null : true)}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-600 border ${value === true ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
        <Check className="h-3 w-3" /> Đạt
      </button>
      <button type="button" onClick={() => onChange(value === false ? null : false)}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-600 border ${value === false ? 'bg-rose-600 border-rose-500 text-white' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
        <Minus className="h-3 w-3" /> Không đạt
      </button>
    </div>
  );
}

/** Badge Đạt/Không đạt ở chế độ chỉ xem. */
function AchievedBadge({ value }: { value: boolean | null }) {
  if (value === null || value === undefined) return null;
  return value
    ? <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-600 bg-emerald-500/15 text-emerald-400"><Check className="h-3 w-3" /> Đạt</span>
    : <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-600 bg-rose-500/15 text-rose-400"><Minus className="h-3 w-3" /> Không đạt</span>;
}

interface Props {
  assignmentId: string;
  currentUserId: string;
  companyId?: string | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Nối ?company_id= khi Super Admin đang thao tác 1 công ty tường minh (dropdown /kpi). */
function withCompany(url: string, companyId?: string | null): string {
  if (!companyId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}company_id=${companyId}`;
}

/** Modal xem/xử lý 1 phiếu KPI — form hiện ra đúng tầng đang chờ VÀ đúng người được giao (record-driven). */
export default function AssignmentDetailModal({ assignmentId, currentUserId, companyId, onClose, onChanged }: Props) {
  const toast = useToast();
  const [data, setData] = useState<KpiAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selfInputs, setSelfInputs] = useState<Record<string, { actual: string; note: string; score: string; achieved: boolean | null }>>({});
  const [managerInputs, setManagerInputs] = useState<Record<string, { actual: string; note: string; score: string; achieved: boolean | null }>>({});
  const [managerNote, setManagerNote] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [seniorNote, setSeniorNote] = useState('');
  const [summary, setSummary] = useState<SummaryState>({ strengths: '', improvements: '', next_goals: '', training_needs: '' });
  const [integrationScores, setIntegrationScores] = useState<{ source: string; weight: number; score: number }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(withCompany(`/api/kpi/assignments/${assignmentId}`, companyId));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Lỗi tải phiếu KPI');
      setData(j.data);
      const si: typeof selfInputs = {};
      const mi: typeof managerInputs = {};
      for (const it of j.data.items || []) {
        si[it.id] = { actual: it.self_actual || '', note: it.self_note || '', score: it.self_score != null ? String(it.self_score) : '', achieved: it.self_achieved ?? null };
        mi[it.id] = { actual: it.manager_actual || '', note: it.manager_note || '', score: it.manager_score != null ? String(it.manager_score) : '', achieved: it.manager_achieved ?? it.self_achieved ?? null };
      }
      setSelfInputs(si);
      setManagerInputs(mi);
      setSummary({
        strengths: j.data.strengths || '', improvements: j.data.improvements || '',
        next_goals: j.data.next_goals || '', training_needs: j.data.training_needs || '',
      });
      if (j.data.final_score != null) setFinalScore(String(j.data.final_score));
      if (j.data.senior_id === currentUserId && j.data.status === 'senior_review') {
        fetch(withCompany(`/api/kpi/assignments/${assignmentId}/integration-scores`, companyId)).then((r) => r.json()).then((ij) => setIntegrationScores(ij.data || [])).catch(() => {});
      }
    } catch (e: any) {
      toast.error(e.message || 'Lỗi tải phiếu KPI');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [assignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const isEmployee = data.employee_id === currentUserId;
  const isManager = data.manager_id === currentUserId;
  const isSenior = data.senior_id === currentUserId;

  // Kỳ đã ĐÓNG (lưu trữ) → toàn bộ phiếu chỉ-đọc, không cho tự nhận xét/chấm/chốt nữa.
  const cycleClosed = data.cycle_status === 'closed';
  const canSelfReview = isEmployee && data.status === 'draft' && !cycleClosed;
  const canManagerReview = isManager && data.status === 'manager_review' && !cycleClosed;
  const canConclude = isSenior && data.status === 'senior_review' && !cycleClosed;
  const summaryPayload = () => ({
    strengths: summary.strengths || null, improvements: summary.improvements || null,
    next_goals: summary.next_goals || null, training_needs: summary.training_needs || null,
  });

  // Gom tiêu chí theo nhóm (KPI_CATEGORY_ORDER trước, chưa phân nhóm xếp cuối).
  const items = data.items || [];
  const groupKeys = [...KPI_CATEGORY_ORDER.filter((c) => items.some((it) => it.category === c))];
  const hasUncategorized = items.some((it) => !it.category || !KPI_CATEGORY_ORDER.includes(it.category as typeof KPI_CATEGORY_ORDER[number]));
  const grade = kpiGradeFromScore(data.final_score);

  const renderItem = (it: KpiAssignmentItem) => {
    const officialAchieved = it.manager_achieved ?? it.self_achieved ?? null;
    return (
      <div key={it.id} className="rounded-2xl border border-white/5 p-4 space-y-2" style={{ background: 'var(--background)' }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-600 text-foreground">{it.name} <span className="text-2xs text-muted-foreground">· trọng số {it.weight}%</span></p>
          <div className="flex items-center gap-2">
            {!canSelfReview && !canManagerReview && <AchievedBadge value={officialAchieved} />}
            {it.final_score != null && <span className="text-sm font-800 text-emerald-400 tabular-nums">{it.final_score} đ</span>}
          </div>
        </div>
        {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
        {it.target_value && <p className="text-2xs text-indigo-300/80">Chỉ tiêu: <span className="font-600">{it.target_value} {it.unit || ''}</span></p>}

        {canSelfReview ? (
          <div className="space-y-2 pt-2">
            <div>
              <label className="text-2xs text-muted-foreground">Kết quả thực tế</label>
              <textarea rows={2} className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs resize-y" placeholder="Mô tả kết quả thực tế đạt được…"
                value={selfInputs[it.id]?.actual || ''} onChange={(e) => setSelfInputs({ ...selfInputs, [it.id]: { ...selfInputs[it.id], actual: e.target.value } })} />
            </div>
            <input className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" placeholder="Ghi chú / minh chứng (link, số liệu…)"
              value={selfInputs[it.id]?.note || ''} onChange={(e) => setSelfInputs({ ...selfInputs, [it.id]: { ...selfInputs[it.id], note: e.target.value } })} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground shrink-0">Tự chấm:</span>
                <input type="number" min={0} max={100} className="w-24 rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" placeholder="0–100"
                  value={selfInputs[it.id]?.score || ''} onChange={(e) => setSelfInputs({ ...selfInputs, [it.id]: { ...selfInputs[it.id], score: e.target.value } })} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground shrink-0">Tự đánh giá:</span>
                <AchievedToggle value={selfInputs[it.id]?.achieved ?? null} onChange={(v) => setSelfInputs({ ...selfInputs, [it.id]: { ...selfInputs[it.id], achieved: v } })} />
              </div>
            </div>
          </div>
        ) : (
          (it.self_actual || it.self_score != null || it.self_achieved != null) && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>Tự nhận xét: {it.self_actual || '—'} {it.self_score != null && `· ${it.self_score} đ`}</span>
              <AchievedBadge value={it.self_achieved ?? null} />
            </p>
          )
        )}

        {canManagerReview ? (
          <div className="space-y-2 pt-2 border-t border-white/5 mt-2">
            <div>
              <label className="text-2xs text-muted-foreground">Kết quả quản lý ghi nhận</label>
              <textarea rows={2} className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs resize-y" placeholder="Ghi nhận/đối chiếu kết quả thực tế…"
                value={managerInputs[it.id]?.actual || ''} onChange={(e) => setManagerInputs({ ...managerInputs, [it.id]: { ...managerInputs[it.id], actual: e.target.value } })} />
            </div>
            <input className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" placeholder="Nhận xét"
              value={managerInputs[it.id]?.note || ''} onChange={(e) => setManagerInputs({ ...managerInputs, [it.id]: { ...managerInputs[it.id], note: e.target.value } })} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground shrink-0">Điểm:</span>
                <input type="number" min={0} max={100} className="w-24 rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" placeholder="0–100"
                  value={managerInputs[it.id]?.score || ''} onChange={(e) => setManagerInputs({ ...managerInputs, [it.id]: { ...managerInputs[it.id], score: e.target.value } })} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground shrink-0">Quản lý đánh giá:</span>
                <AchievedToggle value={managerInputs[it.id]?.achieved ?? null} onChange={(v) => setManagerInputs({ ...managerInputs, [it.id]: { ...managerInputs[it.id], achieved: v } })} />
              </div>
            </div>
          </div>
        ) : (
          (it.manager_actual || it.manager_score != null) && (
            <p className="text-xs text-muted-foreground">Quản lý: {it.manager_actual || '—'} {it.manager_score != null && `· ${it.manager_score} đ`}</p>
          )
        )}
      </div>
    );
  };

  const renderGroupedItems = () => {
    if (!items.length) return null;
    return (
      <>
        {groupKeys.map((cat) => (
          <div key={cat} className="space-y-2">
            <p className="text-2xs font-700 uppercase tracking-wider text-muted-foreground/70">{KPI_CATEGORY_LABEL[cat]}</p>
            {items.filter((it) => it.category === cat).map(renderItem)}
          </div>
        ))}
        {hasUncategorized && (
          <div className="space-y-2">
            {groupKeys.length > 0 && <p className="text-2xs font-700 uppercase tracking-wider text-muted-foreground/70">Khác</p>}
            {items.filter((it) => !it.category || !KPI_CATEGORY_ORDER.includes(it.category as typeof KPI_CATEGORY_ORDER[number])).map(renderItem)}
          </div>
        )}
      </>
    );
  };

  const showSummaryEdit = canManagerReview || canConclude;
  const hasSummaryContent = !!(data.strengths || data.improvements || data.next_goals || data.training_needs);

  const submitSelf = async () => {
    setSaving(true);
    try {
      const items = (data.items || []).map((it) => ({
        id: it.id,
        actual: selfInputs[it.id]?.actual || null,
        note: selfInputs[it.id]?.note || null,
        score: selfInputs[it.id]?.score ? Number(selfInputs[it.id].score) : null,
        achieved: selfInputs[it.id]?.achieved ?? null,
      }));
      const r = await fetch(`/api/kpi/assignments/${assignmentId}/self-review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, company_id: companyId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Lỗi nộp tự nhận xét');
      toast.success('Đã nộp tự nhận xét');
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi nộp tự nhận xét');
    } finally {
      setSaving(false);
    }
  };

  const submitManager = async () => {
    setSaving(true);
    try {
      const items = (data.items || []).map((it) => ({
        id: it.id,
        actual: managerInputs[it.id]?.actual || null,
        note: managerInputs[it.id]?.note || null,
        score: managerInputs[it.id]?.score ? Number(managerInputs[it.id].score) : null,
        achieved: managerInputs[it.id]?.achieved ?? null,
      }));
      const r = await fetch(`/api/kpi/assignments/${assignmentId}/manager-review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, note: managerNote || undefined, summary: summaryPayload(), company_id: companyId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Lỗi chấm điểm');
      toast.success('Đã gửi đánh giá');
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi chấm điểm');
    } finally {
      setSaving(false);
    }
  };

  const submitConclude = async () => {
    if (!finalScore) { toast.error('Nhập điểm chốt cuối cùng'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/kpi/assignments/${assignmentId}/conclude`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_score: Number(finalScore), note: seniorNote || undefined, summary: summaryPayload(), company_id: companyId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Lỗi chốt điểm');
      toast.success('Đã chốt điểm KPI');
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi chốt điểm');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 sticky top-0" style={{ background: 'var(--card)' }}>
          <div>
            <h2 className="text-base font-700 text-foreground">{data.cycle_name || 'Phiếu KPI'}</h2>
            <p className={`text-xs mt-0.5 ${STATUS_COLOR[data.status]}`}>{STATUS_LABEL[data.status]}</p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-2.5 -m-1"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {cycleClosed && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
              Kỳ này đã <span className="font-700">đóng &amp; lưu trữ</span> — phiếu ở chế độ chỉ đọc, không thể chấm/sửa nữa.
            </div>
          )}
          {data.rollupReference && data.rollupReference.count > 0 && (
            <div className="rounded-2xl border border-white/5 p-3 text-xs text-muted-foreground" style={{ background: 'var(--background)' }}>
              Tham khảo — trung bình có trọng số {data.rollupReference.count} kỳ tháng đã chốt: <span className="text-foreground font-700">{data.rollupReference.avg} đ</span>
              <span className="block mt-1 opacity-80">{data.rollupReference.breakdown.map((b) => `${b.cycle_name}: ${b.final_score}đ (${b.weight}%)`).join(' · ')}</span>
            </div>
          )}
          {renderGroupedItems()}

          {canManagerReview && (
            <textarea className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" rows={2}
              placeholder="Nhận xét chung của quản lý (tùy chọn)" value={managerNote} onChange={(e) => setManagerNote(e.target.value)} />
          )}

          {/* Phần tổng kết — điểm mạnh / cần cải thiện / mục tiêu kỳ tới / nhu cầu đào tạo */}
          {showSummaryEdit ? (
            <div className="rounded-2xl border border-white/5 p-4 space-y-2" style={{ background: 'var(--background)' }}>
              <p className="text-sm font-600 text-foreground">Tổng kết đánh giá</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <textarea className="rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" rows={2} placeholder="Điểm mạnh"
                  value={summary.strengths} onChange={(e) => setSummary({ ...summary, strengths: e.target.value })} />
                <textarea className="rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" rows={2} placeholder="Điểm cần cải thiện"
                  value={summary.improvements} onChange={(e) => setSummary({ ...summary, improvements: e.target.value })} />
                <textarea className="rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" rows={2} placeholder="Mục tiêu kỳ tới"
                  value={summary.next_goals} onChange={(e) => setSummary({ ...summary, next_goals: e.target.value })} />
                <textarea className="rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" rows={2} placeholder="Nhu cầu đào tạo"
                  value={summary.training_needs} onChange={(e) => setSummary({ ...summary, training_needs: e.target.value })} />
              </div>
            </div>
          ) : hasSummaryContent && (
            <div className="rounded-2xl border border-white/5 p-4 space-y-1.5 text-xs" style={{ background: 'var(--background)' }}>
              <p className="text-sm font-600 text-foreground mb-1">Tổng kết đánh giá</p>
              {data.strengths && <p className="text-muted-foreground"><span className="text-foreground font-600">Điểm mạnh:</span> {data.strengths}</p>}
              {data.improvements && <p className="text-muted-foreground"><span className="text-foreground font-600">Cần cải thiện:</span> {data.improvements}</p>}
              {data.next_goals && <p className="text-muted-foreground"><span className="text-foreground font-600">Mục tiêu kỳ tới:</span> {data.next_goals}</p>}
              {data.training_needs && <p className="text-muted-foreground"><span className="text-foreground font-600">Nhu cầu đào tạo:</span> {data.training_needs}</p>}
            </div>
          )}

          {canConclude && (
            <div className="rounded-2xl border border-white/5 p-4 space-y-2" style={{ background: 'var(--background)' }}>
              <p className="text-sm font-600 text-foreground">Chốt điểm cuối cùng</p>
              <p className="text-2xs text-muted-foreground">Tự chấm: {data.self_score ?? '—'} · Quản lý chấm: {data.manager_score ?? '—'}</p>
              {integrationScores.length > 0 && (
                <p className="text-2xs text-muted-foreground">
                  Tham khảo thêm — {integrationScores.map((s) => `${s.source === 'attendance' ? 'Chấm công' : 'Task'}: ${s.score} đ (trọng số ${s.weight}%)`).join(' · ')}
                </p>
              )}
              <input type="number" className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm" placeholder="Điểm chính thức (0-100)"
                value={finalScore} onChange={(e) => setFinalScore(e.target.value)} />
              <textarea className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" rows={2}
                placeholder="Nhận xét của cấp cao (tùy chọn)" value={seniorNote} onChange={(e) => setSeniorNote(e.target.value)} />
            </div>
          )}

          {!canSelfReview && !canManagerReview && !canConclude && (
            <div className="rounded-2xl border border-white/5 p-4 text-center space-y-1" style={{ background: 'var(--background)' }}>
              <p className="text-sm font-700 text-foreground">Điểm chính thức: {data.final_score ?? 'Chưa chốt'}</p>
              {grade && <p className={`text-xs font-700 ${grade.color}`}>Xếp loại: {grade.label} ({grade.grade})</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
          {canSelfReview && <button disabled={saving} onClick={submitSelf} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">{saving ? 'Đang nộp...' : 'Nộp tự nhận xét'}</button>}
          {canManagerReview && <button disabled={saving} onClick={submitManager} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">{saving ? 'Đang gửi...' : 'Gửi đánh giá'}</button>}
          {canConclude && <button disabled={saving} onClick={submitConclude} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">{saving ? 'Đang chốt...' : 'Chốt điểm'}</button>}
        </div>
      </div>
    </div>
  );
}
