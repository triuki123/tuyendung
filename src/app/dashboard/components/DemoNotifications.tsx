'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { useNotificationHelper } from '@/lib/notificationHelper';

export default function DemoNotifications() {
  const notifications = useNotificationHelper();

  return (
    <div className="rounded-2xl border border-white/08 p-4 sm:p-5 lg:p-6"
      style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/15">
          <Bell size={18} className="text-amber-400" />
        </div>
        <h2 className="text-sm font-700 text-foreground">Thử Nghiệm Thông Báo</h2>
        <span className="text-2xs text-muted-foreground ml-auto">DEV ONLY</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Nhấn các nút dưới đây để thử nghiệm hệ thống thông báo:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <button
          onClick={() => notifications.notifyTaskAssigned('Kiểm tra server IT-05', 'Nguyễn Văn A')}
          className="px-3 py-2 rounded-lg text-xs font-600 bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors"
        >
          Task mới
        </button>
        <button
          onClick={() => notifications.notifyTicketAssigned('TK-2026-001', 'Trần Thị B', 'Lỗi login từ chi nhánh HN')}
          className="px-3 py-2 rounded-lg text-xs font-600 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 transition-colors"
        >
          Ticket mới
        </button>
        <button
          onClick={() => notifications.notifyAssetUpdate('Dell XPS 15', 'Đã sửa chữa thành công')}
          className="px-3 py-2 rounded-lg text-xs font-600 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
        >
          Update tài sản
        </button>
        <button
          onClick={() => notifications.notifyReminder('Báo cáo tháng này', 'Lê Văn C')}
          className="px-3 py-2 rounded-lg text-xs font-600 bg-orange-500/10 border border-orange-500/30 text-orange-300 hover:bg-orange-500/20 transition-colors"
        >
          Nhắc nhở
        </button>
        <button
          onClick={() => notifications.notifySystemMessage('Bảo trì hệ thống', 'Bảo trì database vào 22:00 hôm nay')}
          className="px-3 py-2 rounded-lg text-xs font-600 bg-blue-500/10 border border-blue-500/30 text-blue-300 hover:bg-blue-500/20 transition-colors"
        >
          Tin hệ thống
        </button>
      </div>
    </div>
  );
}
