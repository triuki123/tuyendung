'use client';

interface BookingLegendProps {
  variant?: 'grid' | 'inline' | 'compact';
  className?: string;
}

export function BookingLegend({ variant = 'grid', className = '' }: BookingLegendProps) {
  const legendItems = [
    {
      icon: '✅',
      label: 'Đã Duyệt',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/20',
    },
    {
      icon: '⏳',
      label: 'Chờ Duyệt',
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
    },
    {
      icon: '❌',
      label: 'Từ Chối',
      color: 'text-red-400',
      bg: 'bg-red-500/20',
    },
    {
      icon: '✖️',
      label: 'Đã Hủy',
      color: 'text-ink-muted',
      bg: 'bg-slate-500/20',
    },
  ];

  // Grid layout (2x2 on desktop, 1 col on mobile)
  if (variant === 'grid') {
    return (
      <div className={`${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {legendItems.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border border-line ${item.bg}`}
            >
              <span className="text-lg flex-shrink-0">{item.icon}</span>
              <span className={`text-2xs sm:text-xs font-600 ${item.color}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Inline layout (single row)
  if (variant === 'inline') {
    return (
      <div className={`${className}`}>
        <div className="flex flex-wrap gap-2">
          {legendItems.map((item) => (
            <div
              key={item.label}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-line ${item.bg}`}
            >
              <span className="text-sm flex-shrink-0">{item.icon}</span>
              <span className="text-2xs sm:text-xs font-600 text-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Compact layout (minimal)
  if (variant === 'compact') {
    return (
      <div className={`${className}`}>
        <div className="flex flex-wrap gap-1.5">
          {legendItems.map((item) => (
            <div
              key={item.label}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-hover border border-line"
              title={item.label}
            >
              <span className="text-xs">{item.icon}</span>
              <span className="text-2xs text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
