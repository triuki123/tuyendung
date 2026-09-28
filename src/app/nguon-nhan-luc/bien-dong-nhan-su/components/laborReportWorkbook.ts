import * as XLSX from 'xlsx-js-style';

/**
 * Xuất file Excel "Báo cáo tình hình sử dụng lao động" theo Mẫu số 01/PLI
 * ban hành kèm Nghị định 145/2020/NĐ-CP (nộp định kỳ 6 tháng & hằng năm).
 *
 * Gồm 2 sheet:
 *  - "Tổng hợp": số liệu tổng quan (giới tính, nước ngoài, BHXH, trình độ, loại HĐ).
 *  - "Mẫu 01-PLI": danh sách chi tiết từng lao động đang làm việc.
 *
 * Tạo hoàn toàn ở client (XLSX.writeFile tự tải về), khớp pattern exportWorkbook.ts.
 */

interface Bucket { label: string; count: number }
interface LaborReportRow {
  stt: number; name: string; dob: string | null; gender: string | null;
  nationality: string | null; education: string | null; position: string | null;
  department: string | null; company: string | null; contractType: string | null;
  hireDate: string | null; hasInsurance: boolean;
}
export interface LaborUsageReport {
  year: number; companyId: string | null; companyName: string | null; generatedAt: string;
  summary: {
    total: number; female: number; male: number; other: number;
    foreign: number; insured: number;
    byEducation: Bucket[]; byContractType: Bucket[];
  };
  rows: LaborReportRow[];
}

// ── Bảng màu ──
const C_TITLE = '1F3A5F';
const C_HEAD = '2E5984';
const C_SUBTITLE_TXT = '475569';
const C_TOTAL_BG = 'FFF2CC';
const C_BORDER = 'B7C3D0';
const C_ZEBRA = 'F4F8FC';

const thin = { style: 'thin', color: { rgb: C_BORDER } };
const allBorder = { top: thin, bottom: thin, left: thin, right: thin };

const fmtDate = (d?: string | null): string => {
  if (!d) return '';
  const p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
};
const fmtDateTime = (iso: string): string => {
  const d = String(iso).slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
};
const isFemaleGender = (g: string | null): boolean => (g || '').trim().toLowerCase() === 'nữ';

// ════════════════ Sheet 1: Danh sách chi tiết (Mẫu 01/PLI) ════════════════════
function buildDetailSheet(data: LaborUsageReport): XLSX.WorkSheet {
  const NCOL = 11; // 0..10
  const lastC = NCOL - 1;
  const HEAD_T1 = 5;
  const HEAD_T2 = 6;
  const DATA_START = 7;
  const blank = () => Array(NCOL).fill('');

  const aoa: (string | number)[][] = [];
  // Row 0: tên đơn vị
  const r0 = blank();
  r0[0] = data.companyName ? data.companyName.toUpperCase() : 'TỔNG HỢP TOÀN HỆ THỐNG';
  aoa.push(r0);
  // Row 1: tiêu đề báo cáo
  const r1 = blank(); r1[0] = 'BÁO CÁO TÌNH HÌNH SỬ DỤNG LAO ĐỘNG'; aoa.push(r1);
  // Row 2: căn cứ pháp lý
  const r2 = blank(); r2[0] = '(Mẫu số 01/PLI ban hành kèm theo Nghị định số 145/2020/NĐ-CP)'; aoa.push(r2);
  // Row 3: kỳ + ngày xuất
  const r3 = blank();
  r3[0] = `Kỳ báo cáo: Năm ${data.year}`;
  r3[lastC] = `Ngày lập: ${fmtDateTime(data.generatedAt)}`;
  aoa.push(r3);
  // Row 4: trống
  aoa.push(blank());
  // Row 5: header tầng 1
  aoa.push([
    'STT', 'Họ và tên', 'Ngày, tháng, năm sinh', '', 'Quốc tịch',
    'Trình độ CMKT', 'Vị trí việc làm', 'Phòng ban', 'Loại HĐLĐ',
    'Thời điểm bắt đầu làm việc', 'Tham gia BHXH',
  ]);
  // Row 6: header tầng 2 (Nam / Nữ dưới "Ngày sinh")
  aoa.push(['', '', 'Nam', 'Nữ', '', '', '', '', '', '', '']);
  // Data
  for (const r of data.rows) {
    const dob = fmtDate(r.dob);
    const isFemale = isFemaleGender(r.gender);
    aoa.push([
      r.stt,
      r.name || '',
      isFemale ? '' : dob,          // Nam
      isFemale ? dob : '',          // Nữ
      r.nationality || '',
      r.education || '',
      r.position || '',
      r.department || '',
      r.contractType || '',
      fmtDate(r.hireDate),
      r.hasInsurance ? 'Có' : 'Không',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 5 }, { wch: 26 }, { wch: 13 }, { wch: 13 }, { wch: 12 },
    { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 12 },
  ];

  // Merges
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastC } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastC } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastC } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
    { s: { r: HEAD_T1, c: 2 }, e: { r: HEAD_T1, c: 3 } }, // "Ngày sinh" ngang Nam/Nữ
  ];
  // Các cột đơn merge dọc 2 hàng header
  for (const c of [0, 1, 4, 5, 6, 7, 8, 9, 10]) {
    merges.push({ s: { r: HEAD_T1, c }, e: { r: HEAD_T2, c } });
  }
  ws['!merges'] = merges;

  // Styles
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      let cell = ws[addr];
      if (!cell) { cell = { t: 's', v: '' }; ws[addr] = cell; }

      if (R === 0) {
        cell.s = { font: { bold: true, sz: 12, color: { rgb: '1A2330' } }, alignment: { horizontal: 'left', vertical: 'center' } };
      } else if (R === 1) {
        cell.s = { font: { bold: true, sz: 14, color: { rgb: C_TITLE } }, alignment: { horizontal: 'center', vertical: 'center' } };
      } else if (R === 2) {
        cell.s = { font: { italic: true, sz: 10, color: { rgb: C_SUBTITLE_TXT } }, alignment: { horizontal: 'center', vertical: 'center' } };
      } else if (R === 3) {
        cell.s = { font: { sz: 10, color: { rgb: '1A2330' } }, alignment: { horizontal: C === lastC ? 'right' : 'left', vertical: 'center' } };
      } else if (R === HEAD_T1 || R === HEAD_T2) {
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: C_HEAD } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: allBorder,
        };
      } else if (R >= DATA_START) {
        const zebra = (R - DATA_START) % 2 === 1;
        const isCenter = C === 0 || C === 2 || C === 3 || C === 4 || C === 9 || C === 10;
        cell.s = {
          font: { sz: 10, color: { rgb: '1A2330' } },
          fill: zebra ? { fgColor: { rgb: C_ZEBRA } } : undefined,
          alignment: { horizontal: isCenter ? 'center' : 'left', vertical: 'center', wrapText: C === 6 || C === 8 },
          border: allBorder,
        };
      }
    }
  }

  ws['!freeze'] = { xSplit: 2, ySplit: DATA_START } as any;
  ws['!rows'] = aoa.map((_, i) =>
    i === 1 ? { hpt: 22 } : i === HEAD_T1 ? { hpt: 20 } : i === HEAD_T2 ? { hpt: 18 } : { hpt: 16 }
  );
  return ws;
}

// ════════════════ Sheet 2: Tổng hợp ═══════════════════════════════════════════
function buildSummarySheet(data: LaborUsageReport): XLSX.WorkSheet {
  const s = data.summary;
  const aoa: (string | number)[][] = [];
  const push2 = (a: string | number, b: string | number = '') => aoa.push([a, b]);

  push2(data.companyName ? data.companyName.toUpperCase() : 'TỔNG HỢP TOÀN HỆ THỐNG');
  push2('TỔNG HỢP TÌNH HÌNH SỬ DỤNG LAO ĐỘNG');
  push2(`Kỳ báo cáo: Năm ${data.year}`, `Ngày lập: ${fmtDateTime(data.generatedAt)}`);
  push2('', '');

  const tableStart = aoa.length;
  push2('Chỉ tiêu', 'Số lượng');
  push2('Tổng số lao động đang làm việc', s.total);
  push2('  - Lao động nam', s.male);
  push2('  - Lao động nữ', s.female);
  if (s.other > 0) push2('  - Chưa xác định giới tính', s.other);
  push2('Lao động là người nước ngoài', s.foreign);
  push2('Lao động tham gia BHXH', s.insured);
  const tableEnd = aoa.length - 1;

  push2('', '');
  const eduStart = aoa.length;
  push2('Phân theo trình độ chuyên môn kỹ thuật', '');
  for (const b of s.byEducation) push2(`  ${b.label}`, b.count);
  const eduEnd = aoa.length - 1;

  push2('', '');
  const ctStart = aoa.length;
  push2('Phân theo loại hợp đồng lao động', '');
  for (const b of s.byContractType) push2(`  ${b.label}`, b.count);
  const ctEnd = aoa.length - 1;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 44 }, { wch: 16 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
  ];

  const sectionHeaderRows = new Set([tableStart, eduStart, ctStart]);
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = 0; C <= 1; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      let cell = ws[addr];
      if (!cell) { cell = { t: 's', v: '' }; ws[addr] = cell; }

      if (R === 0) {
        cell.s = { font: { bold: true, sz: 12, color: { rgb: '1A2330' } }, alignment: { horizontal: 'left', vertical: 'center' } };
      } else if (R === 1) {
        cell.s = { font: { bold: true, sz: 14, color: { rgb: C_TITLE } }, alignment: { horizontal: 'center', vertical: 'center' } };
      } else if (R === 2) {
        cell.s = { font: { sz: 10, color: { rgb: '1A2330' } }, alignment: { horizontal: C === 1 ? 'right' : 'left', vertical: 'center' } };
      } else if (sectionHeaderRows.has(R)) {
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: C_HEAD } },
          alignment: { horizontal: C === 1 ? 'center' : 'left', vertical: 'center' },
          border: allBorder,
        };
      } else {
        const inTable = (R > tableStart && R <= tableEnd) || (R > eduStart && R <= eduEnd) || (R > ctStart && R <= ctEnd);
        if (!inTable) { cell.s = {}; continue; }
        const isTotal = R === tableStart + 1; // dòng "Tổng số lao động"
        cell.s = {
          font: { bold: isTotal, sz: 10, color: { rgb: '1A2330' } },
          fill: isTotal ? { fgColor: { rgb: C_TOTAL_BG } } : undefined,
          alignment: { horizontal: C === 1 ? 'center' : 'left', vertical: 'center' },
          border: allBorder,
        };
      }
    }
  }
  ws['!rows'] = aoa.map((_, i) => (i === 1 ? { hpt: 22 } : { hpt: 17 }));
  return ws;
}

/** Dựng workbook & tải về. */
export function exportLaborReportWorkbook(data: LaborUsageReport) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(data), 'Tổng hợp');
  XLSX.utils.book_append_sheet(wb, buildDetailSheet(data), 'Mẫu 01-PLI');
  const slug = data.companyName
    ? data.companyName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    : 'Toan_he_thong';
  XLSX.writeFile(wb, `Bao_cao_su_dung_lao_dong_${slug}_${data.year}.xlsx`);
}
