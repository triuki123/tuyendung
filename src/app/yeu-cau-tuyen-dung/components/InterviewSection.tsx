'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, CalendarClock, Plus, X, Video, MapPin, Phone, Check, Ban, Search } from 'lucide-react';
import {
  listRequisitionCandidateInterviews, addRequisitionCandidateInterview, updateRequisitionCandidateInterview,
  type InterviewSchedule,
} from '@/lib/api/requisitionApi';
import { fmtDateTime } from '@/lib/api/onboardingApi';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

const labelCls = 'text-2xs font-600 text-muted-foreground uppercase tracking-wider';
const MODE = { onsite: { label: 'Trực tiếp', icon: MapPin }, online: { label: 'Online', icon: Video }, phone: { label: 'Điện thoại', icon: Phone } } as const;
const STATUS_BADGE: Record<string, string> = {
  scheduled: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
  done: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  cancelled: 'text-red-300 bg-red-500/15 border-red-500/30',
};
const STATUS_LABEL: Record<string, string> = { scheduled: 'Đã đặt', done: 'Đã xong', cancelled: 'Đã huỷ' };

export default function InterviewSection({ reqId, appId }: { reqId: string; appId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<InterviewSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await listRequisitionCandidateInterviews(reqId, appId)); }
    catch { /* silent */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reqId, appId]);

  async function changeStatus(id: string, status: 'done' | 'cancelled') {
    try { await updateRequisitionCandidateInterview(reqId, appId, id, status); await load(); toast.success(status === 'done' ? 'Đã đánh dấu hoàn tất' : 'Đã huỷ lịch'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Không cập nhật được'); }
  }

  return (
    <div className="space-y-2 border-t border-line-subtle pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-700 text-foreground flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-purple-400" /> Lịch phỏng vấn{items.length > 0 ? ` (${items.length})` : ''}</h3>
        <button onClick={() => setAdding((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-600 transition-colors ${adding ? 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10' : 'border-line text-muted-foreground hover:text-indigo-300 hover:border-indigo-500/40'}`}>
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />} Đặt lịch
        </button>
      </div>

      {adding && <InterviewForm reqId={reqId} appId={appId} onSaved={async () => { setAdding(false); await load(); toast.success('Đã đặt lịch — người phỏng vấn sẽ được thông báo'); }} onError={(m) => toast.error(m)} />}

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-2xs text-muted-foreground/70">Chưa có lịch phỏng vấn. Bấm <span className="text-indigo-300">Đặt lịch</span> để lên lịch.</p>
      ) : items.map((it) => {
        const M = MODE[it.mode as keyof typeof MODE] || MODE.onsite; const Icon = M.icon;
        return (
          <div key={it.id} className="rounded-lg border border-line-subtle bg-white/[0.02] px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xs font-600 text-indigo-300">{it.round_label}</span>
              <span className={`rounded-full border px-1.5 py-0.5 text-2xs font-600 ${STATUS_BADGE[it.status]}`}>{STATUS_LABEL[it.status] || it.status}</span>
              <span className="text-2xs text-foreground ml-auto">{fmtDateTime(it.scheduled_at)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" /> {M.label}</span>
              <span>{it.duration_min} phút</span>
              {it.mode === 'online' && it.meeting_link && <a href={it.meeting_link} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline truncate max-w-[160px]">{it.meeting_link}</a>}
              {it.mode !== 'online' && it.location && <span className="truncate">📍 {it.location}</span>}
            </div>
            {it.interviewer_names.length > 0 && <p className="text-2xs text-muted-foreground mt-0.5">Người PV: {it.interviewer_names.join(', ')}</p>}
            {it.note && <p className="text-2xs text-foreground mt-0.5">{it.note}</p>}
            {it.status === 'scheduled' && (
              <div className="flex gap-1.5 mt-1.5">
                <button onClick={() => changeStatus(it.id, 'done')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 px-2 py-0.5 text-2xs font-600"><Check className="h-3 w-3" /> Hoàn tất</button>
                <button onClick={() => changeStatus(it.id, 'cancelled')} className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 px-2 py-0.5 text-2xs font-600"><Ban className="h-3 w-3" /> Huỷ</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface UserOpt { id: string; name: string }

export function InterviewForm({ reqId, appId, onSaved, onError, initialWhen = '' }: {
  reqId: string; appId: string; onSaved: () => void | Promise<void>; onError: (m: string) => void; initialWhen?: string;
}) {
  const confirm = useConfirm();
  const [round, setRound] = useState('Vòng 1');
  const [when, setWhen] = useState(initialWhen);
  const [duration, setDuration] = useState('60');
  const [mode, setMode] = useState<'onsite' | 'online' | 'phone'>('onsite');
  const [location, setLocation] = useState('');   // dùng cho phone (địa điểm/số) — onsite dùng room
  const [roomName, setRoomName] = useState('');
  const rooms = ['Phòng họp lầu 4', 'Phòng họp lầu 6', 'Phòng họp lầu 7', 'Sảnh chung'];
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [interviewers, setInterviewers] = useState<UserOpt[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserOpt[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/search-users?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (alive) setResults((json.data || []).slice(0, 8).map((u: any) => ({ id: u.id, name: u.name })));
      } catch { /* silent */ }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const addInterviewer = (u: UserOpt) => { if (!interviewers.some((x) => x.id === u.id)) setInterviewers((p) => [...p, u]); setQ(''); };
  const removeInterviewer = (id: string) => setInterviewers((p) => p.filter((x) => x.id !== id));

  async function submit() {
    if (!when) { onError('Chọn thời gian phỏng vấn'); return; }
    if (mode === 'onsite' && !roomName) { onError('Chọn phòng họp cho phỏng vấn trực tiếp'); return; }
    setSaving(true);
    try {
      const payload = {
        round_label: round, scheduled_at: when, duration_min: Number(duration) || 60, mode,  // when = giờ local
        room_name: mode === 'onsite' ? roomName : null,
        location: mode === 'phone' ? (location.trim() || null) : null,
        meeting_link: mode === 'online' ? (link.trim() || null) : null,
        interviewer_ids: interviewers.map((u) => u.id),
        note: note.trim() || undefined,
      };
      try {
        await addRequisitionCandidateInterview(reqId, appId, payload);
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ROOM_CONFLICT') throw error;
        const proceed = await confirm({ title: 'Phòng đã có lịch trùng giờ', message: `${error.message}\nBạn có muốn tiếp tục đặt lịch tại phòng này?`, cancelLabel: 'Huỷ', confirmLabel: 'Tiếp tục đặt', danger: false });
        if (!proceed) return;
        await addRequisitionCandidateInterview(reqId, appId, { ...payload, allow_room_conflict: true });
      }
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Không đặt được lịch');
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Vòng</label>
          <input value={round} onChange={(e) => setRound(e.target.value)} className="mt-1 w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none" />
        </div>
        <div>
          <label className={labelCls}>Thời lượng (phút)</label>
          <input type="number" min="15" step="15" value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1 w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none" />
        </div>
      </div>
      <div>
        <label className={labelCls}>Thời gian</label>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none" />
      </div>
      <div>
        <label className={labelCls}>Hình thức</label>
        <div className="mt-1 flex gap-1.5">
          {(['onsite', 'online', 'phone'] as const).map((m) => {
            const M = MODE[m]; const Icon = M.icon;
            return (
              <button key={m} onClick={() => setMode(m)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-600 ${mode === m ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                <Icon className="h-3 w-3" /> {M.label}
              </button>
            );
          })}
        </div>
      </div>
      {mode === 'online' ? (
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link online (Meet/Zoom...)" className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none" />
      ) : mode === 'onsite' ? (
        <div>
          <label className={labelCls}>Phòng họp <span className="text-rose-400">*</span></label>
          <select value={roomName} onChange={(e) => setRoomName(e.target.value)}
            className="mt-1 w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none">
            <option value="" className="bg-surface-2">— Chọn phòng —</option>
            {rooms.map((room) => <option key={room} value={room} className="bg-surface-2">{room}</option>)}
          </select>
          <p className="mt-1 text-2xs text-muted-foreground/70">Lưu lịch sẽ tự đặt phòng này (kiểm tra trùng giờ).</p>
        </div>
      ) : (
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Số điện thoại / ghi chú" className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none" />
      )}

      <div>
        <label className={labelCls}>Người phỏng vấn</label>
        {interviewers.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {interviewers.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 text-indigo-200 border border-indigo-500/30 px-1.5 py-0.5 text-2xs font-600">
                {u.name}<button onClick={() => removeInterviewer(u.id)} className="hover:text-red-300">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="relative mt-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm người phỏng vấn..." className="w-full h-8 pl-8 pr-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none" />
        </div>
        {q && results.length > 0 && (
          <div className="mt-1 rounded-lg border border-line bg-surface-2 max-h-32 overflow-y-auto">
            {results.filter((u) => !interviewers.some((x) => x.id === u.id)).map((u) => (
              <button key={u.id} onClick={() => addInterviewer(u)} className="block w-full text-left px-2.5 py-1.5 text-xs text-foreground hover:bg-hover">{u.name}</button>
            ))}
          </div>
        )}
      </div>

      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ghi chú..." className="w-full px-2.5 py-1.5 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none resize-none" />

      <div className="flex justify-end">
        <button onClick={submit} disabled={saving} className="btn-indigo rounded-lg px-3 py-1.5 text-xs font-600 flex items-center gap-1 disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />} Đặt lịch
        </button>
      </div>
    </div>
  );
}
