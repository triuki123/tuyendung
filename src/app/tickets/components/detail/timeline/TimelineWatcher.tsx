'use client';

import { Eye, EyeOff } from 'lucide-react';
import { TimelineEvent } from '@/hooks/useUnifiedTimeline';

interface TimelineWatcherProps {
  event: TimelineEvent;
}

export default function TimelineWatcher({
  event,
}: TimelineWatcherProps) {
  const isAdded = event.entity_type === 'watcher_added';

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isAdded ? 'bg-blue-100' : 'bg-gray-100'
          }`}
        >
          {isAdded ? (
            <Eye className="w-4 h-4 text-blue-600" />
          ) : (
            <EyeOff className="w-4 h-4 text-gray-600" />
          )}
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
            {isAdded ? 'Bắt đầu theo dõi' : 'Dừng theo dõi'}
          </p>
        </div>
      </div>
    </div>
  );
}
