import * as XLSX from 'xlsx-js-style';

/**
 * Xuất "Ngày Nghỉ" — báo cáo ngày-nghỉ/công-đặc-biệt theo khoảng ngày.
 * Mỗi dòng = 1 nhân sự × 1 ngày có đơn đã duyệt; giá trị (1 / 0.5) nằm vào cột theo LOẠI.
 * Cột động theo dữ liệu thật (danh mục leave_types + loại bù công).
 */

export interface LeaveDayRow {
  date: string; // YYYY-MM-DD
  user_name: string;
  values: Record<string, number>;
}

export interface LeaveDaysExportData {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  columns: string[]; // nhãn cột loại nghỉ/công đặc biệt (động)
  rows: LeaveDayRow[];
}

/** dd/mm/yyyy từ YYYY-MM-DD. */
function fmtDate(d: string): string {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

const C_TITLE_BG = '1F3A5F';
const C_HEAD_BG = '2E5984';
const C_BORDER = 'B7C3D0';
const C_ZEBRA = 'F4F8FC';

const thin = { style: 'thin', color: { rgb: C_BORDER } };
const allBorder = { top: thin, bottom: thin, left: thin, right: thin };

/** Xuất Excel (.xlsx) có style. */
export function exportLeaveDaysExcel(data: LeaveDaysExportData): void {
  const headers = ['STT', 'NGÀY THÁNG', 'HỌ TÊN', ...data.columns];
  const nCol = headers.length;
  const lastC = nCol - 1;

  const aoa: (string | number)[][] = [];
  const blank = () => Array(nCol).fill('');

  // Row 0: tiêu đề
  const r0 = blank(); r0[0] = 'BẢNG NGÀY NGHỈ / CÔNG ĐẶC BIỆT'; aoa.push(r0);
  // Row 1: khoảng ngày
  const r1 = blank(); r1[0] = `Từ ${fmtDate(data.startDate)} đến ${fmtDate(data.endDate)} · ${data.rows.length} dòng`; aoa.push(r1);
  // Row 2: header
  aoa.push(headers);
  const HEADER_R = 2;
  const DATA_START = 3;
  // Data
  data.rows.forEach((r, i) => {
    aoa.push([
      i + 1,
      fmtDate(r.date),
      r.user_name,
      ...data.columns.map((c) => (r.values[c] != null ? r.values[c] : '')),
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 13 },
    { wch: 26 },
    ...data.columns.map((c) => ({ wch: Math.max(12, Math.min(28, c.length + 2)) })),
  ];
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
        const dataIdx = R - DATA_START;
        const fill = dataIdx % 2 === 1 ? { fgColor: { rgb: C_ZEBRA } } : undefined;
        const isValueCol = C >= 3;
        cell.s = {
          font: { sz: 10, color: { rgb: '1A2330' } },
          fill,
          alignment: { horizontal: C === 2 ? 'left' : 'center', vertical: 'center' },
          border: allBorder,
        };
        // Giá trị 1 / 0.5 → cell số, hiển thị 0.5 đúng số.
        if ((C === 0 || isValueCol) && typeof cell.v === 'number') {
          cell.t = 'n';
          if (isValueCol) cell.z = '0.##';
        }
      }
    }
  }

  ws['!rows'] = aoa.map((_, i) => (i === 0 ? { hpt: 26 } : i === HEADER_R ? { hpt: 30 } : { hpt: 16 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ngày nghỉ');
  XLSX.writeFile(wb, `ngay-nghi_${data.startDate}_${data.endDate}.xlsx`);
}
