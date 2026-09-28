'use client';

import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { FilterCriteria } from './FilterBuilder';

interface SearchResultsIndicatorProps {
  totalItems: number;
  filteredItems: number;
  appliedFilters: FilterCriteria[];
  searchQuery?: string;
  onResetFilters: () => void;
  onResetSearch?: () => void;
}

export default function SearchResultsIndicator({
  totalItems,
  filteredItems,
  appliedFilters,
  searchQuery,
  onResetFilters,
  onResetSearch,
}: SearchResultsIndicatorProps) {
  const hasFilters = appliedFilters.length > 0 || searchQuery;

  if (!hasFilters) {
    return null;
  }

  const itemsHidden = totalItems - filteredItems;
  const filterPercentage = totalItems > 0 ? Math.round((filteredItems / totalItems) * 100) : 0;

  return (
    <div className="rounded-2xl border border-white/05 p-4 bg-indigo-500/5 border-indigo-500/20">
      {/* Header with stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-4">
          {/* Results counter */}
          <div>
            <p className="text-sm text-muted-foreground">Kết quả lọc</p>
            <p className="text-lg font-700 text-foreground">
              {filteredItems} <span className="text-xs text-muted-foreground font-500">/ {totalItems}</span>
            </p>
          </div>

          {/* Hidden items indicator */}
          {itemsHidden > 0 && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Ẩn</p>
              <p className="text-lg font-700 text-orange-400">{itemsHidden}</p>
            </div>
          )}

          {/* Filter percentage bar */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full bg-hover-strong overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all"
                style={{ width: `${filterPercentage}%` }}
              />
            </div>
            <span className="text-2xs text-muted-foreground font-500 tabular-nums min-w-[28px]">{filterPercentage}%</span>
          </div>
        </div>

        {/* Reset button */}
        <button
          onClick={() => {
            onResetFilters();
            onResetSearch?.();
          }}
          className="flex items-center gap-2 h-8 px-3 rounded-lg text-sm font-500 text-muted-foreground hover:text-foreground hover:bg-hover-strong transition-colors"
          title="Xóa tất cả bộ lọc"
        >
          <RotateCcw size={14} />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Applied filters list */}
      {appliedFilters.length > 0 && (
        <div className="space-y-2 border-t border-white/05 pt-3">
          <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground/60">Bộ lọc đang áp dụng</p>

          <div className="flex flex-wrap gap-2">
            {appliedFilters.map((filter, idx) => (
              <div
                key={idx}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-2xs font-500 bg-hover border border-line text-foreground"
              >
                <span className="text-muted-foreground">{filter.field}:</span>
                <span className="font-600">{filter.operator}</span>
                <span className="text-indigo-300">{String(filter.value).substring(0, 20)}{String(filter.value).length > 20 ? '...' : ''}</span>
                {filter.logic && idx > 0 && (
                  <span className="text-2xs ml-1 px-1.5 rounded bg-hover-strong text-muted-foreground">
                    {filter.logic}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search query indicator */}
      {searchQuery && (
        <div className="space-y-2 border-t border-white/05 pt-3 mt-3">
          <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground/60">Tìm kiếm</p>
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-2xs font-500 bg-hover border border-line text-foreground">
            <span className="text-emerald-300 font-600">"{searchQuery}"</span>
          </div>
        </div>
      )}
    </div>
  );
}
