'use client';

import React, { useEffect, useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { useFollowTicket } from '@/hooks/useFollowTicket';

interface FollowTicketButtonProps {
  ticketId: string;
  userId: string;
  followers?: string[];
  className?: string;
}

export default function FollowTicketButton({
  ticketId,
  userId,
  followers = [],
  className = '',
}: FollowTicketButtonProps) {
  const { isFollowing, loading, toggleFollow } = useFollowTicket(ticketId, userId, followers);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <button
      onClick={toggleFollow}
      disabled={loading}
      className={`
        flex items-center justify-center gap-2 h-10 px-4 rounded-lg
        text-sm font-600 transition-all duration-200
        ${
          isFollowing
            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30'
            : 'bg-slate-700/50 text-ink-bright hover:bg-slate-700/80 border border-slate-600/50'
        }
        ${loading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      title={isFollowing ? 'Hủy theo dõi ticket' : 'Theo dõi ticket'}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          <span>{isFollowing ? 'Đang hủy...' : 'Đang theo dõi...'}</span>
        </>
      ) : (
        <>
          <Star
            size={16}
            className={isFollowing ? 'fill-current' : ''}
          />
          <span>{isFollowing ? 'Đang Theo Dõi' : 'Theo Dõi'}</span>
        </>
      )}
    </button>
  );
}
