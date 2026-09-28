'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fetchAssets } from '@/lib/api-client';
import ErrorState from '@/components/ui/ErrorState';

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#C62828', '#ec4899', '#64748b'];

interface DepartmentData {
  department: string;
  assets: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-white/08 p-3 text-sm"
      style={{ background: 'var(--card)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-xs font-600 text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground text-xs">Tài sản: <span className="text-foreground font-600 tabular-nums">{payload[0].value}</span></p>
    </div>
  );
}

export default function DepartmentBarChart() {
  const [data, setData] = useState<DepartmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadDepartmentData();
  }, []);

  const loadDepartmentData = async () => {
    try {
      setLoading(true);
      setError(false);
      const assets = await fetchAssets();

      const departmentMap: Record<string, number> = {};
      assets?.forEach((asset: any) => {
        if (asset.department) {
          departmentMap[asset.department] = (departmentMap[asset.department] || 0) + 1;
        }
      });

      const chartData = Object.entries(departmentMap)
        .map(([department, count]) => ({
          department,
          assets: count,
        }))
        .sort((a, b) => b.assets - a.assets);

      setData(chartData);
    } catch (error) {
      console.error('Error loading department data:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="h-52 animate-pulse bg-white/05 rounded-lg" />;
  }
  if (error) {
    return <ErrorState onRetry={loadDepartmentData} />;
  }
  if (data.length === 0) {
    return <div className="h-52 animate-pulse bg-white/05 rounded-lg" />;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="department" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
        <Bar dataKey="assets" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={`cell-dept-${i}`} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}