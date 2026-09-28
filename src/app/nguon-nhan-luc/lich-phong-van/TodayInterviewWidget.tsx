'use client';

import { useEffect, useState } from 'react';
import { Clock3, MapPin, Plus, Video } from 'lucide-react';
import { authHeaders } from '@/lib/api/onboardingApi';

type Event = { id: string; scheduled_at: string; duration_min: number; status: string; candidate_name: string | null; round_label: string; requisition_title: string | null; location: string | null; mode: string };
const zone = 'Asia/Ho_Chi_Minh';
const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(date);
const time = (date: Date) => new Intl.DateTimeFormat('vi-VN', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);

export default function TodayInterviewWidget({ revision, onOpen, onCreate }: { revision: number; onOpen: () => void; onCreate: () => void }) {
  const [now, setNow] = useState(() => new Date());
  const today = dayKey(now);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError('');
    const tomorrow = dayKey(new Date(new Date(`${today}T00:00:00+07:00`).getTime() + 86400000));
    fetch(`/api/hr/interviews?from=${today}&to=${tomorrow}`, { headers: authHeaders(), signal: abort.signal })
      .then(async response => { const json = await response.json(); if (!response.ok) throw new Error(json.error || 'Không tải được lịch hôm nay'); return json.data; })
      .then(data => { if (!abort.signal.aborted) setEvents(data.filter((item: Event) => dayKey(new Date(item.scheduled_at)) === today && item.status !== 'cancelled').sort((a: Event, b: Event) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))); })
      .catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Không tải được lịch hôm nay'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [today, revision]);
  const pending = events.filter(item => item.status === 'scheduled').length;
  return <section aria-label="Lịch phỏng vấn hôm nay" className="calendar-agenda-widget calendar-agenda-minimal">
    <header className="calendar-agenda-header"><div><h2>Hôm nay <span className="calendar-agenda-heading-date">{new Intl.DateTimeFormat('vi-VN', { timeZone: zone, day: '2-digit', month: '2-digit' }).format(now)}</span></h2><p>{loading ? 'Đang tải lịch…' : error ? 'Không tải được lịch' : `${events.length} lịch phỏng vấn · ${pending} chưa hoàn tất`} · Giờ Việt Nam</p></div><div className="calendar-agenda-header-actions"><button type="button" onClick={onOpen} className="calendar-agenda-open">Mở lịch</button><button type="button" onClick={onCreate} className="calendar-agenda-add" aria-label="Thêm lịch" title="Thêm lịch phỏng vấn"><Plus aria-hidden="true" /></button></div></header>
    {error ? <p role="alert" className="calendar-agenda-error">{error}</p> : loading ? <p role="status" className="calendar-agenda-empty">Đang tải lịch hôm nay…</p> : !events.length ? <p className="calendar-agenda-empty">Hôm nay chưa có lịch phỏng vấn.<br />Bấm + để tạo lịch mới.</p> : <div className="calendar-agenda-events">{(expanded ? events : events.slice(0, 3)).map(item => {
      const start = new Date(item.scheduled_at), end = new Date(start.getTime() + item.duration_min * 60000);
      const ongoing = item.status === 'scheduled' && start <= now && end > now;
      const label = ongoing ? 'Đang diễn ra' : item.status === 'done' ? 'Đã hoàn tất' : end <= now ? 'Đã qua giờ — chưa hoàn tất' : 'Sắp tới';
      return <button key={item.id} type="button" onClick={onOpen} className={`calendar-agenda-event ${item.status === 'done' ? 'is-done' : ongoing ? 'is-live' : ''}`}><div className="calendar-agenda-event-top"><span>{time(start)} – {time(end)} · {item.round_label}</span><span>{label}</span></div><h3>{item.candidate_name || 'Ứng viên'}</h3><p>{item.requisition_title || 'Vị trí tuyển dụng'}</p><div className="calendar-agenda-location">{item.mode === 'online' ? <Video aria-hidden="true" /> : item.mode === 'phone' ? <Clock3 aria-hidden="true" /> : <MapPin aria-hidden="true" />}<span>{item.mode === 'online' ? 'Online' : item.mode === 'phone' ? 'Điện thoại' : item.location || 'Trực tiếp'}</span></div></button>;
    })}</div>}
    {events.length > 3 && !loading && !error && <button type="button" onClick={() => setExpanded(!expanded)} className="calendar-agenda-more">{expanded ? 'Thu gọn' : `Xem thêm ${events.length - 3} lịch`}</button>}
  </section>;
}
