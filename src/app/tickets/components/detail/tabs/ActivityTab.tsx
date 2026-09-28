'use client';

import { useTicketAudit } from '@/hooks/useTicketAudit';
import { Activity, ChevronDown } from 'lucide-react';

interface ActivityTabProps {
  ticketId: string;
}

/** Lấy giá trị hiển thị cho old_value / new_value theo từng event type */
function formatEventValue(value: any, eventType: string): string {
  if (!value || typeof value !== 'object') return String(value ?? '');
  switch (eventType) {
    case 'assigned':
      return value.assigned_to_name || value.assigned_to || '';
    case 'status_changed':
      return value.status || '';
    case 'priority_changed':
      return value.priority || '';
    default:
      // Fallback: lấy giá trị đầu tiên không phải UUID
      for (const v of Object.values(value)) {
        const s = String(v);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
          return s;
        }
      }
      return String(Object.values(value)[0] ?? '');
  }
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  created: { label: 'Tạo ticket', color: 'text-emerald-400' },
  status_changed: { label: 'Thay đổi trạng thái', color: 'text-indigo' },
  assigned: { label: 'Giao cho người khác', color: 'text-blue-400' },
  priority_changed: { label: 'Thay đổi ưu tiên', color: 'text-orange-400' },
  comment_added: { label: 'Thêm bình luận', color: 'text-indigo' },
  comment_edited: { label: 'Chỉnh sửa bình luận', color: 'text-muted-foreground' },
  comment_deleted: { label: 'Xóa bình luận', color: 'text-red-400' },
  attachment_added: { label: 'Thêm tệp đính kèm', color: 'text-indigo' },
  watcher_added: { label: 'Bắt đầu theo dõi', color: 'text-indigo' },
  watcher_removed: { label: 'Dừng theo dõi', color: 'text-muted-foreground' },
};

export default function ActivityTab({ ticketId }: ActivityTabProps) {
  const { events, loading, error, total, has_more, loadMore } = useTicketAudit(ticketId);

  if (loading && events.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
        Đang tải hoạt động...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có hoạt động</p>
        </div>
      )}

      {/* Timeline */}
      <div className="relative space-y-1">
        {events.map((event, index) => {
          const cfg = EVENT_LABELS[event.event_type] ?? { label: event.event_type, color: 'text-muted-foreground' };
          return (
            <div key={event.id} className="flex gap-3 group">
              {/* dot + line */}
              <div className="flex flex-col items-center flex-shrink-0 mt-1">
                <div className="w-2 h-2 rounded-full bg-indigo/60 ring-2 ring-indigo/20 flex-shrink-0" />
                {index < events.length - 1 && (
                  <div className="w-px flex-1 bg-border mt-1 min-h-[1.5rem]" />
                )}
              </div>

              {/* content */}
              <div className="pb-4 flex-1">
                <div className="bg-secondary rounded-xl border border-border p-3 hover:border-indigo/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-foreground">{event.actor_name}</span>
                      <span className="text-sm text-muted-foreground"> — </span>
                      <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(event.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  {event.old_value && event.new_value && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded border border-red-500/20">
                        {formatEventValue(event.old_value, event.event_type)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                        {formatEventValue(event.new_value, event.event_type)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {has_more && (
        <button
          onClick={() => loadMore()}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-indigo border border-border hover:border-indigo/30 rounded-xl transition-colors"
        >
          <ChevronDown className="w-4 h-4" /> Tải thêm
        </button>
      )}

      {!has_more && events.length > 0 && (
        <p className="text-center text-xs text-muted-foreground py-2">
          Tất cả {total} sự kiện
        </p>
      )}
    </div>
  );
}
