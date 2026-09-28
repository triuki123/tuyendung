import React from 'react';

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-white/05 ${className ?? ''}`} />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl p-5 border border-white/05 animate-pulse" style={{ background: 'var(--card)' }}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-white/05" />
        <div className="w-16 h-5 rounded-full bg-white/05" />
      </div>
      <div className="w-20 h-8 rounded-lg bg-white/05 mb-2" />
      <div className="w-28 h-4 rounded bg-white/05" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 8 }: { cols?: number }) {
  return (
    <tr className="border-b border-white/05">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={`skel-col-${i}`} className="px-4 py-3">
          <div className="h-4 rounded bg-white/05 animate-pulse" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton 1 card (dùng cho grid danh sách). */
export function CardSkeleton() {
  return (
    <div className="rounded-2xl p-5 border border-white/05 animate-pulse" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-white/05" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-white/05" />
          <div className="h-3 w-1/3 rounded bg-white/05" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-white/05" />
        <div className="h-3 w-4/5 rounded bg-white/05" />
        <div className="h-3 w-3/5 rounded bg-white/05" />
      </div>
    </div>
  );
}

/** Lưới skeleton card — dùng cho trang danh sách khi tải lần đầu. */
export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'}>
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={`card-skel-${i}`} />)}
    </div>
  );
}

/** Skeleton danh sách dòng (list view). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`list-skel-${i}`} className="flex items-center gap-3 rounded-xl border border-white/05 p-3 animate-pulse" style={{ background: 'var(--card)' }}>
          <div className="w-9 h-9 rounded-lg bg-white/05 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-white/05" />
            <div className="h-3 w-1/2 rounded bg-white/05" />
          </div>
        </div>
      ))}
    </div>
  );
}