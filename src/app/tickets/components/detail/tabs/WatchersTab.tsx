'use client';

import { useTicketWatchers } from '@/hooks/useTicketWatchers';
import { Eye, EyeOff, BellOff, Bell, Users } from 'lucide-react';

interface WatchersTabProps {
  ticketId: string;
  userId: string;
}

const WATCH_TYPE_LABELS: Record<string, string> = {
  all: 'Tất cả hoạt động',
  comments: 'Chỉ bình luận',
  status: 'Chỉ thay đổi trạng thái',
};

export default function WatchersTab({ ticketId, userId }: WatchersTabProps) {
  const { watchers, loading, error, isFollowing, follow, unfollow, toggleMute } = useTicketWatchers(ticketId, userId);

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-30 animate-pulse" />
        Đang tải...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Follow toggle */}
      <div className="bg-secondary rounded-xl border border-border p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Trạng thái theo dõi</h3>
        {isFollowing ? (
          <button
            onClick={unfollow}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm font-semibold hover:bg-red-500/20 transition-colors w-full"
          >
            <EyeOff className="w-4 h-4" />
            Bỏ theo dõi ticket này
          </button>
        ) : (
          <button
            onClick={() => follow()}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo/10 text-indigo border border-indigo/30 rounded-lg text-sm font-semibold hover:bg-indigo/20 transition-colors w-full"
          >
            <Eye className="w-4 h-4" />
            Theo dõi ticket này
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* List */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {watchers.length} người đang theo dõi
        </h3>

        {watchers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có người theo dõi ticket này</p>
          </div>
        ) : (
          <div className="space-y-2">
            {watchers.map((watcher) => (
              <div
                key={watcher.id}
                className="flex items-center gap-3 p-3 bg-secondary rounded-xl border border-border hover:border-indigo/20 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-indigo/15 border border-indigo/25 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-indigo">
                    {watcher.user_name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{watcher.user_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {WATCH_TYPE_LABELS[watcher.watch_type] || watcher.watch_type}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {watcher.muted && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      <BellOff className="w-3 h-3" /> Tắt tiếng
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
