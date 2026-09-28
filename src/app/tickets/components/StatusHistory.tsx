'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface StatusHistoryItem {
  id: string;
  ticket_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  changed_by_name: string;
  reason: string | null;
  created_at: string;
}

interface StatusHistoryProps {
  ticketId: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <AlertCircle size={16} className="text-blue-400" />,
  in_progress: <Clock size={16} className="text-amber-400" />,
  resolved: <CheckCircle2 size={16} className="text-emerald-400" />,
  closed: <CheckCircle2 size={16} className="text-ink-muted" />,
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Mở',
  in_progress: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  closed: 'Đóng',
};

export default function StatusHistory({ ticketId }: StatusHistoryProps) {
  const [history, setHistory] = useState<StatusHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatusHistory = async () => {
      try {
        const response = await fetch(`/api/tickets/${ticketId}/status-history`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data);
        }
      } catch (error) {
        console.error('Failed to fetch status history:', error);
      } finally {
        setLoading(false);
      }
    };

    if (ticketId) {
      fetchStatusHistory();
    }
  }, [ticketId]);

  if (loading) {
    return (
      <div className="py-4">
        <p className="text-xs text-muted-foreground animate-pulse">Đang tải lịch sử...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="py-4">
        <p className="text-xs text-muted-foreground">Không có lịch sử trạng thái</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((item, index) => (
        <div key={item.id} className="flex gap-3">
          {/* Timeline dot and line */}
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-hover-strong border border-line-strong">
              {STATUS_ICONS[item.new_status] || <CheckCircle2 size={14} className="text-ink-muted" />}
            </div>
            {index < history.length - 1 && (
              <div className="w-0.5 h-8 bg-hover-strong mt-2" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-2">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-500 text-foreground">
                {item.old_status ? (
                  <>
                    <span className="text-muted-foreground">{STATUS_LABELS[item.old_status]}</span>
                    <span className="text-muted-foreground mx-1">→</span>
                    <span className={getStatusColor(item.new_status)}>{STATUS_LABELS[item.new_status]}</span>
                  </>
                ) : (
                  <>
                    <span>Ticket tạo</span>
                    <span className="text-muted-foreground mx-1">—</span>
                    <span className={getStatusColor(item.new_status)}>{STATUS_LABELS[item.new_status]}</span>
                  </>
                )}
              </p>
            </div>

            <p className="text-2xs text-muted-foreground mt-1">
              Bởi <span className="text-ink-bright">{item.changed_by_name}</span>
              {' · '}
              {formatDateTime(item.created_at)}
            </p>

            {item.reason && (
              <p className="text-2xs text-ink-muted mt-1.5 italic">
                Lý do: {item.reason}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    open: 'text-blue-400',
    in_progress: 'text-amber-400',
    resolved: 'text-emerald-400',
    closed: 'text-ink-muted',
  };
  return colors[status] || 'text-ink-muted';
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const time = date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${dateStr} ${time}`;
}
