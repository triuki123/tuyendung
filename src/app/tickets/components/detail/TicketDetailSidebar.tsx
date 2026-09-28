'use client';

import { Eye, EyeOff, Bell, Calendar, User2, FolderOpen, CheckCircle2, Clock } from 'lucide-react';
import { TicketWatcher } from '@/hooks/useTicketWatchers';

interface TicketDetailSidebarProps {
  ticket: any;
  watchers: TicketWatcher[];
  isFollowing: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  mentionCount: number;
}

export default function TicketDetailSidebar({
  ticket, watchers, isFollowing, onFollow, onUnfollow, mentionCount,
}: TicketDetailSidebarProps) {

  const approvalSteps = [
    { label: 'Tạo',       done: true,  date: ticket.created_at },
    { label: 'Xử lý',    done: ['in_progress','resolved','closed'].includes(ticket.status) },
    { label: 'Hoàn thành',done: ['resolved','closed'].includes(ticket.status) },
  ];

  return (
    <aside className="w-64 flex-shrink-0 border-l border-border bg-secondary overflow-y-auto flex flex-col">

      {/* Follow */}
      <div className="p-4 border-b border-border space-y-2">
        {isFollowing ? (
          <button onClick={onUnfollow}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/25 rounded-lg text-xs font-semibold hover:bg-red-500/20 transition-colors">
            <EyeOff className="w-3.5 h-3.5" /> Bỏ theo dõi
          </button>
        ) : (
          <button onClick={onFollow}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo/10 text-indigo border border-indigo/25 rounded-lg text-xs font-semibold hover:bg-indigo/20 transition-colors">
            <Eye className="w-3.5 h-3.5" /> Theo dõi
          </button>
        )}
        {mentionCount > 0 && (
          <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
            <Bell className="w-3 h-3 flex-shrink-0" />
            <span>{mentionCount} mentions chưa đọc</span>
          </div>
        )}
      </div>

      {/* Người theo dõi */}
      <div className="p-4 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Theo dõi ({watchers.length})
        </p>
        {watchers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có ai theo dõi</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {watchers.map(w => (
              <div key={w.id} title={w.user_name}
                className="w-7 h-7 rounded-full bg-indigo/15 border border-indigo/25 flex items-center justify-center cursor-default">
                <span className="text-xs font-bold text-indigo">{w.user_name?.charAt(0).toUpperCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="p-4 border-b border-border space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chi tiết</p>

        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-2">
            <User2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-muted-foreground">Tạo bởi</p>
              <p className="font-semibold text-foreground">{ticket.created_by_name}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <User2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-muted-foreground">Giao cho</p>
              <p className="font-semibold text-foreground">{ticket.assigned_to_name || 'Chưa giao'}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <FolderOpen className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-muted-foreground">Danh mục</p>
              <p className="font-semibold text-foreground">{ticket.support_category || 'Không xác định'}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-muted-foreground">Ngày tạo</p>
              <p className="font-semibold text-foreground">{new Date(ticket.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-muted-foreground">Cập nhật</p>
              <p className="font-semibold text-foreground">{new Date(ticket.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Approval steps */}
      <div className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quy trình</p>
        <div className="space-y-0.5">
          {approvalSteps.map((step, i) => (
            <div key={step.label} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                {step.done
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  : <Clock className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                }
                {i < approvalSteps.length - 1 && (
                  <div className={`w-px flex-1 my-0.5 min-h-[14px] ${step.done ? 'bg-emerald-500/30' : 'bg-border'}`} />
                )}
              </div>
              <div className="pb-3">
                <p className={`text-xs font-semibold ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </p>
                {step.date && (
                  <p className="text-xs text-muted-foreground">{new Date(step.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
