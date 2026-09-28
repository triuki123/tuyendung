'use client';

import { useState } from 'react';
import { X, PanelRight, Tag, User, CheckCircle, PlayCircle, XCircle, UserCheck, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import StatusFlow, { TicketStatus } from './StatusFlow';
import RejectDialog from './RejectDialog';
import ReassignDialog from './ReassignDialog';

interface TicketDetailHeaderProps {
  ticket: any;
  onClose: () => void;
  userRole: string;
  userId: string;
  onStatusChange: (newStatus: string, rejectionReason?: string) => Promise<void>;
  onReassign: (newUserId: string, newUserName: string, note: string) => Promise<void>;
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  low:      { label: 'Thấp',       className: 'bg-slate-500/15 text-ink-muted border-slate-500/30' },
  medium:   { label: 'Trung bình', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  high:     { label: 'Cao',        className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  critical: { label: 'Khẩn cấp',  className: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

// Cho phép người có quyền đặt lại BẤT KỲ trạng thái nào (thoát ngõ cụt completed/rejected/closed).
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'submitted',   label: 'Đã gửi' },
  { value: 'in_progress', label: 'Đang xử lý' },
  { value: 'completed',   label: 'Đã hoàn thành' },
  { value: 'rejected',    label: 'Từ chối' },
  { value: 'closed',      label: 'Đóng' },
];

export default function TicketDetailHeader({
  ticket, onClose, userRole, userId, onStatusChange, onReassign, onToggleSidebar, sidebarOpen,
}: TicketDetailHeaderProps) {
  const [changing, setChanging] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const canAct = userRole === 'super_admin' || userRole === 'admin' || ticket.assigned_to === userId;
  const priorityCfg = PRIORITY_CONFIG[ticket.priority] ?? { label: ticket.priority, className: 'bg-muted text-muted-foreground border-border' };

  const rawStatus = ticket.status;
  const status: TicketStatus = rawStatus === 'open' ? 'submitted'
    : rawStatus === 'resolved' ? 'completed'
    : rawStatus === 'pending' ? 'submitted'
    : rawStatus as TicketStatus;

  const doChange = async (newStatus: string, reason?: string) => {
    setChanging(newStatus);
    try { await onStatusChange(newStatus, reason); }
    finally { setChanging(null); }
  };

  const handleRejectConfirm = async (reason: string) => {
    setShowRejectDialog(false);
    await doChange('rejected', reason);
  };

  // Đổi trạng thái tự do qua dropdown. 'rejected' đi qua dialog nhập lý do.
  const selectStatus = (s: string) => {
    setShowStatusMenu(false);
    if (s === status) return;
    if (s === 'rejected') { setShowRejectDialog(true); return; }
    doChange(s);
  };

  const handleReassignConfirm = async (newUserId: string, newUserName: string, note: string) => {
    setShowReassignDialog(false);
    setChanging('reassign');
    try { await onReassign(newUserId, newUserName, note); }
    finally { setChanging(null); }
  };

  const renderActions = () => {
    if (!canAct) return null;
    switch (status) {
      case 'submitted':
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => doChange('in_progress')} disabled={!!changing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo text-white text-xs font-semibold rounded-lg hover:bg-indigo/90 disabled:opacity-50 transition-colors">
              {changing === 'in_progress' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Tiếp nhận & xử lý</span>
              <span className="sm:hidden">Tiếp nhận</span>
            </button>
            <button onClick={() => setShowReassignDialog(true)} disabled={!!changing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/25 text-xs font-semibold rounded-lg hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
              {changing === 'reassign' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Chuyển ticket</span>
              <span className="sm:hidden">Chuyển</span>
            </button>
            <button onClick={() => setShowRejectDialog(true)} disabled={!!changing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/25 text-xs font-semibold rounded-lg hover:bg-red-500/20 disabled:opacity-50 transition-colors">
              {changing === 'rejected' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>Từ chối</span>
            </button>
          </div>
        );
      case 'in_progress':
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => doChange('completed')} disabled={!!changing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-xs font-semibold rounded-lg hover:bg-emerald-500/25 disabled:opacity-50 transition-colors">
              {changing === 'completed' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Đánh dấu hoàn thành</span>
              <span className="sm:hidden">Hoàn thành</span>
            </button>
            <button onClick={() => setShowReassignDialog(true)} disabled={!!changing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/25 text-xs font-semibold rounded-lg hover:bg-amber-500/20 disabled:opacity-50 transition-colors">
              {changing === 'reassign' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Chuyển ticket</span>
              <span className="sm:hidden">Chuyển</span>
            </button>
            <button onClick={() => setShowRejectDialog(true)} disabled={!!changing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/25 text-xs font-semibold rounded-lg hover:bg-red-500/20 disabled:opacity-50 transition-colors">
              {changing === 'rejected' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>Từ chối</span>
            </button>
          </div>
        );
      case 'completed':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl w-fit">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-semibold">Ticket đã hoàn thành · Tự đóng sau 3 ngày</span>
          </div>
        );
      case 'rejected':
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl w-fit">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 font-semibold">Ticket đã từ chối · Tự đóng sau 3 ngày</span>
            </div>
            {ticket.rejection_reason && (
              <p className="text-xs text-muted-foreground px-1">
                Lý do: <span className="text-foreground">{ticket.rejection_reason}</span>
              </p>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="border-b border-border bg-card flex-shrink-0">
        <div className="px-5 py-4 space-y-3">
          {/* Row 1: code + title + close */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-indigo tracking-widest uppercase">{ticket.code}</span>
              <h2 className="mt-0.5 text-lg font-semibold text-foreground leading-snug">{ticket.title}</h2>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 mt-1">
              {/* Nút mở sidebar — chỉ hiện trên mobile */}
              <button
                onClick={onToggleSidebar}
                className={`md:hidden p-2 rounded-lg transition-colors ${sidebarOpen ? 'text-indigo bg-indigo/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                title="Chi tiết"
              >
                <PanelRight className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Row 2: meta badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg font-semibold border ${priorityCfg.className}`}>
              {priorityCfg.label}
            </span>
            <span className="text-border select-none">·</span>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Tag className="w-3 h-3" /><span>{ticket.asset_name || 'N/A'}</span>
            </div>
            <span className="text-border select-none">·</span>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <User className="w-3 h-3" /><span>{ticket.created_by_name}</span>
            </div>
          </div>

          {/* Row 3: Status flow */}
          <StatusFlow currentStatus={status} />

          {/* Row 4: Action buttons + đổi trạng thái tự do */}
          {canAct && (
            <div className="flex items-center gap-2 flex-wrap">
              {renderActions()}
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu((v) => !v)}
                  disabled={!!changing}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Đổi trạng thái</span>
                  <span className="sm:hidden">Trạng thái</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showStatusMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                    <div className="absolute left-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-card shadow-lg overflow-hidden py-1">
                      {STATUS_OPTIONS.map((opt) => {
                        const isCurrent = opt.value === status;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => selectStatus(opt.value)}
                            disabled={isCurrent || !!changing}
                            className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                              isCurrent ? 'text-muted-foreground/50 cursor-default' : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            {opt.label}
                            {isCurrent && <span className="text-2xs text-muted-foreground">Hiện tại</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showRejectDialog && (
        <RejectDialog ticketCode={ticket.code} onConfirm={handleRejectConfirm} onCancel={() => setShowRejectDialog(false)} />
      )}
      {showReassignDialog && (
        <ReassignDialog ticketCode={ticket.code} currentAssignedId={ticket.assigned_to} userId={userId} onConfirm={handleReassignConfirm} onCancel={() => setShowReassignDialog(false)} />
      )}
    </>
  );
}
