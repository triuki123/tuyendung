'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface UsersPaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function UsersPagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: UsersPaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handleFirstPage = () => onPageChange(1);
  const handlePrevPage = () => onPageChange(Math.max(1, currentPage - 1));
  const handleNextPage = () => onPageChange(Math.min(totalPages, currentPage + 1));
  const handleLastPage = () => onPageChange(totalPages);

  const getVisiblePages = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        endPage = 4;
      }
      if (currentPage >= totalPages - 2) {
        startPage = totalPages - 3;
      }

      if (startPage > 2) {
        pages.push('...');
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (endPage < totalPages - 1) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pt-4 border-t border-line">
      {/* Items per page selector */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-2xs sm:text-xs text-muted-foreground whitespace-nowrap">Hiển thị:</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="h-8 sm:h-9 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
        <span className="text-2xs sm:text-xs text-muted-foreground whitespace-nowrap">trên trang</span>
      </div>

      {/* Page info */}
      <div className="text-2xs sm:text-xs text-muted-foreground text-center sm:text-left">
        <span>
          {startItem}–{endItem} / {totalItems}
        </span>
      </div>

      {/* Page navigation */}
      <div className="flex items-center justify-center sm:justify-end gap-1">
        {/* First page button */}
        <button
          onClick={handleFirstPage}
          disabled={currentPage === 1 || totalPages === 0}
          className="p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] min-w-[40px] flex items-center justify-center"
          title="Trang đầu"
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Previous page button */}
        <button
          onClick={handlePrevPage}
          disabled={currentPage === 1 || totalPages === 0}
          className="p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] min-w-[40px] flex items-center justify-center"
          title="Trang trước"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-0.5">
          {getVisiblePages().map((page, index) => {
            if (page === '...') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="text-muted-foreground text-2xs sm:text-xs px-1 sm:px-2"
                >
                  …
                </span>
              );
            }

            const pageNum = Number(page);
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`h-8 sm:h-9 min-w-[32px] sm:min-w-[36px] rounded-lg text-2xs sm:text-xs font-600 transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'text-muted-foreground hover:bg-hover-strong hover:text-foreground'
                }`}
                disabled={totalPages === 0}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next page button */}
        <button
          onClick={handleNextPage}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] min-w-[40px] flex items-center justify-center"
          title="Trang sau"
        >
          <ChevronRight size={16} />
        </button>

        {/* Last page button */}
        <button
          onClick={handleLastPage}
          disabled={currentPage === totalPages || totalPages === 0}
          className="p-2 rounded-lg hover:bg-hover-strong transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] min-w-[40px] flex items-center justify-center"
          title="Trang cuối"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
