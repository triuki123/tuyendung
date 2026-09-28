'use client';

import React, { useState, useEffect } from 'react';
import { X, History, Package, ArrowRight, CheckCircle, Wrench, AlertTriangle, ArchiveX, ArrowLeftRight, Loader2 } from 'lucide-react';
import { Asset, formatDate } from '@/lib/mockData';
import StatusBadge from '@/components/ui/StatusBadge';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface HistoryEntry {
  id: string;
  date: string;
  action: string;
  performedBy: string;
  note: string;
}

interface AssetHistoryDrawerProps {
  asset: Asset;
  onClose: () => void;
}

function getActionIcon(action: string) {
  if (action.includes('Nhập kho') || action.includes('Triển khai')) return <Package size={14} className="text-emerald-400" />;
  if (action.includes('Phân bổ')) return <ArrowRight size={14} className="text-indigo-400" />;
  if (action.includes('Bảo trì')) return <Wrench size={14} className="text-amber-400" />;
  if (action.includes('Hỏng') || action.includes('Báo hỏng')) return <AlertTriangle size={14} className="text-red-400" />;
  if (action.includes('Thanh lý')) return <ArchiveX size={14} className="text-ink-muted" />;
  if (action.includes('Thu hồi')) return <ArrowLeftRight size={14} className="text-orange-400" />;
  return <CheckCircle size={14} className="text-blue-400" />;
}

function getActionColor(action: string): string {
  if (action.includes('Nhập kho') || action.includes('Triển khai')) return 'bg-emerald-500/15 border-emerald-500/30';
  if (action.includes('Phân bổ')) return 'bg-indigo-500/15 border-indigo-500/30';
  if (action.includes('Bảo trì')) return 'bg-amber-500/15 border-amber-500/30';
  if (action.includes('Hỏng') || action.includes('Báo hỏng')) return 'bg-red-500/15 border-red-500/30';
  if (action.includes('Thanh lý')) return 'bg-slate-500/15 border-slate-500/30';
  return 'bg-blue-500/15 border-blue-500/30';
}

export default function AssetHistoryDrawer({ asset, onClose }: AssetHistoryDrawerProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(onClose);

  useEffect(() => {
    fetchHistory();
  }, [asset.id]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/assets/${asset.id}/history`);
      if (!response.ok) throw new Error('Failed to fetch history');
      const result = await response.json();
      setHistory(result.data || []);
    } catch (err) {
      console.error('Error fetching asset history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
      // Fall back to mock data if API fails
      setHistory(asset.history || []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full sm:max-w-md h-full flex flex-col border-l border-white/08 slide-up"
        style={{ background: 'var(--primary)', boxShadow: '-8px 0 40px rgba(0,0,0,0.5)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-white/08 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/15">
              <History size={18} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-700 text-foreground">Lịch Sử Tài Sản</h3>
              <p className="text-xs text-muted-foreground">{asset.code}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl btn-ghost text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Asset summary */}
        <div className="px-4 sm:px-6 py-4 border-b border-white/05 shrink-0" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-sm font-600 text-foreground mb-1">{asset.name}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={asset.status} size="sm" />
            <span className="text-xs text-muted-foreground">{asset.brand} · {asset.model}</span>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>Mua: {formatDate(asset.purchaseDate)}</span>
            <span>BH đến: {formatDate(asset.warrantyExpiry)}</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-indigo-400 mb-3" />
              <p className="text-sm text-muted-foreground">Đang tải lịch sử...</p>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              Lỗi: {error}
            </div>
          ) : (
            <>
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-4">
                {history.length} sự kiện
              </p>

              {history.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <History size={32} className="text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Chưa có lịch sử nào</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/08" />

                  <div className="space-y-4">
                    {[...history].reverse().map((entry, i) => (
                      <div key={`hist-${entry.id}`} className="flex gap-4 relative">
                        {/* Icon */}
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 z-10 ${getActionColor(entry.action)}`}
                          style={{ background: 'var(--card)' }}>
                          {getActionIcon(entry.action)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pb-4">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-600 text-foreground">{entry.action}</span>
                            <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
                              {new Date(entry.date).toLocaleString('vi-VN')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{entry.note}</p>
                          <p className="text-2xs text-muted-foreground/60 mt-1">
                            Thực hiện bởi: <span className="text-muted-foreground">{entry.performedBy}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-white/08 shrink-0">
          <button
            onClick={onClose}
            className="w-full h-10 rounded-xl btn-ghost text-sm font-600"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}