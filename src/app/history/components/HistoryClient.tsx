'use client';

import React, { useState, useEffect } from 'react';
import FilterBuilder, { FilterCriteria } from '@/components/FilterBuilder';
import SavedFilters from '@/components/SavedFilters';
import SearchResultsIndicator from '@/components/SearchResultsIndicator';
import { History, Search, Package, Loader2 } from 'lucide-react';

const ACTION_COLORS: Record<string, string> = {
  'Nhập kho': 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  'Phân bổ': 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  'Bảo trì': 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  'Báo hỏng': 'text-red-400 bg-red-500/15 border-red-500/30',
  'Thu hồi': 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  'Thanh lý': 'text-ink-muted bg-slate-500/15 border-slate-500/30',
  'Xóa tài sản (Phê duyệt)': 'text-red-400 bg-red-500/15 border-red-500/30',
  'Xóa tài sản (Từ chối)': 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  'Cập nhật tài sản': 'text-blue-400 bg-blue-500/15 border-blue-500/30',
  'Tạo người dùng': 'text-purple-400 bg-purple-500/15 border-purple-500/30',
  'Cập nhật người dùng': 'text-violet-400 bg-violet-500/15 border-violet-500/30',
  'Vô hiệu hóa người dùng': 'text-red-400 bg-red-500/15 border-red-500/30',
};

interface HistoryEntry {
  id: string;
  assetId: string | null;
  assetCode: string | null;
  assetName: string | null;
  date: string;
  action: string;
  performedBy: string;
  note: string;
  type: 'audit' | 'delete_request' | 'asset_operation';
  status?: string;
}

const applyFilterCriteria = (entry: HistoryEntry, criteria: FilterCriteria): boolean => {
  const fieldValue = (entry as any)[criteria.field];
  if (fieldValue === undefined || fieldValue === null) return false;

  const val = String(fieldValue).toLowerCase();
  const filterVal = String(criteria.value).toLowerCase();

  switch (criteria.operator) {
    case 'equals': return val === filterVal;
    case 'contains': return val.includes(filterVal);
    case 'startsWith': return val.startsWith(filterVal);
    case 'endsWith': return val.endsWith(filterVal);
    case 'gt': return Number(fieldValue) > Number(criteria.value);
    case 'lt': return Number(fieldValue) < Number(criteria.value);
    case 'between': return Number(fieldValue) >= Number(criteria.value);
    default: return true;
  }
};

export default function HistoryClient() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState<FilterCriteria[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [allHistory, setAllHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/history?limit=500');
      if (!response.ok) throw new Error('Failed to fetch history');
      const result = await response.json();
      setAllHistory(result.data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
      setAllHistory([]);
    } finally {
      setLoading(false);
    }
  }

  const handleAdvancedFilterApply = (filterCriteria: FilterCriteria[]) => {
    setAdvancedFilters(filterCriteria);
  };

  const handleAdvancedFilterReset = () => {
    setAdvancedFilters([]);
  };

  const handleLoadSavedFilter = (filterCriteria: FilterCriteria[]) => {
    setAdvancedFilters(filterCriteria);
  };

  const filtered = allHistory.filter(h => {
    // Basic search
    const matchSearch = !search ||
      (h.assetCode?.toLowerCase().includes(search.toLowerCase())) ||
      (h.assetName?.toLowerCase().includes(search.toLowerCase())) ||
      h.performedBy.toLowerCase().includes(search.toLowerCase());
    // Basic filter
    const matchAction = !actionFilter || h.action === actionFilter;

    // Advanced filters
    const andFilters: FilterCriteria[] = [];
    const orFilters: FilterCriteria[] = [];
    advancedFilters.forEach((f, idx) => {
      if (idx === 0 || f.logic === 'AND') {
        andFilters.push(f);
      } else {
        orFilters.push(f);
      }
    });

    const andMatch = andFilters.every(f => applyFilterCriteria(h, f));
    if (!andMatch) return false;
    if (orFilters.length > 0) {
      const orMatch = orFilters.some(f => applyFilterCriteria(h, f));
      if (!orMatch) return false;
    }

    return matchSearch && matchAction;
  });

  const uniqueActions = Array.from(new Set(allHistory.map(h => h.action)));

  const stats = [
    { label: 'Tổng sự kiện', value: allHistory.length },
    { label: 'Xóa tài sản phê duyệt', value: allHistory.filter(h => h.action === 'Xóa tài sản (Phê duyệt)').length },
    { label: 'Xóa tài sản từ chối', value: allHistory.filter(h => h.action === 'Xóa tài sản (Từ chối)').length },
    { label: 'Hoạt động khác', value: allHistory.filter(h => h.type === 'audit').length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="size-8 animate-spin mx-auto mb-3 text-indigo-400" />
          <p className="text-sm text-muted-foreground">Đang tải lịch sử...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-sm text-red-400">Lỗi khi tải lịch sử: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Lịch Sử Hoạt Động</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Hiển thị {filtered.length} / {allHistory.length} sự kiện</p>
        </div>
        <SavedFilters
          currentFilters={advancedFilters}
          onLoadFilter={handleLoadSavedFilter}
          onDeleteFilter={() => {}}
          moduleName="history"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {stats.map((s, i) => (
          <div key={i} className="rounded-2xl p-3 sm:p-4 border border-white/05" style={{ background: 'var(--card)' }}>
            <p className="text-xl sm:text-2xl font-700 text-foreground">{s.value}</p>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Basic Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
        <div className="relative lg:min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm theo mã tài sản, tên, người thực hiện..."
            className="w-full h-9 pl-9 pr-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60"
          />
        </div>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="h-9 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none"
        >
          <option value="">Tất cả hành động</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className="h-9 px-4 rounded-xl text-sm font-600 btn-ghost border border-line hover:border-indigo/60"
        >
          Bộ lọc nâng cao
        </button>
      </div>

      {/* FilterBuilder */}
      {filterOpen && (
        <FilterBuilder
          fields={[
            { name: 'assetCode', label: 'Loại Thực Thể', type: 'text' },
            { name: 'action', label: 'Hành Động', type: 'text' },
            { name: 'performedBy', label: 'Thực Hiện Bởi', type: 'text' },
            { name: 'date', label: 'Thời Gian', type: 'text' },
          ]}
          onApply={handleAdvancedFilterApply}
          onReset={handleAdvancedFilterReset}
          initialFilters={advancedFilters}
        />
      )}

      {/* Search Results Indicator */}
      <SearchResultsIndicator
        totalItems={allHistory.length}
        filteredItems={filtered.length}
        appliedFilters={advancedFilters}
        searchQuery={search}
        onResetFilters={handleAdvancedFilterReset}
        onResetSearch={() => setSearch('')}
      />

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/05 px-4 py-10 text-center" style={{ background: 'var(--card)' }}>
            <History size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground">Không có lịch sử nào</p>
          </div>
        ) : (
          filtered.map((h, idx) => {
            const colorClass = ACTION_COLORS[h.action] ?? 'text-ink-muted bg-slate-500/15 border-slate-500/30';
            return (
              <div key={h.id || `mh-${idx}`} className="rounded-2xl border border-white/05 p-4" style={{ background: 'var(--card)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/15 shrink-0">
                    <Package size={15} className="text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-mono text-indigo-300">{h.assetCode || 'N/A'}</p>
                      <span className="text-2xs text-muted-foreground tabular-nums shrink-0">
                        {new Date(h.date).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p className="text-sm font-500 text-foreground line-clamp-1">{h.assetName || 'Hành động hệ thống'}</p>
                    <div className="mt-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-600 border ${colorClass}`}>
                        {h.action}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{h.note}</p>
                    <p className="text-2xs text-muted-foreground/70 mt-1.5">
                      Bởi <span className="text-muted-foreground">{h.performedBy}</span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Timeline (md+) */}
      <div className="hidden md:block rounded-2xl border border-white/05 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/05">
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ngày</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Nội dung</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Hành động</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Người thực hiện</th>
                <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    <History size={32} className="mx-auto mb-3 opacity-30" />
                    Không có lịch sử nào
                  </td>
                </tr>
              )}
              {filtered.map((h, idx) => {
                const colorClass = ACTION_COLORS[h.action] ?? 'text-ink-muted bg-slate-500/15 border-slate-500/30';
                return (
                  <tr key={h.id || idx} className="border-b border-white/04 last:border-0 hover:bg-white/02 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(h.date).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-500/15">
                          <Package size={13} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-xs font-mono text-indigo-300">{h.assetCode || 'N/A'}</p>
                          <p className="text-sm text-foreground">{h.assetName || 'Hành động hệ thống'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-600 border ${colorClass}`}>
                        {h.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{h.performedBy}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">{h.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
