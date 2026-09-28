'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Loader2, MapPin, Video, Phone, UsersRound } from 'lucide-react';
import Link from 'next/link';
import CalendarActions from './CalendarActions';
import CalendarCreateModal from './CalendarCreateModal';
import TodayInterviewWidget from './TodayInterviewWidget';

type CalendarInterview = {
  id: string; application_id: string; requisition_id: string; round_label: string; scheduled_at: string;
  duration_min: number; mode: string; location: string | null; meeting_link: string | null;
  interviewer_names: string[]; status: string; note: string | null; candidate_name: string | null; requisition_title: string | null;
};

const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
const viTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
const viDate = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

function localDay(value: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
function isoDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function authHeaders() {
  try { const user = JSON.parse(localStorage.getItem('assetflow_auth') || '{}'); return { 'x-current-user-id': user.id || '', 'x-current-user-role': user.role || '', ...(user.module_permissions ? { 'x-user-permissions': JSON.stringify(user.module_permissions) } : {}) }; }
  catch { return {}; }
}

export default function InterviewCalendarClient() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [items, setItems] = useState<CalendarInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => { const refresh = () => setRevision(n => n + 1); window.addEventListener('interview-calendar-changed', refresh); return () => window.removeEventListener('interview-calendar-changed', refresh); }, []);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(isoDate(new Date()));
  const [createDay, setCreateDay] = useState<string | null>(null);

  const range = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    return { from: isoDate(first), to: isoDate(last) };
  }, [month]);
  useEffect(() => {
    let alive = true; setLoading(true); setError('');
    fetch(`/api/hr/interviews?from=${range.from}&to=${range.to}`, { headers: authHeaders() })
      .then(async (res) => { const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Không tải được lịch'); return json.data || []; })
      .then((data) => { if (alive) setItems(data); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Không tải được lịch'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range, revision]);

  const byDay = useMemo(() => items.reduce<Record<string, CalendarInterview[]>>((all, item) => { const key = localDay(item.scheduled_at); (all[key] ||= []).push(item); return all; }, {}), [items]);
  const selected = byDay[selectedDay] || [];
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => index - offset + 1);
  }, [month]);
  const today = isoDate(new Date());
  const shift = (amount: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1));
  const selectToday = () => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDay(isoDate(now)); };

  return <section className="space-y-5">
    <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-2 text-sm font-600 text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-5 w-5" /> Tuyển Dụng
    </Link>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="mb-1 flex items-center gap-2 text-blue-600"><CalendarDays className="h-5 w-5" /><span className="text-sm font-700">Tuyển Dụng</span></div><h1 className="text-2xl font-750 tracking-tight text-foreground">Lịch phỏng vấn</h1><p className="mt-1 text-sm text-muted-foreground">Theo dõi và ghi chú lịch PV tập trung theo ngày.</p></div>
      <div className="flex items-center gap-2"><button onClick={selectToday} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-600 text-foreground hover:bg-hover">Hôm nay</button><div className="flex rounded-xl border border-line bg-white"><button aria-label="Tháng trước" onClick={() => shift(-1)} className="p-2.5 hover:bg-hover"><ChevronLeft className="h-4 w-4" /></button><button aria-label="Tháng sau" onClick={() => shift(1)} className="border-l border-line p-2.5 hover:bg-hover"><ChevronRight className="h-4 w-4" /></button></div></div>
    </div>
    <TodayInterviewWidget revision={revision} onOpen={selectToday} onCreate={() => { selectToday(); setCreateDay(isoDate(new Date())); }} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-base font-700 text-foreground">{MONTHS[month.getMonth()]} {month.getFullYear()}</h2><span className="text-xs text-muted-foreground">{items.length} lịch trong tháng</span></div><div className="grid grid-cols-7 border-b border-line bg-slate-50">{DAYS.map((day) => <div key={day} className="px-2 py-2 text-center text-xs font-700 text-muted-foreground">{day}</div>)}</div><div className="grid grid-cols-7">{cells.map((day, index) => { const inMonth = day > 0 && day <= new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); const key = inMonth ? isoDate(new Date(month.getFullYear(), month.getMonth(), day)) : `empty-${index}`; const dayItems = inMonth ? byDay[key] || [] : []; const isSelected = key === selectedDay; return <button type="button" key={key} disabled={!inMonth} onClick={() => { setSelectedDay(key); setCreateDay(key); }} className={`min-h-28 border-b border-r border-line p-1.5 text-left transition-colors ${inMonth ? 'hover:bg-blue-50/60' : 'bg-slate-50/50'} ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : ''}`}><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-700 ${key === today ? 'bg-blue-500 text-white' : 'text-foreground'}`}>{inMonth ? day : ''}</span><div className="mt-1 space-y-1">{dayItems.slice(0, 3).map((item) => <span key={item.id} className={`block truncate rounded-md px-1.5 py-1 text-[11px] font-600 ${item.status === 'cancelled' ? 'bg-slate-100 text-slate-400 line-through' : item.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-100 text-blue-800'}`}>{viTime.format(new Date(item.scheduled_at))} · {item.candidate_name || 'Ứng viên'}</span>)}{dayItems.length > 3 && <span className="block px-1.5 text-[11px] font-600 text-blue-600">+{dayItems.length - 3} lịch khác</span>}</div></button>; })}</div></div>
      <aside className="rounded-2xl border border-line bg-white p-4 shadow-sm"><h2 className="text-sm font-700 capitalize text-foreground">{viDate.format(new Date(`${selectedDay}T12:00:00`))}</h2><div className="mt-4 space-y-3">{loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div> : error ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : selected.length === 0 ? <div className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted-foreground">Chưa có lịch phỏng vấn trong ngày này.</div> : selected.map((item) => <InterviewCard key={item.id} item={item} />)}</div><p className="mt-5 border-t border-line pt-3 text-xs leading-5 text-muted-foreground">Bấm vào một ngày trên lịch để tạo lịch phỏng vấn mới.</p></aside>
    </div>
    {createDay && <CalendarCreateModal day={createDay} onClose={() => setCreateDay(null)} onSaved={() => { setCreateDay(null); setRevision(n => n + 1); }} />}
  </section>;
}

function InterviewCard({ item }: { item: CalendarInterview }) {
  const ModeIcon = item.mode === 'online' ? Video : item.mode === 'phone' ? Phone : MapPin;
  return <article className={`rounded-xl border p-3 ${item.status === 'cancelled' ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-blue-100 bg-blue-50/40'}`}><div className="flex items-start justify-between gap-2"><p className="text-sm font-700 text-foreground">{viTime.format(new Date(item.scheduled_at))} · {item.round_label}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-700 ${item.status === 'done' ? 'bg-emerald-100 text-emerald-700' : item.status === 'cancelled' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>{item.status === 'done' ? 'Đã xong' : item.status === 'cancelled' ? 'Đã huỷ' : 'Đã đặt'}</span></div><p className="mt-2 text-sm font-700 text-foreground">{item.candidate_name || 'Ứng viên'}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.requisition_title || 'Vị trí tuyển dụng'} · {item.duration_min} phút</p><div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ModeIcon className="h-3.5 w-3.5 text-blue-500" />{item.mode === 'online' ? (item.meeting_link ? <a className="truncate text-blue-600 hover:underline" href={item.meeting_link} target="_blank" rel="noreferrer">Mở cuộc họp online</a> : 'Phỏng vấn online') : item.mode === 'phone' ? 'Phỏng vấn qua điện thoại' : item.location || 'Phỏng vấn trực tiếp'}</div>{item.interviewer_names?.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><UsersRound className="h-3.5 w-3.5" />{item.interviewer_names.join(', ')}</p>}{item.note && <p className="mt-2 rounded-lg bg-white/80 p-2 text-xs leading-5 text-foreground"><Clock3 className="mr-1 inline h-3.5 w-3.5 text-blue-500" />{item.note}</p>}<CalendarActions item={item} /></article>;
}
