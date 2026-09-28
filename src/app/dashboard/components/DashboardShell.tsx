'use client';

/**
 * DashboardShell — khung dashboard tuỳ biến dùng chung cho cả 3 role.
 * - Render widget theo registry (widgets.ts) + config per-user (useDashboardLayout).
 * - Nút "Tuỳ chỉnh" bật chế độ chỉnh sửa: ẩn/hiện widget + kéo thả sắp thứ tự
 *   trong từng cột (không kéo chéo cột — layout không vỡ).
 * - Chưa tuỳ chỉnh (layout NULL) → bố cục mặc định, giống hệt trước đây.
 */

import React, { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Settings2, EyeOff, Eye, GripVertical, RotateCcw, Loader2, Check, X } from 'lucide-react';
import {
  widgetsForRole,
  applyLayout,
  isDefaultLayout,
  DashboardLayoutConfig,
  DashboardWidgetMeta,
  DashboardSlot,
} from '../widgets';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { useToastSafe } from '@/context/ToastContext';

interface DashboardShellProps {
  role: string;
  /** Khối tiêu đề trang (h1 + mô tả + badge…) — shell tự thêm nút Tuỳ chỉnh bên phải */
  header: React.ReactNode;
  /** widgetId → JSX widget (mỗi shell tự fetch/truyền props như hiện tại) */
  elements: Record<string, React.ReactNode>;
  /** Khi lỗi tải dữ liệu cột chính: render thay TOÀN BỘ widget cột chính */
  mainFallback?: React.ReactNode;
}

const EMPTY: DashboardLayoutConfig = { hidden: [], order: [] };

export default function DashboardShell({ role, header, elements, mainFallback }: DashboardShellProps) {
  const toast = useToastSafe();
  const { layout, saveLayout } = useDashboardLayout();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashboardLayoutConfig>(EMPTY);
  const [saving, setSaving] = useState(false);

  const catalog = useMemo(() => widgetsForRole(role), [role]);
  const active = editing ? draft : layout;
  const visible = useMemo(() => applyLayout(catalog, active), [catalog, active]);

  const bySlot = (slot: DashboardSlot) => visible.filter((w) => w.slot === slot);
  const fullW = bySlot('full');
  const mainW = bySlot('main');
  const sideW = bySlot('side');

  const hiddenWidgets = editing ? catalog.filter((w) => draft.hidden.includes(w.id)) : [];
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(layout ?? EMPTY);

  const startEdit = () => {
    // Materialize thứ tự hiện hành để kéo thả ổn định
    setDraft({
      hidden: [...(layout?.hidden ?? [])],
      order: applyLayout(catalog, layout).map((w) => w.id),
    });
    setEditing(true);
  };

  const hideWidget = (id: string) =>
    setDraft((d) => ({ ...d, hidden: [...d.hidden, id] }));

  const showWidget = (id: string) =>
    setDraft((d) => ({ ...d, hidden: d.hidden.filter((x) => x !== id) }));

  const resetDefault = () => setDraft({ ...EMPTY });

  /** Reorder trong 1 slot → ghép lại order tổng (full → main → side). */
  const reorderSlot = (slot: DashboardSlot, from: string, to: string) => {
    setDraft((d) => {
      const cur = applyLayout(catalog, d);
      const slotIds = cur.filter((w) => w.slot === slot).map((w) => w.id);
      const moved = arrayMove(slotIds, slotIds.indexOf(from), slotIds.indexOf(to));
      const order = (['full', 'main', 'side'] as DashboardSlot[]).flatMap((s) =>
        s === slot ? moved : cur.filter((w) => w.slot === s).map((w) => w.id)
      );
      return { ...d, order };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const cfg = isDefaultLayout(draft) ? null : draft;
    const ok = await saveLayout(cfg);
    setSaving(false);
    setEditing(false);
    if (ok) toast?.success('Đã lưu bố cục Dashboard');
    else toast?.warning('Đã áp dụng trên thiết bị này, nhưng chưa lưu được lên máy chủ');
  };

  const renderSlot = (widgets: DashboardWidgetMeta[], slot: DashboardSlot) =>
    editing ? (
      <SortableSlot key={slot} slot={slot} widgets={widgets} elements={elements} onReorder={reorderSlot} onHide={hideWidget} />
    ) : (
      widgets.map((w) => <React.Fragment key={w.id}>{elements[w.id]}</React.Fragment>)
    );

  return (
    <div className="space-y-5 sm:space-y-6 xl:space-y-8">
      {/* Header + nút Tuỳ chỉnh */}
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        {!editing && (
          <button
            onClick={startEdit}
            className="shrink-0 flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            title="Tuỳ chỉnh Dashboard"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Tuỳ chỉnh</span>
          </button>
        )}
      </div>

      {editing && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-xs sm:text-sm text-indigo-300">
          Đang ở chế độ tuỳ chỉnh — kéo <GripVertical className="inline h-3.5 w-3.5" /> để đổi thứ tự trong cột,
          bấm <EyeOff className="inline h-3.5 w-3.5" /> để ẩn widget. Nhấn <b>Lưu</b> khi xong.
        </div>
      )}

      {/* Slot full-width */}
      {fullW.length > 0 && <div className="space-y-4 sm:space-y-5">{renderSlot(fullW, 'full')}</div>}

      {/* 2 cột: chính (2/3) + phải (1/3) */}
      {(mainW.length > 0 || sideW.length > 0 || mainFallback) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start">
          <div className="lg:col-span-2 space-y-4 sm:space-y-5">
            {mainFallback && !editing ? mainFallback : renderSlot(mainW, 'main')}
          </div>
          <div className="space-y-4 sm:space-y-5">{renderSlot(sideW, 'side')}</div>
        </div>
      )}

      {/* Thanh điều khiển chế độ tuỳ chỉnh */}
      {editing && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 backdrop-blur-md"
          style={{ background: 'rgba(10,15,28,0.92)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="max-w-screen-2xl mx-auto px-4 py-3 space-y-2.5">
            {hiddenWidgets.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xs uppercase tracking-wider font-600 text-muted-foreground">Đang ẩn:</span>
                {hiddenWidgets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => showWidget(w.id)}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-foreground hover:border-indigo-400/50 hover:text-indigo-300 transition-colors"
                    title="Hiện lại widget"
                  >
                    <Eye className="h-3 w-3" /> {w.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={resetDefault}
                disabled={isDefaultLayout(draft)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Khôi phục</span> mặc định
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-600 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Hủy
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs sm:text-sm font-600 text-white disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Lưu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Chừa chỗ cho thanh dưới khi đang chỉnh */}
      {editing && <div className="h-24" />}
    </div>
  );
}

/* ── Kéo thả trong 1 slot ── */

function SortableSlot({
  slot,
  widgets,
  elements,
  onReorder,
  onHide,
}: {
  slot: DashboardSlot;
  widgets: DashboardWidgetMeta[];
  elements: Record<string, React.ReactNode>;
  onReorder: (slot: DashboardSlot, from: string, to: string) => void;
  onHide: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) onReorder(slot, String(active.id), String(over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
        {widgets.map((w) => (
          <SortableWidget key={w.id} meta={w} onHide={onHide}>
            {elements[w.id]}
          </SortableWidget>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableWidget({
  meta,
  onHide,
  children,
}: {
  meta: DashboardWidgetMeta;
  onHide: (id: string) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: meta.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative rounded-2xl ${isDragging ? 'z-30 opacity-80 ring-2 ring-indigo-500' : 'ring-1 ring-indigo-500/30'}`}
    >
      {/* Thanh công cụ widget khi chỉnh sửa */}
      <div className="flex items-center gap-2 rounded-t-2xl border border-b-0 border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-indigo-300 hover:text-indigo-200 touch-none p-0.5"
          title="Kéo để đổi thứ tự"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex-1 text-xs font-600 text-indigo-200 truncate">{meta.label}</span>
        <button
          onClick={() => onHide(meta.id)}
          className="text-indigo-300 hover:text-rose-400 p-0.5 transition-colors"
          title="Ẩn widget này"
        >
          <EyeOff className="h-4 w-4" />
        </button>
      </div>
      {/* Khoá tương tác nội dung khi đang chỉnh để kéo thả không vướng */}
      <div className="pointer-events-none select-none [&>*]:!mt-0">{children}</div>
    </div>
  );
}
