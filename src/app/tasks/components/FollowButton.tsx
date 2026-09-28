'use client';

import React, { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';

interface FollowButtonProps {
  taskId: string;
  isFollowing: boolean;
  onToggle?: (isFollowing: boolean) => Promise<void>;
  followerCount?: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
}

export default function FollowButton({
  taskId,
  isFollowing: initialFollowing,
  onToggle,
  followerCount = 0,
  size = 'md',
  showCount = true,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(followerCount);

  const handleToggle = async () => {
    if (loading) return;

    setLoading(true);
    try {
      await onToggle?.(isFollowing);

      setIsFollowing(!isFollowing);
      if (!isFollowing) {
        setCount(count + 1);
      } else {
        setCount(Math.max(0, count - 1));
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 h-8 md:h-7 md:px-2 md:py-1',
    md: 'text-sm px-3 py-2 h-9 md:h-8 md:py-1.5',
    lg: 'text-base px-4 py-2.5 h-11 md:h-10 md:py-2',
  };

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`flex items-center justify-center gap-1.5 rounded-lg transition-colors font-600 md:font-500 min-h-9 ${
        isFollowing
          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 active:bg-red-500/40 border border-red-500/30'
          : 'bg-hover text-muted-foreground hover:bg-hover-strong active:bg-white/20 border border-line'
      } ${sizeClasses[size]} disabled:opacity-50 disabled:cursor-not-allowed`}
      title={isFollowing ? 'Bỏ theo dõi' : 'Theo dõi task'}
      aria-label={isFollowing ? 'Bỏ theo dõi task này' : 'Theo dõi task này'}
      aria-pressed={isFollowing}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin flex-shrink-0" />
      ) : (
        <Heart size={iconSize} fill={isFollowing ? 'currentColor' : 'none'} className="flex-shrink-0" />
      )}
      {showCount && <span className="hidden sm:inline">{count}</span>}
    </button>
  );
}
