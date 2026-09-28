'use client';

/**
 * Người liên quan · Theo dõi · Lịch sử · Xem nhanh yêu cầu tuyển dụng.
 *
 * Dùng CHUNG cho cả trang Tuyển Dụng (/nguon-nhan-luc/yeu-cau-tuyen-dung) lẫn cổng đặt yêu cầu
 * (/yeu-cau-tuyen-dung). Trước đây mỗi trang tự vẽ thẻ riêng nên người vào trang này thấy thông
 * tin mới, người vào trang kia thì không.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, ChevronRight, Star, History, Pencil } from 'lucide-react';
import {
  listRequisitionHistory, toggleFollowRequisition,
  RequisitionAuditEntry, Requisition, REQ_STATUS_LABELS, REQ_PRIORITY_LABELS,
} from '@/lib/api/requisitionApi';
import { SlaBadge, CommentPanel, fmtSalary } from '@/components/RequisitionExtras';
import { getCurrentUser } from '@/lib/authStore';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { RequisitionWorkflow } from '@/components/RequisitionWorkflow';

/** Người yêu cầu / phỏng vấn / theo dõi — 3 dòng gọn cho thẻ danh sách. */
export function RequisitionPeopleLines({ r }: { r: Requisition }) {
  const line = (label: string, value?: string | null) => value ? (
    <p className="text-2xs text-muted-foreground mt-0.5 truncate">{label}: <span className="text-foreground">{value}</span></p>
  ) : null;
  return (
    <>
      {line('Người yêu cầu', r.requester_name)}
      {line('Phỏng vấn', r.interviewer_names?.length ? r.interviewer_names.join(', ') : null)}
      {line('Theo dõi', r.follower_names?.length ? r.follower_names.join(', ') : null)}
    </>
  );
}

/** Nút bật/tắt theo dõi cho CHÍNH người đang đăng nhập. */
export function FollowButton({ req, onChanged, compact }: {
  req: Requisition; onChanged: (r: Requisition) => void; compact?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const me = useMemo(() => (getCurrentUser() as { id?: string } | null)?.id || '', []);
  const following = (req.follower_ids || []).includes(me);
  const sz = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';

  const click = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const { requisition, following: now } = await toggleFollowRequisition(req.id);
      onChanged(requisition);
      toast.success(now ? 'Đã theo dõi yêu cầu này' : 'Đã bỏ theo dõi');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Lỗi theo dõi'); }
    finally { setBusy(false); }
  };

  return (
    <button onClick={click} disabled={busy}
      className={`btn-ghost rounded-lg p-1.5 disabled:opacity-50 ${following ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'}`}
      title={following ? 'Bỏ theo dõi' : 'Theo dõi yêu cầu này'}>
      {busy ? <Loader2 className={`${sz} animate-spin`} /> : <Star className={`${sz} ${following ? 'fill-amber-400' : ''}`} />}
    </button>
  );
}

/** Icon + màu theo MÃ hành động (không đoán theo chuỗi tiếng Việt). */
const AUDIT_META: Record<string, { label: string; cls: string }> = {
  create:        { label: 'Tạo mới',        cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' },
  update:        { label: 'Cập nhật',       cls: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300' },
  status_change: { label: 'Đổi trạng thái', cls: 'border-sky-500/30 bg-sky-500/15 text-sky-300' },
  approve:       { label: 'Phê duyệt',      cls: 'border-violet-500/30 bg-violet-500/15 text-violet-300' },
  accept:        { label: 'Tiếp nhận',      cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' },
  reject:        { label: 'Từ chối',        cls: 'border-rose-500/30 bg-rose-500/15 text-rose-300' },
  follow:        { label: 'Theo dõi',       cls: 'border-amber-500/30 bg-amber-500/15 text-amber-300' },
  unfollow:      { label: 'Bỏ theo dõi',    cls: 'border-line bg-hover text-muted-foreground' },
  delete:        { label: 'Xóa',            cls: 'border-red-500/30 bg-red-500/15 text-red-300' },
};

/** Timeline lịch sử xử lý của 1 yêu cầu. */
export function RequisitionHistory({ reqId }: { reqId: string }) {
  const [entries, setEntries] = useState<RequisitionAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    listRequisitionHistory(reqId)
      .then(d => { if (alive) setEntries(d); })
      .catch(e => { if (alive) setErr(e instanceof Error ? e.message : 'Lỗi tải lịch sử'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reqId]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (err) return <p className="text-xs text-rose-400 py-6 text-center">{err}</p>;
  if (entries.length === 0) return (
    <div className="flex flex-col items-center py-12 text-muted-foreground">
      <History className="h-8 w-8 mb-2 opacity-30" />
      <p className="text-sm">Chưa có lịch sử</p>
      <p className="text-xs mt-1 opacity-60">Các thao tác từ nay sẽ được ghi lại tại đây.</p>
    </div>
  );

  return (
    <div className="relative">
      <div className="absolute left-[5px] top-1 bottom-1 w-px bg-line" />
      <div className="space-y-4">
        {entries.map(e => {
          const meta = AUDIT_META[e.action] || { label: 'Thao tác', cls: 'border-line bg-hover text-muted-foreground' };
          const changes = e.changes ? Object.values(e.changes) : [];
          return (
            <div key={e.id} className="flex gap-3 relative">
              <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500/70 shrink-0 z-10" style={{ boxShadow: '0 0 0 4px var(--card)' }} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${meta.cls}`}>{meta.label}</span>
                  <span className="text-2xs text-muted-foreground tabular-nums">{new Date(e.created_at).toLocaleString('vi-VN')}</span>
                </div>
                {e.details && <p className="text-xs text-muted-foreground mt-1 break-words">{e.details}</p>}
                {changes.length > 0 && (
                  <div className="mt-1.5 space-y-1 rounded-lg border border-line-subtle p-2" style={{ background: 'var(--background)' }}>
                    {changes.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-2xs flex-wrap">
                        <span className="text-muted-foreground/70">{c.label}:</span>
                        <span className="text-muted-foreground line-through">{c.from ?? '—'}</span>
                        <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                        <span className="text-foreground font-600">{c.to ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-2xs text-muted-foreground/60 mt-1">Thực hiện bởi: <span className="text-muted-foreground">{e.performed_by_name || 'Hệ thống'}</span></p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-line-subtle last:border-0">
      <span className="w-32 shrink-0 text-2xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-xs text-foreground min-w-0 break-words">{children}</span>
    </div>
  );
}

/**
 * Xem nhanh yêu cầu tuyển dụng (chỉ đọc) — 3 tab Thông tin / Lịch sử / Ghi chú.
 * `candidatesSlot` và `actionsSlot` do từng trang truyền vào: danh sách ứng viên và nút thao tác
 * khác nhau giữa phía Tuyển Dụng (đổi trạng thái, duyệt) và phía người đặt yêu cầu (chỉ xem).
 */
export function RequisitionQuickView({ req, onClose, onChanged, onEdit, candidatesSlot, actionsSlot }: {
  req: Requisition;
  onClose: () => void;
  onChanged: (r: Requisition) => void;
  onEdit?: () => void;
  candidatesSlot?: React.ReactNode;
  actionsSlot?: React.ReactNode;
}) {
  useEscapeKey(onClose);
  const [tab, setTab] = useState<'info' | 'workflow' | 'history' | 'comments'>('info');
  const st = REQ_STATUS_LABELS[req.status];
  const pr = REQ_PRIORITY_LABELS[req.priority];
  const salary = fmtSalary(req.salary_min, req.salary_max, req.salary_type);
  const d = (v?: string | null) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-line-subtle px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-700 text-foreground truncate">{req.title}</h2>
            <p className="text-2xs text-muted-foreground truncate mt-0.5">
              {[req.company_name, req.department_name, req.sub_department_name].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <FollowButton req={req} onChanged={onChanged} />
            {onEdit && <button onClick={onEdit} className="btn-ghost rounded-lg p-1.5" title="Sửa"><Pencil className="h-4 w-4" /></button>}
            <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-line px-6 shrink-0">
          {([['info', 'Thông tin'], ['workflow', 'Quy trình'], ['history', 'Lịch sử'], ['comments', 'Ghi chú']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-2 py-2 text-sm font-500 border-b-2 ${tab === k ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'info' ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${st.color}`}>{st.label}</span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${pr.color}`}>{pr.label}</span>
                <SlaBadge targetCloseDate={req.target_close_date} status={req.status} />
              </div>
              <InfoRow label="Tiến độ">{req.filled_count}/{req.target_headcount} người</InfoRow>
              <InfoRow label="Người phụ trách">{req.owner_name || 'Chưa giao'}</InfoRow>
              <InfoRow label="Người yêu cầu">{req.requester_name || '—'}</InfoRow>
              <InfoRow label="Người phỏng vấn">{req.interviewer_names?.length ? req.interviewer_names.join(', ') : '—'}</InfoRow>
              <InfoRow label="Người theo dõi">{req.follower_names?.length ? req.follower_names.join(', ') : '—'}</InfoRow>
              <InfoRow label="Khoảng lương">{salary || 'Thỏa thuận'}</InfoRow>
              <InfoRow label="Ngày mở">{d(req.open_date)}</InfoRow>
              <InfoRow label="Hạn tuyển">{d(req.target_close_date)}</InfoRow>
              <InfoRow label="Mã ngân sách">{req.budget_code || '—'}</InfoRow>
              <InfoRow label="Pipeline">
                Tìm nguồn {req.cnt_sourcing ?? 0} · Sàng lọc {req.cnt_screening ?? 0} · Phỏng vấn {req.cnt_interview ?? 0} · Offer {req.cnt_offer ?? 0}
              </InfoRow>
              {req.reject_reason && <InfoRow label="Lý do từ chối"><span className="text-rose-300">{req.reject_reason}</span></InfoRow>}
              <InfoRow label="Ghi chú">{req.note || '—'}</InfoRow>
              {candidatesSlot && <div className="pt-4">{candidatesSlot}</div>}
            </div>
          ) : tab === 'workflow' ? (
            <RequisitionWorkflow reqId={req.id} />
          ) : tab === 'history' ? (
            <RequisitionHistory reqId={req.id} />
          ) : (
            <CommentPanel reqId={req.id} />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-subtle px-6 py-4 shrink-0">
          <div className="min-w-0">{actionsSlot}</div>
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm shrink-0">Đóng</button>
        </div>
      </div>
    </div>
  );
}
