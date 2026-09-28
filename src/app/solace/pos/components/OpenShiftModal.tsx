'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, PlayCircle } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import { api } from '../../quan-ly/lib/solaceApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { POS_MODAL_Z } from './modalLayers';

interface SalesShift { id: string; label: string; startTime: string; endTime: string; }

/** Modal mở ca: chọn loại ca (Sáng/Chiều, gợi ý theo giờ) + nhập quỹ đầu ca. */
export default function OpenShiftModal({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const [loading, setLoading] = useState(true);
  const [openingFloat, setOpeningFloat] = useState('');
  const [shifts, setShifts] = useState<SalesShift[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<{ data: { suggestedFloat: number; salesShifts: SalesShift[]; suggestedShiftId: string | null } }>('/api/solace/shift')
      .then(r => {
        if (r.data.suggestedFloat > 0) setOpeningFloat(String(r.data.suggestedFloat));
        setShifts(r.data.salesShifts ?? []);
        setShiftId(r.data.suggestedShiftId ?? r.data.salesShifts?.[0]?.id ?? '');
      })
      .catch((e) => { console.error('Lỗi tải dữ liệu mở ca:', e); setErr('Không tải được dữ liệu gợi ý ca. Bạn vẫn có thể nhập thủ công.'); })
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const def = shifts.find(s => s.id === shiftId);
      await api.post('/api/solace/shift', {
        openingFloat: openingFloat ? parseVND(openingFloat) : 0,
        shiftType: shiftId || null,
        shiftLabel: def?.label ?? null,
      });
      markClean();
      onOpened();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.base} flex items-center justify-center p-4`} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground flex items-center gap-2"><PlayCircle className="h-4 w-4 text-emerald-400" /> Mở ca</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {shifts.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Loại ca</label>
                  <div className="grid grid-cols-2 gap-2">
                    {shifts.map(s => (
                      <button key={s.id} type="button" onClick={() => { markDirty(); setShiftId(s.id); }}
                        className={`rounded-xl px-3 py-2 text-sm font-600 border transition-colors ${shiftId === s.id ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-white/10 text-muted-foreground hover:text-foreground'}`}>
                        {s.label}
                        <span className="block text-2xs font-400 opacity-70">{s.startTime}–{s.endTime}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Quỹ đầu ca (tiền lẻ thối)</label>
                <input value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} placeholder="Nhập số tiền lẻ đầu ca"
                  inputMode="numeric"
                  className="w-full rounded-xl px-3 py-2 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
                <p className="text-2xs text-muted-foreground">Số tiền mặt sẵn trong két khi bắt đầu ca. Dùng để đối soát đúng khi kết ca. {openingFloat && `≈ ${formatVND(parseVND(openingFloat))}`}</p>
              </div>
              {err && <p className="text-xs text-red-400">{err}</p>}
            </>
          )}
        </div>
        {!loading && (
          <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
            <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
            <button disabled={busy} onClick={submit}
              className="rounded-xl px-4 py-2 text-sm font-600 bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-50">
              {busy ? 'Đang mở ca…' : 'Mở ca'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
