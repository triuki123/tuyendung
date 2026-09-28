'use client';

/**
 * Phân trang danh sách CHUẨN toàn hệ thống: chọn cỡ trang 10/20/30/50/100 +
 * điều hướng trang (đầu/trước/số/…/sau/cuối) + "x–y / tổng".
 * Dùng kèm hook usePagedList (cắt trang client-side) hoặc tự quản state.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export const PAGE_SIZES = [10, 20, 30, 50, 100] as const;

interface ListPaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Tuỳ biến cỡ trang nếu danh sách đặc thù (mặc định 10/20/30/50/100). */
  pageSizes?: readonly number[];
}

/**
 * Hook cắt trang client-side: trả về items của trang hiện tại + props cho <ListPagination>.
 * Tự quay về trang 1 khi danh sách đổi (lọc/tab) hoặc trang hiện tại vượt tổng số trang.
 */
export function usePagedList<T>(items: T[], defaultPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);
  const paged = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  const resetPage = useCallback(() => setPage(1), []);
  return {
    paged,
    resetPage,
    paginationProps: {
      currentPage: Math.min(page, totalPages), pageSize, totalItems: items.length,
      onPageChange: setPage, onPageSizeChange: setPageSize,
    },
  };
}

export default function ListPagination({
  currentPage, pageSize, totalItems, onPageChange, onPageSizeChange, pageSizes = PAGE_SIZES,
}: ListPaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalItems <= Math.min(...pageSizes)) return null; // ít hơn cỡ trang nhỏ nhất → khỏi phân trang

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const getVisiblePages = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    let startPage = Math.max(2, currentPage - 1);
    let endPage = Math.min(totalPages - 1, currentPage + 1);
    if (currentPage <= 3) endPage = 4;
    if (currentPage >= totalPages - 2) startPage = totalPages - 3;
    if (startPage > 2) pages.push('...');
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    if (endPage < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const navBtn = 'p-2 rounded-lg hover:bg-hover transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] min-w-[36px] flex items-center justify-center';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-white/5">
      <div className="flex items-center gap-2">
        <span className="text-2xs sm:text-xs text-muted-foreground whitespace-nowrap">Hiển thị:</span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          className="h-8 px-2 rounded-lg text-2xs sm:text-xs text-foreground bg-[#162033] border border-white/10 focus:outline-none focus:border-indigo-500"
        >
          {pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-2xs sm:text-xs text-muted-foreground whitespace-nowrap">/ trang · {startItem}–{endItem} trên {totalItems}</span>
      </div>

      <div className="flex items-center justify-center sm:justify-end gap-1">
        <button onClick={() => onPageChange(1)} disabled={currentPage === 1} className={navBtn} title="Trang đầu"><ChevronsLeft size={15} /></button>
        <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className={navBtn} title="Trang trước"><ChevronLeft size={15} /></button>
        <div className="flex items-center gap-0.5">
          {getVisiblePages().map((p, i) => p === '...' ? (
            <span key={`e-${i}`} className="text-muted-foreground text-2xs px-1.5">…</span>
          ) : (
            <button key={p} onClick={() => onPageChange(Number(p))}
              className={`h-8 min-w-[32px] rounded-lg text-2xs sm:text-xs font-600 transition-colors ${
                Number(p) === currentPage ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-hover hover:text-foreground'}`}>
              {p}
            </button>
          ))}
        </div>
        <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className={navBtn} title="Trang sau"><ChevronRight size={15} /></button>
        <button onClick={() => onPageChange(totalPages)} disabled={currentPage >= totalPages} className={navBtn} title="Trang cuối"><ChevronsRight size={15} /></button>
      </div>
    </div>
  );
}
