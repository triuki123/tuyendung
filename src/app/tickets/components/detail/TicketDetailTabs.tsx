'use client';

import { LayoutGrid, Clock, Paperclip, Activity, Users, MessageCircle } from 'lucide-react';

type TabType = 'overview' | 'timeline' | 'attachments' | 'activity' | 'watchers' | 'comments';

interface TicketDetailTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Tổng quan', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { id: 'timeline', label: 'Timeline', icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'attachments', label: 'Tệp đính kèm', icon: <Paperclip className="w-3.5 h-3.5" /> },
  { id: 'activity', label: 'Hoạt động', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'comments', label: 'Bình luận', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { id: 'watchers', label: 'Người theo dõi', icon: <Users className="w-3.5 h-3.5" /> },
];

export default function TicketDetailTabs({ activeTab, onTabChange }: TicketDetailTabsProps) {
  return (
    <div className="border-b border-border bg-card flex-shrink-0">
      <div className="flex px-2 md:px-4 gap-0.5 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-indigo text-indigo'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
