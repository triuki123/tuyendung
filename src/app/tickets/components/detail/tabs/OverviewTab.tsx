'use client';

import { useState, useEffect } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import LinkedRecords from '../metadata/LinkedRecords';
import RelatedTickets from '../metadata/RelatedTickets';
import TicketTasks from '../metadata/TicketTasks';

interface OverviewTabProps {
  ticket: any;
  userRole: string;
  onUpdate: (fields: Record<string, any>) => Promise<void>;
}

const PRIORITY_OPTIONS = [
  { value: 'low',      label: 'Thấp',       cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' },
  { value: 'medium',   label: 'Trung bình', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  { value: 'high',     label: 'Cao',        cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { value: 'critical', label: 'Khẩn cấp',  cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
];

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  open:        { label: 'Đã gửi',        cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  submitted:   { label: 'Đã gửi',        cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  in_progress: { label: 'Đang xử lý',    cls: 'bg-indigo/15 text-indigo border-indigo/30' },
  completed:   { label: 'Đã hoàn thành', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  resolved:    { label: 'Đã hoàn thành', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rejected:    { label: 'Từ chối',       cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  closed:      { label: 'Đóng',          cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' },
};

/**
 * Hiển thị LOẠI YÊU CẦU + DANH MỤC + các TRƯỜNG TÙY CHỈNH mà người tạo đã nhập.
 * Trước đây các thông tin này được lưu nhưng KHÔNG hiện ở màn xử lý → người nhận
 * không thấy. Map key→label từ cấu hình danh mục (/api/ticket-categories).
 */
function RequestInfoSection({ ticket }: { ticket: any }) {
  const [fieldDefs, setFieldDefs] = useState<Record<string, { label: string; type?: string }>>({});

  const customValues: Record<string, any> = (() => {
    const raw = ticket.custom_fields;
    if (!raw) return {};
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
    return typeof raw === 'object' ? raw : {};
  })();
  const entries = Object.entries(customValues).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== ''
  );

  useEffect(() => {
    if (!ticket.category_id) return;
    let alive = true;
    fetch('/api/ticket-categories')
      .then(r => (r.ok ? r.json() : []))
      .then((list: any[]) => {
        if (!alive || !Array.isArray(list)) return;
        const cat = list.find(c => c.id === ticket.category_id);
        const defs: Record<string, { label: string; type?: string }> = {};
        for (const f of (cat?.custom_fields ?? [])) defs[f.key] = { label: f.label, type: f.type };
        setFieldDefs(defs);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [ticket.category_id]);

  const hasAny = ticket.request_type || ticket.category_name || entries.length > 0;
  if (!hasAny) return null;

  const fmt = (key: string, val: any) => {
    if (fieldDefs[key]?.type === 'date' && val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('vi-VN');
    }
    return String(val);
  };

  return (
    <section className="bg-secondary rounded-xl border border-border p-5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Loại yêu cầu &amp; thông tin bổ sung
      </h3>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        {ticket.request_type && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Loại yêu cầu</p>
            <p className="text-sm text-foreground font-medium">{ticket.request_type}</p>
          </div>
        )}
        {ticket.category_name && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Danh mục</p>
            <p className="text-sm text-foreground font-medium">{ticket.category_name}</p>
          </div>
        )}
        {entries.map(([key, val]) => (
          <div key={key} className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{fieldDefs[key]?.label || key}</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{fmt(key, val)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// Hook nhỏ cho mỗi field inline-edit
function useInlineEdit(initial: string, onSave: (val: string) => Promise<void>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const start = () => { setValue(initial); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = async () => {
    if (value.trim() === initial) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(value.trim()); setEditing(false); }
    finally { setSaving(false); }
  };

  return { editing, value, setValue, saving, start, cancel, save };
}

export default function OverviewTab({ ticket, userRole, onUpdate }: OverviewTabProps) {
  const canEdit = userRole === 'super_admin' || userRole === 'admin';

  const titleEdit = useInlineEdit(ticket.title, (v) => onUpdate({ title: v }));
  const descEdit  = useInlineEdit(ticket.description || '', (v) => onUpdate({ description: v }));
  const catEdit   = useInlineEdit(ticket.support_category || '', (v) => onUpdate({ support_category: v }));

  const [editingPriority, setEditingPriority] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);

  const handlePriorityChange = async (val: string) => {
    setEditingPriority(false);
    setSavingPriority(true);
    try { await onUpdate({ priority: val }); }
    finally { setSavingPriority(false); }
  };

  const priorityCfg = PRIORITY_OPTIONS.find(p => p.value === ticket.priority);
  const statusCfg   = STATUS_LABELS[ticket.status] ?? { label: ticket.status, cls: 'bg-muted text-muted-foreground border-border' };

  return (
    <div className="p-5 space-y-4">

      {/* ── Tiêu đề ── */}
      {canEdit && (
        <section className="bg-secondary rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tiêu đề</h3>
            {!titleEdit.editing && (
              <button onClick={titleEdit.start} className="p-1 text-muted-foreground hover:text-indigo transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {titleEdit.editing ? (
            <div className="space-y-2">
              <input
                value={titleEdit.value}
                onChange={e => titleEdit.setValue(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <InlineActions saving={titleEdit.saving} onSave={titleEdit.save} onCancel={titleEdit.cancel} />
            </div>
          ) : (
            <p className="text-sm font-semibold text-foreground">{ticket.title}</p>
          )}
        </section>
      )}

      {/* ── Mô tả ── */}
      <section className="bg-secondary rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mô tả</h3>
          {canEdit && !descEdit.editing && (
            <button onClick={descEdit.start} className="p-1 text-muted-foreground hover:text-indigo transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {descEdit.editing ? (
          <div className="space-y-2">
            <textarea
              value={descEdit.value}
              onChange={e => descEdit.setValue(e.target.value)}
              rows={5}
              placeholder="Nhập mô tả chi tiết..."
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              autoFocus
            />
            <InlineActions saving={descEdit.saving} onSave={descEdit.save} onCancel={descEdit.cancel} />
          </div>
        ) : (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap min-h-[2rem]">
            {ticket.description || <span className="text-muted-foreground italic">Chưa có mô tả</span>}
          </p>
        )}
      </section>

      {/* ── Loại yêu cầu & thông tin bổ sung (các trường người tạo đã nhập) ── */}
      <RequestInfoSection ticket={ticket} />

      {/* ── Chi tiết ── */}
      <section className="bg-secondary rounded-xl border border-border p-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Chi tiết</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">

          {/* Trạng thái — chỉ đọc, đổi qua action buttons */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Trạng thái</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusCfg.cls}`}>
              {statusCfg.label}
            </span>
          </div>

          {/* Ưu tiên — inline edit */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Ưu tiên</p>
            {editingPriority ? (
              <div className="flex flex-col gap-1">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handlePriorityChange(opt.value)}
                    className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:opacity-80 ${opt.cls}`}
                  >
                    {opt.label}
                  </button>
                ))}
                <button onClick={() => setEditingPriority(false)} className="text-xs text-muted-foreground hover:text-foreground mt-1">
                  Hủy
                </button>
              </div>
            ) : (
              <button
                onClick={() => canEdit && setEditingPriority(true)}
                disabled={!canEdit || savingPriority}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${priorityCfg?.cls ?? ''} ${canEdit ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
              >
                {savingPriority ? <Loader2 className="w-3 h-3 animate-spin" /> : priorityCfg?.label ?? ticket.priority}
                {canEdit && !savingPriority && <Pencil className="w-2.5 h-2.5 opacity-60" />}
              </button>
            )}
          </div>

          {/* Người được giao — chỉ đọc, đổi qua Chuyển ticket */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Người được giao</p>
            <p className="text-sm font-semibold text-foreground">
              {ticket.assigned_to_name || <span className="text-muted-foreground font-normal">Chưa giao</span>}
            </p>
          </div>

          {/* Danh mục — inline edit */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Danh mục</p>
              {canEdit && !catEdit.editing && (
                <button onClick={catEdit.start} className="p-0.5 text-muted-foreground hover:text-indigo transition-colors">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            {catEdit.editing ? (
              <div className="space-y-1.5">
                <input
                  value={catEdit.value}
                  onChange={e => catEdit.setValue(e.target.value)}
                  placeholder="Nhập danh mục..."
                  className="w-full px-2 py-1.5 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <InlineActions saving={catEdit.saving} onSave={catEdit.save} onCancel={catEdit.cancel} compact />
              </div>
            ) : (
              <p className="text-sm font-semibold text-foreground">
                {ticket.support_category || <span className="text-muted-foreground font-normal">Không xác định</span>}
              </p>
            )}
          </div>

          {/* Tài sản — chỉ đọc */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Tài sản</p>
            <p className="text-sm font-semibold text-foreground">
              {ticket.asset_name || <span className="text-muted-foreground font-normal">N/A</span>}
            </p>
          </div>

          {/* Ngày tạo — chỉ đọc */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Ngày tạo</p>
            <p className="text-sm font-semibold text-foreground">
              {new Date(ticket.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
        </div>
      </section>

      <TicketTasks ticketId={ticket.id} ticketCode={ticket.code} ticketTitle={ticket.title} />
      <LinkedRecords ticket={ticket} />
      <RelatedTickets ticketId={ticket.id} />
    </div>
  );
}

function InlineActions({ saving, onSave, onCancel, compact = false }: {
  saving: boolean; onSave: () => void; onCancel: () => void; compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onSave}
        disabled={saving}
        className={`flex items-center gap-1 ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} bg-indigo text-white font-semibold rounded-lg hover:bg-indigo/90 disabled:opacity-50 transition-colors`}
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        {saving ? 'Đang lưu...' : 'Lưu'}
      </button>
      <button
        onClick={onCancel}
        disabled={saving}
        className={`flex items-center gap-1 ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} text-muted-foreground hover:text-foreground bg-muted rounded-lg transition-colors`}
      >
        <X className="w-3 h-3" /> Hủy
      </button>
    </div>
  );
}
