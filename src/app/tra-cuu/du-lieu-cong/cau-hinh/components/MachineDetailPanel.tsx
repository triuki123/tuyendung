'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Server, Users, BarChart3, Clock, Download, RefreshCw, Plus } from 'lucide-react';
import { AddMappingModal } from './AddMappingModal';
import DateInputVN from '@/components/ui/DateInputVN';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface Machine {
  id: string;
  name: string;
  host: string;
  port: number;
  machine_type: string;
  location: string | null;
  status: string;
  last_sync: string | null;
  last_error: string | null;
  polling_enabled: boolean;
  connection_mode?: 'pull' | 'push';
  poll_interval_seconds?: number;
  notes: string | null;
}

interface MachineMapping {
  id: string;
  machine_id: string;
  employee_code: string;
  user_id: string;
  user_name: string | null;
}

interface AttendanceRecord {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  event_type: string;
  recorded_at: string;
  employee_code: string | null;
  lat?: number;
  lng?: number;
  notes?: string;
}

interface Props {
  machine: Machine;
  onClose: () => void;
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMinutes < 1) return 'vừa xong';
  if (diffMinutes < 60) return `${diffMinutes}p trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h trước`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN');
}

export function MachineDetailPanel({ machine, onClose }: Props) {
  const toast = useToast();
  useEscapeKey(onClose);
  const [tab, setTab] = useState<'info' | 'employees' | 'records' | 'stats'>('info');
  const [mappings, setMappings] = useState<MachineMapping[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPages, setRecordsPages] = useState(1);
  const [filterDate, setFilterDate] = useState('');
  const [showAddMapping, setShowAddMapping] = useState(false);

  useEffect(() => {
    if (tab === 'info' || tab === 'employees') {
      fetchMappings();
    } else if (tab === 'records') {
      fetchRecords();
    }
  }, [tab, machine.id, recordsPage, filterDate]);

  async function fetchMappings() {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/machine-mappings?machine_id=${machine.id}`);
      const json = await res.json();
      if (json.success) {
        setMappings(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching mappings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecords() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: recordsPage.toString(),
        limit: '15',
      });
      if (filterDate) {
        params.append('start_date', filterDate + 'T00:00:00Z');
        params.append('end_date', filterDate + 'T23:59:59Z');
      }
      const res = await fetch(`/api/attendance/machines/${machine.id}/records?${params}`);
      const json = await res.json();
      if (json.success) {
        setRecords(json.data || []);
        setRecordsTotal(json.pagination?.total || 0);
        setRecordsPages(json.pagination?.pages || 1);
      }
    } catch (err) {
      console.error('Error fetching records:', err);
    } finally {
      setLoading(false);
    }
  }

  function exportRecordsAsCSV() {
    if (records.length === 0) {
      toast.error('Không có records để export');
      return;
    }

    const headers = ['Nhân sự', 'Email', 'Loại', 'Thời gian', 'Mã máy', 'Ghi chú'];
    const rows = records.map((r) => [
      r.user_name || 'Unknown',
      r.user_email || '',
      r.event_type === 'check_in' ? 'Vào' : 'Ra',
      fmtDateTime(r.recorded_at),
      r.employee_code || '',
      r.notes || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `records_${machine.id}_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  }

  const TABS = [
    { key: 'info' as const, label: 'Thông Tin Máy', icon: Server },
    { key: 'employees' as const, label: 'Nhân Sự', icon: Users },
    { key: 'records' as const, label: 'Records', icon: Clock },
    { key: 'stats' as const, label: 'Thống Kê', icon: BarChart3 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Side Panel */}
      <div className="w-full max-w-2xl h-full flex flex-col bg-slate-950 border-l border-line overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 bg-slate-900/50">
          <div>
            <h2 className="text-xl font-bold text-foreground">{machine.name}</h2>
            <p className="text-xs text-muted-foreground mt-1">{machine.host}:{machine.port}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-line-subtle px-4 py-3 bg-slate-900/30 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-500 rounded-lg transition-all whitespace-nowrap ${
                  tab === t.key
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : tab === 'info' ? (
            // Machine Info
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground font-600 mb-1">MÃ MÁY</p>
                <p className="text-sm font-mono text-indigo-400">{machine.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-600 mb-1">ĐỊA CHỈ</p>
                <p className="text-sm text-foreground">{machine.host}:{machine.port}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-600 mb-1">LOẠI MÁY</p>
                <p className="text-sm text-foreground">{machine.machine_type}</p>
              </div>
              {machine.location && (
                <div>
                  <p className="text-xs text-muted-foreground font-600 mb-1">ĐỊA ĐIỂM</p>
                  <p className="text-sm text-foreground">{machine.location}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground font-600 mb-1">TRẠNG THÁI</p>
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      machine.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                  />
                  <span className="text-sm font-500">
                    {machine.status === 'active' ? '✓ Online' : '✕ Error'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-600 mb-1">POLLING</p>
                <p className="text-sm">
                  {machine.polling_enabled ? (
                    <span className="text-emerald-400">✓ ON (mỗi 30s)</span>
                  ) : (
                    <span className="text-muted-foreground">○ OFF</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-600 mb-1">LẦN POLLING CUỐI</p>
                <p className="text-sm text-foreground">{fmtTime(machine.last_sync)}</p>
              </div>
              {machine.last_error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-xs text-red-400 font-600 mb-1">LỖI CUỐI</p>
                  <p className="text-xs text-red-300">{machine.last_error}</p>
                </div>
              )}
              {machine.notes && (
                <div>
                  <p className="text-xs text-muted-foreground font-600 mb-1">GHI CHÚ</p>
                  <p className="text-sm text-foreground">{machine.notes}</p>
                </div>
              )}
            </div>
          ) : tab === 'employees' ? (
            // Employees
            <div className="space-y-4">
              {/* Add Mapping Button */}
              <button
                onClick={() => setShowAddMapping(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition font-500 text-sm"
              >
                <Plus className="h-4 w-4" />
                Thêm Mapping
              </button>

              {/* Mappings List */}
              {mappings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">Chưa có nhân sự được gán cho máy này</p>
                  <p className="text-xs mt-2">Nhấn "Thêm Mapping" ở trên để tạo mapping mới</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mappings.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-line-subtle bg-slate-900/50 p-3 hover:bg-slate-900/70 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-600 text-foreground">{m.user_name || 'Unmapped'}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Mã máy: <span className="font-mono">{m.employee_code}</span>
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            m.user_name
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {m.user_name ? '✓ Mapped' : '⚠️ Unmapped'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === 'records' ? (
            // Records
            <div className="space-y-4">
              {/* Filter & Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <DateInputVN
                  value={filterDate}
                  onChange={(e) => {
                    setFilterDate(e.target.value);
                    setRecordsPage(1);
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg border border-line bg-slate-900/50 text-foreground focus:border-indigo-500/60 focus:outline-none"
                />
                {filterDate && (
                  <button
                    onClick={() => {
                      setFilterDate('');
                      setRecordsPage(1);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-slate-700 transition"
                  >
                    ✕ Clear
                  </button>
                )}
                <button
                  onClick={fetchRecords}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={exportRecordsAsCSV}
                  disabled={records.length === 0}
                  className="ml-auto p-1.5 text-muted-foreground hover:text-indigo-400 transition disabled:opacity-30"
                  title="Export CSV"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* Records List */}
              {records.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Không có records</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {records.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-line-subtle bg-slate-900/50 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-600 text-foreground">{r.user_name || 'Unknown'}</div>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-500 ${
                            r.event_type === 'check_in'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {r.event_type === 'check_in' ? '→ Vào' : '← Ra'}
                        </span>
                      </div>
                      <p className="text-muted-foreground mb-1">{fmtDateTime(r.recorded_at)}</p>
                      {r.employee_code && (
                        <p className="text-muted-foreground">
                          Mã: <span className="font-mono text-indigo-300">{r.employee_code}</span>
                        </p>
                      )}
                      {r.notes && <p className="text-muted-foreground mt-1 italic">"{r.notes}"</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {recordsPages > 1 && (
                <div className="flex items-center justify-between border-t border-line-subtle pt-4 mt-4">
                  <p className="text-xs text-muted-foreground">
                    Trang {recordsPage} / {recordsPages} ({recordsTotal} records)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
                      disabled={recordsPage === 1}
                      className="px-2 py-1 text-xs rounded border border-line hover:bg-slate-700 disabled:opacity-30 transition"
                    >
                      ← Trước
                    </button>
                    <button
                      onClick={() => setRecordsPage((p) => Math.min(recordsPages, p + 1))}
                      disabled={recordsPage === recordsPages}
                      className="px-2 py-1 text-xs rounded border border-line hover:bg-slate-700 disabled:opacity-30 transition"
                    >
                      Sau →
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Stats
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-line-subtle bg-slate-900/50 p-4">
                  <p className="text-xs text-muted-foreground font-600">NHÂN SỰ MAPPED</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-2">
                    {mappings.filter((m) => m.user_name).length}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {mappings.length > 0
                      ? `${Math.round((mappings.filter((m) => m.user_name).length / mappings.length) * 100)}%`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-line-subtle bg-slate-900/50 p-4">
                  <p className="text-xs text-muted-foreground font-600">CHƯA MAPPED</p>
                  <p className="text-2xl font-bold text-amber-400 mt-2">
                    {mappings.filter((m) => !m.user_name).length}
                  </p>
                </div>
                <div className="rounded-lg border border-line-subtle bg-slate-900/50 p-4">
                  <p className="text-xs text-muted-foreground font-600">TỔNG RECORDS</p>
                  <p className="text-2xl font-bold text-indigo-400 mt-2">{recordsTotal}</p>
                </div>
                <div className="rounded-lg border border-line-subtle bg-slate-900/50 p-4">
                  <p className="text-xs text-muted-foreground font-600">STATUS MÁY</p>
                  <p className={`text-2xl font-bold mt-2 ${machine.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {machine.status === 'active' ? '✓ Online' : '✕ Error'}
                  </p>
                </div>
              </div>

              {/* Machine Status Details */}
              <div className="rounded-lg border border-line-subtle bg-slate-900/50 p-4 space-y-2">
                <p className="text-xs font-600 text-foreground mb-3">THÔNG TIN KIỂM TRA</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Polling:</span>
                  <span className={machine.polling_enabled ? 'text-emerald-400' : 'text-muted-foreground'}>
                    {machine.connection_mode === 'push'
                      ? '— (máy tự đẩy, không poll)'
                      : machine.polling_enabled
                        ? `✓ ON (${machine.poll_interval_seconds ?? 30}s)`
                        : '○ OFF'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Lần sync cuối:</span>
                  <span className="text-foreground">{fmtTime(machine.last_sync)}</span>
                </div>
                {machine.last_error && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <p className="text-xs text-red-400 font-500 mb-1">Lỗi gần nhất:</p>
                    <p className="text-xs text-red-300 line-clamp-2">{machine.last_error}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Mapping Modal */}
      <AddMappingModal
        machineId={machine.id}
        isOpen={showAddMapping}
        onClose={() => setShowAddMapping(false)}
        onSuccess={() => {
          fetchMappings();
          setShowAddMapping(false);
        }}
      />
    </div>
  );
}
