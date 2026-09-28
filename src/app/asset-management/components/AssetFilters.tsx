'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import { AssetStatus } from '@/lib/mockData';
import { FilterState } from './AssetManagementClient';

interface AssetFiltersProps {
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
  categories: string[];
  statuses: { value: AssetStatus; label: string }[];
  companies: string[];
  onReset: () => void;
}

export default function AssetFilters({
  filters, onFilterChange, categories, statuses, companies, onReset,
}: AssetFiltersProps) {
  const update = (key: keyof FilterState, value: string) =>
    onFilterChange({ ...filters, [key]: value });

  const hasActiveFilters = filters.category || filters.status || filters.department || filters.search;

  return (
    <div
      className="rounded-2xl border border-white/08 p-4 slide-up"
      style={{ background: 'var(--card)' }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-3">
        {/* Search */}
        <div className="relative sm:col-span-2 lg:flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm theo mã, tên, serial, người dùng..."
            value={filters.search}
            onChange={e => update('search', e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-xl text-sm bg-surface-2 border border-white/08 text-foreground placeholder:text-ink-faint focus:outline-none focus:border-indigo/50 transition-all"
          />
        </div>

        {/* Category */}
        <select
          value={filters.category}
          onChange={e => update('category', e.target.value)}
          className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-white/08 text-foreground focus:outline-none focus:border-indigo/50 transition-all lg:min-w-[140px]"
        >
          <option value="">Tất cả loại</option>
          {categories.map(c => (
            <option key={`cat-opt-${c}`} value={c}>{c}</option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={e => update('status', e.target.value)}
          className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-white/08 text-foreground focus:outline-none focus:border-indigo/50 transition-all lg:min-w-[140px]"
        >
          <option value="">Tất cả trạng thái</option>
          {statuses.map(s => (
            <option key={`status-opt-${s.value}`} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Company */}
        <select
          value={filters.department}
          onChange={e => update('department', e.target.value)}
          className="h-9 px-3 rounded-xl text-sm bg-surface-2 border border-white/08 text-foreground focus:outline-none focus:border-indigo/50 transition-all sm:col-span-2 lg:col-auto lg:min-w-[160px]"
        >
          <option value="">Tất cả công ty</option>
          {companies.map(c => (
            <option key={`company-opt-${c}`} value={c}>{c}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors border border-red-500/20 shrink-0 sm:col-span-2 lg:col-auto"
          >
            <X size={14} />
            Xóa lọc
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-muted-foreground">Đang lọc:</span>
          {filters.search && (
            <span className="flex items-center gap-1 text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 rounded-full px-2.5 py-0.5">
              Tìm: "{filters.search}"
              <button onClick={() => update('search', '')} className="hover:text-white"><X size={11} /></button>
            </span>
          )}
          {filters.category && (
            <span className="flex items-center gap-1 text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 rounded-full px-2.5 py-0.5">
              {filters.category}
              <button onClick={() => update('category', '')} className="hover:text-white"><X size={11} /></button>
            </span>
          )}
          {filters.status && (
            <span className="flex items-center gap-1 text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 rounded-full px-2.5 py-0.5">
              {statuses.find(s => s.value === filters.status)?.label}
              <button onClick={() => update('status', '')} className="hover:text-white"><X size={11} /></button>
            </span>
          )}
          {filters.department && (
            <span className="flex items-center gap-1 text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 rounded-full px-2.5 py-0.5">
              {filters.department}
              <button onClick={() => update('department', '')} className="hover:text-white"><X size={11} /></button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
