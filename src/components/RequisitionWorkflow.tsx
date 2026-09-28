'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Play } from 'lucide-react';
import { listRequisitionWorkflow, RequisitionWorkflowMilestone, updateRequisitionWorkflowMilestone } from '@/lib/api/requisitionApi';
import { useToast } from '@/context/ToastContext';

export function RequisitionWorkflow({ reqId }: { reqId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<RequisitionWorkflowMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = async () => setItems(await listRequisitionWorkflow(reqId));
  useEffect(() => {
    let active = true;
    load().catch(err => { if (active) toast.error(err instanceof Error ? err.message : 'Lỗi tải quy trình'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reqId]);
  const update = async (item: RequisitionWorkflowMilestone, status: 'in_progress' | 'completed') => {
    setBusyId(item.id);
    try { await updateRequisitionWorkflowMilestone(reqId, item.id, { status }); await load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Lỗi cập nhật mốc'); }
    finally { setBusyId(null); }
  };
  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  return <div className="space-y-2">
    <p className="mb-3 text-xs text-muted-foreground">Các mốc được kích hoạt tuần tự. SLA chỉ tính trong ngày làm việc.</p>
    {items.map((item, index) => {
      const done = item.status === 'completed' || item.status === 'skipped';
      const overdue = item.status === 'in_progress' && item.due_at && new Date(item.due_at).getTime() < Date.now();
      return <div key={item.id} className="flex gap-3 border-b border-line-subtle py-3 last:border-0">
        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-500 text-white' : item.status === 'in_progress' ? 'bg-sky-500 text-white' : 'border border-line text-muted-foreground'}`}>{done ? <Check className="h-3 w-3" /> : <span className="text-2xs">{index + 1}</span>}</div>
        <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-600 text-foreground">{item.title}</p><p className="mt-0.5 text-2xs text-muted-foreground">{item.owner_label} · SLA {item.sla_hours} giờ</p></div>{item.status === 'in_progress' && <span className={`text-2xs ${overdue ? 'text-rose-400' : 'text-sky-400'}`}>{overdue ? 'Quá hạn' : item.due_at ? `Hạn ${new Date(item.due_at).toLocaleString('vi-VN')}` : 'Đang xử lý'}</span>}</div>
          {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}
          {item.status === 'pending' && <button disabled={busyId !== null} onClick={() => update(item, 'in_progress')} className="btn-ghost mt-2 inline-flex items-center gap-1 px-2 py-1 text-2xs"><Play className="h-3 w-3" />Bắt đầu</button>}
          {item.status === 'in_progress' && <button disabled={busyId !== null} onClick={() => update(item, 'completed')} className="btn-ghost mt-2 inline-flex items-center gap-1 px-2 py-1 text-2xs text-emerald-400"><Check className="h-3 w-3" />Hoàn tất</button>}
        </div>
      </div>;
    })}
  </div>;
}
