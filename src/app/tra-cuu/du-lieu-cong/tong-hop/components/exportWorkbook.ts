import * as XLSX from 'xlsx-js-style';
import {
  computeCell,
  resolveColumns,
  DEFAULT_COLUMNS,
  type ResolvedColumn,
  type SheetExportRow,
} from '@/lib/attendanceExportCatalog';

/**
 * Xuất bảng công theo cấu hình cột động (lấy từ Cấu Hình Xuất Bảng Công).
 * Cột nào / thứ tự / nhãn do `columns` quyết định; dữ liệu lấy qua catalog.
 * Phần đầu trang (FADO GROUP, kỳ công, tổng, header 2 tầng) dựng theo vị trí
 * tương đối nên không vỡ khi HR thêm/bớt/đổi thứ tự cột.
 */

const C_TITLE_BG = '1F3A5F';
const C_GROUP_BG = '2E5984';
const C_HEAD_BG  = '34507A';
const C_TOTAL_BG = 'FFF2CC';
const C_BORDER   = 'B7C3D0';
const C_ZEBRA    = 'F4F8FC';

const thin = { style: 'thin', color: { rgb: C_BORDER } };
const allBorder = { top: thin, bottom: thin, left: thin, right: thin };

/** Kỳ công FADO: 28 tháng trước → 27 tháng này. */
function periodLabel(month: number, year: number): string {
  const pm = month === 1 ? 12 : month - 1;
  const py = month === 1 ? year - 1 : year;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `Kỳ công: 28/${p2(pm)}/${py} – 27/${p2(month)}/${year}`;
}

export function exportAttendanceWorkbook(
  rows: SheetExportRow[],
  month: number,
  year: number,
  columns?: ResolvedColumn[]
) {
  // Fallback: chưa truyền cấu hình → dùng layout mặc định (sao y khuôn DETAIL_fill)
  const COLS: ResolvedColumn[] = columns && columns.length ? columns : resolveColumns(DEFAULT_COLUMNS);
  const nCol = COLS.length;
  const lastC = nCol - 1;
  const HEADER_T1 = 6;
  const HEADER_T2 = 7;
  const DATA_START = 8;

  const blank = () => Array(nCol).fill('');
  const aoa: (string | number)[][] = [];

  // Mốc cột chính (position-independent)
  const firstData = COLS.findIndex((c) => c.key !== null);
  const startMerge = firstData < 0 ? 0 : firstData;
  const nameIdx = COLS.findIndex((c) => c.source === 'name');
  const labelIdx = nameIdx >= 0 ? nameIdx : startMerge;
  // Phạm vi nhóm CÔNG ERP (cho dòng chú thích "Ko TC Cơm, xe")
  const erpIdx = COLS.map((c, i) => (c.group === 'CÔNG ERP' ? i : -1)).filter((i) => i >= 0);

  // Row 0: FADO GROUP
  const r0 = blank(); r0[startMerge] = 'FADO GROUP'; aoa.push(r0);
  // Row 1: BẢNG TÍNH CÔNG + kỳ công
  const mid = Math.min(lastC, Math.max(startMerge + 1, Math.floor(nCol * 0.5)));
  const r1 = blank(); r1[startMerge] = 'BẢNG TÍNH CÔNG';
  if (mid < lastC) r1[mid + 1] = periodLabel(month, year);
  aoa.push(r1);
  // Row 2: chú thích
  const r2 = blank(); r2[startMerge] = 'Fado HCM (28 tháng này - 27 tháng sau)'; aoa.push(r2);
  // Row 3: "Ko TC Cơm, xe" trên nhóm CÔNG ERP
  const r3 = blank(); if (erpIdx.length) r3[erpIdx[0]] = 'Ko TC Cơm, xe'; aoa.push(r3);
  // Row 4: tổng cộng (điền sum sau)
  const r4 = blank(); r4[labelIdx] = 'TỔNG CỘNG'; aoa.push(r4);
  // Row 5: số thứ tự cột
  const r5 = blank(); let num = 1; for (let c = 0; c < nCol; c++) { if (COLS[c].key !== null) r5[c] = num++; } aoa.push(r5);
  // Row 6: header tầng 1
  aoa.push(COLS.map((c) => (c.group ? c.group : c.header)));
  // Row 7: header tầng 2
  aoa.push(COLS.map((c) => (c.group ? c.header : '')));
  // Data
  rows.forEach((r, i) => aoa.push(COLS.map((c) => computeCell(c, r, i))));

  // Tính tổng cho row 4 (các cột số, trừ STT)
  COLS.forEach((c, ci) => {
    if (c.type === 'num' || c.type === 'money') {
      if (c.source === 'stt') return;
      let sum = 0;
      rows.forEach((r, i) => { const v = computeCell(c, r, i); if (typeof v === 'number') sum += v; });
      if (sum !== 0) aoa[4][ci] = sum;
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = COLS.map((c) => ({ wch: c.width }));

  // ── Merges ──
  const merges: XLSX.Range[] = [];
  if (lastC > startMerge) merges.push({ s: { r: 0, c: startMerge }, e: { r: 0, c: lastC } });   // FADO GROUP
  if (mid > startMerge) merges.push({ s: { r: 1, c: startMerge }, e: { r: 1, c: mid } });        // BẢNG TÍNH CÔNG
  if (mid < lastC) merges.push({ s: { r: 1, c: mid + 1 }, e: { r: 1, c: lastC } });               // kỳ công
  if (lastC > startMerge) merges.push({ s: { r: 2, c: startMerge }, e: { r: 2, c: lastC } });    // chú thích
  if (erpIdx.length > 1) merges.push({ s: { r: 3, c: erpIdx[0] }, e: { r: 3, c: erpIdx[erpIdx.length - 1] } }); // Ko TC
  // Header nhóm + cột đơn
  let ci = 0;
  while (ci < nCol) {
    const g = COLS[ci].group;
    if (COLS[ci].key === null) { ci++; continue; }
    if (!g) { merges.push({ s: { r: HEADER_T1, c: ci }, e: { r: HEADER_T2, c: ci } }); ci++; }
    else {
      let cj = ci;
      while (cj + 1 < nCol && COLS[cj + 1].group === g) cj++;
      if (cj > ci) merges.push({ s: { r: HEADER_T1, c: ci }, e: { r: HEADER_T1, c: cj } });
      else merges.push({ s: { r: HEADER_T1, c: ci }, e: { r: HEADER_T2, c: ci } });
      ci = cj + 1;
    }
  }
  ws['!merges'] = merges;

  // ── Styles ──
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      let cell = ws[addr];
      if (!cell) { cell = { t: 's', v: '' }; ws[addr] = cell; }
      const col = COLS[C];
      const isSpacer = col?.key === null;

      if (R === 0) {
        cell.s = { font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: C_TITLE_BG } }, alignment: { horizontal: 'center', vertical: 'center' } };
      } else if (R === 1) {
        cell.s = { font: { bold: true, sz: 12, color: { rgb: '1A2330' } }, alignment: { horizontal: C === mid + 1 ? 'right' : 'left', vertical: 'center' } };
      } else if (R === 2 || R === 3) {
        cell.s = { font: { italic: true, sz: 9, color: { rgb: '7A4F00' } }, alignment: { horizontal: 'center', vertical: 'center' } };
      } else if (R === 4) {
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: '1A2330' } },
          fill: { fgColor: { rgb: C_TOTAL_BG } },
          alignment: { horizontal: (col?.type === 'num' || col?.type === 'money') ? 'right' : 'left', vertical: 'center' },
          border: allBorder,
        };
        if (col?.type === 'money') cell.z = '#,##0';
        else if (col?.type === 'num') cell.z = '0.##';
      } else if (R === 5) {
        cell.s = { font: { sz: 8, color: { rgb: '8A93A0' } }, alignment: { horizontal: 'center' }, border: isSpacer ? undefined : allBorder };
      } else if (R === HEADER_T1 || R === HEADER_T2) {
        cell.s = isSpacer ? {} : {
          font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: R === HEADER_T1 ? C_GROUP_BG : C_HEAD_BG } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: allBorder,
        };
      } else {
        // data
        if (isSpacer) { cell.s = {}; continue; }
        const isMoney = col?.type === 'money';
        const isNum = col?.type === 'num' || isMoney;
        const zebra = (R - DATA_START) % 2 === 1;
        const wrap = col?.key === 'ghi_chu' || col?.key === 'ly_do_thieu_du' || col?.group === 'GHI CHÚ PHỤ CẤP';
        cell.s = {
          font: { sz: 9, color: { rgb: '1A2330' } },
          fill: zebra ? { fgColor: { rgb: C_ZEBRA } } : undefined,
          alignment: { horizontal: isNum ? 'right' : 'left', vertical: 'center', wrapText: wrap },
          border: allBorder,
        };
        if (isMoney) { cell.z = '#,##0'; cell.t = 'n'; }
        else if (isNum) { cell.z = '0.##'; cell.t = 'n'; }
      }
    }
  }

  // Freeze tới hết cột Họ tên (hoặc 5 cột đầu nếu không có)
  const xSplit = nameIdx >= 0 ? nameIdx + 1 : Math.min(5, nCol);
  ws['!freeze'] = { xSplit, ySplit: DATA_START } as any;
  ws['!rows'] = aoa.map((_, i) =>
    i === 0 ? { hpt: 26 } : i === HEADER_T1 ? { hpt: 28 } : i === HEADER_T2 ? { hpt: 34 } : { hpt: 17 }
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `DETAIL T${month}.${year}`);
  XLSX.writeFile(wb, `Bang_cong_BCC_T${String(month).padStart(2, '0')}_${year}.xlsx`);
}
