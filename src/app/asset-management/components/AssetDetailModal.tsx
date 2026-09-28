'use client';

import React, { useEffect, useState } from 'react';
import {
  X, Package, Tag, Cpu, Hash, BadgeInfo, User, Building2, Network, MapPin,
  CalendarDays, ShieldCheck, Wallet, StickyNote, History, Loader2, Edit2, QrCode, ClipboardList,
} from 'lucide-react';
import { Asset, formatDate, formatVND } from '@/lib/mockData';
import StatusBadge from '@/components/ui/StatusBadge';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface HistoryEntry {
  id: string;
  date: string;
  action: string;
  performedBy: string;
  note: string;
}

interface AssetDetailModalProps {
  asset: Asset;
  onClose: () => void;
  onEdit?: (a: Asset) => void;
  onQR?: (a: Asset) => void;
  onInventory?: (a: Asset) => void;
}

/** Một dòng thông tin nhãn — giá trị trong dossier. */
function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value?: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '' ;
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-white/05 flex items-center justify-center shrink-0 text-muted-foreground mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className={`text-sm ${empty ? 'text-muted-foreground/40 italic' : 'text-foreground'} break-words`}>
          {empty ? '—' : value}
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-3 flex items-center gap-2">
        <span className="w-4 h-px bg-indigo-400/50" />
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">{children}</div>
    </div>
  );
}

/**
 * Lý lịch tài sản (read-only) — tương tự sơ yếu lý lịch người dùng:
 * gom toàn bộ thông tin tài sản theo nhóm + dòng thời gian lịch sử.
 */
export default function AssetDetailModal({ asset, onClose, onEdit, onQR, onInventory }: AssetDetailModalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  useEscapeKey(onClose);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingHistory(true);
        const res = await fetch(`/api/assets/${asset.id}/history`);
        const json = res.ok ? await res.json() : null;
        if (alive) setHistory(json?.data || []);
      } catch {
        if (alive) setHistory([]);
      } finally {
        if (alive) setLoadingHistory(false);
      }
    })();
    return () => { alive = false; };
  }, [asset.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-4 sm:pt-10 overflow-y-auto fade-in"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-2xl rounded-2xl sm:rounded-3xl border border-white/08 modal-entrance mb-6 sm:mb-10 overflow-hidden"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/08 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-500/15 shrink-0">
              <Package size={22} className="text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-700 text-foreground truncate">{asset.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-mono text-2xs font-600 text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                  {asset.code}
                </span>
                <StatusBadge status={asset.status} size="sm" />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl btn-ghost text-muted-foreground shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
          <Section title="Thông Tin Cơ Bản">
            <Field icon={<Tag size={14} />} label="Loại tài sản" value={asset.categoryName || asset.category} />
            <Field icon={<BadgeInfo size={14} />} label="Tình trạng" value={asset.condition} />
            <Field icon={<Cpu size={14} />} label="Hãng sản xuất" value={asset.brand} />
            <Field icon={<Cpu size={14} />} label="Model" value={asset.model} />
            <Field icon={<Hash size={14} />} label="Số serial" value={asset.serialNumber} />
          </Section>

          <Section title="Phân Bổ & Vị Trí">
            <Field icon={<User size={14} />} label="Người dùng" value={asset.assignedToName} />
            <Field icon={<Building2 size={14} />} label="Công ty" value={asset.companyName || asset.company} />
            <Field icon={<Network size={14} />} label="Phòng ban" value={asset.divisionName || asset.division} />
            <Field icon={<Network size={14} />} label="Bộ phận" value={asset.departmentName || asset.department} />
            <Field icon={<MapPin size={14} />} label="Vị trí" value={asset.location} />
          </Section>

          <Section title="Tài Chính & Bảo Hành">
            <Field icon={<CalendarDays size={14} />} label="Ngày mua" value={asset.purchaseDate ? formatDate(asset.purchaseDate) : null} />
            <Field icon={<ShieldCheck size={14} />} label="Hết hạn bảo hành" value={asset.warrantyExpiry ? formatDate(asset.warrantyExpiry) : null} />
            <Field icon={<Wallet size={14} />} label="Giá trị" value={asset.value != null ? formatVND(asset.value) : null} />
          </Section>

          {asset.notes && (
            <Section title="Ghi Chú">
              <div className="sm:col-span-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/05 flex items-center justify-center shrink-0 text-muted-foreground mt-0.5">
                    <StickyNote size={14} />
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{asset.notes}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Lịch sử */}
          <div>
            <p className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-3 flex items-center gap-2">
              <span className="w-4 h-px bg-indigo-400/50" />
              Lịch Sử Tài Sản
            </p>
            {loadingHistory ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                <Loader2 size={16} className="animate-spin" /> Đang tải lịch sử…
              </div>
            ) : history.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground/60 py-3">
                <History size={16} /> Chưa có lịch sử nào
              </div>
            ) : (
              <div className="relative pl-1">
                <div className="absolute left-[14px] top-1 bottom-1 w-px bg-white/08" />
                <div className="space-y-3">
                  {[...history].reverse().map(entry => (
                    <div key={`adh-${entry.id}`} className="flex gap-3 relative">
                      <div className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center shrink-0 z-10" style={{ background: 'var(--secondary)' }}>
                        <History size={12} className="text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-600 text-foreground">{entry.action}</span>
                          <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
                            {new Date(entry.date).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        {entry.note && <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>}
                        {entry.performedBy && (
                          <p className="text-2xs text-muted-foreground/60 mt-0.5">Bởi: {entry.performedBy}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-4 sm:px-6 py-4 border-t border-white/08">
          {onQR && (
            <button onClick={() => onQR(asset)} className="h-10 px-4 rounded-xl btn-ghost text-sm font-600 flex items-center gap-2">
              <QrCode size={15} /> QR
            </button>
          )}
          {onInventory && (
            <button onClick={() => onInventory(asset)} className="h-10 px-4 rounded-xl btn-ghost text-sm font-600 flex items-center gap-2">
              <ClipboardList size={15} /> Kiểm kê
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="h-10 px-4 rounded-xl btn-ghost text-sm font-600">Đóng</button>
          {onEdit && (
            <button
              onClick={() => onEdit(asset)}
              className="h-10 px-4 rounded-xl btn-accent text-sm font-600 flex items-center gap-2"
            >
              <Edit2 size={15} /> Chỉnh sửa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
