'use client';

import { useState } from 'react';
import { X, Download, Loader2, CalendarOff, Users } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import { useToast } from '@/context/ToastContext';
import { DEFAULT_ATTENDANCE_CONFIG, getPayrollPeriodDates } from '@/lib/config/attendanceConfig';
import { exportLeaveDaysExcel, type LeaveDaysExportData } from './exportLeaveDaysWorkbook';

interface Emp { user_id: string; user_name: string }

/** Date (giờ địa phương) → chuỗi YYYY-MM-DD. */
function toYMD(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/**
 * Modal "Xuất Ngày Nghỉ" — báo cáo ngày-nghỉ/công-đặc-biệt theo khoảng ngày
 * cho các nhân sự được chọn. Gọi /api/attendance/export-leave-days → dựng Excel client-side.
 * Mặc định khoảng ngày = kỳ công đang xem (month/year).
 */
export default function ExportLeaveDaysModal({
  open, onClose, employees, headers, month, year,
}: {
  open: boolean;
  onClose: () => void;
  employees: Emp[];
  headers: () => Record<string, string>;
  month: number;
  year: number;
}) {
  const toast = useToast();
  const period = getPayrollPeriodDates(month, year, DEFAULT_ATTENDANCE_CONFIG);
  const [startDate, setStartDate] = useState(toYMD(period.startDate));
  const [endDate, setEndDate] = useState(toYMD(period.endDate));
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleExport() {
    if (!employees.length) { toast.warning('Chưa chọn nhân sự nào'); return; }
    if (!startDate || !endDate) { toast.warning('Chọn khoảng ngày'); return; }
    if (startDate > endDate) { toast.warning('Ngày bắt đầu phải trước ngày kết thúc'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/attendance/export-leave-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ userIds: employees.map((e) => e.user_id), startDate, endDate }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { toast.error(json.error ?? 'Lỗi xuất dữ liệu'); return; }

      const data: LeaveDaysExportData = {
        startDate,
        endDate,
        columns: json.data.columns,
        rows: json.data.rows,
      };
      if (!data.rows.length) { toast.warning('Không có đơn nghỉ/công đặc biệt nào trong khoảng đã chọn'); return; }

      exportLeaveDaysExcel(data);
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
            <CalendarOff className="h-5 w-5 text-emerald-400" /> Xuất Ngày Nghỉ
          </h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Xuất Excel các ngày nghỉ phép / công đặc biệt (đơn đã duyệt) — mỗi dòng là 1 nhân sự × 1 ngày,
            giá trị 1 hoặc 0,5 theo loại.
          </p>

          <div className="flex items-center gap-2 rounded-xl border border-line-subtle px-3 py-2.5 text-sm text-muted-foreground" style={{ background: 'var(--secondary)' }}>
            <Users className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span><span className="font-700 text-foreground">{employees.length}</span> nhân sự được chọn</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Từ ngày</label>
              <DateInputVN value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-foreground focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Đến ngày</label>
              <DateInputVN value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-foreground focus:outline-none focus:border-emerald-500" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={handleExport} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-600 text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Xuất Excel
          </button>
        </div>
      </div>
    </div>
  );
}
