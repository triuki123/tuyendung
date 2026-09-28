'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Download, X, Loader2, Users, Building2, FolderTree, Globe, User } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import SearchableSelect, { type SearchableOption } from '@/components/ui/SearchableSelect';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface ExportReportButtonProps {
  userId: string;
  userName: string;
  userRole: 'super_admin' | 'admin' | 'manager' | 'user' | string;
}

type TargetType = 'self' | 'user' | 'sub_department' | 'department' | 'company' | 'all';

interface ScopeOption {
  type: TargetType;
  id: string;
  label: string;
  group: string;
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const GROUP_META: Record<string, { icon: React.ReactNode; order: number }> = {
  'Cá nhân':     { icon: <User size={14} />,        order: 1 },
  'Bộ phận':     { icon: <FolderTree size={14} />,  order: 2 },
  'Phòng ban':   { icon: <Users size={14} />,       order: 3 },
  'Công ty':     { icon: <Building2 size={14} />,   order: 4 },
  'Hệ thống':    { icon: <Globe size={14} />,       order: 5 },
};

export default function ExportReportButton({ userId, userRole }: ExportReportButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phạm vi
  const [options, setOptions] = useState<ScopeOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [target, setTarget] = useState<{ type: TargetType; id: string } | null>(null);

  // Khoảng ngày — mặc định 30 ngày gần nhất
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const [fromDate, setFromDate] = useState<string>(toIsoDate(thirtyDaysAgo));
  const [toDate, setToDate] = useState<string>(toIsoDate(today));

  useEscapeKey(() => setShowModal(false), showModal);

  // Fetch danh sách target hợp lệ khi mở modal lần đầu
  useEffect(() => {
    if (!showModal || options.length > 0) return;
    let cancelled = false;
    (async () => {
      setLoadingOptions(true);
      try {
        const res = await fetch('/api/tasks/report/scope-options', {
          headers: { 'x-current-user-id': userId },
        });
        if (!res.ok) throw new Error('Không tải được danh sách phạm vi');
        const data: { defaultTarget: { type: TargetType; id: string }; options: ScopeOption[] } = await res.json();
        if (cancelled) return;
        setOptions(data.options);
        setTarget({ type: data.defaultTarget.type, id: data.defaultTarget.id });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Lỗi tải phạm vi');
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showModal, userId, options.length]);

  // Sắp xếp options theo group rồi dồn về 1 mảng SearchableOption với prefix group
  const searchOptions: SearchableOption[] = useMemo(() => {
    const sorted = [...options].sort((a, b) => {
      const ga = GROUP_META[a.group]?.order ?? 99;
      const gb = GROUP_META[b.group]?.order ?? 99;
      if (ga !== gb) return ga - gb;
      return a.label.localeCompare(b.label, 'vi');
    });
    return sorted.map(o => ({
      value: `${o.type}:${o.id}`,
      label: o.label,
      sublabel: o.group,
    }));
  }, [options]);

  const selectedValue = target ? `${target.type}:${target.id}` : null;
  const selectedOption = options.find(o => target && o.type === target.type && o.id === target.id);

  const handleExport = async () => {
    setError(null);
    if (!target) {
      setError('Vui lòng chọn đối tượng báo cáo');
      return;
    }
    if (!fromDate || !toDate) {
      setError('Vui lòng chọn đầy đủ ngày bắt đầu và kết thúc');
      return;
    }
    if (new Date(fromDate) > new Date(toDate)) {
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tasks/report/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': userId },
        body: JSON.stringify({
          targetType: target.type,
          targetId: target.id,
          fromDate,
          toDate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Xuất báo cáo thất bại');
      }
      window.open(data.reportUrl, '_blank');
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xuất báo cáo thất bại');
    } finally {
      setLoading(false);
    }
  };

  const roleHint: Record<string, string> = {
    super_admin: 'Bạn có thể chọn bất kỳ cá nhân, bộ phận, phòng ban hay công ty trong hệ thống.',
    admin: 'Bạn có thể chọn cá nhân, bộ phận, phòng ban hoặc công ty của bạn.',
    manager: 'Bạn có thể chọn bất kỳ ai trong đội nhóm của bạn (đệ quy).',
    user: 'Bạn chỉ có thể xuất báo cáo của bản thân.',
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center justify-center gap-2 px-2 sm:px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-300 hover:bg-blue-500/30 transition-colors font-600 text-sm h-9 min-w-[44px]"
        title="Xuất báo cáo"
      >
        <Download size={16} className="flex-shrink-0" />
        <span className="hidden sm:inline">Xuất Báo Cáo</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setShowModal(false)}>
          <div className="bg-slate-900 border border-line rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-700 text-foreground">Xuất Báo Cáo Công Việc</h2>
                <p className="text-xs text-ink-muted mt-1">{roleHint[userRole] || roleHint.user}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-ink-muted hover:text-foreground transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Đối tượng */}
            <div className="mb-5">
              <label className="text-sm font-600 text-ink-bright block mb-2">Đối Tượng Báo Cáo</label>
              {loadingOptions ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-ink-muted">
                  <Loader2 size={14} className="animate-spin" /> Đang tải danh sách...
                </div>
              ) : (
                <>
                  <SearchableSelect
                    options={searchOptions}
                    value={selectedValue}
                    onChange={(val) => {
                      if (!val) { setTarget(null); return; }
                      const [type, ...rest] = val.split(':');
                      setTarget({ type: type as TargetType, id: rest.join(':') });
                    }}
                    placeholder="-- Chọn đối tượng --"
                    emptyText="Không có đối tượng nào trong phạm vi của bạn"
                  />
                  {selectedOption && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-ink-muted">
                      {GROUP_META[selectedOption.group]?.icon}
                      <span>Phạm vi: <strong className="text-slate-200">{selectedOption.group}</strong></span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Khoảng ngày */}
            <div className="mb-5">
              <label className="text-sm font-600 text-ink-bright block mb-2">Khoảng Thời Gian</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-muted block mb-1">Từ ngày</label>
                  <DateInputVN
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-foreground text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-muted block mb-1">Đến ngày</label>
                  <DateInputVN
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-foreground text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-xs text-ink-muted mt-2">Báo cáo gồm các công việc có hạn chót trong khoảng này.</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-300 text-sm">{error}</div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-ink-bright hover:bg-slate-800/50 transition-colors font-600"
              >
                Hủy
              </button>
              <button
                onClick={handleExport}
                disabled={loading || loadingOptions || !target}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors font-600"
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Đang xuất...</>
                ) : (
                  <><Download size={18} /> Xuất Báo Cáo</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
