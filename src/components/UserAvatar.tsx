'use client';

import React from 'react';

interface UserAvatarProps {
  name: string;
  /** URL ảnh đại diện (vd /avatars/xxx.jpg) — có thì hiện ảnh, không thì fallback chữ cái đầu */
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  bgColor?: string;
  textColor?: string;
  className?: string;
  online?: boolean;
}

const AVATAR_COLORS = [
  'bg-indigo-500/30 text-indigo-200 border-indigo-500/50',
  'bg-blue-500/30 text-blue-200 border-blue-500/50',
  'bg-cyan-500/30 text-cyan-200 border-cyan-500/50',
  'bg-emerald-500/30 text-emerald-200 border-emerald-500/50',
  'bg-amber-500/30 text-amber-200 border-amber-500/50',
  'bg-rose-500/30 text-rose-200 border-rose-500/50',
  'bg-purple-500/30 text-purple-200 border-purple-500/50',
  'bg-pink-500/30 text-pink-200 border-pink-500/50',
];

const SIZE_MAP = {
  xs: 'w-5 h-5 text-2xs',
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-12 h-12 text-base',
};

export default function UserAvatar({
  name,
  avatarUrl,
  size = 'md',
  bgColor,
  textColor,
  className = '',
  online = false,
}: UserAvatarProps) {
  const [imgError, setImgError] = React.useState(false);
  const getInitials = (text: string) => {
    return text
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Deterministic color based on name
  const getColorClass = () => {
    if (bgColor) return bgColor;
    const charCode = name.charCodeAt(0);
    const colorIndex = charCode % AVATAR_COLORS.length;
    return AVATAR_COLORS[colorIndex];
  };

  const initials = getInitials(name);
  const sizeClass = SIZE_MAP[size];
  const colorClass = getColorClass();
  const showImage = !!avatarUrl && avatarUrl.startsWith('/') && !imgError;

  return (
    <div className={`relative inline-flex items-center justify-center rounded-full border font-600 tracking-tight ${sizeClass} ${colorClass} ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initials || '?'
      )}

      {/* Online Indicator */}
      {online && (
        <div className={`absolute bottom-0 right-0 rounded-full border-2 border-slate-900 ${
          size === 'xs' ? 'w-1.5 h-1.5' : size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-2.5 h-2.5' : 'w-3 h-3'
        } bg-emerald-500`} />
      )}
    </div>
  );
}
