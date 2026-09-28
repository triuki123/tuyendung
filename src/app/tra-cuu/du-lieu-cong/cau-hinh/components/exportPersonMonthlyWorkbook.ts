import * as XLSX from 'xlsx-js-style';

/**
 * Xuất "Bảng chấm công" của MỘT người theo khoảng ngày → mỗi THÁNG một sheet.
 * Cột: Ngày | Thứ | Giờ vào | Giờ ra | Ghi chú. Ngày không chấm → "-".
 * Cuối mỗi sheet: "Tổng số ngày có dữ liệu chấm công: X/Y".
 */

export interface PersonDay {
  date: string;        // YYYY-MM-DD
  weekday: string;     // Thứ Hai... / Chủ Nhật
  check_in: string;    // 'HH:MM:SS' | ''
  check_out: string;   // 'HH:MM:SS' | ''
}
export interface PersonInfo {
  name: string;
  employeeCode?: string | null;
  company?: string | null;
  department?: string | null;
}

const HEADERS = ['Ngày', 'Thứ', 'Giờ vào', 'Giờ ra', 'Ghi chú'];
const COL_WIDTHS = [13, 11, 12, 12, 30];

const C_TITLE_BG = '1F3A5F';
const C_HEAD_BG = '2E5984';
const C_ZEBRA = 'EAF3FB';
const C_FOOTER_BG = 'FFF7E6';
const C_BORDER = 'B7C3D0';

const thin = { style: 'thin', color: { rgb: C_BORDER } };
const allBorder = { top: thin, bottom: thin, left: thin, right: thin };

function fmtDate(d: string): string {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

/** Nhóm ngày theo tháng dương lịch, giữ thứ tự tăng dần. */
function groupByMonth(days: PersonDay[]): Map<string, PersonDay[]> {
  const map = new Map<string, PersonDay[]>();
  for (const d of days) {
    const key = d.date.slice(0, 7); // YYYY-MM
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  return map;
}

export function exportPersonMonthlyWorkbook(
  person: PersonInfo,
  from: string,
  to: string,
  days: PersonDay[]
): void {
  const nCol = HEADERS.length;
  const lastC = nCol - 1;
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const months = groupByMonth(days);
  for (const [ym, monthDays] of months) {
    const [y, m] = ym.split('-');
    const aoa: (string | number)[][] = [];

    // Row 0: tiêu đề
    aoa.push([`Bảng chấm công tháng ${Number(m)}/${y}`, '', '', '', '']);
    // Row 1: header
    aoa.push([...HEADERS]);
    const HEADER_R = 1;
    const DATA_START = 2;

    // Data
    let withData = 0;
    for (const d of monthDays) {
      const hasIn = !!d.check_in;
      const hasOut = !!d.check_out;
      if (hasIn || hasOut) withData++;
      aoa.push([
        fmtDate(d.date),
        d.weekday,
        hasIn ? d.check_in : '-',
        hasOut ? d.check_out : '-',
        '',
      ]);
    }

    // Footer
    const footerR = aoa.length;
    aoa.push([`Tổng số ngày có dữ liệu chấm công: ${withData}/${monthDays.length}`, '', '', '', '']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COL_WIDTHS.map((w) => ({ wch: w }));
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: lastC } },
      { s: { r: footerR, c: 0 }, e: { r: footerR, c: lastC } },
    ];
    ws['!freeze'] = { xSplit: 0, ySplit: DATA_START } as unknown as XLSX.Range;

    const range = XLSX.utils.decode_range(ws['!ref']!);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = ws[addr];
        if (!cell) { cell = { t: 's', v: '' }; ws[addr] = cell; }

        if (R === 0) {
          cell.s = { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: C_TITLE_BG } }, alignment: { horizontal: 'center', vertical: 'center' } };
        } else if (R === HEADER_R) {
          cell.s = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: C_HEAD_BG } }, alignment: { horizontal: 'center', vertical: 'center' }, border: allBorder };
        } else if (R === footerR) {
          cell.s = { font: { italic: true, sz: 9, color: { rgb: '7A4F00' } }, fill: { fgColor: { rgb: C_FOOTER_BG } }, alignment: { horizontal: 'left', vertical: 'center' } };
        } else {
          const zebra = (R - DATA_START) % 2 === 1;
          cell.s = {
            font: { sz: 10, color: { rgb: '1A2330' } },
            fill: zebra ? { fgColor: { rgb: C_ZEBRA } } : undefined,
            alignment: { horizontal: C === 0 ? 'left' : 'center', vertical: 'center' },
            border: allBorder,
          };
        }
      }
    }
    ws['!rows'] = aoa.map((_, i) => (i === 0 ? { hpt: 24 } : i === HEADER_R ? { hpt: 20 } : { hpt: 16 }));

    // Tên sheet: T{MM}-{YYYY}, đảm bảo không trùng + hợp lệ (<=31 ký tự, không ký tự cấm).
    let name = `T${m}-${y}`;
    let i = 1;
    while (usedNames.has(name)) name = `T${m}-${y} (${i++})`;
    usedNames.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  // Nếu khoảng ngày không có ngày nào (hiếm) → 1 sheet trống thông báo.
  if (months.size === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['Không có dữ liệu trong khoảng đã chọn']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Trống');
  }

  const safeName = (person.name || 'nhan_vien').replace(/[^\p{L}\p{N}]+/gu, '_');
  XLSX.writeFile(wb, `bang_cham_cong_${safeName}_${from}_den_${to}.xlsx`);
}
