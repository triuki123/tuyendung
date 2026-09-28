import React from 'react';
import { AlertTriangle, Wrench, Package, Clock, ChevronRight } from 'lucide-react';

const ALERTS = [
  {
    id: 'alert-001',
    type: 'critical',
    icon: <AlertTriangle size={16} />,
    title: 'Samsung Galaxy S24+ báo hỏng',
    detail: 'AF-IT-2026-007 · Vỡ màn hình · Chưa có ticket',
    time: '15 phút trước',
    action: 'Tạo Ticket',
  },
  {
    id: 'alert-002',
    type: 'warning',
    icon: <Wrench size={16} />,
    title: 'Máy chủ Dell R750 đang bảo trì quá hạn',
    detail: 'AF-IT-2026-012 · Dự kiến hoàn thành 10/04/2026',
    time: '32 ngày trước',
    action: 'Xem chi tiết',
  },
  {
    id: 'alert-003',
    type: 'warning',
    icon: <Clock size={16} />,
    title: 'Bảo hành sắp hết: LG 27UK850-W',
    detail: 'AF-IT-2026-005 · Hết hạn 14/08/2026 · còn 94 ngày',
    time: '1 ngày trước',
    action: 'Gia hạn',
  },
  {
    id: 'alert-004',
    type: 'info',
    icon: <Package size={16} />,
    title: 'Laptop HP EliteBook 840 G10 chờ phân bổ',
    detail: 'AF-IT-2026-003 · Kho IT · Yêu cầu từ HR tháng 5',
    time: '11 ngày trước',
    action: 'Phân bổ',
  },
  {
    id: 'alert-005',
    type: 'critical',
    icon: <AlertTriangle size={16} />,
    title: 'Màn hình LG bảo trì chưa có tiến độ',
    detail: 'AF-IT-2026-005 · Gửi bảo trì 22/11/2025 · Chưa cập nhật',
    time: '172 ngày trước',
    action: 'Cập nhật',
  },
];

const ALERT_STYLES: Record<string, { border: string; icon: string; bg: string }> = {
  critical: { border: 'border-l-red-500', icon: 'text-red-400', bg: 'bg-red-500/05' },
  warning: { border: 'border-l-amber-500', icon: 'text-amber-400', bg: 'bg-amber-500/05' },
  info: { border: 'border-l-blue-500', icon: 'text-blue-400', bg: 'bg-blue-500/05' },
};

export default function AlertsPanel() {
  return (
    <div className="rounded-2xl border border-white/05 overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/05">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-400" />
          <h3 className="text-base font-600 text-foreground">Cảnh Báo Hệ Thống</h3>
          <span className="text-2xs font-600 text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
            2 khẩn cấp
          </span>
        </div>
      </div>

      <div className="divide-y divide-white/04">
        {ALERTS.map(alert => {
          const style = ALERT_STYLES[alert.type];
          return (
            <div
              key={`alert-${alert.id}`}
              className={`px-5 py-3.5 border-l-2 ${style.border} ${style.bg} table-row-hover`}
            >
              <div className="flex items-start gap-3">
                <span className={`${style.icon} mt-0.5 shrink-0`}>{alert.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-500 text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-2xs text-muted-foreground/70">{alert.time}</span>
                    <button className={`flex items-center gap-1 text-xs font-600 ${style.icon} hover:opacity-80 transition-opacity`}>
                      {alert.action} <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}