'use client';

import { TicketWatcher } from '@/hooks/useTicketWatchers';

interface WatcherFormProps {
  watcher: TicketWatcher;
  onUpdate: (watcherId: string, watch_type: string, muted: boolean) => Promise<void>;
}

export default function WatcherForm({
  watcher,
  onUpdate,
}: WatcherFormProps) {
  return (
    <div className="p-3 bg-white border border-gray-200 rounded space-y-3">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase">
          Loại theo dõi
        </label>
        <select
          value={watcher.watch_type}
          onChange={(e) =>
            onUpdate(watcher.id, e.target.value, watcher.muted)
          }
          className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
        >
          <option value="all">Tất cả hoạt động</option>
          <option value="comments">Chỉ bình luận</option>
          <option value="status">Chỉ thay đổi trạng thái</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={watcher.muted}
          onChange={(e) =>
            onUpdate(watcher.id, watcher.watch_type, e.target.checked)
          }
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-gray-700">Tắt tiếng thông báo</span>
      </label>
    </div>
  );
}
