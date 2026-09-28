'use client';

import React, { useState } from 'react';
import { Plus, X, ChevronDown } from 'lucide-react';

export interface FilterCriteria {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'between';
  value: string | number;
  logic?: 'AND' | 'OR';
}

interface FilterField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  options?: { value: string; label: string }[];
}

interface FilterBuilderProps {
  fields: FilterField[];
  onApply: (filters: FilterCriteria[]) => void;
  onReset: () => void;
  initialFilters?: FilterCriteria[];
}

/**
 * Phase 2: Filter Builder Component
 * Allows multi-criteria filtering with AND/OR logic
 */
export default function FilterBuilder({
  fields,
  onApply,
  onReset,
  initialFilters = [],
}: FilterBuilderProps) {
  const [filters, setFilters] = useState<FilterCriteria[]>(initialFilters);
  const [isOpen, setIsOpen] = useState(false);

  const addFilter = () => {
    const newFilter: FilterCriteria = {
      id: Date.now().toString(),
      field: fields[0]?.name || '',
      operator: 'contains',
      value: '',
      logic: filters.length > 0 ? 'AND' : undefined,
    };
    setFilters([...filters, newFilter]);
  };

  const removeFilter = (id: string) => {
    const updated = filters.filter(f => f.id !== id);
    setFilters(updated);
  };

  const updateFilter = (id: string, key: keyof FilterCriteria, value: any) => {
    setFilters(filters.map(f =>
      f.id === id ? { ...f, [key]: value } : f
    ));
  };

  const handleApply = () => {
    onApply(filters);
    setIsOpen(false);
  };

  const handleReset = () => {
    setFilters([]);
    onReset();
    setIsOpen(false);
  };

  const getFieldLabel = (fieldName: string) => {
    return fields.find(f => f.name === fieldName)?.label || fieldName;
  };

  const getFieldType = (fieldName: string) => {
    return fields.find(f => f.name === fieldName)?.type || 'text';
  };

  const getFieldOptions = (fieldName: string) => {
    return fields.find(f => f.name === fieldName)?.options || [];
  };

  return (
    <div className="relative">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 h-10 px-3 rounded-xl text-sm font-500 transition-all ${
          isOpen
            ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300'
            : 'bg-white/02 border border-line text-muted-foreground hover:bg-white/05'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Bộ Lọc
        {filters.length > 0 && (
          <span className="ml-1 px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 text-xs font-600">
            {filters.length}
          </span>
        )}
        <ChevronDown size={14} className="ml-auto" />
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white/02 border border-line rounded-xl shadow-xl backdrop-blur-md z-50 p-4">
          {/* Filters List */}
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {filters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Chưa có bộ lọc nào. Nhấn "Thêm Bộ Lọc" để bắt đầu.</p>
            ) : (
              filters.map((filter, idx) => (
                <div key={filter.id} className="space-y-2 pb-3 border-b border-white/05 last:border-0">
                  {/* Logic Selector (for filters after the first) */}
                  {idx > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateFilter(filter.id, 'logic', filter.logic === 'AND' ? 'OR' : 'AND')}
                        className="px-2 py-1 rounded text-xs font-600 bg-white/05 hover:bg-hover-strong text-muted-foreground transition-colors"
                      >
                        {filter.logic || 'AND'}
                      </button>
                    </div>
                  )}

                  {/* Field Selector */}
                  <div className="flex gap-2">
                    <select
                      value={filter.field}
                      onChange={(e) => updateFilter(filter.id, 'field', e.target.value)}
                      className="flex-1 h-8 px-2 rounded-lg text-sm bg-white/02 border border-line text-foreground focus:outline-none focus:border-indigo-500/60"
                    >
                      {fields.map(f => (
                        <option key={f.name} value={f.name}>{f.label}</option>
                      ))}
                    </select>

                    {/* Operator Selector */}
                    <select
                      value={filter.operator}
                      onChange={(e) => updateFilter(filter.id, 'operator', e.target.value as FilterCriteria['operator'])}
                      className="w-24 h-8 px-2 rounded-lg text-sm bg-white/02 border border-line text-foreground focus:outline-none focus:border-indigo-500/60"
                    >
                      <option value="equals">Bằng</option>
                      <option value="contains">Chứa</option>
                      <option value="startsWith">Bắt đầu</option>
                      <option value="endsWith">Kết thúc</option>
                      <option value="gt">Lớn hơn</option>
                      <option value="lt">Nhỏ hơn</option>
                    </select>

                    {/* Remove Button */}
                    <button
                      onClick={() => removeFilter(filter.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Value Input */}
                  {getFieldType(filter.field) === 'select' ? (
                    <select
                      value={filter.value}
                      onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
                      className="w-full h-8 px-2 rounded-lg text-sm bg-white/02 border border-line text-foreground focus:outline-none focus:border-indigo-500/60"
                    >
                      <option value="">-- Chọn --</option>
                      {getFieldOptions(filter.field).map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={getFieldType(filter.field) === 'number' ? 'number' : 'text'}
                      value={filter.value}
                      onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
                      placeholder="Nhập giá trị..."
                      className="w-full h-8 px-2 rounded-lg text-sm bg-white/02 border border-line text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/60"
                    />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2 border-t border-white/05 pt-4">
            <button
              onClick={addFilter}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-500 text-sm transition-colors"
            >
              <Plus size={16} />
              Thêm Bộ Lọc
            </button>
            <button
              onClick={handleReset}
              className="flex-1 h-9 rounded-lg bg-white/02 hover:bg-white/05 text-muted-foreground font-500 text-sm transition-colors"
            >
              Xóa Tất Cả
            </button>
            <button
              onClick={handleApply}
              className="flex-1 h-9 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-600 text-sm transition-colors"
            >
              Áp Dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
