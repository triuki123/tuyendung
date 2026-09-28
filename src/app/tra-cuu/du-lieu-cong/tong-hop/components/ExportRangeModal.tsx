'use client';

import { useState } from 'react';
import { X, Download, Loader2, CalendarRange, FileSpreadsheet, FileText, Users } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import { useToast } from '@/context/ToastContext';
import { exportRangeExcel, exportRangeCSV, type RangeExportData } from './exportRangeWorkbook';

interface Emp { user_id: string; user_name: string }

/**
 * Modal "Xuất Dữ Liệu Công" theo khoảng ngày bất kỳ cho các nhân sự được chọn.
 * Gọi /api/attendance/export-range → dựng Excel/CSV client-side.
 */
export default function ExportRangeModal({
  open, onClose, employees, headers,
}: {
  open: boolean;
  onClose: () => void;
  employees: Emp[];
  headers: () => Record<string, string>;
}) {
  const toast = useToast();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const firstOfMonth = today.slice(0, 8) + '01';
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [format, setFormat] = useState<'excel' | 'csv'>('excel');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleExport() {
    if (!employees.length) { toast.warning('Chưa chọn nhân sự nào'); return; }
    if (!from || !to) { toast.warning('Chọn khoảng ngày'); return; }
    if (from > to) { toast.warning('Ngày bắt đầu phải trước ngày kết thúc'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/attendance/export-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ userIds: employees.map((e) => e.user_id), from, to }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { toast.error(json.error ?? 'Lỗi xuất dữ liệu'); return; }

      const data: RangeExportData = { from: json.from, to: json.to, layout: json.layout ?? [], employees: json.employees };
      if (!data.layout.length) { toast.error('Chưa có cột nào được bật ở tab Cấu Hình Xuất Dữ Liệu Công'); return; }
      // Có chấm công HOẶC có đơn nghỉ/bù công đã duyệt đều coi là có dữ liệu để xuất.
      const hasData = data.employees.some((e) =>
        e.days.some((d) => d.check_in || d.check_out || Object.keys(d.values ?? {}).length > 0));
      if (!hasData) { toast.warning('Không có dữ liệu chấm công trong khoảng đã chọn'); return; }

      if (format === 'excel') exportRangeExcel(data);
      else exportRangeCSV(data);
      toast.success('Đã tạo file tải về');
      onClose();
    } catch {
      toast.error('Lỗi kết nối khi xuất dữ liệu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-indigo-400" /> Xuất Dữ Liệu Công
          </h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-line-subtle px-3 py-2.5 text-sm text-muted-foreground" style={{ background: 'var(--secondary)' }}>
            <Users className="h-4 w-4 text-indigo-400 flex-shrink-0" />
            <span><span className="font-700 text-foreground">{employees.length}</span> nhân sự được chọn</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Từ ngày</label>
              <DateInputVN value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-foreground focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Đến ngày</label>
              <DateInputVN value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-foreground focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Định dạng tải về</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setFormat('excel')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-600 transition-colors ${
                  format === 'excel' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
              <button onClick={() => setFormat('csv')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-600 transition-colors ${
                  format === 'csv' ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                <FileText className="h-4 w-4" /> CSV
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={handleExport} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Tải về
          </button>
        </div>
      </div>
    </div>
  );
}
