'use client';

import { useState, useEffect } from 'react';
import { X, Eye } from 'lucide-react';
import { fetchTaskActivities } from '@/lib/api-client';
import { TaskActivity, formatActivityLog, getActivityIcon, getActivityBadgeColor } from '@/lib/task-utils';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface ActivityLogModalProps {
  taskId: string;
  taskCode: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityLogModal({ taskId, taskCode, isOpen, onClose }: ActivityLogModalProps) {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose, isOpen);

  useEffect(() => {
    if (isOpen) {
      loadActivities();
    }
  }, [isOpen, taskId]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchTaskActivities(taskId);
      setActivities(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activities');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-900/95 backdrop-blur-sm rounded-xl border border-line w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-line">
          <div className="flex items-center gap-2">
            <Eye size={20} className="text-indigo-400" />
            <div>
              <h2 className="text-base sm:text-lg font-600 text-foreground">Lịch Sử Hoạt Động</h2>
              <p className="text-2xs sm:text-xs text-muted-foreground">{taskCode}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-hover-strong rounded-lg transition-colors"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border border-indigo-400 border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="p-4 sm:p-6 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={loadActivities}
                className="mt-3 px-3 py-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg text-xs hover:bg-indigo-600/30 transition"
              >
                Thử lại
              </button>
            </div>
          )}

          {!loading && !error && activities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Eye size={32} className="text-muted-foreground mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">Chưa có hoạt động nào</p>
            </div>
          )}

          {!loading && !error && activities.length > 0 && (
            <div className="p-4 sm:p-6 space-y-4">
              {activities.map((activity, index) => (
                <div
                  key={activity.id || index}
                  className="flex gap-3 sm:gap-4 pb-4 sm:pb-6 last:pb-0 border-b border-line-subtle last:border-0"
                >
                  {/* Timeline dot and line */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-base ${getActivityBadgeColor(
                        activity.action
                      )}`}
                    >
                      {getActivityIcon(activity.action)}
                    </div>
                    {index < activities.length - 1 && (
                      <div className="w-0.5 h-8 sm:h-12 bg-hover-strong mt-2" />
                    )}
                  </div>

                  {/* Activity content */}
                  <div className="flex-1 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 mb-1">
                      <span className={`text-2xs sm:text-xs font-600 px-2 sm:px-2.5 py-1 rounded-full w-fit ${getActivityBadgeColor(
                        activity.action
                      )}`}>
                        {activity.action.toUpperCase().replace('_', ' ')}
                      </span>
                      {activity.created_at && (
                        <p className="text-2xs sm:text-xs text-muted-foreground">
                          {(() => {
                            const date = new Date(activity.created_at);
                            const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            return `${timeStr} ${dateStr}`;
                          })()}
                        </p>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-foreground mt-2">
                      {formatActivityLog(activity)}
                    </p>
                    {activity.description && (
                      <p className="text-2xs sm:text-xs text-muted-foreground mt-2 italic">
                        "{activity.description}"
                      </p>
                    )}
                    {activity.old_value && activity.action === 'status_changed' && (
                      <div className="mt-2 flex items-center gap-2 text-2xs sm:text-xs text-muted-foreground">
                        <span className="px-2 py-0.5 bg-slate-800 rounded border border-line-subtle">
                          {activity.old_value}
                        </span>
                        <span>→</span>
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                          {activity.new_value}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line p-4 sm:p-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 h-10 bg-slate-800/50 hover:bg-slate-800 text-foreground text-sm font-600 rounded-lg transition-colors min-h-[44px] sm:min-h-auto"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
