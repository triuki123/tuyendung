'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ClipboardList, Activity, AtSign, CheckSquare, Ticket, ArrowLeft, Loader2 } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string | null;
  related_url: string | null;
  actor_name: string | null;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; iconCls: string; bgCls: string }> = {
  audit:           { label: 'Hoạt động',          icon: Activity,     iconCls: 'text-ink-muted',   bgCls: 'bg-slate-500/15' },
  task_assigned:   { label: 'Giao task',           icon: CheckSquare,  iconCls: 'text-indigo-400',  bgCls: 'bg-indigo-500/15' },
  task_mention:    { label: 'Nhắc đến (Task)',     icon: AtSign,       iconCls: 'text-purple-400',  bgCls: 'bg-purple-500/15' },
  ticket_assigned: { label: 'Giao ticket',         icon: Ticket,       iconCls: 'text-amber-400',   bgCls: 'bg-amber-500/15' },
  ticket_mention:  { label: 'Nhắc đến (Ticket)',  icon: AtSign,       iconCls: 'text-pink-400',    bgCls: 'bg-pink-500/15' },
};

const FILTER_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'audit', label: 'Hoạt động' },
  { value: 'task_assigned', label: 'Task được giao' },
  { value: 'task_mention', label: 'Được nhắc (Task)' },
  { value: 'ticket_assigned', label: 'Ticket được giao' },
  { value: 'ticket_mention', label: 'Được nhắc (Ticket)' },
];

/** Ép giá trị về chuỗi an toàn để render — tránh React #31 khi DB trả về object (JSONB cũ) */
function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function groupByDate(events: ActivityEvent[]) {
  const groups: Record<string, ActivityEvent[]> = {};
  for (const e of events) {
    const date = new Date(e.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  }
  return groups;
}

export default function LichSuClient() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) { try { setUserId(JSON.parse(stored).id ?? ''); } catch { /* empty */ } }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filter) params.set('type', filter);
      const res = await fetch(`/api/activity-history?${params}`, {
        headers: { 'x-current-user-id': userId },
      });
      const json = await res.json();
      if (json.success) setEvents(json.data);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    } finally { setLoading(false); }
  }, [filter, userId]);

  useEffect(() => { if (userId) fetchEvents(); }, [fetchEvents, userId]);

  const grouped = groupByDate(events);

  return (
    <div className="animate-fadeIn">
      <Link href="/tra-cuu" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Tra Cứu
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lịch Sử Hoạt Động</h1>
          <p className="mt-1 text-sm text-muted-foreground">Những gì bạn đã làm và những ai liên quan đến bạn</p>
        </div>
        <select
          className="h-9 rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo/60 focus:outline-none"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <ErrorState onRetry={fetchEvents} />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ClipboardList className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">Chưa có hoạt động nào</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dateEvents]) => (
            <div key={date}>
              {/* Date divider */}
              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-hover" />
                <span className="rounded-full border border-line px-3 py-1 text-xs font-500 text-muted-foreground" style={{ background: 'var(--secondary)' }}>
                  {date}
                </span>
                <div className="h-px flex-1 bg-hover" />
              </div>

              <div className="space-y-2">
                {dateEvents.map((e, idx) => {
                  const cfg = TYPE_CONFIG[e.type] ?? TYPE_CONFIG.audit;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={`${e.id}-${idx}`}
                      className="flex gap-3 rounded-xl border border-line-subtle p-3 transition hover:border-line hover:bg-white/[0.02]"
                      style={{ background: 'var(--card)' }}
                    >
                      <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${cfg.bgCls}`}>
                        <Icon className={`h-4 w-4 ${cfg.iconCls}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 mb-0.5">
                          <span className={`text-xs font-600 ${cfg.iconCls}`}>{cfg.label}</span>
                          {e.actor_name && <span className="text-xs text-muted-foreground">· {asText(e.actor_name)}</span>}
                        </div>
                        <p className="truncate text-sm font-500 text-foreground">{asText(e.title)}</p>
                        {e.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{asText(e.description)}</p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {e.related_url && (
                          <a href={e.related_url} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                            Xem →
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
