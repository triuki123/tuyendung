'use client';

import { useEffect, useState } from 'react';
import { ListChecks, Plus, ExternalLink, Loader2 } from 'lucide-react';

interface TicketTasksProps {
  ticketId: string;
  ticketCode?: string;
  ticketTitle?: string;
}

interface LinkedTask {
  id: string;
  code?: string;
  task_code?: string | null;
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to_name?: string;
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  todo:        { label: 'Chờ làm',     cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' },
  in_progress: { label: 'Đang làm',    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  done:        { label: 'Hoàn thành',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  cancelled:   { label: 'Đã hủy',      cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

/**
 * Hiển thị các Công Việc (task) đã giao cho ticket này — một ticket có thể cần
 * nhiều công đoạn/người để hoàn thành. Click vào task để mở chi tiết task,
 * hoặc bấm "Giao công việc" để tạo task mới đã khóa sẵn liên kết với ticket.
 */
export default function TicketTasks({ ticketId, ticketCode, ticketTitle }: TicketTasksProps) {
  const [tasks, setTasks] = useState<LinkedTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        let headers: Record<string, string> = {};
        if (typeof window !== 'undefined') {
          const auth = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
          if (auth) {
            const u = JSON.parse(auth);
            if (u.id) headers['x-current-user-id'] = u.id;
            if (u.role) headers['x-current-user-role'] = u.role;
          }
        }
        const res = await fetch(`/api/tasks?ticket_id=${encodeURIComponent(ticketId)}`, { headers });
        if (res.ok) {
          const json = await res.json();
          const list = json?.data || json || [];
          if (!cancelled) setTasks(list);
        }
      } catch (err) {
        console.error('Failed to load ticket tasks:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [ticketId]);

  const goCreate = () => {
    const params = new URLSearchParams({ ticketId });
    if (ticketCode) params.set('ticketCode', ticketCode);
    if (ticketTitle) params.set('ticketTitle', ticketTitle);
    window.location.href = `/tasks?${params.toString()}`;
  };

  const openTask = (id: string) => {
    window.location.href = `/tasks?openTask=${encodeURIComponent(id)}`;
  };

  return (
    <div className="bg-secondary rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <ListChecks className="w-3.5 h-3.5" />
          Công việc của ticket {tasks.length > 0 && `(${tasks.length})`}
        </h3>
        <button
          onClick={goCreate}
          className="flex items-center gap-1 text-xs font-semibold text-indigo hover:text-indigo/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Giao công việc
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          Chưa có công việc nào. Bấm <span className="text-indigo font-semibold">Giao công việc</span> nếu ticket này cần đội ngũ xử lý.
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.todo;
            return (
              <button
                key={t.id}
                onClick={() => openTask(t.id)}
                className="w-full flex items-center justify-between gap-2 p-3 bg-card rounded-lg border border-border hover:border-indigo/30 hover:bg-indigo/5 transition-colors group text-left"
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono text-muted-foreground">{t.task_code || t.code || 'N/A'}</p>
                  <p className="text-sm font-semibold text-foreground truncate">{t.title}</p>
                  {t.assigned_to_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">Phụ trách: {t.assigned_to_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-indigo transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
