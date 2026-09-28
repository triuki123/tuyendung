'use client';

import { History } from 'lucide-react';
import { TimelineEvent } from '@/hooks/useUnifiedTimeline';

interface TimelineAuditEventProps {
  event: TimelineEvent;
}

export default function TimelineAuditEvent({
  event,
}: TimelineAuditEventProps) {
  const eventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      created: 'Tạo ticket',
      assigned: 'Giao cho người khác',
      priority_changed: 'Thay đổi ưu tiên',
      comment_added: 'Thêm bình luận',
      comment_edited: 'Chỉnh sửa bình luận',
      comment_deleted: 'Xóa bình luận',
      attachment_added: 'Thêm tệp đính kèm',
      watcher_added: 'Bắt đầu theo dõi',
      watcher_removed: 'Dừng theo dõi',
    };
    return labels[type] || type;
  };

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <History className="w-4 h-4 text-gray-600" />
        </div>
        <div className="w-0.5 h-12 bg-gray-200 mt-2" />
      </div>

      <div className="flex-1 pb-4">
        <p className="text-sm font-semibold text-gray-900">{event.actor_name}</p>
        <p className="text-xs text-gray-500">
          {new Date(event.created_at).toLocaleString('vi-VN')}
        </p>

        <div className="mt-3 bg-white p-3 rounded border border-gray-200">
          <p className="text-sm text-gray-700">
            {eventTypeLabel(event.entity_type)}
          </p>
          {event.old_value && event.new_value && (
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <div>
                <span className="font-semibold">Từ:</span> {JSON.stringify(event.old_value)}
              </div>
              <div>
                <span className="font-semibold">Thành:</span> {JSON.stringify(event.new_value)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
