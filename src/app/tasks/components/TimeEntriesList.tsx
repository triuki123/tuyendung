'use client';

import React, { useState } from 'react';
import { Plus, AlertCircle, Filter } from 'lucide-react';
import TimeEntryCard from './TimeEntryCard';

interface TimeEntry {
  id: string;
  task_id: string;
  subtask_id?: string;
  user_id: string;
  user_name: string;
  duration_minutes: number;
  date_worked: string;
  description?: string;
  is_billable: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

interface TimeEntriesListProps {
  entries: TimeEntry[];
  summary?: {
    total_hours: number;
    billable_hours: number;
    entry_count: number;
  };
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (entry: TimeEntry) => Promise<void>;
  onAddNew?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  loading?: boolean;
}

const durationToHours = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

export default function TimeEntriesList({
  entries,
  summary,
  onEdit,
  onDelete,
  onAddNew,
  canEdit = true,
  canDelete = true,
  loading = false,
}: TimeEntriesListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterBillable, setFilterBillable] = useState<'all' | 'billable' | 'non-billable'>(
    'all'
  );

  const filteredEntries =
    filterBillable === 'all'
      ? entries
      : filterBillable === 'billable'
      ? entries.filter((e) => e.is_billable)
      : entries.filter((e) => !e.is_billable);

  const handleDelete = async (entry: TimeEntry) => {
    setDeleting(entry.id);
    try {
      await onDelete?.(entry);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 bg-hover-strong rounded animate-pulse" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-hover rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Total Hours */}
          <div className="p-3 rounded-lg bg-hover border border-line">
            <p className="text-xs text-muted-foreground mb-1">Tổng cộng</p>
            <p className="text-lg font-700 text-white">
              {durationToHours(summary.total_hours * 60)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.entry_count} entry
            </p>
          </div>

          {/* Billable Hours */}
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-xs text-emerald-400 mb-1">Tính phí</p>
            <p className="text-lg font-700 text-emerald-400">
              {durationToHours(summary.billable_hours * 60)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {(
                (summary.billable_hours / (summary.total_hours || 1)) *
                100
              ).toFixed(0)}
              %
            </p>
          </div>

          {/* Non-Billable Hours */}
          <div className="p-3 rounded-lg bg-slate-500/10 border border-slate-500/20">
            <p className="text-xs text-ink-muted mb-1">Không tính phí</p>
            <p className="text-lg font-700 text-ink-muted">
              {durationToHours((summary.total_hours - summary.billable_hours) * 60)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {(
                ((summary.total_hours - summary.billable_hours) /
                  (summary.total_hours || 1)) *
                100
              ).toFixed(0)}
              %
            </p>
          </div>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilterBillable('all')}
          className={`px-3 py-1 rounded-lg text-xs font-500 transition-colors ${
            filterBillable === 'all'
              ? 'bg-indigo-500 text-white'
              : 'border border-line hover:border-line-strong text-muted-foreground'
          }`}
        >
          <Filter size={14} className="inline mr-1" />
          Tất cả ({entries.length})
        </button>
        <button
          onClick={() => setFilterBillable('billable')}
          className={`px-3 py-1 rounded-lg text-xs font-500 transition-colors ${
            filterBillable === 'billable'
              ? 'bg-emerald-500 text-white'
              : 'border border-line hover:border-line-strong text-muted-foreground'
          }`}
        >
          Tính phí ({entries.filter((e) => e.is_billable).length})
        </button>
        <button
          onClick={() => setFilterBillable('non-billable')}
          className={`px-3 py-1 rounded-lg text-xs font-500 transition-colors ${
            filterBillable === 'non-billable'
              ? 'bg-slate-500 text-white'
              : 'border border-line hover:border-line-strong text-muted-foreground'
          }`}
        >
          Không tính ({entries.filter((e) => !e.is_billable).length})
        </button>
      </div>

      {/* Time Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <AlertCircle size={16} className="mr-2" />
          <span className="text-sm">
            {entries.length === 0
              ? 'Chưa có time entry nào'
              : 'Không có entry nào phù hợp'}
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry) => (
            <TimeEntryCard
              key={entry.id}
              entry={entry}
              onEdit={onEdit}
              onDelete={handleDelete}
              canEdit={canEdit}
              canDelete={canDelete}
              deleting={deleting === entry.id}
            />
          ))}
        </div>
      )}

      {/* Add New Time Entry Button */}
      {canEdit && (
        <button
          onClick={onAddNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-line hover:border-indigo-500 hover:bg-indigo-500/10 transition-colors text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus size={16} />
          Ghi nhận thời gian
        </button>
      )}
    </div>
  );
}
