'use client';
import { useState } from 'react';
import { authHeaders } from '@/lib/api/onboardingApi';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';

export default function CalendarActions({ item }: { item: { id: string; scheduled_at: string; duration_min: number; round_label: string; location: string | null; meeting_link: string | null; note: string | null; status: string; mode: string } }) {
  const confirm = useConfirm(), toast = useToast();
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false), [reason, setReason] = useState('');
  const initial = () => ({ scheduled_at: new Date(new Date(item.scheduled_at).getTime()+7*3600000).toISOString().slice(0,16), duration_min: item.duration_min, round_label: item.round_label, location: item.location || '', meeting_link: item.meeting_link || '', note: item.note || '' });
  const [form, setForm] = useState(initial);
  async function mutate(method: 'PUT' | 'DELETE', allow = false): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(`/api/hr/interviews/${item.id}`, { method, headers: authHeaders(true), body: JSON.stringify(method === 'PUT' ? { ...form, allow_room_conflict: allow } : { reason: reason.trim() }) });
      const data = await res.json();
      if (data.code === 'ROOM_CONFLICT' && !allow) {
        if (await confirm({ title: 'Trùng lịch phòng', message: data.error, confirmLabel: 'Tiếp tục đặt', cancelLabel: 'Huỷ', danger: false })) await mutate(method, true);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setEditing(false); window.dispatchEvent(new Event('interview-calendar-changed'));
      toast.success(method === 'DELETE' ? 'Đã xoá lịch và giải phóng phòng' : 'Đã cập nhật lịch');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không lưu được'); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 border-t border-line pt-3">
    <div className="flex gap-3 text-xs font-600">
      {item.status === 'scheduled' && <button disabled={busy} onClick={() => { setForm(initial()); setEditing(!editing); }} className="text-blue-600">{editing ? 'Đóng chỉnh sửa' : 'Sửa lịch'}</button>}
      <button disabled={busy} className="text-red-600" onClick={() => { setDeleting(true); setEditing(false); }}>Xoá lịch</button>
    </div>
    {deleting && <form className="mt-3 space-y-3 rounded-xl border border-red-200 p-3" onSubmit={async e => { e.preventDefault(); if (busy || !reason.trim()) return; if (await confirm({ title: 'Xác nhận xoá lịch?', message: `Lý do: ${reason.trim()}\nLịch sẽ bị xoá và phòng được giải phóng. Lý do được lưu trong ghi chú hồ sơ ứng viên.`, confirmLabel: 'Xoá lịch', cancelLabel: 'Giữ lại', danger: true })) await mutate('DELETE'); }}>
      <label className="block text-sm font-600">Lý do huỷ lịch *<textarea autoFocus required maxLength={2000} disabled={busy} rows={3} className="mt-2 w-full border p-2 text-sm" placeholder="Ví dụ: Ứng viên xin huỷ, thay đổi kế hoạch tuyển dụng…" value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => { setDeleting(false); setReason(''); }} className="rounded-lg border px-3 py-2 text-xs">Giữ lại</button><button disabled={busy || !reason.trim()} className="rounded-lg bg-red-600 px-3 py-2 text-xs text-white disabled:opacity-50">{busy ? 'Đang xoá…' : 'Xác nhận xoá'}</button></div>
    </form>}
    {editing && <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void mutate('PUT'); }}>
      <label className="block text-xs">Vòng phỏng vấn<input required className="mt-1 w-full border p-2" value={form.round_label} onChange={e => setForm({ ...form, round_label: e.target.value })} /></label>
      <label className="block text-xs">Ngày giờ (Việt Nam)<input required type="datetime-local" className="mt-1 w-full border p-2" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} /></label>
      <label className="block text-xs">Thời lượng (phút)<input required type="number" min="15" max="480" className="mt-1 w-full border p-2" value={form.duration_min} onChange={e => setForm({ ...form, duration_min: Number(e.target.value) })} /></label>
      {item.mode === 'onsite' ? <label className="block text-xs">Phòng họp<select required className="mt-1 w-full border p-2" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}>{Array.from(new Set([form.location, 'Phòng họp lầu 4','Phòng họp lầu 6','Phòng họp lầu 7','Sảnh chung'])).filter(Boolean).map(room => <option key={room}>{room}</option>)}</select></label> : item.mode === 'online' ? <label className="block text-xs">Link cuộc họp<input type="url" className="mt-1 w-full border p-2" value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} /></label> : null}
      <label className="block text-xs">Ghi chú<textarea className="mt-1 w-full border p-2" rows={3} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
      <button disabled={busy} className="rounded-xl bg-blue-600 px-3 py-2 text-sm text-white">{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
    </form>}
  </div>;
}
