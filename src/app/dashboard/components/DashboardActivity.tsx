import React from 'react';
import RecentTickets from './RecentTickets';
import AlertsPanel from './AlertsPanel';

export default function DashboardActivity() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2 gap-3 sm:gap-4">
      <RecentTickets />
      <AlertsPanel />
    </div>
  );
}