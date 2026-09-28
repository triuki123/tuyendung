'use client';

import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';

interface AdvancedFiltersProps {
  users: any[];
  supportCategories: string[];
  onFilterChange: (filters: FilterOptions) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export interface FilterOptions {
  dateFrom?: string;
  dateTo?: string;
  createdBy?: string;
  assignedTo?: string;
  supportCategory?: string;
  priority?: string;
  status?: string;
}

export default function AdvancedFilters({
  users,
  supportCategories,
  onFilterChange,
  isOpen,
  onToggle,
}: AdvancedFiltersProps) {
  const [filters, setFilters] = useState<FilterOptions>({});

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleReset = () => {
    setFilters({});
    onFilterChange({});
  };

  const activeFilterCount = Object.values(filters).filter(v => v).length;

  return (
    <div className="space-y-3">
      {/* Filter Toggle Button */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-hover border border-line hover:bg-hover-strong transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-500 text-foreground">🔍 Bộ Lọc Nâng Cao</span>
          {activeFilterCount > 0 && (
            <span className="text-2xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
              {activeFilterCount} active
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div className="p-4 rounded-lg bg-hover border border-line space-y-4">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-2xs font-600 text-muted-foreground block mb-1.5">
                Từ Ngày
              </label>
              <DateInputVN
                value={filters.dateFrom || ''}
                onChange={e => handleFilterChange('dateFrom', e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line"
              />
            </div>
            <div>
              <label className="text-2xs font-600 text-muted-foreground block mb-1.5">
                Đến Ngày
              </label>
              <DateInputVN
                value={filters.dateTo || ''}
                onChange={e => handleFilterChange('dateTo', e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line"
              />
            </div>
          </div>

          {/* Người Tạo */}
          <div>
            <label className="text-2xs font-600 text-muted-foreground block mb-1.5">
              Người Tạo
            </label>
            <select
              value={filters.createdBy || ''}
              onChange={e => handleFilterChange('createdBy', e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line"
            >
              <option value="">— Tất cả —</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          {/* Người Được Giao */}
          <div>
            <label className="text-2xs font-600 text-muted-foreground block mb-1.5">
              Người Được Giao
            </label>
            <select
              value={filters.assignedTo || ''}
              onChange={e => handleFilterChange('assignedTo', e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line"
            >
              <option value="">— Tất cả —</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          {/* Danh Mục Hỗ Trợ */}
          <div>
            <label className="text-2xs font-600 text-muted-foreground block mb-1.5">
              Danh Mục Hỗ Trợ
            </label>
            <select
              value={filters.supportCategory || ''}
              onChange={e => handleFilterChange('supportCategory', e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line"
            >
              <option value="">— Tất cả —</option>
              {supportCategories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="text-2xs font-600 text-muted-foreground block mb-1.5">
              Độ Ưu Tiên
            </label>
            <select
              value={filters.priority || ''}
              onChange={e => handleFilterChange('priority', e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line"
            >
              <option value="">— Tất cả —</option>
              <option value="low">🟢 Thấp</option>
              <option value="medium">🟡 Trung bình</option>
              <option value="high">🟠 Cao</option>
              <option value="critical">🔴 Khẩn cấp</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-2xs font-600 text-muted-foreground block mb-1.5">
              Trạng Thái
            </label>
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg text-xs text-foreground bg-surface-2 border border-line"
            >
              <option value="">— Tất cả —</option>
              <option value="open">Mở</option>
              <option value="in_progress">Đang xử lý</option>
              <option value="resolved">Đã giải quyết</option>
              <option value="closed">Đóng</option>
            </select>
          </div>

          {/* Reset Button */}
          {activeFilterCount > 0 && (
            <button
              onClick={handleReset}
              className="w-full h-8 px-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-500 flex items-center justify-center gap-1.5"
            >
              <X size={12} />
              Xóa tất cả bộ lọc
            </button>
          )}
        </div>
      )}
    </div>
  );
}
