import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { JD_SECTIONS, parseJdFields } from '@/lib/jdForm';
import { displayJdSalary } from '@/lib/jdSalary';

export async function createJdPdf(jd: { title: string; description: string | null; department_name: string | null }) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontPath = process.env.JD_PDF_FONT_PATH || (process.platform === 'win32' ? 'C:/Windows/Fonts/times.ttf' : '/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf');
  const font = await pdf.embedFont(await readFile(fontPath), { subset: true });
  const fields = parseJdFields(jd.description);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const ink = rgb(.12, .15, .2);
  function line(text: string, size = 11, heading = false) {
    const words = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').split(/\s+/);
    let buffer = '';
    const draw = () => {
      if (y < 60) { page = pdf.addPage([595.28, 841.89]); y = 790; }
      page.drawText(buffer, { x: 48, y, font, size, color: heading ? rgb(.05,.25,.48) : ink }); y -= size * 1.55;
    };
    for (const word of words) {
      for (const chunk of word.match(/.{1,55}/gu) || ['']) {
        const next = buffer ? `${buffer} ${chunk}` : chunk;
        if (font.widthOfTextAtSize(next, size) > 499 && buffer) { draw(); buffer = chunk; } else buffer = next;
      }
    }
    if (buffer) draw();
  }
  function section(title: string, text: string) {
    if (!text.trim()) return;
    if (y < 115) { page = pdf.addPage([595.28,841.89]); y = 790; }
    y -= 14; line(title, 13, true); y -= 5;
    for (const paragraph of text.split('\n')) { if (paragraph.trim()) line(paragraph); else y -= 5; }
  }
  line(fields.unit || 'TUYỂN DỤNG', 12, true); y -= 12;
  line(`TUYỂN DỤNG: ${jd.title}`, 17, true); y -= 15;
  line('YÊU CẦU TUYỂN DỤNG', 13, true);
  line(`Vị trí tuyển dụng: ${jd.title}`);
  if (jd.department_name) line(`Phòng ban: ${jd.department_name}`);
  for (const key of ['unit','location','work_time','salary','headcount'] as const) if (fields[key]) line(`${JD_SECTIONS[key]}: ${key === 'salary' ? displayJdSalary(fields.salary) : fields[key]}`);
  section('MÔ TẢ CÔNG VIỆC', [fields.purpose && `Mục đích công việc\n${fields.purpose}`, fields.objectives && `Mục tiêu công việc\n${fields.objectives}`, fields.duties && `Các công việc chính\n${fields.duties}`].filter(Boolean).join('\n\n'));
  section('YÊU CẦU ỨNG VIÊN', fields.requirements);
  section('QUYỀN LỢI ỨNG VIÊN', fields.benefits);
  pdf.getPages().forEach((p, i, pages) => p.drawText(`${i + 1} / ${pages.length}`, { x: 510, y: 30, font, size: 9, color: ink }));
  pdf.setTitle(jd.title);
  return pdf.save();
}
