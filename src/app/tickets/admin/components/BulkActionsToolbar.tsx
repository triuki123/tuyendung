'use client';

import React, { useState } from 'react';
import { Trash2, CheckCircle2, Clock, RotateCw, Loader2 } from 'lucide-react';
import { useConfirm } from '@/context/ConfirmContext';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onChangeStatus: (status: string) => Promise<void>;
  onReassign: (userId: string) => Promise<void>;
  onDelete: () => Promise<void>;
  users: any[];
  isLoading?: boolean;
}

export default function BulkActionsToolbar({
  selectedCount,
  onChangeStatus,
  onReassign,
  onDelete,
  users,
  isLoading = false,
}: BulkActionsToolbarProps) {
  const confirm = useConfirm();
  const [showReassignMenu, setShowReassignMenu] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (selectedCount === 0) return null;

  const handleChangeStatus = async (status: string) => {
    setIsProcessing(true);
    try {
      await onChangeStatus(status);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReassign = async (userId: string) => {
    setIsProcessing(true);
    try {
      await onReassign(userId);
      setShowReassignMenu(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({ title: 'Xóa ticket?', message: `Xác nhận xóa ${selectedCount} ticket?`, confirmLabel: 'Xóa', danger: true });
    if (!ok) return;
    setIsProcessing(true);
    try {
      await onDelete();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="sticky bottom-0 left-0 right-0 px-6 py-4 bg-gradient-to-t from-[#0f172a] to-[#0f172a]/80 border-t border-line flex items-center gap-3">
      {/* Info */}
      <div className="flex-1">
        <p className="text-sm font-500 text-foreground">
          ✓ {selectedCount} ticket được chọn
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Change Status */}
        <div className="flex gap-1.5">
          <button
            onClick={() => handleChangeStatus('in_progress')}
            disabled={isProcessing}
            className="h-9 px-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5 text-xs font-500 disabled:opacity-50"
            title="Chuyển sang Đang xử lý"
          >
            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
            <span className="hidden sm:inline">Xử lý</span>
          </button>

          <button
            onClick={() => handleChangeStatus('resolved')}
            disabled={isProcessing}
            className="h-9 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5 text-xs font-500 disabled:opacity-50"
            title="Chuyển sang Đã giải quyết"
          >
            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            <span className="hidden sm:inline">Xong</span>
          </button>

          <button
            onClick={() => handleChangeStatus('closed')}
            disabled={isProcessing}
            className="h-9 px-3 rounded-lg bg-slate-500/10 border border-slate-500/30 text-ink-muted hover:bg-slate-500/20 transition-colors flex items-center gap-1.5 text-xs font-500 disabled:opacity-50"
            title="Đóng"
          >
            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
            <span className="hidden sm:inline">Đóng</span>
          </button>
        </div>

        {/* Reassign Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowReassignMenu(!showReassignMenu)}
            disabled={isProcessing}
            className="h-9 px-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 transition-colors text-xs font-500 disabled:opacity-50"
          >
            👤 Giao cho
          </button>

          {showReassignMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-48 max-h-64 overflow-y-auto rounded-lg bg-[#1a2332] border border-line shadow-lg z-10">
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleReassign(user.id)}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-hover transition-colors disabled:opacity-50"
                >
                  {user.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={isProcessing}
          className="h-9 px-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5 text-xs font-500 disabled:opacity-50"
          title="Xóa các ticket đã chọn"
        >
          {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          <span className="hidden sm:inline">Xóa</span>
        </button>
      </div>
    </div>
  );
}
