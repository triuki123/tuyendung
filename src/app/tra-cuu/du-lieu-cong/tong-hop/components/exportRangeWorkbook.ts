import * as XLSX from 'xlsx-js-style';
import { LEAVE_PREFIX, type ResolvedRangeColumn } from '@/lib/rangeExportCatalog';

/**
 * Xuất "Dữ Liệu Công" theo khoảng ngày bất kỳ cho nhiều nhân sự.
 * Bảng phẳng: 1 dòng = 1 nhân sự × 1 ngày.
 *
 * Bố cục cột KHÔNG cứng ở đây — API trả về `layout` đã giải nghĩa từ tab
 * "Cấu Hình Xuất Dữ Liệu Công" (bật/tắt, đổi thứ tự, đổi tên, cột thủ công,
 * và khối loại nghỉ/bù công tự sinh). File này chỉ lo dựng ô + style.
 */

export interface RangeDay {
  date: string;        // YYYY-MM-DD
  weekday: string;     // Thứ Hai...
  check_in: string;    // 'HH:MM' | ''
  check_out: string;   // 'HH:MM' | ''
  total_hours: number;
  work_days: number;   // ngày công = giờ công ÷ ngưỡng đủ công
  over_hours: number;  // dư giờ
  short_hours: number; // thiếu giờ
  values: Record<string, number>; // nhãn cột nghỉ/bù công → 1 | 0.5
}
export interface RangeEmployee {
  userId: string;
  name: string;
  employeeCode: string | null;
  company: string | null;
  department: string | null;
  standardHours: number;
  days: RangeDay[];
}
export interface RangeExportData {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  /** Cột cuối cùng của file, theo đúng thứ tự hiển thị. */
  layout: ResolvedRangeColumn[];
  employees: RangeEmployee[];
}

/** dd/mm/yyyy từ YYYY-MM-DD. */
function fmtDate(d: string): string {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function isWeekend(weekday: string): boolean {
  return weekday === 'Thứ Bảy' || weekday === 'Chủ Nhật';
}

/** Giá trị 1 ô theo key cột. Số 0 / rỗng → để trống cho file dễ đọc. */
function cellValue(
  key: string, e: RangeEmployee, d: RangeDay, stt: number
): string | number {
  switch (key) {
    case 'stt':            return stt;
    case 'employee_code':  return e.employeeCode ?? '';
    case 'name':           return e.name;
    case 'company':        return e.company ?? '';
    case 'department':     return e.department ?? '';
    case 'date':           return fmtDate(d.date);
    case 'weekday':        return d.weekday;
    case 'check_in':       return d.check_in;
    case 'check_out':      return d.check_out;
    case 'total_hours':    return d.total_hours > 0 ? d.total_hours : '';
    case 'work_days':      return d.work_days > 0 ? d.work_days : '';
    case 'over_hours':     return d.over_hours > 0 ? d.over_hours : '';
    case 'short_hours':    return d.short_hours > 0 ? d.short_hours : '';
    case 'standard_hours': return e.standardHours;
    default:
      // Cột nghỉ/bù công: chỉ điền khi ngày đó có đơn đã duyệt.
      if (key.startsWith(LEAVE_PREFIX)) return d.values[key.slice(LEAVE_PREFIX.length)] ?? '';
      return ''; // manual_* / spacer_* → ô trống cho HR tự điền
  }
}

/** Phẳng hóa dữ liệu thành mảng dòng [cells...] + cờ cuối tuần để tô màu. */
function toRows(data: RangeExportData): { cells: (string | number)[]; weekend: boolean }[] {
  const out: { cells: (string | number)[]; weekend: boolean }[] = [];
  let stt = 1;
  for (const e of data.employees) {
    for (const d of e.days) {
      const n = stt++;
      out.push({
        cells: data.layout.map((col) => cellValue(col.key, e, d, n)),
        weekend: isWeekend(d.weekday),
      });
    }
  }
  return out;
}

const C_TITLE_BG = '1F3A5F';
const C_HEAD_BG = '2E5984';
const C_BORDER = 'B7C3D0';
const C_ZEBRA = 'F4F8FC';
const C_WEEKEND = 'FCEFE6';

const thin = { style: 'thin', color: { rgb: C_BORDER } };
const allBorder = { top: thin, bottom: thin, left: thin, right: thin };

/** Cột căn TRÁI (định danh); còn lại căn giữa, cột số căn phải. */
const LEFT_KEYS = new Set(['employee_code', 'name', 'company', 'department']);

/** Xuất Excel (.xlsx) có style. */
export function exportRangeExcel(data: RangeExportData): void {
  const layout = data.layout;
  const nCol = layout.length;
  const lastC = nCol - 1;
  const rows = toRows(data);

  const aoa: (string | number)[][] = [];
  const blank = () => Array(nCol).fill('');

  // Row 0: tiêu đề
  const r0 = blank(); r0[0] = 'BẢNG DỮ LIỆU CÔNG'; aoa.push(r0);
  // Row 1: khoảng ngày
  const r1 = blank(); r1[0] = `Từ ${fmtDate(data.from)} đến ${fmtDate(data.to)} · ${data.employees.length} nhân sự`; aoa.push(r1);
  // Row 2: header
  aoa.push(layout.map((c) => c.label));
  const HEADER_R = 2;
  const DATA_START = 3;
  // Data
  rows.forEach((r) => aoa.push(r.cells));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = layout.map((c) => ({ wch: c.width }));
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastC } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastC } },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: DATA_START } as unknown as XLSX.Range;

  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      let cell = ws[addr];
      if (!cell) { cell = { t: 's', v: '' }; ws[addr] = cell; }

      if (R === 0) {
        cell.s = { font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: C_TITLE_BG } }, alignment: { horizontal: 'center', vertical: 'center' } };
      } else if (R === 1) {
        cell.s = { font: { italic: true, sz: 10, color: { rgb: '425066' } }, alignment: { horizontal: 'center', vertical: 'center' } };
      } else if (R === HEADER_R) {
        cell.s = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: C_HEAD_BG } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: allBorder };
      } else {
        const col = layout[C];
        const dataIdx = R - DATA_START;
        const weekend = rows[dataIdx]?.weekend;
        const isNum = col?.type === 'number';
        const fill = weekend ? { fgColor: { rgb: C_WEEKEND } } : (dataIdx % 2 === 1 ? { fgColor: { rgb: C_ZEBRA } } : undefined);
        cell.s = {
          font: { sz: 10, color: { rgb: '1A2330' } },
          fill,
          alignment: {
            horizontal: isNum ? 'right' : (col && LEFT_KEYS.has(col.key) ? 'left' : 'center'),
            vertical: 'center',
          },
          border: allBorder,
        };
        if (isNum && typeof cell.v === 'number') { cell.z = '0.##'; cell.t = 'n'; }
      }
    }
  }

  ws['!rows'] = aoa.map((_, i) => (i === 0 ? { hpt: 26 } : i === HEADER_R ? { hpt: 30 } : { hpt: 16 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dữ liệu công');
  XLSX.writeFile(wb, `Du_lieu_cong_${data.from}_den_${data.to}.xlsx`);
}

/** Xuất CSV (BOM UTF-8 để Excel đọc tiếng Việt đúng). */
export function exportRangeCSV(data: RangeExportData): void {
  const rows = toRows(data);
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    data.layout.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => r.cells.map(esc).join(',')),
  ];
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Du_lieu_cong_${data.from}_den_${data.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
