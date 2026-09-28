'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Edit2, Trash2, History, QrCode, Eye,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { Asset, MockUser } from '@/lib/mockData';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatVND, formatDate } from '@/lib/mockData';

interface AssetTableProps {
  assets: Asset[];
  allAssets: Asset[];
  selectedIds: Set<string>;
  sortCol: keyof Asset;
  sortDir: 'asc' | 'desc';
  onSort: (col: keyof Asset) => void;
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onEdit: (a: Asset) => void;
  onDelete: (a: Asset) => void;
  onHistory: (a: Asset) => void;
  onQR: (a: Asset) => void;
  onView: (a: Asset) => void;
  page: number;
  perPage: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (p: number) => void;
  onPerPageChange: (v: number) => void;
  currentUser?: MockUser | null;
  visibleCols?: Set<string>;
}

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: string }) {
  if (sortCol !== col) return <ArrowUpDown size={13} className="text-muted-foreground/40" />;
  return sortDir === 'asc'
    ? <ArrowUp size={13} className="text-indigo-400" />
    : <ArrowDown size={13} className="text-indigo-400" />;
}

export const ALL_COLUMNS: { key: keyof Asset; label: string; sortable?: boolean; defaultWidth: number; required?: boolean }[] = [
  { key: 'code',           label: 'Mã Tài Sản',  sortable: true,  defaultWidth: 140, required: true },
  { key: 'name',           label: 'Tên Tài Sản',  sortable: true,  defaultWidth: 200, required: true },
  { key: 'category',       label: 'Loại',         sortable: true,  defaultWidth: 120 },
  { key: 'brand',          label: 'Hãng',         sortable: true,  defaultWidth: 90  },
  { key: 'serialNumber',   label: 'Serial',       sortable: false, defaultWidth: 150 },
  { key: 'status',         label: 'Trạng Thái',   sortable: true,  defaultWidth: 120, required: true },
  { key: 'assignedToName', label: 'Người Dùng',   sortable: true,  defaultWidth: 160 },
  { key: 'company',        label: 'Công ty',      sortable: true,  defaultWidth: 150 },
  { key: 'purchaseDate',   label: 'Ngày Mua',     sortable: true,  defaultWidth: 110 },
  { key: 'value',          label: 'Giá Trị',      sortable: true,  defaultWidth: 130 },
];

const COL_WIDTHS_KEY = 'asset_table_col_widths';
const MIN_COL_WIDTH = 60;

const CELL: Record<string, (asset: Asset) => React.ReactNode> = {
  code: (a) => (
    <span className="font-mono text-xs font-600 text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-lg">
      {a.code}
    </span>
  ),
  name: (a) => (
    <div>
      <p className="font-500 text-foreground truncate">{a.name}</p>
      <p className="text-xs text-muted-foreground">{a.model}</p>
    </div>
  ),
  category: (a) => (
    <span className="text-xs font-500 text-muted-foreground bg-white/05 border border-white/08 rounded-lg px-2 py-1">
      {a.categoryName || a.category}
    </span>
  ),
  brand: (a) => <span className="text-sm text-foreground">{a.brand}</span>,
  serialNumber: (a) => <span className="font-mono text-xs text-muted-foreground">{a.serialNumber}</span>,
  status: (a) => <StatusBadge status={a.status} size="sm" />,
  assignedToName: (a) => a.assignedToName ? (
    <div className="flex items-center gap-2">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-2xs font-700 text-white shrink-0"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
      >
        {a.assignedToName.split(' ').pop()?.charAt(0) ?? '?'}
      </div>
      <span className="text-sm text-foreground truncate">{a.assignedToName}</span>
    </div>
  ) : (
    <span className="text-xs text-muted-foreground/60 italic">Chưa phân bổ</span>
  ),
  company: (a) => (
    <span className="text-sm text-muted-foreground truncate block">
      {a.companyName || a.company}
    </span>
  ),
  purchaseDate: (a) => (
    <span className="text-sm text-muted-foreground tabular-nums">{formatDate(a.purchaseDate)}</span>
  ),
  value: (a) => (
    <span className="text-sm font-600 text-foreground tabular-nums">{formatVND(a.value)}</span>
  ),
};

export default function AssetTable({
  assets, allAssets, selectedIds, sortCol, sortDir, onSort,
  onSelectAll, onSelectOne, onEdit, onDelete, onHistory, onQR, onView,
  page, perPage, totalPages, totalCount, onPageChange, onPerPageChange,
  currentUser, visibleCols,
}: AssetTableProps) {
  const allSelected = assets.length > 0 && assets.every(a => selectedIds.has(a.id));
  const someSelected = assets.some(a => selectedIds.has(a.id)) && !allSelected;

  const pageNumbers: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  const columns = visibleCols
    ? ALL_COLUMNS.filter(c => visibleCols.has(c.key as string))
    : ALL_COLUMNS;

  // ── Column widths ──────────────────────────────────────────────────────────
  const defaultWidths = () => {
    const m: Record<string, number> = {};
    ALL_COLUMNS.forEach(c => { m[c.key as string] = c.defaultWidth; });
    return m;
  };

  const [colWidths, setColWidths] = useState<Record<string, number>>(defaultWidths);

  // Load từ localStorage sau khi mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COL_WIDTHS_KEY);
      if (saved) {
        const parsed: Record<string, number> = JSON.parse(saved);
        setColWidths(prev => ({ ...prev, ...parsed }));
      }
    } catch { /* bỏ qua */ }
  }, []);

  // ── Resize drag logic ──────────────────────────────────────────────────────
  const dragging = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = { key, startX: e.clientX, startWidth: colWidths[key] ?? 120 };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const { key: dragKey, startX, startWidth } = dragging.current;
      const delta = ev.clientX - startX;
      const newW = Math.max(MIN_COL_WIDTH, startWidth + delta);
      setColWidths(prev => ({ ...prev, [dragKey]: newW }));
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      // Lưu ngay khi thả chuột
      setColWidths(prev => {
        try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(prev)); } catch { /* bỏ qua */ }
        return prev;
      });
      dragging.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colWidths]);

  return (
    <div
      className="rounded-2xl border border-white/05 overflow-hidden"
      style={{ background: 'var(--card)' }}
    >
      {/* Mobile card list (< md) */}
      <div className="md:hidden divide-y divide-white/05">
        {assets.length === 0 ? (
          <div className="px-4 py-14 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/05">
              <Eye size={28} className="text-muted-foreground/40" />
            </div>
            <p className="text-sm font-600 text-muted-foreground text-center">Không tìm thấy tài sản nào</p>
            <p className="text-xs text-muted-foreground/60 max-w-xs text-center">
              Thử thay đổi bộ lọc hoặc thêm tài sản mới vào hệ thống
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/05" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={e => onSelectAll(e.target.checked)}
                className="w-4 h-4 rounded border-line-strong accent-indigo"
              />
              <span className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">Chọn tất cả</span>
            </div>
            {assets.map(asset => (
              <div
                key={`mcard-${asset.id}`}
                className={`p-4 ${selectedIds.has(asset.id) ? 'bg-indigo-500/05' : ''} ${asset.status === 'broken' ? 'bg-red-500/03' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(asset.id)}
                    onChange={e => onSelectOne(asset.id, e.target.checked)}
                    className="w-4 h-4 rounded border-line-strong accent-indigo mt-1 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-mono text-2xs font-600 text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md shrink-0">
                        {asset.code}
                      </span>
                      <StatusBadge status={asset.status} size="sm" />
                    </div>
                    <p className="font-500 text-foreground text-sm">{asset.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{asset.brand} · {asset.model}</p>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-xs">
                      <div>
                        <p className="text-muted-foreground/60 text-2xs">Loại</p>
                        <p className="text-foreground truncate">{asset.categoryName || asset.category}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground/60 text-2xs">Serial</p>
                        <p className="text-muted-foreground font-mono text-2xs truncate">{asset.serialNumber}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground/60 text-2xs">Người dùng</p>
                        <p className="text-foreground truncate">{asset.assignedToName ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground/60 text-2xs">Phòng ban</p>
                        <p className="text-muted-foreground truncate">{asset.departmentName || asset.department}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground/60 text-2xs">Ngày mua</p>
                        <p className="text-muted-foreground tabular-nums">{formatDate(asset.purchaseDate)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground/60 text-2xs">Giá trị</p>
                        <p className="text-foreground font-600 tabular-nums">{formatVND(asset.value)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-3">
                      <ActionButton onClick={() => onView(asset)} title="Xem lý lịch tài sản" icon={<Eye size={15} />} color="text-emerald-300 hover:bg-emerald-500/25 bg-emerald-500/10" />
                      <ActionButton onClick={() => onQR(asset)} title="Xem QR Code" icon={<QrCode size={15} />} color="text-indigo-300 hover:bg-indigo-500/25 bg-indigo-500/10" />
                      <ActionButton onClick={() => onHistory(asset)} title="Xem lịch sử tài sản" icon={<History size={15} />} color="text-blue-300 hover:bg-blue-500/25 bg-blue-500/10" />
                      <ActionButton onClick={() => onEdit(asset)} title="Chỉnh sửa tài sản" icon={<Edit2 size={15} />} color="text-amber-300 hover:bg-amber-500/25 bg-amber-500/10" />
                      <ActionButton onClick={() => onDelete(asset)} title="Xóa tài sản" icon={<Trash2 size={15} />} color="text-red-300 hover:bg-red-500/25 bg-red-500/10" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Table (md+) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <ColGroup columns={columns} colWidths={colWidths} />

          <thead>
            <tr className="border-b border-white/08" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <th className="w-10 px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={e => onSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-line-strong accent-indigo"
                />
              </th>

              {columns.map(col => (
                <th
                  key={`th-${col.key}`}
                  className="px-4 py-3.5 text-left relative overflow-visible select-none"
                >
                  {col.sortable ? (
                    <button
                      onClick={() => onSort(col.key)}
                      className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      <span className="truncate">{col.label}</span>
                      <SortIcon col={col.key} sortCol={sortCol} sortDir={sortDir} />
                    </button>
                  ) : (
                    <span className="text-xs font-600 uppercase tracking-wider text-muted-foreground truncate block">
                      {col.label}
                    </span>
                  )}

                  {/* Resize handle */}
                  <div
                    onMouseDown={e => onResizeMouseDown(e, col.key as string)}
                    className="absolute right-0 top-0 h-full w-3 flex items-center justify-center cursor-col-resize group z-10"
                    title="Kéo để căn độ rộng cột"
                  >
                    <div className="w-px h-4 bg-white/15 group-hover:bg-indigo-400 group-hover:h-full transition-all" />
                  </div>
                </th>
              ))}

              <th className="px-4 py-3.5 text-xs font-600 uppercase tracking-wider text-muted-foreground text-right">
                Thao Tác
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/04">
            {assets.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/05">
                      <Eye size={28} className="text-muted-foreground/40" />
                    </div>
                    <p className="text-base font-600 text-muted-foreground">Không tìm thấy tài sản nào</p>
                    <p className="text-sm text-muted-foreground/60 max-w-xs">
                      Thử thay đổi bộ lọc hoặc thêm tài sản mới vào hệ thống
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              assets.map(asset => (
                <tr
                  key={`row-${asset.id}`}
                  className={`table-row-hover ${selectedIds.has(asset.id) ? 'bg-indigo-500/05' : ''} ${asset.status === 'broken' ? 'bg-red-500/03' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(asset.id)}
                      onChange={e => onSelectOne(asset.id, e.target.checked)}
                      className="w-4 h-4 rounded border-line-strong accent-indigo"
                    />
                  </td>

                  {columns.map(col => (
                    <td key={`cell-${asset.id}-${col.key}`} className="px-4 py-3 overflow-hidden">
                      {CELL[col.key]?.(asset) ?? null}
                    </td>
                  ))}

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <ActionButton onClick={() => onView(asset)} title="Xem lý lịch tài sản" icon={<Eye size={15} />} color="text-emerald-300 hover:bg-emerald-500/25 bg-emerald-500/10" />
                      <ActionButton onClick={() => onQR(asset)} title="Xem QR Code" icon={<QrCode size={15} />} color="text-indigo-300 hover:bg-indigo-500/25 bg-indigo-500/10" />
                      <ActionButton onClick={() => onHistory(asset)} title="Xem lịch sử tài sản" icon={<History size={15} />} color="text-blue-300 hover:bg-blue-500/25 bg-blue-500/10" />
                      <ActionButton onClick={() => onEdit(asset)} title="Chỉnh sửa tài sản" icon={<Edit2 size={15} />} color="text-amber-300 hover:bg-amber-500/25 bg-amber-500/10" />
                      <ActionButton onClick={() => onDelete(asset)} title="Xóa tài sản — không thể hoàn tác" icon={<Trash2 size={15} />} color="text-red-300 hover:bg-red-500/25 bg-red-500/10" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-5 py-3 sm:py-3.5 border-t border-white/05">
        <div className="flex flex-col xs:flex-row items-center gap-2 xs:gap-3 w-full sm:w-auto">
          <span className="text-2xs sm:text-xs text-muted-foreground text-center xs:text-left">
            {((page - 1) * perPage) + 1}–{Math.min(page * perPage, totalCount)} / {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-2xs sm:text-xs text-muted-foreground">Mỗi trang:</span>
            <select
              value={perPage}
              onChange={e => onPerPageChange(Number(e.target.value))}
              className="h-7 px-2 rounded-lg text-xs bg-surface-2 border border-white/08 text-foreground focus:outline-none"
            >
              {[10, 20, 50].map(v => (
                <option key={`pp-${v}`} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <PaginationBtn onClick={() => onPageChange(1)} disabled={page === 1} title="Trang đầu">
            <ChevronsLeft size={14} />
          </PaginationBtn>
          <PaginationBtn onClick={() => onPageChange(page - 1)} disabled={page === 1} title="Trang trước">
            <ChevronLeft size={14} />
          </PaginationBtn>

          {pageNumbers.map(n => (
            <button
              key={`page-${n}`}
              onClick={() => onPageChange(n)}
              className={`w-8 h-8 rounded-lg text-xs font-600 transition-all ${n === page ? 'btn-indigo' : 'btn-ghost'}`}
            >
              {n}
            </button>
          ))}

          <PaginationBtn onClick={() => onPageChange(page + 1)} disabled={page === totalPages} title="Trang sau">
            <ChevronRight size={14} />
          </PaginationBtn>
          <PaginationBtn onClick={() => onPageChange(totalPages)} disabled={page === totalPages} title="Trang cuối">
            <ChevronsRight size={14} />
          </PaginationBtn>
        </div>
      </div>
    </div>
  );
}

function ColGroup({ columns, colWidths }: {
  columns: typeof ALL_COLUMNS;
  colWidths: Record<string, number>;
}) {
  const cols = [
    { key: '__cb__', width: 44 },
    ...columns.map(c => ({ key: c.key as string, width: colWidths[c.key as string] ?? c.defaultWidth })),
    { key: '__act__', width: 136 },
  ];
  return (
    <colgroup>
      {cols.map(c => <col key={c.key} style={{ width: c.width }} />)}
    </colgroup>
  );
}

function ActionButton({ onClick, title, icon, color }: {
  onClick: () => void; title: string; icon: React.ReactNode; color: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all text-[rgba(226,226,228,1)] ${color}`}
    >
      {icon}
    </button>
  );
}

function PaginationBtn({ onClick, disabled, title, children }: {
  onClick: () => void; disabled: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
