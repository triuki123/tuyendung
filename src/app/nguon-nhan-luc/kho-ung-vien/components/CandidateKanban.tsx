'use client';

import React from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { Briefcase, Star, FileText, GripVertical } from 'lucide-react';
import { CvItem } from '@/lib/api/onboardingApi';
import { STAGES, avatarFor, fmtExp } from './candidateShared';

/** Thẻ ứng viên (dùng trong cột Kanban & danh sách). */
function CardBody({ cv }: { cv: CvItem }) {
  const extraSkills = cv.skills.length - 3;
  return (
    <>
      <div className="flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-700 text-white shrink-0" style={{ background: avatarFor(cv.candidate_name) }}>
          {cv.candidate_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-600 text-foreground truncate">{cv.candidate_name}</p>
          {(cv.current_title || cv.position_applied) && (
            <p className="text-2xs text-muted-foreground flex items-center gap-1 truncate"><Briefcase className="h-3 w-3 shrink-0" /> {cv.current_title || cv.position_applied}</p>
          )}
        </div>
        {cv.rating != null && (
          <span className="inline-flex items-center gap-0.5 text-2xs text-amber-300 font-600 shrink-0"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {cv.rating}</span>
        )}
      </div>

      {cv.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {cv.skills.slice(0, 3).map((s) => (
            <span key={s} className="rounded bg-indigo-500/15 text-indigo-200 border border-indigo-500/25 px-1.5 py-0.5 text-2xs font-600">{s}</span>
          ))}
          {extraSkills > 0 && <span className="rounded bg-hover text-muted-foreground px-1.5 py-0.5 text-2xs">+{extraSkills}</span>}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2 text-2xs text-muted-foreground">
        {cv.years_experience != null && <span className="rounded bg-hover px-1.5 py-0.5">{fmtExp(cv.years_experience)}</span>}
        {cv.source && <span className="truncate">· {cv.source}</span>}
        {cv.file_name && <FileText className="h-3 w-3 ml-auto shrink-0" />}
      </div>
    </>
  );
}

function DraggableCard({ cv, canEdit, onOpen }: { cv: CvItem; canEdit: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cv.id, disabled: !canEdit });
  return (
    <div ref={setNodeRef}
      className={`group rounded-xl border border-line-subtle p-3 cursor-pointer hover:border-indigo-500/30 transition-colors ${isDragging ? 'opacity-30' : ''}`}
      style={{ background: 'var(--background)' }} onClick={onOpen}>
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0"><CardBody cv={cv} /></div>
        {canEdit && (
          <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}
            className="shrink-0 -mr-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none" title="Kéo để đổi giai đoạn">
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Column({ stage, items, canEdit, onOpen }: {
  stage: typeof STAGES[number]; items: CvItem[]; canEdit: boolean; onOpen: (cv: CvItem) => void;
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
        ) : items.map((cv) => <DraggableCard key={cv.id} cv={cv} canEdit={canEdit} onOpen={() => onOpen(cv)} />)}
      </div>
    </div>
  );
}

export default function CandidateKanban({ items, canEdit, onOpen, onMove }: {
  items: CvItem[]; canEdit: boolean; onOpen: (cv: CvItem) => void; onMove: (id: string, status: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const activeCv = items.find((c) => c.id === activeId) || null;

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    const cv = items.find((c) => c.id === id);
    if (cv && cv.status !== over && STAGES.some((s) => s.key === over)) onMove(id, over);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => (
          <Column key={stage.key} stage={stage} canEdit={canEdit} onOpen={onOpen}
            items={items.filter((c) => c.status === stage.key)} />
        ))}
      </div>
      <DragOverlay>
        {activeCv && (
          <div className="rounded-xl border border-indigo-500/40 p-3 shadow-2xl w-[240px]" style={{ background: 'var(--card)' }}>
            <CardBody cv={activeCv} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
