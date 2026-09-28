'use client';

import { useState } from 'react';
import { PanelRight } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useTicketWatchers } from '@/hooks/useTicketWatchers';
import { useTicketMentions } from '@/hooks/useTicketMentions';
import TicketDetailHeader from './TicketDetailHeader';
import TicketDetailTabs from './TicketDetailTabs';
import TicketDetailSidebar from './TicketDetailSidebar';
import OverviewTab from './tabs/OverviewTab';
import TimelineTab from './tabs/TimelineTab';
import AttachmentsTab from './tabs/AttachmentsTab';
import ActivityTab from './tabs/ActivityTab';
import CommentsTab from './tabs/CommentsTab';
import WatchersTab from './tabs/WatchersTab';

type TabType = 'overview' | 'timeline' | 'attachments' | 'activity' | 'comments' | 'watchers';

interface TicketDetailPanelProps {
  ticket: any;
  userId: string;
  userRole: string;
  onClose: () => void;
}

export default function TicketDetailPanel({ ticket, userId, userRole, onClose }: TicketDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [currentTicket, setCurrentTicket] = useState(ticket);
  const [showSidebar, setShowSidebar] = useState(false);

  useEscapeKey(onClose);

  const watchersData = useTicketWatchers(currentTicket.id, userId);
  const mentionsData = useTicketMentions(currentTicket.id, userId);

  const callApi = async (body: Record<string, any>) => {
    const res = await fetch(`/api/tickets/${currentTicket.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, userId, userRole }),
    });
    if (!res.ok) throw new Error('Failed');
    return res.json();
  };

  const handleFieldUpdate = async (fields: Record<string, any>) => {
    const prev = { ...currentTicket };
    setCurrentTicket((t: any) => ({ ...t, ...fields }));
    try {
      const updated = await callApi(fields);
      setCurrentTicket(updated);
    } catch {
      setCurrentTicket(prev);
    }
  };

  const handleStatusChange = async (newStatus: string, rejectionReason?: string) => {
    await handleFieldUpdate({
      status: newStatus,
      ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
    });
  };

  const handleReassign = async (newUserId: string, newUserName: string, _note: string) => {
    await handleFieldUpdate({ assigned_to: newUserId, assigned_to_name: newUserName });
  };

  const sidebarContent = (
    <TicketDetailSidebar
      ticket={currentTicket}
      watchers={watchersData.watchers}
      isFollowing={watchersData.isFollowing}
      onFollow={() => watchersData.follow()}
      onUnfollow={() => watchersData.unfollow()}
      mentionCount={mentionsData.unreadCount}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute right-0 top-0 bottom-0 w-full md:max-w-5xl flex flex-col bg-card border-l border-border shadow-modal">

        <TicketDetailHeader
          ticket={currentTicket}
          onClose={onClose}
          userRole={userRole}
          userId={userId}
          onStatusChange={handleStatusChange}
          onReassign={handleReassign}
          onToggleSidebar={() => setShowSidebar(v => !v)}
          sidebarOpen={showSidebar}
        />

        <TicketDetailTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex flex-1 overflow-hidden relative">
          {/* Main content */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {activeTab === 'overview'    && (
              <OverviewTab
                ticket={currentTicket}
                userRole={userRole}
                onUpdate={handleFieldUpdate}
              />
            )}
            {activeTab === 'timeline'    && <TimelineTab ticketId={currentTicket.id} userId={userId} />}
            {activeTab === 'attachments' && <AttachmentsTab ticketId={currentTicket.id} userId={userId} />}
            {activeTab === 'activity'    && <ActivityTab ticketId={currentTicket.id} />}
            {activeTab === 'comments'    && <CommentsTab ticketId={currentTicket.id} userId={userId} userRole={userRole} />}
            {activeTab === 'watchers'    && <WatchersTab ticketId={currentTicket.id} userId={userId} />}
          </div>

          {/* Desktop sidebar — luôn hiện */}
          <div className="hidden md:flex">
            {sidebarContent}
          </div>

          {/* Mobile sidebar — slide in từ phải khi toggle */}
          {showSidebar && (
            <div className="md:hidden absolute inset-0 z-10 flex">
              <div className="flex-1 bg-black/40" onClick={() => setShowSidebar(false)} />
              <div className="w-72 h-full overflow-y-auto bg-secondary border-l border-border flex flex-col">
                {sidebarContent}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
