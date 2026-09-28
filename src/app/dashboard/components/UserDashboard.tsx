'use client';

import React, { useEffect, useState } from 'react';
import { fetchTickets, fetchTasks, fetchRoomBookings } from '@/lib/api-client';
import { Ticket } from '@/lib/types/ticket';
import UserQuickActions from './user/UserQuickActions';
import UserActionItems from './user/UserActionItems';
import UserMyWork from './user/UserMyWork';
import UserMyRoomBookings from './user/UserMyRoomBookings';
import UserRecentActivity from './user/UserRecentActivity';
import UserStatistics from './user/UserStatistics';
import RecentAnnouncementsCard from './RecentAnnouncementsCard';
import RecentDocumentsCard from './RecentDocumentsCard';
import DashboardShell from './DashboardShell';
import ErrorState from '@/components/ui/ErrorState';

interface Task {
  id: string;
  code: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to: string;
  assigned_to_name: string;
  created_by: string;
  due_date: string;
  created_at: string;
  updated_at: string;
  relatedAsset?: string;
  progress?: number;
}

interface RoomBooking {
  id: string;
  room_id: string;
  room_name: string;
  requested_by: string;
  requested_by_name: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'approved' | 'rejected';
  purpose?: string;
  created_at: string;
}

export default function UserDashboard() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roomBookings, setRoomBookings] = useState<RoomBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Load current user
  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
  }, []);

  const loadData = async (cu: any) => {
    if (!cu) return;
    setLoading(true);
    setError(false);
    try {
      // Fetch tickets assigned to current user
      const ticketsData = await fetchTickets({
        userId: cu.id,
        userRole: cu.role,
      });
      setTickets(ticketsData || []);

      // Fetch tasks assigned to current user
      const tasksData = await fetchTasks({
        assigned_to: cu.id,
      });
      setTasks(Array.isArray(tasksData) ? tasksData : []);

      // Fetch room bookings created by current user
      const bookingsData = await fetchRoomBookings({
        requested_by: cu.id,
      });
      setRoomBookings(bookingsData || []);
    } catch (error) {
      console.error('Failed to load user dashboard data:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Load tickets, tasks, and room bookings
  useEffect(() => {
    loadData(currentUser);
  }, [currentUser]);

  if (!currentUser) return null;

  return (
    <DashboardShell
      role="user"
      header={
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">
            Xin chào, {currentUser.name}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Tổng quan các công việc và nhiệm vụ của bạn
          </p>
        </div>
      }
      mainFallback={
        error ? (
          <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <ErrorState onRetry={() => loadData(currentUser)} />
          </div>
        ) : undefined
      }
      elements={{
        'user-quick-actions': <UserQuickActions />,
        'user-action-items': (
          <UserActionItems
            ticketsOpen={tickets.filter(t => !['resolved', 'closed'].includes(t.status)).length}
            tasksTodo={tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length}
            roomsPending={roomBookings.filter(b => b.status === 'pending').length}
            loading={loading}
          />
        ),
        'user-my-work': <UserMyWork tickets={tickets} tasks={tasks} loading={loading} />,
        'user-room-bookings': <UserMyRoomBookings bookings={roomBookings} loading={loading} />,
        announcements: <RecentAnnouncementsCard />,
        documents: <RecentDocumentsCard />,
        'user-statistics': <UserStatistics tickets={tickets} tasks={tasks} />,
        'user-recent-activity': (
          <UserRecentActivity
            currentUser={currentUser}
            tickets={tickets}
            tasks={tasks}
            bookings={roomBookings}
          />
        ),
      }}
    />
  );
}
