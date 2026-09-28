'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, AlertCircle, X, Edit2, Wifi, WifiOff, Loader2, CheckCircle2, XCircle, Download, Upload, RefreshCw, Bug } from 'lucide-react';
import { MachineDetailPanel } from './MachineDetailPanel';
import { useAttendanceRealtimeContext } from '@/context/AttendanceRealtimeContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

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
  connection_mode: 'pull' | 'push';
  comm_key: string | null;
  poll_interval_seconds: number;
  notes: string | null;
}

const EMPTY_FORM = {
  id: '', name: '', host: '', port: '1111', machine_type: 'zkteco',
  location: '', notes: '', connection_mode: 'pull' as 'pull' | 'push',
  comm_key: '', poll_interval_seconds: '30', polling_enabled: true,
};

const ADMS_URL = (typeof window !== 'undefined' ? window.location.origin : 'https://assetflow.fadoai.com') + '/api/attendance/adms';

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMinutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMinutes < 1) return 'vừa xong';
  if (diffMinutes < 60) return `${diffMinutes}p trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h trước`;
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function MachineManagementClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testState, setTestState] = useState<{ status: 'idle' | 'testing' | 'ok' | 'fail'; msg?: string }>({ status: 'idle' });
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  // Kết quả đồng bộ thủ công theo máy — hiện vài giây rồi tự ẩn
  const [syncResults, setSyncResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  // Đếm số punch mới nhận được realtime theo từng máy
  const [syncNewCounts, setSyncNewCounts] = useState<Record<string, number>>({});
  const [liveSyncTime, setLiveSyncTime]   = useState<Record<string, string>>({});
  const syncStartRef = useRef<Record<string, number>>({});

  const { lastEvent } = useAttendanceRealtimeContext();

  // UX modal Thêm/Sửa máy (form): ESC + cảnh báo thay đổi chưa lưu
  const closeForm = useCallback(() => setShowForm(false), []);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(closeForm);
  useEscapeKey(guardedClose, showForm);

  // Nhận punch mới từ SSE → cập nhật counter và last_sync display
  useEffect(() => {
    if (!lastEvent?.machine_id) return;
    const mid = lastEvent.machine_id;
    const startedAt = syncStartRef.current[mid];
    // Chỉ đếm punch đến SAU khi người dùng bấm đồng bộ
    if (startedAt && lastEvent.timestamp >= startedAt) {
      setSyncNewCounts(prev => ({ ...prev, [mid]: (prev[mid] || 0) + 1 }));
    }
    setLiveSyncTime(prev => ({ ...prev, [mid]: new Date().toISOString() }));
    // Cập nhật last_sync trong danh sách máy ngay lập tức
    setMachines(prev => prev.map(m =>
      m.id === mid ? { ...m, last_sync: new Date().toISOString() } : m
    ));
  }, [lastEvent]);

  const fetchMachines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/machines', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setMachines(json.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMachines(); }, [fetchMachines]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTestState({ status: 'idle' });
    markClean();
    setShowForm(true);
  }

  function openEdit(m: Machine) {
    setEditingId(m.id);
    setForm({
      id: m.id, name: m.name, host: m.host, port: String(m.port),
      machine_type: m.machine_type, location: m.location ?? '', notes: m.notes ?? '',
      connection_mode: m.connection_mode, comm_key: m.comm_key ?? '',
      poll_interval_seconds: String(m.poll_interval_seconds), polling_enabled: m.polling_enabled,
    });
    setTestState({ status: 'idle' });
    markClean();
    setShowForm(true);
  }

  function showSyncResult(machineId: string, ok: boolean, msg: string) {
    setSyncResults(prev => ({ ...prev, [machineId]: { ok, msg } }));
    setTimeout(() => {
      setSyncResults(prev => { const c = { ...prev }; delete c[machineId]; return c; });
    }, 10000);
  }

  async function handleSync(machineId: string) {
    // Reset counter và ghi thời điểm bắt đầu sync
    syncStartRef.current[machineId] = Date.now();
    setSyncNewCounts(prev => ({ ...prev, [machineId]: 0 }));
    setSyncingIds((prev) => new Set([...prev, machineId]));
    try {
      // Route giờ CHỜ kéo dữ liệu xong mới trả lời (tối đa 60s) — kết quả là thật
      const res = await fetch(`/api/attendance/machines/${machineId}/sync`, {
        method: 'POST',
        headers: { 'x-current-user-role': 'super_admin' },
      });
      const json = await res.json();
      if (json.success) {
        showSyncResult(machineId, true, json.message || 'Đồng bộ xong');
        fetchMachines();
      } else {
        showSyncResult(machineId, false, json.error || 'Lỗi khi đồng bộ');
      }
    } catch {
      showSyncResult(machineId, false, 'Lỗi kết nối server');
    } finally {
      setSyncingIds((prev) => { const s = new Set(prev); s.delete(machineId); return s; });
    }
  }

  async function handleTest() {
    if (!form.host || !form.port) { setTestState({ status: 'fail', msg: 'Nhập host và port trước' }); return; }
    setTestState({ status: 'testing' });
    try {
      const res = await fetch('/api/attendance/machines/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-role': 'super_admin' },
        body: JSON.stringify({
          host: form.host,
          port: parseInt(form.port, 10),
          // Pass machineId nếu đang edit máy có sẵn → test thành công sẽ clear lỗi + restart poller ngay
          machineId: form.id || undefined,
        }),
      });
      const json = await res.json();
      setTestState(json.ok ? { status: 'ok', msg: json.message } : { status: 'fail', msg: json.error });
    } catch {
      setTestState({ status: 'fail', msg: 'Lỗi gọi kiểm tra' });
    }
  }

  async function handleSave() {
    if (!form.id || !form.name || !form.host) return;
    setSubmitting(true);
    try {
      const payload = {
        id: form.id, name: form.name, host: form.host, port: parseInt(form.port, 10),
        machine_type: form.machine_type, location: form.location, notes: form.notes,
        connection_mode: form.connection_mode, comm_key: form.comm_key || null,
        poll_interval_seconds: parseInt(form.poll_interval_seconds, 10) || 30,
        polling_enabled: form.polling_enabled,
      };
      const res = editingId
        ? await fetch(`/api/attendance/machines/${encodeURIComponent(editingId)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/attendance/machines', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (json.success) { markClean(); setShowForm(false); setForm(EMPTY_FORM); setEditingId(null); fetchMachines(); }
      else toast.error('Lỗi: ' + (json.error ?? 'không rõ'));
    } finally { setSubmitting(false); }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Xóa máy?', message: 'Xóa máy này? Dữ liệu chấm công đã về vẫn được giữ.', confirmLabel: 'Xóa', danger: true }))) return;
    const res = await fetch(`/api/attendance/machines/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { 'x-current-user-role': 'super_admin' },
    });
    const json = await res.json();
    if (json.success) fetchMachines();
    else toast.error('Lỗi: ' + (json.error ?? 'không xóa được'));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Quản Lý Máy Chấm Công</h2>
          <p className="mt-1 text-xs text-muted-foreground">Thêm, sửa, kiểm tra kết nối máy chấm công</p>
        </div>
        <button onClick={openAdd} className="btn-indigo inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600">
          <Plus className="h-4 w-4" /> Thêm máy
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : machines.length === 0 ? (
        <div className="rounded-2xl border border-line-subtle p-8 text-center" style={{ background: 'var(--card)' }}>
          <AlertCircle className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm text-muted-foreground">Chưa có máy chấm công nào</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="hidden md:flex items-center gap-3 border-b border-line-subtle px-4 py-3 bg-slate-500/5">
            <span className="flex-1 text-xs font-600 uppercase text-muted-foreground">Tên / Mã máy</span>
            <span className="w-40 text-xs font-600 uppercase text-muted-foreground">Địa chỉ</span>
            <span className="w-24 text-xs font-600 uppercase text-muted-foreground">Chế độ</span>
            <span className="w-28 text-xs font-600 uppercase text-muted-foreground">Trạng thái</span>
            <span className="w-32 text-xs font-600 uppercase text-muted-foreground">Lần cuối</span>
            <span className="w-20"></span>
          </div>
          {machines.map((m) => (
            <div key={m.id} className="border-b border-line-subtle last:border-0">
            <div
              onClick={() => setSelectedMachine(m)}
              className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-4 py-3 hover:bg-indigo-500/10 transition-colors cursor-pointer"
            >
              <span className="flex-1 min-w-0">
                <p className="text-sm font-500 text-foreground truncate">{m.name}</p>
                <p className="text-xs font-mono text-indigo-400">{m.id}{m.location ? ` · ${m.location}` : ''}</p>
              </span>
              <span className="w-40 text-sm font-mono text-muted-foreground truncate">{m.host}:{m.port}</span>
              <span className="w-24">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-500 ${m.connection_mode === 'pull' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-violet-500/15 text-violet-400'}`}>
                  {m.connection_mode === 'pull' ? <><Download className="h-3 w-3" />Pull</> : <><Upload className="h-3 w-3" />Push</>}
                </span>
              </span>
              <span className="w-28 text-xs">
                {m.status === 'active'
                  ? <span className="inline-flex items-center gap-1 text-emerald-400"><Wifi className="h-3.5 w-3.5" />Online</span>
                  : <span className="inline-flex items-center gap-1 text-red-400" title={m.last_error ?? ''}><WifiOff className="h-3.5 w-3.5" />{m.status === 'error' ? 'Lỗi' : 'Off'}</span>}
              </span>
              <span className="w-32 text-xs text-muted-foreground">
                {fmtTime(liveSyncTime[m.id] || m.last_sync)}{m.connection_mode === 'push' && <span className="opacity-50"> (máy gửi)</span>}
                {syncNewCounts[m.id] != null && syncNewCounts[m.id] > 0 && (
                  <span className="ml-1 text-emerald-400 font-600">+{syncNewCounts[m.id]}</span>
                )}
              </span>
              <span className="w-28 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {m.connection_mode === 'pull' && (
                  <button
                    onClick={() => handleSync(m.id)}
                    disabled={syncingIds.has(m.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-emerald-400 transition-colors disabled:opacity-50"
                    title={syncingIds.has(m.id) ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
                  >
                    <RefreshCw className={`h-4 w-4 ${syncingIds.has(m.id) ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                )}
                <button onClick={() => openEdit(m)} className="rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400 transition-colors" title="Sửa"><Edit2 className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(m.id)} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 transition-colors" title="Xóa"><Trash2 className="h-4 w-4" /></button>
                <a href={`/api/attendance/machines/${m.id}/debug`} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-muted-foreground hover:text-yellow-400 transition-colors" title="Chẩn đoán (Debug JSON)"><Bug className="h-4 w-4" /></a>
              </span>
            </div>
            {/* Kết quả đồng bộ thủ công — hiện 10s rồi tự ẩn */}
            {syncingIds.has(m.id) && (
              <p className="px-4 pb-2.5 text-xs text-indigo-300 inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Đang kết nối máy và kéo dữ liệu...
              </p>
            )}
            {!syncingIds.has(m.id) && syncResults[m.id] && (
              <p className={`px-4 pb-2.5 text-xs inline-flex items-center gap-1.5 ${syncResults[m.id].ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {syncResults[m.id].ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {syncResults[m.id].msg}
              </p>
            )}
            </div>
          ))}
        </div>
      )}

      {/* Form Thêm/Sửa */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}>
          <div className="w-full max-w-lg rounded-3xl border border-line overflow-hidden max-h-[90vh] flex flex-col" style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 flex-shrink-0">
              <h2 className="text-base font-700 text-foreground">{editingId ? 'Sửa Máy Chấm Công' : 'Thêm Máy Chấm Công'}</h2>
              <button onClick={guardedClose} className="p-1.5 hover:bg-slate-500/20 rounded-lg"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-4 p-6 overflow-y-auto" onChange={markDirty}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Mã máy *</label>
                  <input
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none disabled:opacity-50"
                    placeholder="zkteco_vp_a"
                    value={form.id}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Tên máy *</label>
                  <input
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                    placeholder="Ronald Jack - VP A"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </div>

              {/* Chế độ kết nối */}
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Chế độ kết nối</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setForm({ ...form, connection_mode: 'pull' }); markDirty(); }}
                    className={`rounded-xl border p-2.5 text-left transition-colors ${form.connection_mode === 'pull' ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-line hover:bg-hover'}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-600 text-foreground"><Download className="h-4 w-4 text-indigo-400" />Pull (LAN)</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">Server kéo dữ liệu. Cho máy nội bộ.</span>
                  </button>
                  <button
                    onClick={() => { setForm({ ...form, connection_mode: 'push' }); markDirty(); }}
                    className={`rounded-xl border p-2.5 text-left transition-colors ${form.connection_mode === 'push' ? 'border-violet-500/50 bg-violet-500/10' : 'border-line hover:bg-hover'}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-600 text-foreground"><Upload className="h-4 w-4 text-violet-400" />Push (ADMS)</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">Máy tự gửi ra. Cho máy ở xa/qua domain.</span>
                  </button>
                </div>
              </div>

              {/* Hướng dẫn ADMS khi push */}
              {form.connection_mode === 'push' && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="text-violet-300 font-600">Cấu hình trên máy (ADMS / Cloud Server):</p>
                  <p>• Máy mới (có HTTPS): Server <span className="font-mono text-foreground">{ADMS_URL.replace(/^https?:\/\//, '').split('/')[0]}</span> · Port 443 · Bật HTTPS</p>
                  <p>• Máy đời cũ (chỉ HTTP, vd FA120): Server = <span className="font-mono text-foreground">IP server</span> · Port <span className="font-mono text-foreground">80</span> · không cần HTTPS</p>
                  <p>• Đường dẫn: <span className="font-mono text-foreground">/api/attendance/adms</span> (firmware cũ mặc định <span className="font-mono text-foreground">/iclock/cdata</span> cũng nhận)</p>
                  <p>• <span className="font-mono text-foreground">SN của máy = Mã máy</span> ở trên (sai 1 ký tự là dữ liệu không khớp)</p>
                  <p className="text-violet-400/80">Máy push không cần mở cổng vào — an toàn cho kết nối qua domain.</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">{form.connection_mode === 'push' ? 'Host (tham chiếu)' : 'IP / Domain *'}</label>
                  <input
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                    placeholder="115.79.205.119 hoặc may.congty.com"
                    value={form.host}
                    onChange={(e) => { setForm({ ...form, host: e.target.value }); setTestState({ status: 'idle' }); }}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Port *</label>
                  <input
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                    placeholder="1111"
                    value={form.port}
                    onChange={(e) => { setForm({ ...form, port: e.target.value }); setTestState({ status: 'idle' }); }}
                  />
                </div>
              </div>

              {/* Test connection (chỉ cho pull) */}
              {form.connection_mode === 'pull' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTest}
                    disabled={testState.status === 'testing'}
                    className="btn-ghost inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {testState.status === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                    Kiểm tra kết nối
                  </button>
                  {testState.status === 'ok' && <span className="inline-flex items-center gap-1 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" />{testState.msg ?? 'OK'}</span>}
                  {testState.status === 'fail' && <span className="inline-flex items-center gap-1 text-sm text-red-400"><XCircle className="h-4 w-4" />{testState.msg ?? 'Thất bại'}</span>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Loại máy</label>
                  <select
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
                    value={form.machine_type}
                    onChange={(e) => setForm({ ...form, machine_type: e.target.value })}
                  >
                    <option value="zkteco">ZKTeco</option>
                    <option value="ronald_jack">Ronald Jack</option>
                    <option value="hikvision">Hikvision</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
                {form.connection_mode === 'pull' && (
                  <div>
                    <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Chu kỳ poll (giây)</label>
                    <input
                      type="number" min={10}
                      className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground focus:border-indigo-500/60 focus:outline-none"
                      value={form.poll_interval_seconds}
                      onChange={(e) => setForm({ ...form, poll_interval_seconds: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Comm Key (tùy chọn)</label>
                  <input
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                    placeholder="Khóa giao tiếp máy"
                    value={form.comm_key}
                    onChange={(e) => setForm({ ...form, comm_key: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Địa điểm</label>
                  <input
                    className="h-9 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
                    placeholder="VP A, Lầu 2"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={form.polling_enabled} onChange={(e) => setForm({ ...form, polling_enabled: e.target.checked })} className="rounded" />
                <span className="text-sm text-foreground">Bật đồng bộ tự động (polling)</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4 flex-shrink-0">
              <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={handleSave} disabled={submitting || !form.id || !form.name || !form.host} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-40">
                {submitting ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMachine && (
        <MachineDetailPanel machine={selectedMachine} onClose={() => setSelectedMachine(null)} />
      )}
    </div>
  );
}
