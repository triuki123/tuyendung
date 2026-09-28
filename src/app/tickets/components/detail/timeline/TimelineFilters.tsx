'use client';

const filters = [
  { id: 'all', label: 'Tất cả' },
  { id: 'comment', label: 'Bình luận' },
  { id: 'status_change', label: 'Trạng thái' },
  { id: 'attachment', label: 'Tệp đính kèm' },
  { id: 'watcher', label: 'Theo dõi' },
];

interface TimelineFiltersProps {
  eventFilter: string;
  onFilterChange: (filter: string) => void;
}

export default function TimelineFilters({ eventFilter, onFilterChange }: TimelineFiltersProps) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {filters.map((filter) => (
        <button
          key={filter.id}
          onClick={() => onFilterChange(filter.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            eventFilter === filter.id
              ? 'bg-indigo text-white'
              : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-secondary border border-border'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
