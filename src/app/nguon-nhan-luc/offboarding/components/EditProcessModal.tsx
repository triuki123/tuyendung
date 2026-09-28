'use client';

import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ObProcess, OB_REASON_LABELS, updateObProcessInfo } from '@/lib/api/offboardingApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface Props {
  process: ObProcess;
  onClose: () => void;
  onSaved: (updated: ObProcess) => void;
}

export default function EditProcessModal({ process, onClose, onSaved }: Props) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const [reason, setReason] = useState(process.reason);
  const [reasonNote, setReasonNote] = useState(process.reason_note || '');
  const [lastWorkingDate, setLastWorkingDate] = useState(
    process.last_working_date ? String(process.last_working_date).slice(0, 10) : ''
  );
  const [sourceTicketId, setSourceTicketId] = useState(process.source_ticket_id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const updated = await updateObProcessInfo(process.id, {
        reason,
        reason_note: reasonNote.trim() || null,
        last_working_date: lastWorkingDate || null,
        source_ticket_id: sourceTicketId.trim() || null,
      });
      markClean();
      onSaved(updated);
    } catch (e: any) { setError(e.message || 'Lỗi server'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden"
        style={{ background: 'var(--card)' }} onChange={markDirty} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <div>
            <h2 className="text-base font-700 text-foreground">Sửa Thông Tin Quy Trình</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{process.user_name}</p>
          </div>
          <button onClick={guardedClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Lý do nghỉ</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60">
              {Object.entries(OB_REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Ngày làm việc cuối</label>
            <input type="date" value={lastWorkingDate} onChange={e => setLastWorkingDate(e.target.value)}
              className="w-full h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
          </div>

          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Ghi chú</label>
            <textarea value={reasonNote} onChange={e => setReasonNote(e.target.value)} rows={2}
              placeholder="Ghi chú thêm về lý do nghỉ việc..."
              className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Mã ticket liên kết</label>
            <input value={sourceTicketId} onChange={e => setSourceTicketId(e.target.value)}
              placeholder="VD: TICKET-123"
              className="w-full h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-hover">Hủy</button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}
