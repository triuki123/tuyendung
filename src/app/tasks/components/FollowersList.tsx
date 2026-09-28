'use client';

import React from 'react';
import { Users, AlertCircle } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

interface Follower {
  user_id: string;
  user_name: string;
  avatar?: string;
  created_at: string;
}

interface FollowersListProps {
  followers: Follower[];
  loading?: boolean;
  onRemove?: (userId: string) => Promise<void>;
  currentUserId?: string;
  isManager?: boolean;
}

export default function FollowersList({
  followers,
  loading = false,
  onRemove,
  currentUserId,
  isManager = false,
}: FollowersListProps) {
  const [removing, setRemoving] = React.useState<string | null>(null);

  const handleRemove = async (userId: string) => {
    setRemoving(userId);
    try {
      await onRemove?.(userId);
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-hover rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (followers.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Users size={16} className="mr-2" />
        <span className="text-sm">Chưa có ai theo dõi task này</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {followers.map((follower) => (
        <div
          key={follower.user_id}
          className="flex items-center justify-between p-2.5 md:p-3 rounded-lg border border-line bg-hover hover:bg-white/8 active:bg-hover-strong transition-colors"
          role="listitem"
        >
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <UserAvatar name={follower.user_name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-500 text-foreground truncate">
                {follower.user_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(follower.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
          </div>

          {(follower.user_id === currentUserId || isManager) && (
            <button
              onClick={() => handleRemove(follower.user_id)}
              disabled={removing === follower.user_id}
              className="text-xs px-2.5 md:px-2 py-1.5 md:py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 active:bg-red-500/40 transition-colors disabled:opacity-50 flex-shrink-0 ml-2 min-h-8 md:min-h-6 flex items-center justify-center"
              aria-label={`Bỏ theo dõi ${follower.user_name}`}
            >
              Bỏ
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
