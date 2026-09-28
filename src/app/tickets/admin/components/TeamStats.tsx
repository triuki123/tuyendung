import React from 'react';
import { Users } from 'lucide-react';
import { Ticket } from '@/lib/types/ticket';

interface User {
  id: string;
  name: string;
}

interface TeamStatsProps {
  tickets: Ticket[];
  users: User[];
}

export default function TeamStats({ tickets, users }: TeamStatsProps) {
  // Calculate stats per team member
  const teamStats = users
    .filter(u => u.id && tickets.some(t => t.assigned_to === u.id))
    .map(u => {
      const assigned = tickets.filter(t => t.assigned_to === u.id).length;
      const percentage = tickets.length > 0 ? Math.round((assigned / tickets.length) * 100) : 0;
      return {
        id: u.id,
        name: u.name,
        count: assigned,
        percentage,
      };
    })
    .sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-2xl border border-white/05 p-4 sticky top-20" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-indigo-400" />
        <h3 className="text-sm font-600 text-foreground">Thống Kê Team</h3>
      </div>

      {teamStats.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Chưa có ticket được giao</p>
      ) : (
        <div className="space-y-3">
          {teamStats.map(stat => (
            <div key={stat.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-foreground font-500 truncate">{stat.name}</p>
                <span className="text-2xs text-muted-foreground whitespace-nowrap ml-2">
                  {stat.count}/{tickets.length}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/05 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all"
                  style={{ width: `${stat.percentage}%` }}
                />
              </div>
              <p className="text-2xs text-muted-foreground text-right">{stat.percentage}%</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
