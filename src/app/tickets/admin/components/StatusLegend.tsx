'use client';

import React from 'react';
import { PRIORITY_CONFIG, STATUS_CONFIG } from '@/lib/constants/ticketConstants';

interface StatusLegendProps {
  compact?: boolean;
}

/**
 * Status Legend Component - Hiển thị chú thích trạng thái và độ ưu tiên
 */
export default function StatusLegend({ compact = false }: StatusLegendProps) {
  const statuses = Object.entries(STATUS_CONFIG);
  const priorities = Object.entries(PRIORITY_CONFIG);

  if (compact) {
    return (
      <div className="rounded-lg border border-line p-3 bg-slate-900/50 backdrop-blur-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {statuses.map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${config.color.split('-')[1]}`} />
              <span className="text-xs text-muted-foreground">{config.label}</span>
            </div>
          ))}
          {priorities.map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${config.color.split('-')[1]}`} />
              <span className="text-xs text-muted-foreground">{config.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line p-6 bg-slate-900/50 backdrop-blur-sm">
      <h3 className="text-sm font-600 text-foreground mb-4">Chú Thích</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Legend */}
        <div className="space-y-3">
          <h4 className="text-xs font-600 text-muted-foreground uppercase">Trạng Thái</h4>
          {statuses.map(([key, config]) => (
            <div key={key} className="flex items-center gap-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-600 border ${config.bg}`}>
                {config.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {key === 'open' && 'Yêu cầu mới, chưa xử lý'}
                {key === 'in_progress' && 'Đang được xử lý'}
                {key === 'resolved' && 'Đã hoàn thành'}
                {key === 'closed' && 'Đã đóng'}
              </span>
            </div>
          ))}
        </div>

        {/* Priority Legend */}
        <div className="space-y-3">
          <h4 className="text-xs font-600 text-muted-foreground uppercase">Độ Ưu Tiên</h4>
          {priorities.map(([key, config]) => (
            <div key={key} className="flex items-center gap-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-600 border ${config.bg}`}>
                {config.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {key === 'low' && 'Có thể xử lý sau'}
                {key === 'medium' && 'Bình thường'}
                {key === 'high' && 'Cần xử lý sớm'}
                {key === 'critical' && 'Khẩn cấp, ưu tiên cao nhất'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
