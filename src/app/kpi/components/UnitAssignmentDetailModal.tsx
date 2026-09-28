'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { KpiUnitAssignment, UNIT_STATUS_LABEL, UNIT_STATUS_COLOR } from './kpiTypes';

interface Props {
  assignmentId: string;
  currentUserId: string;
  companyId?: string | null;
  onClose: () => void;
  onChanged: () => void;
}

function withCompany(url: string, companyId?: string | null): string {
  if (!companyId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}company_id=${companyId}`;
}

/** Modal xem/xử lý 1 phiếu đánh giá ĐƠN VỊ — tự nhận xét (trưởng đơn vị) hoặc duyệt (đúng tầng đang chờ). */
export default function UnitAssignmentDetailModal({ assignmentId, currentUserId, companyId, onClose, onChanged }: Props) {
  const toast = useToast();
  const [data, setData] = useState<KpiUnitAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selfInputs, setSelfInputs] = useState<Record<string, { actual: string; note: string; score: string }>>({});
  const [reviewInputs, setReviewInputs] = useState<Record<string, { actual: string; note: string; score: string }>>({});
  const [tierNote, setTierNote] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(withCompany(`/api/kpi/unit-assignments/${assignmentId}`, companyId));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Lỗi tải phiếu');
      setData(j.data);
      const si: typeof selfInputs = {};
      const ri: typeof reviewInputs = {};
      for (const it of j.data.items || []) {
        si[it.id] = { actual: it.self_actual || '', note: it.self_note || '', score: it.self_score != null ? String(it.self_score) : '' };
        ri[it.id] = { actual: it.review_actual || '', note: it.review_note || '', score: it.review_score != null ? String(it.review_score) : '' };
      }
      setSelfInputs(si);
      setReviewInputs(ri);
    } catch (e: any) {
      toast.error(e.message || 'Lỗi tải phiếu');
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

  const isSelfReviewer = data.self_reviewer_id === currentUserId;
  const canSelfReview = isSelfReviewer && data.status === 'draft';
  const myPendingTier = (data.approvers || []).find((a) => a.approver_id === currentUserId && a.tier_order === data.current_tier && a.status === 'pending');
  const canApprove = data.status === 'in_approval' && !!myPendingTier;

  const submitSelf = async () => {
    setSaving(true);
    try {
      const items = (data.items || []).map((it) => ({
        id: it.id,
        actual: selfInputs[it.id]?.actual || null,
        note: selfInputs[it.id]?.note || null,
        score: selfInputs[it.id]?.score ? Number(selfInputs[it.id].score) : null,
      }));
      const r = await fetch(`/api/kpi/unit-assignments/${assignmentId}/self-review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, company_id: companyId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Lỗi nộp tự nhận xét');
      toast.success('Đã nộp tự nhận xét — chuyển sang tầng duyệt đầu tiên');
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi nộp tự nhận xét');
    } finally {
      setSaving(false);
    }
  };

  const submitApprove = async () => {
    setSaving(true);
    try {
      const items = (data.items || []).map((it) => ({
        id: it.id,
        actual: reviewInputs[it.id]?.actual || null,
        note: reviewInputs[it.id]?.note || null,
        score: reviewInputs[it.id]?.score ? Number(reviewInputs[it.id].score) : null,
      }));
      const r = await fetch(`/api/kpi/unit-assignments/${assignmentId}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, note: tierNote || undefined, company_id: companyId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Lỗi duyệt phiếu');
      toast.success(j.data?.status === 'concluded' ? 'Đã chốt điểm phiếu đơn vị' : 'Đã duyệt — chuyển sang tầng kế tiếp');
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi duyệt phiếu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 sticky top-0" style={{ background: 'var(--card)' }}>
          <div>
            <h2 className="text-base font-700 text-foreground">{data.unit_name || 'Đơn vị'} · {data.cycle_name}</h2>
            <p className={`text-xs mt-0.5 ${UNIT_STATUS_COLOR[data.status]}`}>{UNIT_STATUS_LABEL[data.status]}{data.status === 'in_approval' && ` (tầng ${data.current_tier}/${(data.approvers || []).length})`}</p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-2.5 -m-1"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {data.teamAvgIndividualScore?.avg != null && (
            <div className="rounded-2xl border border-white/5 p-3 text-xs text-muted-foreground" style={{ background: 'var(--background)' }}>
              Tham khảo — điểm KPI cá nhân trung bình của {data.teamAvgIndividualScore.count} thành viên trong đơn vị (cùng kỳ): <span className="text-foreground font-700">{data.teamAvgIndividualScore.avg} đ</span>
            </div>
          )}
          {data.rollupReference && data.rollupReference.count > 0 && (
            <div className="rounded-2xl border border-white/5 p-3 text-xs text-muted-foreground" style={{ background: 'var(--background)' }}>
              Tham khảo — trung bình có trọng số {data.rollupReference.count} kỳ tháng đơn vị đã chốt: <span className="text-foreground font-700">{data.rollupReference.avg} đ</span>
              <span className="block mt-1 opacity-80">{data.rollupReference.breakdown.map((b) => `${b.cycle_name}: ${b.final_score}đ (${b.weight}%)`).join(' · ')}</span>
            </div>
          )}

          {(data.approvers || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(data.approvers || []).map((a) => (
                <span key={a.id} className={`text-2xs px-2 py-1 rounded-lg border ${a.status === 'reviewed' ? 'border-emerald-500/30 text-emerald-400' : a.tier_order === data.current_tier ? 'border-amber-500/30 text-amber-400' : 'border-white/10 text-muted-foreground'}`}>
                  Tầng {a.tier_order}: {a.approver_name || a.approver_id} {a.score != null && `· ${a.score} đ`}
                </span>
              ))}
            </div>
          )}

          {(data.items || []).map((it) => (
            <div key={it.id} className="rounded-2xl border border-white/5 p-4 space-y-2" style={{ background: 'var(--background)' }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-600 text-foreground">{it.name} <span className="text-2xs text-muted-foreground">· trọng số {it.weight}%</span></p>
              </div>
              {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}

              {canSelfReview ? (
                <div className="space-y-2 pt-2">
                  <div>
                    <label className="text-2xs text-muted-foreground">Kết quả thực tế</label>
                    <textarea rows={2} className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs resize-y" placeholder="Mô tả kết quả thực tế đạt được…"
                      value={selfInputs[it.id]?.actual || ''} onChange={(e) => setSelfInputs({ ...selfInputs, [it.id]: { ...selfInputs[it.id], actual: e.target.value } })} />
                  </div>
                  <input className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" placeholder="Ghi chú / minh chứng"
                    value={selfInputs[it.id]?.note || ''} onChange={(e) => setSelfInputs({ ...selfInputs, [it.id]: { ...selfInputs[it.id], note: e.target.value } })} />
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-muted-foreground shrink-0">Tự chấm:</span>
                    <input type="number" min={0} max={100} className="w-24 rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" placeholder="0–100"
                      value={selfInputs[it.id]?.score || ''} onChange={(e) => setSelfInputs({ ...selfInputs, [it.id]: { ...selfInputs[it.id], score: e.target.value } })} />
                  </div>
                </div>
              ) : (
                (it.self_actual || it.self_score != null) && (
                  <p className="text-xs text-muted-foreground">Trưởng đơn vị tự nhận xét: {it.self_actual || '—'} {it.self_score != null && `· ${it.self_score} đ`}</p>
                )
              )}

              {canApprove ? (
                <div className="space-y-2 pt-2 border-t border-white/5 mt-2">
                  <div>
                    <label className="text-2xs text-muted-foreground">Ghi nhận của bạn</label>
                    <textarea rows={2} className="mt-0.5 w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs resize-y" placeholder="Ghi nhận/đối chiếu kết quả…"
                      value={reviewInputs[it.id]?.actual || ''} onChange={(e) => setReviewInputs({ ...reviewInputs, [it.id]: { ...reviewInputs[it.id], actual: e.target.value } })} />
                  </div>
                  <input className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" placeholder="Nhận xét"
                    value={reviewInputs[it.id]?.note || ''} onChange={(e) => setReviewInputs({ ...reviewInputs, [it.id]: { ...reviewInputs[it.id], note: e.target.value } })} />
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-muted-foreground shrink-0">Điểm:</span>
                    <input type="number" min={0} max={100} className="w-24 rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" placeholder="0–100"
                      value={reviewInputs[it.id]?.score || ''} onChange={(e) => setReviewInputs({ ...reviewInputs, [it.id]: { ...reviewInputs[it.id], score: e.target.value } })} />
                  </div>
                </div>
              ) : (
                (it.review_actual || it.review_score != null) && (
                  <p className="text-xs text-muted-foreground">Duyệt gần nhất: {it.review_actual || '—'} {it.review_score != null && `· ${it.review_score} đ`}</p>
                )
              )}
            </div>
          ))}

          {canApprove && (
            <textarea className="w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs" rows={2}
              placeholder="Nhận xét chung của bạn (tùy chọn)" value={tierNote} onChange={(e) => setTierNote(e.target.value)} />
          )}

          {!canSelfReview && !canApprove && (
            <div className="rounded-2xl border border-white/5 p-4 text-center" style={{ background: 'var(--background)' }}>
              <p className="text-sm font-700 text-foreground">Điểm chính thức: {data.final_score ?? 'Chưa chốt'}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
          {canSelfReview && <button disabled={saving} onClick={submitSelf} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">{saving ? 'Đang nộp...' : 'Nộp tự nhận xét'}</button>}
          {canApprove && <button disabled={saving} onClick={submitApprove} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">{saving ? 'Đang gửi...' : (data.current_tier >= (data.approvers?.length || 0) ? 'Duyệt & Chốt Điểm' : 'Duyệt & Chuyển Tầng Sau')}</button>}
        </div>
      </div>
    </div>
  );
}
