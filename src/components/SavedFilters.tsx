'use client';

import React, { useState, useEffect } from 'react';
import { Save, X, ChevronDown, Edit2, Trash2 } from 'lucide-react';
import { FilterCriteria } from './FilterBuilder';

interface SavedFilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: FilterCriteria[];
  createdAt: number;
}

interface SavedFiltersProps {
  currentFilters: FilterCriteria[];
  onLoadFilter: (filters: FilterCriteria[]) => void;
  onDeleteFilter: (id: string) => void;
  moduleName: string;
}

/**
 * Phase 2: Saved Filters Component
 * Manage and load saved filter presets
 */
export default function SavedFilters({
  currentFilters,
  onLoadFilter,
  onDeleteFilter,
  moduleName,
}: SavedFiltersProps) {
  const [presets, setPresets] = useState<SavedFilterPreset[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterDesc, setFilterDesc] = useState('');

  const storageKey = `saved-filters-${moduleName}`;

  // Load presets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setPresets(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Could not load saved filters', e);
    }
  }, [storageKey]);

  const saveFilter = () => {
    if (!filterName.trim() || currentFilters.length === 0) return;

    const newPreset: SavedFilterPreset = {
      id: Date.now().toString(),
      name: filterName,
      description: filterDesc,
      filters: currentFilters,
      createdAt: Date.now(),
    };

    const updated = [...presets, newPreset];
    setPresets(updated);

    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save filter', e);
    }

    setFilterName('');
    setFilterDesc('');
    setShowSaveDialog(false);
  };

  const deletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    onDeleteFilter(id);

    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not delete filter', e);
    }
  };

  const loadPreset = (preset: SavedFilterPreset) => {
    onLoadFilter(preset.filters);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 h-10 px-3 rounded-xl text-sm font-500 transition-all ${
          isOpen
            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
            : 'bg-white/02 border border-line text-muted-foreground hover:bg-white/05'
        }`}
      >
        <Save size={16} />
        Bộ Lọc Đã Lưu
        {presets.length > 0 && (
          <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-300 text-xs font-600">
            {presets.length}
          </span>
        )}
        <ChevronDown size={14} className="ml-auto" />
      </button>

      {/* Presets Panel */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white/02 border border-line rounded-xl shadow-xl backdrop-blur-md z-50 p-4">
          {/* Save Current Filters */}
          {currentFilters.length > 0 && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-500 text-sm transition-colors mb-4"
            >
              <Save size={16} />
              Lưu Bộ Lọc Hiện Tại
            </button>
          )}

          {/* Presets List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Chưa có bộ lọc được lưu. Lưu bộ lọc hiện tại để sử dụng sau.
              </p>
            ) : (
              presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className="w-full text-left p-3 rounded-lg bg-white/02 hover:bg-white/05 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-500 text-sm text-foreground truncate">{preset.name}</p>
                      {preset.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{preset.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground/50 mt-1">
                        {preset.filters.length} bộ lọc • {new Date(preset.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePreset(preset.id);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded text-red-400 hover:bg-red-500/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSaveDialog(false)} />

          <div
            className="relative w-full max-w-md rounded-2xl p-5 border border-white/05"
            style={{ background: 'var(--card)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-700 text-foreground">Lưu Bộ Lọc</h3>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg btn-ghost text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">
                  Tên Bộ Lọc *
                </label>
                <input
                  type="text"
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  placeholder="Ví dụ: Tài sản hỏng ở IT"
                  className="w-full h-10 px-3 rounded-xl text-sm bg-white/02 border border-line text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/60"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">
                  Mô Tả (Tùy Chọn)
                </label>
                <textarea
                  value={filterDesc}
                  onChange={(e) => setFilterDesc(e.target.value)}
                  placeholder="Mô tả bộ lọc này..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-white/02 border border-line text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/60 resize-none"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Sẽ lưu {currentFilters.length} bộ lọc
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t border-white/05 mt-4">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 h-10 rounded-xl btn-ghost text-sm font-600"
              >
                Hủy
              </button>
              <button
                onClick={saveFilter}
                disabled={!filterName.trim()}
                className="flex-1 h-10 rounded-xl btn-accent text-sm font-600 disabled:opacity-50"
              >
                Lưu Bộ Lọc
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
