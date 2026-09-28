'use client';

import { useMemo } from 'react';
import { Calendar, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';

interface DashboardCardsProps {
  bookings: any[];
  currentUser: any;
}

export function RoomBookingDashboard({ bookings, currentUser }: DashboardCardsProps) {
  // My Pending Bookings
  const myPendingBookings = useMemo(() => {
    return bookings.filter(
      (b) =>
        b.requested_by === currentUser?.id &&
        (b.status === 'pending')
    ).length;
  }, [bookings, currentUser]);

  // Approved Bookings
  const approvedBookings = useMemo(() => {
    return bookings.filter(
      (b) =>
        b.requested_by === currentUser?.id &&
        b.status === 'approved'
    ).length;
  }, [bookings, currentUser]);

  // Total My Bookings
  const totalMyBookings = useMemo(() => {
    return bookings.filter((b) => b.requested_by === currentUser?.id).length;
  }, [bookings, currentUser]);

  // Approval Rate (% approved out of total)
  const approvalRate = useMemo(() => {
    if (totalMyBookings === 0) return 0;
    return Math.round((approvedBookings / totalMyBookings) * 100);
  }, [approvedBookings, totalMyBookings]);

  const cards = [
    {
      title: 'Chờ Duyệt',
      value: myPendingBookings,
      subtitle: 'yêu cầu',
      icon: AlertCircle,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      iconBg: 'bg-amber-500/20',
      gradient: 'from-amber-500 to-amber-600',
    },
    {
      title: 'Đã Duyệt',
      value: approvedBookings,
      subtitle: 'phòng đặt',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      iconBg: 'bg-emerald-500/20',
      gradient: 'from-emerald-500 to-emerald-600',
    },
    {
      title: 'Tổng Đặt Phòng',
      value: totalMyBookings,
      subtitle: 'tất cả đơn',
      icon: Calendar,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      iconBg: 'bg-blue-500/20',
      gradient: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Tỉ Lệ Thành Công',
      value: approvalRate,
      subtitle: 'phần trăm',
      icon: TrendingUp,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      iconBg: 'bg-indigo-500/20',
      gradient: 'from-indigo-500 to-indigo-600',
      isPercentage: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-6">
      {cards.map((card, index) => {
        const IconComponent = card.icon;
        const progressValue = card.isPercentage ? card.value : (card.value / Math.max(totalMyBookings, 1)) * 100;

        return (
          <div
            key={index}
            className={`${card.bgColor} backdrop-blur-sm p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-lg lg:rounded-xl border border-line hover:border-line-strong transition-all`}
          >
            <div className="flex items-start justify-between mb-2 sm:mb-3 gap-1">
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-600 text-muted-foreground uppercase mb-0.5 line-clamp-1">{card.title}</p>
                <p className={`text-lg sm:text-xl lg:text-2xl font-700 ${card.color}`}>
                  {card.isPercentage ? `${card.value}%` : card.value}
                </p>
              </div>
              <div className={`${card.iconBg} p-1.5 sm:p-2 rounded-lg flex-shrink-0`}>
                <IconComponent size={14} className={`sm:hidden ${card.color}`} />
                <IconComponent size={16} className={`hidden sm:block lg:hidden ${card.color}`} />
                <IconComponent size={18} className={`hidden lg:block ${card.color}`} />
              </div>
            </div>

            <p className="text-2xs text-muted-foreground mb-1.5 sm:mb-2 line-clamp-1">{card.subtitle}</p>

            {/* Progress Bar */}
            <div className="w-full h-0.5 bg-hover-strong rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${card.gradient} transition-all duration-500`}
                style={{ width: `${Math.min(progressValue, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
