'use client';

import React, { useEffect, useState } from 'react';
import {
  Package, CheckCircle, Wrench, AlertTriangle, ArchiveX, Ticket, DollarSign, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { fetchAssets, fetchTickets } from '@/lib/api-client';
import { formatVND, formatVNDCompact } from '@/lib/format';
import ErrorState from '@/components/ui/ErrorState';

interface Asset {
  id: string;
  status: string;
  value?: number;
}

interface TicketData {
  id: string;
  status: string;
  priority: string;
}

const TREND_ICONS: Record<string, React.ReactNode> = {
  up: <TrendingUp size={13} className="text-emerald-400" />,
  down: <TrendingDown size={13} className="text-red-400" />,
  neutral: <Minus size={13} className="text-ink-muted" />,
};

const TREND_COLORS: Record<string, string> = {
  up: 'text-emerald-400',
  down: 'text-red-400',
  neutral: 'text-ink-muted',
};

export default function DashboardMetrics() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(false);
      const [assetsData, ticketsData] = await Promise.all([
        fetchAssets(),
        fetchTickets(),
      ]);

      // Count assets by status
      const statusCounts = {
        assigned: 0,
        available: 0,
        maintenance: 0,
        broken: 0,
        retired: 0,
      };
      let totalValue = 0;

      assetsData?.forEach((asset: Asset) => {
        if (asset.status === 'assigned') statusCounts.assigned++;
        else if (asset.status === 'available') statusCounts.available++;
        else if (asset.status === 'maintenance') statusCounts.maintenance++;
        else if (asset.status === 'broken') statusCounts.broken++;
        else if (asset.status === 'retired') statusCounts.retired++;
        // assets.value là BIGINT → pg trả về CHUỖI, không phải số.
        // Cộng thẳng bằng + sẽ NỐI CHUỖI ("0"+"0"="00") → tổng giá trị phình khổng lồ.
        const v = Number(asset.value);
        if (Number.isFinite(v)) totalValue += v;
      });

      // Count tickets by status
      const ticketCounts = {
        open: 0,
        critical: 0,
      };
      ticketsData?.forEach((ticket: TicketData) => {
        if (ticket.status === 'open') ticketCounts.open++;
        if (ticket.status === 'open' && ticket.priority === 'critical') ticketCounts.critical++;
      });

      const totalAssets = assetsData?.length || 0;
      const assignedPercent = totalAssets > 0 ? Math.round((statusCounts.assigned / totalAssets) * 100) : 0;

      const newMetrics = [
        {
          id: 'metric-total',
          label: 'Tổng Tài Sản',
          value: totalAssets.toLocaleString('vi-VN'),
          sub: '+12 tháng này',
          trend: 'up',
          icon: <Package size={22} />,
          iconBg: 'bg-indigo-500/15',
          iconColor: 'text-indigo-400',
          span: 'col-span-2 sm:col-span-1 lg:col-span-2',
          hero: true,
        },
        {
          id: 'metric-assigned',
          label: 'Đang Sử Dụng',
          value: statusCounts.assigned.toLocaleString('vi-VN'),
          sub: `${assignedPercent}% tổng tài sản`,
          trend: 'up',
          icon: <CheckCircle size={20} />,
          iconBg: 'bg-emerald-500/15',
          iconColor: 'text-emerald-400',
          span: 'col-span-1',
          hero: false,
        },
        {
          id: 'metric-available',
          label: 'Sẵn Sàng',
          value: statusCounts.available.toLocaleString('vi-VN'),
          sub: `${totalAssets > 0 ? Math.round((statusCounts.available / totalAssets) * 100) : 0}% tổng tài sản`,
          trend: 'neutral',
          icon: <ArchiveX size={20} />,
          iconBg: 'bg-blue-500/15',
          iconColor: 'text-blue-400',
          span: 'col-span-1',
          hero: false,
        },
        {
          id: 'metric-maintenance',
          label: 'Đang Bảo Trì',
          value: statusCounts.maintenance.toLocaleString('vi-VN'),
          sub: `${statusCounts.maintenance} tài sản`,
          trend: 'neutral',
          icon: <Wrench size={20} />,
          iconBg: 'bg-amber-500/15',
          iconColor: 'text-amber-400',
          span: 'col-span-1',
          hero: false,
        },
        {
          id: 'metric-broken',
          label: 'Tài Sản Hỏng',
          value: statusCounts.broken.toLocaleString('vi-VN'),
          sub: `${statusCounts.broken} tài sản`,
          trend: statusCounts.broken > 0 ? 'down' : 'neutral',
          icon: <AlertTriangle size={20} />,
          iconBg: 'bg-red-500/15',
          iconColor: 'text-red-400',
          span: 'col-span-1',
          hero: false,
          alert: statusCounts.broken > 0,
        },
        {
          id: 'metric-tickets',
          label: 'Ticket Đang Mở',
          value: ticketCounts.open.toLocaleString('vi-VN'),
          sub: `${ticketCounts.critical} khẩn cấp chưa xử lý`,
          trend: ticketCounts.open > 0 ? 'down' : 'neutral',
          icon: <Ticket size={20} />,
          iconBg: 'bg-orange-500/15',
          iconColor: 'text-orange-400',
          span: 'col-span-1',
          hero: false,
          alert: ticketCounts.critical > 0,
        },
        {
          id: 'metric-value',
          label: 'Tổng Giá Trị Tài Sản',
          // Thẻ hiện số rút gọn kiểu VN ("1,4 tỷ đ"); dòng phụ hiện số đầy đủ để đối chiếu.
          value: formatVNDCompact(totalValue),
          sub: formatVND(totalValue),
          trend: 'up',
          icon: <DollarSign size={20} />,
          iconBg: 'bg-violet-500/15',
          iconColor: 'text-violet-400',
          span: 'col-span-2 sm:col-span-1 lg:col-span-2',
          hero: false,
        },
      ];

      setMetrics(newMetrics);
    } catch (error) {
      console.error('Error loading metrics:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return <ErrorState onRetry={loadMetrics} />;
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="rounded-2xl p-3.5 sm:p-5 border border-white/05 h-32 animate-pulse" style={{ background: 'var(--card)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-3 sm:gap-4">
      {metrics.map(metric => (
        <div
          key={metric.id}
          className={`
            rounded-2xl p-3.5 sm:p-5 border metric-card-hover
            ${metric.span}
            ${metric.alert
              ? 'border-red-500/25 bg-red-500/05' :'border-white/05'
            }
          `}
          style={!metric.alert ? { background: 'var(--card)' } : undefined}
        >
          <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${metric.iconBg} shrink-0`}>
              <span className={metric.iconColor}>{metric.icon}</span>
            </div>
            {metric.alert && (
              <span className="flex items-center gap-1 text-2xs font-600 text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Cần xử lý
              </span>
            )}
          </div>

          <p
            className={`font-700 tabular-nums mb-1 ${metric.hero ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} ${metric.alert ? 'text-red-300' : 'text-foreground'}`}
          >
            {metric.value}
          </p>

          <p className={`text-xs font-500 mb-1.5 ${metric.alert ? 'text-red-400/70' : 'text-muted-foreground'}`}>
            {metric.label}
          </p>

          <div className="flex items-center gap-1">
            {TREND_ICONS[metric.trend]}
            <span className={`text-2xs sm:text-xs ${TREND_COLORS[metric.trend]} truncate`}>{metric.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}