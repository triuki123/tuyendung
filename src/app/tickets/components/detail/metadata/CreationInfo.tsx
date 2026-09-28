'use client';

import { User2, Calendar, RefreshCw } from 'lucide-react';

interface CreationInfoProps {
  ticket: any;
}

export default function CreationInfo({ ticket }: CreationInfoProps) {
  return (
    <div className="bg-secondary rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Thông tin tạo</h3>
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <User2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Tạo bởi</p>
            <p className="text-sm font-semibold text-foreground">{ticket.created_by_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Ngày tạo</p>
            <p className="text-sm font-semibold text-foreground">
              {new Date(ticket.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Cập nhật gần nhất</p>
            <p className="text-sm font-semibold text-foreground">
              {new Date(ticket.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
