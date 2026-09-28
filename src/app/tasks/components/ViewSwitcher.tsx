'use client';

import { Kanban, Calendar, TrendingUp, Grid3x3 } from 'lucide-react';

export type ViewType = 'kanban' | 'calendar' | 'gantt' | 'card';

interface ViewSwitcherProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const viewConfig: Record<ViewType, { label: string; icon: React.ReactNode }> = {
  kanban: { label: 'Kanban', icon: <Kanban size={18} /> },
  calendar: { label: 'Calendar', icon: <Calendar size={18} /> },
  gantt: { label: 'Gantt', icon: <TrendingUp size={18} /> },
  card: { label: 'Grid', icon: <Grid3x3 size={18} /> },
};

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const views: ViewType[] = ['kanban', 'calendar', 'gantt', 'card'];

  return (
    <div className="flex gap-2 items-center bg-slate-900/50 rounded-lg p-1 w-fit border border-slate-700/50">
      {views.map((view) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-md transition-all
            ${
              currentView === view
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-ink-muted hover:text-slate-200 hover:bg-slate-800/50'
            }
          `}
          title={`${viewConfig[view].label} View`}
        >
          {viewConfig[view].icon}
          <span className="text-sm font-medium">{viewConfig[view].label}</span>
        </button>
      ))}
    </div>
  );
}
