'use client';

// Xuất phản hồi biểu mẫu ra Excel (.xlsx) và PDF — định dạng mang thương hiệu webapp.
// Thư viện nạp động (dynamic import) để không phình bundle ban đầu.

import type { FormField, FormResponse, FormTemplate } from '@/lib/api/formApi';
import { fmtDateTime } from '@/lib/api/formApi';

// Bảng màu thương hiệu (đồng bộ accent indigo của webapp).
const BRAND = {
  indigo: '4F46E5',
  indigoDark: '4338CA',
  indigoSoft: 'EEF2FF',
  zebra: 'F9FAFB',
  line: 'E5E7EB',
  text: '1F2937',
  muted: '6B7280',
  white: 'FFFFFF',
};

const APP_NAME = 'FADO AssetFlow';

/** Giá trị 1 ô (mảng → nối, rỗng → ''). */
function cellValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  return String(v);
}

function respondent(r: FormResponse): string {
  return r.candidate_name || r.candidate_email || '';
}

function safeFileName(s: string): string {
  return (s || 'bieu-mau').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

interface ExportArgs {
  form: Pick<FormTemplate, 'title' | 'description'>;
  fields: FormField[];          // cột muốn xuất (đã lọc enabled)
  responses: FormResponse[];
  hasRespondent: boolean;
}

// ─── EXCEL (.xlsx) — xlsx-js-style ────────────────────────────────────────────
export async function exportExcel({ form, fields, responses, hasRespondent }: ExportArgs): Promise<void> {
  const XLSX = await import('xlsx-js-style');

  const colLabels = ['Thời gian', ...(hasRespondent ? ['Người gửi'] : []), ...fields.map(f => f.label)];
  const ncols = colLabels.length;

  const dataRows = responses.map(r => [
    fmtDateTime(r.created_at),
    ...(hasRespondent ? [respondent(r)] : []),
    ...fields.map(f => cellValue(r.data?.[f.field_key])),
  ]);

  // Hàng tiêu đề thương hiệu + phụ đề + (trống) + header + dữ liệu.
  const aoa: (string | number)[][] = [
    [form.title],
    [`${APP_NAME} · Xuất ${fmtDateTime(new Date().toISOString())} · ${responses.length} phản hồi`],
    [],
    colLabels,
    ...dataRows,
  ];
  const HEADER_ROW = 3; // 0-based: hàng header

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Gộp ô cho tiêu đề + phụ đề.
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } },
  ];

  const border = {
    top: { style: 'thin', color: { rgb: BRAND.line } },
    bottom: { style: 'thin', color: { rgb: BRAND.line } },
    left: { style: 'thin', color: { rgb: BRAND.line } },
    right: { style: 'thin', color: { rgb: BRAND.line } },
  };

  const set = (r: number, c: number, style: Record<string, unknown>) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = style;
  };

  // Tiêu đề (indigo, đậm, lớn).
  set(0, 0, { font: { bold: true, sz: 16, color: { rgb: BRAND.indigo } }, alignment: { vertical: 'center' } });
  set(1, 0, { font: { sz: 10, color: { rgb: BRAND.muted } } });

  // Header.
  for (let c = 0; c < ncols; c++) {
    set(HEADER_ROW, c, {
      fill: { fgColor: { rgb: BRAND.indigo } },
      font: { bold: true, sz: 11, color: { rgb: BRAND.white } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border,
    });
  }

  // Dữ liệu (viền nhẹ, xen kẽ nền, canh trên, xuống dòng).
  for (let i = 0; i < dataRows.length; i++) {
    const r = HEADER_ROW + 1 + i;
    for (let c = 0; c < ncols; c++) {
      set(r, c, {
        font: { sz: 10, color: { rgb: BRAND.text } },
        alignment: { vertical: 'top', wrapText: true, horizontal: c === 0 ? 'left' : 'left' },
        fill: i % 2 === 1 ? { fgColor: { rgb: BRAND.zebra } } : undefined,
        border,
      });
    }
  }

  // Độ rộng cột tự co theo nội dung (giới hạn 12–48 ký tự).
  ws['!cols'] = colLabels.map((label, c) => {
    let max = label.length;
    for (const row of dataRows) max = Math.max(max, String(row[c] ?? '').slice(0, 80).length);
    return { wch: Math.min(48, Math.max(12, max + 2)) };
  });
  ws['!rows'] = [{ hpt: 24 }, { hpt: 16 }, { hpt: 6 }];
  // Đóng băng từ sau hàng header.
  (ws as Record<string, unknown>)['!freeze'] = { xSplit: 0, ySplit: HEADER_ROW + 1, topLeftCell: XLSX.utils.encode_cell({ r: HEADER_ROW + 1, c: 0 }), activePane: 'bottomLeft', state: 'frozen' };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Phản hồi');
  XLSX.writeFile(wb, `${safeFileName(form.title)}.xlsx`);
}

// ─── PDF — pdfmake (Roboto hỗ trợ tiếng Việt) ────────────────────────────────
export async function exportPdf({ form, fields, responses, hasRespondent }: ExportArgs): Promise<void> {
  const pdfMakeMod = await import('pdfmake/build/pdfmake');
  const vfsMod = await import('pdfmake/build/vfs_fonts');
  const pdfMake: any = (pdfMakeMod as any).default ?? pdfMakeMod;
  const vfs: any = (vfsMod as any).default ?? vfsMod;
  pdfMake.vfs = vfs;
  pdfMake.fonts = {
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  };

  const colLabels = ['Thời gian', ...(hasRespondent ? ['Người gửi'] : []), ...fields.map(f => f.label)];
  const hex = (h: string) => `#${h}`;

  const headerCells = colLabels.map(label => ({ text: label, bold: true, color: hex(BRAND.white), fontSize: 9 }));
  const bodyRows = responses.map(r => [
    { text: fmtDateTime(r.created_at), fontSize: 8, color: hex(BRAND.muted), noWrap: false },
    ...(hasRespondent ? [{ text: respondent(r) || '—', fontSize: 8 }] : []),
    ...fields.map(f => ({ text: cellValue(r.data?.[f.field_key]) || '—', fontSize: 8 })),
  ]);

  const ncols = colLabels.length;
  const widths = ['auto', ...(hasRespondent ? ['auto'] : []), ...fields.map(() => '*')];

  const docDefinition: any = {
    pageSize: 'A4',
    pageOrientation: ncols > 4 ? 'landscape' : 'portrait',
    pageMargins: [28, 92, 28, 44],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: hex(BRAND.text) },

    // Dải header indigo phủ mọi trang.
    background: (_curPage: number, pageSize: { width: number }) => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: 72, color: hex(BRAND.indigo) }],
    }),
    header: () => ({
      columns: [
        { text: APP_NAME, color: hex(BRAND.white), bold: true, fontSize: 15, margin: [28, 26, 0, 0] },
        { text: form.title, color: hex(BRAND.indigoSoft), fontSize: 11, alignment: 'right', margin: [0, 30, 28, 0] },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `${APP_NAME} · Xuất ${fmtDateTime(new Date().toISOString())}`, color: hex(BRAND.muted), fontSize: 8, margin: [28, 0, 0, 0] },
        { text: `Trang ${currentPage}/${pageCount}`, color: hex(BRAND.muted), fontSize: 8, alignment: 'right', margin: [0, 0, 28, 0] },
      ],
    }),

    content: [
      { text: `${responses.length} phản hồi`, color: hex(BRAND.muted), fontSize: 10, margin: [0, 0, 0, 8] },
      ...(form.description ? [{ text: form.description, color: hex(BRAND.muted), italics: true, fontSize: 9, margin: [0, 0, 0, 8] }] : []),
      {
        table: { headerRows: 1, widths, body: [headerCells, ...bodyRows] },
        layout: {
          fillColor: (rowIndex: number) => rowIndex === 0 ? hex(BRAND.indigo) : (rowIndex % 2 === 0 ? hex(BRAND.zebra) : null),
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => hex(BRAND.line),
          vLineColor: () => hex(BRAND.line),
          paddingTop: () => 5,
          paddingBottom: () => 5,
          paddingLeft: () => 6,
          paddingRight: () => 6,
        },
      },
    ],
  };

  pdfMake.createPdf(docDefinition).download(`${safeFileName(form.title)}.pdf`);
}
