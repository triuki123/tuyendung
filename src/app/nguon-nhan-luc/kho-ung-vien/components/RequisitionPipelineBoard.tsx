'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  DragStartEvent, DragEndEvent,
} from '@dnd-kit/core';
import { Loader2, Briefcase, Star, GripVertical } from 'lucide-react';
import {
  listRequisitionCandidates, updateRequisitionCandidateStatus, type RequisitionCandidate,
} from '@/lib/api/requisitionApi';
import { STAGES, avatarFor, fmtExp } from './candidateShared';
import RequesterCandidateDrawer from '@/app/yeu-cau-tuyen-dung/components/RequesterCandidateDrawer';
import { useToast } from '@/context/ToastContext';

function CardBody({ c }: { c: RequisitionCandidate }) {
  const extra = c.skills.length - 3;
  return (
    <>
      <div className="flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-700 text-white shrink-0" style={{ background: avatarFor(c.candidate_name) }}>
          {c.candidate_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-600 text-foreground truncate">{c.candidate_name}</p>
          {(c.current_title || c.position_applied) && (
            <p className="text-2xs text-muted-foreground flex items-center gap-1 truncate"><Briefcase className="h-3 w-3 shrink-0" /> {c.current_title || c.position_applied}</p>
          )}
        </div>
        {c.rating != null && (
          <span className="inline-flex items-center gap-0.5 text-2xs text-amber-300 font-600 shrink-0"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {c.rating}</span>
        )}
      </div>
      {c.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {c.skills.slice(0, 3).map((s) => (
            <span key={s} className="rounded bg-indigo-500/15 text-indigo-200 border border-indigo-500/25 px-1.5 py-0.5 text-2xs font-600">{s}</span>
          ))}
          {extra > 0 && <span className="rounded bg-hover text-muted-foreground px-1.5 py-0.5 text-2xs">+{extra}</span>}
        </div>
      )}
      {(c.years_experience != null || c.hired_elsewhere) && (
        <div className="flex items-center gap-2 mt-2 text-2xs text-muted-foreground">
          {c.years_experience != null && <span className="rounded bg-hover px-1.5 py-0.5">{fmtExp(c.years_experience)}</span>}
          {c.hired_elsewhere && <span className="text-emerald-300/90 truncate">✅ tuyển vị trí khác</span>}
        </div>
      )}
    </>
  );
}

function DraggableCard({ c, canEdit, onOpen }: { c: RequisitionCandidate; canEdit: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.application_id, disabled: !canEdit });
  return (
    <div ref={setNodeRef}
      className={`group rounded-xl border border-line-subtle p-3 cursor-pointer hover:border-indigo-500/30 transition-colors ${isDragging ? 'opacity-30' : ''}`}
      style={{ background: 'var(--background)' }} onClick={onOpen}>
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0"><CardBody c={c} /></div>
        {canEdit && (
          <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}
            className="shrink-0 -mr-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none" title="Kéo để đổi trạng thái cho vị trí này">
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Column({ stage, items, canEdit, onOpen }: {
  stage: typeof STAGES[number]; items: RequisitionCandidate[]; canEdit: boolean; onOpen: (c: RequisitionCandidate) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <div ref={setNodeRef}
      className={`flex flex-col rounded-2xl border min-w-[260px] w-[260px] shrink-0 transition-colors ${isOver ? `border-2 ${stage.ring} ring-2 ${stage.ring}` : 'border-line-subtle'}`}
      style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line-subtle">
        <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
        <span className="text-xs font-700 text-foreground">{stage.label}</span>
        <span className="text-2xs text-muted-foreground ml-auto rounded-full bg-hover px-1.5">{items.length}</span>
      </div>
      <div className="flex flex-col gap-2 p-2 overflow-y-auto min-h-[120px] max-h-[calc(100vh-320px)]">
        {items.length === 0 ? (
          <p className="text-2xs text-muted-foreground/50 text-center py-6">Trống</p>
        ) : items.map((c) => <DraggableCard key={c.application_id} c={c} canEdit={canEdit} onOpen={() => onOpen(c)} />)}
      </div>
    </div>
  );
}

/**
 * Pipeline tuyển dụng theo TỪNG VỊ TRÍ (per-application) — kéo-thả đổi trạng thái ứng viên
 * cho đúng vị trí này (không đụng trạng thái CV cấp kho). Tôn trọng khóa độc quyền (lỗi → toast).
 */
export default function RequisitionPipelineBoard({ requisitionId, canEdit }: {
  requisitionId: string; canEdit: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState<RequisitionCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    setLoading(true);
    try { setItems(await listRequisitionCandidates(requisitionId)); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }, [requisitionId]);
  useEffect(() => { reload(); }, [reload]);

  const active = items.find((c) => c.application_id === activeId) || null;

  const onEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over ? String(e.over.id) : null;
    if (!to || !STAGES.some((s) => s.key === to)) return;
    const c = items.find((x) => x.application_id === id);
    if (!c || c.status === to) return;

    const prev = items;
    setItems((p) => p.map((x) => (x.application_id === id ? { ...x, status: to } : x))); // optimistic
    try {
      await updateRequisitionCandidateStatus(requisitionId, id, to);
      await reload();
    } catch (err) {
      setItems(prev); // revert (vd vướng khóa độc quyền)
      toast.error(err instanceof Error ? err.message : 'Không đổi được trạng thái');
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((stage) => (
            <Column key={stage.key} stage={stage} canEdit={canEdit} onOpen={(c) => setOpenApp(c.application_id)}
              items={items.filter((c) => c.status === stage.key)} />
          ))}
        </div>
        <DragOverlay>
          {active && (
            <div className="rounded-xl border border-indigo-500/40 p-3 shadow-2xl w-[240px]" style={{ background: 'var(--card)' }}>
              <CardBody c={active} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {openApp && (
        <RequesterCandidateDrawer reqId={requisitionId} appId={openApp}
          onClose={() => setOpenApp(null)} onChanged={reload} />
      )}
    </>
  );
}
