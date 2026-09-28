'use client';

import React, { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { fetchAssets } from '@/lib/api-client';
import ErrorState from '@/components/ui/ErrorState';

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { status: string; count: number; color: string } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-xl border border-white/08 p-3 text-sm"
      style={{ background: 'var(--card)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
        <span className="text-foreground font-600 text-xs">{d.status}</span>
      </div>
      <p className="text-muted-foreground text-xs">Số lượng: <span className="text-foreground font-700 tabular-nums">{d.count}</span></p>
    </div>
  );
}

export default function StatusPieChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadStatusData();
  }, []);

  const loadStatusData = async () => {
    try {
      setLoading(true);
      setError(false);
      const assets = await fetchAssets();

      const statusMap: Record<string, { status: string; color: string; count: number }> = {
        assigned: { status: 'Đang dùng', color: '#6366f1', count: 0 },
        available: { status: 'Sẵn sàng', color: '#10b981', count: 0 },
        maintenance: { status: 'Bảo trì', color: '#f59e0b', count: 0 },
        broken: { status: 'Hỏng', color: '#C62828', count: 0 },
        retired: { status: 'Thanh lý', color: '#64748b', count: 0 },
      };

      assets?.forEach((asset: any) => {
        if (statusMap[asset.status]) {
          statusMap[asset.status].count++;
        }
      });

      const chartData = Object.values(statusMap).filter(item => item.count > 0);
      setData(chartData);
    } catch (error) {
      console.error('Error loading status data:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="h-40 animate-pulse bg-white/05 rounded-lg" />;
  }
  if (error) {
    return <ErrorState onRetry={loadStatusData} />;
  }
  if (data.length === 0) {
    return <div className="h-40 animate-pulse bg-white/05 rounded-lg" />;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={3}
            dataKey="count"
          >
            {data.map((entry, i) => (
              <Cell key={`pie-cell-${i}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="space-y-1.5 mt-2">
        {data.map((item, i) => (
          <div key={`legend-${i}`} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
              <span className="text-xs text-muted-foreground">{item.status}</span>
            </div>
            <span className="text-xs font-600 text-foreground tabular-nums">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}