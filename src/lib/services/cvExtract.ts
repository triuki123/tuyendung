import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { CV_IMPORT_FIELDS } from '@/lib/cvImport';
import type { CvImportField, CvExtractionEvidence, ExtractedCvCandidateData } from '@/lib/cvImport';
import { inferCvEducationDegree, normalizeCvEducationDegree, CV_EDUCATION_LEVELS } from '@/lib/cvFilters';
import { inferIndustryFromCandidate, inferIndustryFromPosition } from '@/lib/cvIndustry';

/**
 * cvExtract — Trích xuất nội dung & gợi ý dữ liệu có cấu trúc từ file CV.
 *
 * Server-side only (dùng pdf-parse / mammoth qua dynamic import để không lọt
 * vào bundle client). Mọi hàm đều phòng thủ: lỗi parse → trả rỗng, KHÔNG ném.
 *
 * Dùng cho:
 *  - content_text  : nội dung text đầy đủ (tìm kiếm full-text + Phase 2 AI).
 *  - search_text   : chuẩn hoá không dấu + lowercase (tìm kiếm không dấu).
 *  - skills[]      : gợi ý kỹ năng theo từ điển (HR chỉnh tay lại được).
 *  - yearsExperience: gợi ý số năm kinh nghiệm.
 */

/** Bỏ dấu tiếng Việt + đổi đ→d, dùng cho chuẩn hoá tìm kiếm. */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Gộp các phần text → chuỗi không dấu, lowercase, gọn khoảng trắng (cho search_text). */
export function normalizeSearch(...parts: (string | null | undefined)[]): string {
  const joined = parts.filter(Boolean).join(' ');
  return stripDiacritics(stripControlChars(joined)).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Trích text từ buffer CV theo mime/đuôi file. Trả '' nếu không hỗ trợ / lỗi. */
export async function extractCvText(
  buffer: Buffer,
  mimeType?: string | null,
  fileName?: string | null
): Promise<string> {
  return (await extractCvDocument(buffer, mimeType, fileName)).text;
}

export interface ExtractedCvDocument { text: string; data: ExtractedCvCandidateData }
type ExtractionState = { cache: Map<string, { expires: number; result: ExtractedCvDocument }>; pending: Map<string, Promise<ExtractedCvDocument>>; tail: Promise<void> };
const extractionGlobal = globalThis as typeof globalThis & { cvExtractionState?: ExtractionState };
const extractionState = extractionGlobal.cvExtractionState ||= { cache: new Map(), pending: new Map(), tail: Promise.resolve() };
// Keep native PDF/OCR codecs outside Webpack's server dependency rewriting.
const loadLocalRequire = Function('filename', 'return import("node:module").then(module => module.createRequire(filename))') as (filename: string) => Promise<NodeRequire>;
let localRequirePromise: Promise<NodeRequire> | undefined;

/** Bounded, short-lived server cache: an upload is parsed once, not again on Save. */
export async function extractCvDocument(buffer: Buffer, mimeType?: string | null, fileName?: string | null): Promise<ExtractedCvDocument> {
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('Tệp CV phải nhỏ hơn hoặc bằng 20MB.');
  const key = createHash('sha256').update(buffer).update(`:${fileName || ''}:${mimeType || ''}`).digest('hex');
  for (const [id, entry] of extractionState.cache) if (entry.expires < Date.now()) extractionState.cache.delete(id);
  const cached = extractionState.cache.get(key);
  if (cached) return cached.result;
  const pending = extractionState.pending.get(key);
  if (pending) return pending;
  if (extractionState.pending.size >= 8) throw new Error('Đang đọc nhiều CV. Vui lòng chờ và thử lại.');
  const task = extractionState.tail.then(async () => {
    const result = await readCvDocument(buffer, mimeType, fileName);
    if (extractionState.cache.size >= 16) extractionState.cache.delete(extractionState.cache.keys().next().value!);
    if (result.data.extracted && !result.data.warnings.some(value => /Không đọc được|Không khởi động|vượt quá thời gian/.test(value))) {
      const expires = Date.now() + 10 * 60_000;
      extractionState.cache.set(key, { expires, result });
      const expiry = setTimeout(() => { if (extractionState.cache.get(key)?.expires === expires) extractionState.cache.delete(key); }, 10 * 60_000);
      expiry.unref();
    }
    return result;
  });
  extractionState.pending.set(key, task);
  extractionState.tail = task.then(() => {}, () => {});
  try { return await task; } finally { extractionState.pending.delete(key); }
}

async function readOcr(images: Buffer[]): Promise<{ text: string; confidence: number }[]> {
  if (images.reduce((size, image) => size + image.length, 0) > 20 * 1024 * 1024) throw new Error('Ảnh CV quá lớn để đọc tự động.');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=384', path.join(process.cwd(), 'scripts', 'cv-ocr-worker.cjs')],
      { cwd: process.cwd(), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '', settled = false;
    const finish = (error?: Error, pages?: { text: string; confidence: number }[]) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) { child.kill(); reject(error); } else resolve(pages || []);
    };
    const timer = setTimeout(() => finish(new Error('Đọc ảnh CV vượt quá thời gian cho phép. Hãy dùng PDF có chữ hoặc DOCX.')), 90_000);
    child.on('error', () => finish(new Error('Không khởi động được bộ đọc ảnh CV.')));
    child.stdin.on('error', () => finish(new Error('Không đọc được ảnh CV.')));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (value: string) => {
      output += value; if (output.length > 700_000) finish(new Error('Nội dung ảnh CV quá dài.'));
    });
    child.on('close', code => {
      if (code !== 0) return finish(new Error('Không đọc được ảnh CV. Kiểm tra ảnh rõ nét và dữ liệu OCR trên máy.'));
      try { const result = JSON.parse(output); if (!Array.isArray(result.pages)) throw new Error(); finish(undefined, result.pages); }
      catch { finish(new Error('Bộ đọc ảnh CV trả về dữ liệu không hợp lệ.')); }
    });
    child.stdin.end(JSON.stringify({ images: images.map(image => image.toString('base64')) }));
  });
}

async function readCvDocument(buffer: Buffer, mime?: string | null, name?: string | null): Promise<ExtractedCvDocument> {
  let text = '', method: ExtractedCvCandidateData['method'] = 'text';
  const warnings: string[] = [];
  try {
    const localRequire = await (localRequirePromise ||= loadLocalRequire(path.join(process.cwd(), 'package.json')));
    const isPdf = buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (isPdf) {
      const { PDFParse } = localRequire('pdf-parse') as typeof import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
      try {
        const result = await parser.getText({ first: 20 });
        if (result.total > 20) warnings.push('CV dài hơn 20 trang: chỉ đọc 20 trang đầu, cần kiểm tra các trang còn lại.');
        const pages = [...result.pages];
        const scanned = pages.filter(page => page.text.replace(/\W/g, '').length < 25);
        if (scanned.length) {
          method = 'ocr';
          if (scanned.length > 6) warnings.push('Chỉ OCR tối đa 6 trang ảnh để giới hạn tài nguyên. Cần kiểm tra các trang ảnh còn lại.');
          const screenshots = [];
          for (const page of scanned.slice(0, 6)) {
            const rendered = await parser.getScreenshot({ partial: [page.num], desiredWidth: 1600, imageBuffer: true, imageDataUrl: false });
            if (rendered.pages[0]?.data) screenshots.push(Buffer.from(rendered.pages[0].data));
          }
          try {
            const recognized = await readOcr(screenshots);
            scanned.slice(0, recognized.length).forEach((page, index) => { page.text = recognized[index].text; });
            if (recognized.some(page => page.confidence < 80)) warnings.push('Một số chữ trong ảnh chưa rõ; cần đối chiếu thông tin được điền với CV gốc.');
          } catch (error) { warnings.push(error instanceof Error ? error.message : 'Không đọc được các trang ảnh.'); }
        }
        text = pages.map(page => page.text).join('\n\n');
      } finally { await parser.destroy().catch(() => {}); }
    } else if (isZip && buffer.includes(Buffer.from('word/document.xml'))) {
      // Reject zip bombs before the DOCX parser decompresses the document.
      let expanded = 0, entries = 0, offset = 0;
      while ((offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset)) >= 0) {
        if (offset + 46 > buffer.length) throw new Error('DOCX không hợp lệ.');
        expanded += buffer.readUInt32LE(offset + 24); entries++;
        if (expanded > 40 * 1024 * 1024 || entries > 2000) throw new Error('DOCX chứa nội dung quá lớn để đọc an toàn.');
        offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
      }
      const mammoth = localRequire('mammoth') as typeof import('mammoth');
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (buffer[0] === 0xff && buffer[1] === 0xd8 || buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || buffer.subarray(0, 4).toString() === 'RIFF') {
      method = 'ocr';
      const [result] = await readOcr([buffer]); text = result?.text || '';
      if (!result || result.confidence < 80) warnings.push('Ảnh có chữ chưa rõ; cần đối chiếu thông tin được điền với CV gốc.');
    } else if (/\.txt$/i.test(name || '') || mime === 'text/plain') {
      text = buffer.toString('utf8');
      if (/[\u0000\ufffd]/.test(text)) throw new Error('Tệp không phải văn bản UTF-8 có thể đọc được.');
    } else { warnings.push('Định dạng chưa hỗ trợ tự đọc. Hãy dùng PDF, DOCX, ảnh PNG/JPEG/WebP hoặc TXT.'); }
  } catch (error) { warnings.push(error instanceof Error ? error.message : 'Không đọc được CV.'); }
  if (text.length > 100_000) warnings.push('Nội dung CV quá dài; cần kiểm tra phần vượt quá giới hạn tự đọc.');
  text = cleanText(text);
  if (!text) { method = 'unreadable'; warnings.push('Không nhận diện được nội dung CV. Các trường trống cần nhập thủ công.'); }
  const data = extractCandidateFields(text, name || undefined);
  data.method = method; data.extracted = Boolean(text); data.warnings.unshift(...warnings);
  if (method === 'ocr') for (const evidence of Object.values(data.evidence)) if (evidence) evidence.confidence = 'review';
  return { text, data };
}

/** Tách tên file theo quy ước "x - y.ext". */
export function extractCandidateFileNameParts(fileName: string): { candidateName: string; positionApplied: string } {
  const stem = fileName.replace(/\.[^.]+$/, '').trim();
  const separator = stem.match(/\s+-\s+|\s+[–—]\s+/);
  if (!separator || separator.index === undefined) return { candidateName: '', positionApplied: '' };
  return {
    candidateName: stem.slice(0, separator.index).trim().slice(0, 120),
    positionApplied: stem.slice(separator.index + separator[0].length).trim().slice(0, 120),
  };
}

const norm = (value: string) => stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const HEADINGS = ['education', 'hoc van', 'hoc van truong hoc', 'trinh do hoc van', 'dao tao', 'truong hoc', 'school', 'kinh nghiem', 'kinh nghiem lam viec', 'qua trinh lam viec', 'lich su lam viec', 'work experience', 'work history', 'employment history', 'career history', 'professional experience', 'experience',
  'ky nang', 'ky nang chuyen mon', 'skills', 'thanh tuu', 'achievements', 'awards', 'giai thuong', 'educational background', 'ngoai ngu', 'languages', 'chung chi', 'certifications', 'nguoi tham chieu', 'references', 'muc tieu', 'career objective', 'so thich', 'interests', 'du an', 'projects'];
const PERSONAL_HEADINGS = ['thong tin ca nhan', 'thong tin ung vien', 'personal information', 'personal details', 'contact information', 'profile'];
// Common map-pin glyphs emitted by PDF/DOCX generators, including Font Awesome's
// private-use map-marker. A marker is treated as a location label, never as a
// reason to guess a city from unrelated CV text.
const LOCATION_MARKER = /(?:\u{1F4CD}|\u{1F4CC}|\u{1F3E0}|\u2302|\u{1F5FA}\u{FE0F}?|\u2316|\u25C9|\uF041|\uF015|\uF3C5|\uE001|\uE1B7|\uE55C|\uE55F|\uE567|\uE724|\uE7F1|\uE81D|\uE0C8|\uE88A|\uEA3A)/u;
const LOCATION_PREFIX = /^(?:địa\s*chỉ|dia\s*chi|khu\s*vực|khu\s*vuc|nơi\s*ở|noi\s*o|address|location)\s*[:：\-–—]?\s*/i;
const LOCATION_PLACE_WORD = /\b(?:quan|phuong|huyen|thi xa|thanh pho|tp|city|district|province|ward|tinh)\b/;
function isLocationValue(value: string): boolean {
  const normalized = norm(value);
  return value.length >= 2 && value.length <= 180 && !LOCATION_MARKER.test(value)
    && !/^(?:city|district|province|ward|country|quan|phuong|huyen|tinh|thanh pho|tp)$/.test(normalized)
    && !/@/.test(value) && !/^\+?\d[\d .()\-]{6,}$/.test(value)
    && !HEADINGS.includes(normalized)
    && !/\b(?:email|e mail|dien thoai|so dien thoai|phone|mobile|tel|linkedin|website|http|www)\b/.test(normalized);
}
/** Extract only a value directly associated with a map-pin icon. */
function locationFromMarker(lines: string[]): { value: string; excerpt: string; confidence: CvExtractionEvidence['confidence'] } | null {
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!LOCATION_MARKER.test(line)) continue;
    const sameLine = line.replace(LOCATION_MARKER, '').replace(/^[\s:|,;–—\-]+/, '').replace(LOCATION_PREFIX, '').trim();
    if (isLocationValue(sameLine)) {
      return { value: sameLine, excerpt: line, confidence: /[\u{1F4CD}\u{1F4CC}\u{1F3E0}]/u.test(line) ? 'high' : 'review' };
    }
    const nextLine = lines[index + 1]?.replace(LOCATION_PREFIX, '').trim() || '';
    if (isLocationValue(nextLine)) {
      return { value: nextLine, excerpt: `${line}\n${lines[index + 1]}`, confidence: /[\u{1F4CD}\u{1F4CC}\u{1F3E0}]/u.test(line) ? 'high' : 'review' };
    }
  }
  return null;
}
/** A place word on its own is accepted only when the line reads like an address. */
function locationFromPlaceWords(lines: string[]): { value: string; excerpt: string } | null {
  for (const line of lines) {
    // Contact rows are often flattened into email + address + phone by PDF extraction.
    // Remove contact tokens before validating the address, preserving its full place name.
    const value = line.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
      .replace(PHONE_SEQUENCE, '').replace(/\(\+?84\)/g, '')
      .replace(/[\uE000-\uF8FF]/g, '').replace(LOCATION_MARKER, '')
      .replace(LOCATION_PREFIX, '').replace(/^[\s|,;–—-]+|[\s|,;()–—-]+$/g, '').trim();
    const normalized = norm(value);
    if (!isLocationValue(value) || !LOCATION_PLACE_WORD.test(normalized)) continue;
    // "City University" and "District Manager" are positions/schools, not areas.
    if (/\b(?:university|college|school|academy|manager|director|executive|engineer|company|cong ty|truong)\b/.test(normalized)) continue;
    return { value, excerpt: line };
  }
  return null;
}
// Telephone glyphs from Unicode, Font Awesome and Material Icons. The ring
// surrounding a handset in a CV is normally decorative and may be omitted by
// text extraction; the handset glyph itself is the reliable marker.
const PHONE_MARKER = /(?:\u260E|\u2706|\u{1F4DE}|\u{1F4F1}|\uF095|\uE0B0|\uE0B1|\uE8B4|\uE8B5)/u;
// A Vietnamese contact number is either written with +84 / 0084 or as ten
// digits. Spaces, dots, brackets and dashes are presentation-only.
const PHONE_SEQUENCE = /(?<!\d)(?:\+84|0084)(?:[ .()\-]*\d){8,10}(?!\d)|(?<!\d)(?:\d[ .()\-]*){9}\d(?!\d)/g;
function phoneSequences(value: string): string[] {
  return value.match(PHONE_SEQUENCE) || [];
}
function normalizePhone(value: string): string | null {
  const compact = value.replace(/[^\d+]/g, '');
  const local = /^(?:\+84|0084)/.test(compact) ? `0${compact.replace(/^(?:\+84|0084)/, '')}` : compact;
  return /^\d{10}$/.test(local) ? local : null;
}
function phoneFromMarker(lines: string[]): { value: string; excerpt: string; confidence: CvExtractionEvidence['confidence'] } | null {
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!PHONE_MARKER.test(line)) continue;
    const sameLine = line.replace(PHONE_MARKER, '').replace(/^[\s:|,;–—\-]+/, '').trim();
    const nextLine = lines[index + 1]?.trim() || '';
    const samePhone = phoneSequences(sameLine)[0];
    const nextPhone = phoneSequences(nextLine)[0];
    const candidate = samePhone || nextPhone;
    if (candidate) {
      return { value: candidate, excerpt: samePhone ? line : `${line}\n${nextLine}`,
        confidence: /[\u260E\u2706\u{1F4DE}\u{1F4F1}]/u.test(line) ? 'high' : 'review' };
    }
  }
  return null;
}
function isRole(value: string): boolean {
  return value.length < 140 && (Boolean(inferIndustryFromPosition(value)) || /\b(?:chuyen vien|nhan vien|ky su|manager|specialist|leader|intern|engineer|director|executive|consultant)\b/.test(norm(value)));
}
function isPersonName(value: string, labelled = false): boolean {
  const normalized = norm(value), words = value.trim().split(/\s+/);
  return value.length >= 3 && value.length <= 100 && words.length >= (labelled ? 1 : 2) && words.length <= 7 && /^[\p{L}\s.'’\-]+$/u.test(value)
    && !isRole(value) && !HEADINGS.includes(normalized) && !/\b(?:curriculum|vitae|resume|profile|contact|personal|information|summary|thong tin|ung vien|ho so|gioi thieu|ca nhan|cv|university|dai hoc|cao dang|truong|company|cong ty|tieng anh|english|ho chi minh|ha noi|da nang)\b/.test(normalized);
}

/** Evidence-based extraction. Absent or conflicting facts are never invented. */
export function extractCandidateFields(text: string, fileName?: string, now = new Date()): ExtractedCvCandidateData {
  const lines = cleanText(text).split(/\n+|\t+|\s*\|\s*/).map(line => line.replace(/^[•●▪]\s*/, '').trim()).filter(Boolean);
  const data: ExtractedCvCandidateData = { candidate_name: '', candidate_email: '', candidate_phone: '', position_applied: '', current_title: '', industry: null,
    location: '', education_level: '', education_degree: null, skills: [], languages: [], years_experience: null, expected_salary: null,
    gender: null, date_of_birth: null, employment_type: null, job_search_status: null, extracted: Boolean(text), method: text ? 'text' : 'unreadable', warnings: [], evidence: {}, missing_fields: [] };
  const put = <K extends CvImportField>(key: K, value: ExtractedCvCandidateData[K], source: CvExtractionEvidence['source'], excerpt: string, confidence: CvExtractionEvidence['confidence'] = 'high') => {
    if (value === null || value === '' || Array.isArray(value) && !value.length) return;
    data[key] = value; data.evidence[key] = { source, confidence, text: excerpt.slice(0, 300) };
  };
  const labelled = (aliases: string[], source = lines): string => {
    for (let index = 0; index < source.length; index++) {
      const match = source[index].match(/^(.{1,65}?)\s*[:：]\s*(.*)$/);
      const label = norm(match ? match[1] : source[index]);
      if (!aliases.includes(label)) continue;
      const value = match?.[2] || source[index + 1] || '';
      if (HEADINGS.includes(norm(value)) || /[:：]/.test(value) && !match?.[2]) continue;
      return value.trim();
    }
    return '';
  };
  const section = (aliases: string[]): string[] => {
    const start = lines.findIndex(line => aliases.includes(norm(line)));
    if (start < 0) return [];
    const end = lines.findIndex((line, index) => index > start && HEADINGS.includes(norm(line)));
    return lines.slice(start + 1, end < 0 ? undefined : end);
  };
  const firstSection = lines.findIndex(line => HEADINGS.includes(norm(line)));
  const header = lines.slice(0, firstSection < 0 ? 12 : firstSection);
  const personalStart = lines.findIndex(line => PERSONAL_HEADINGS.includes(norm(line)));
  const personalEnd = personalStart < 0 ? -1 : lines.findIndex((line, index) => index > personalStart && HEADINGS.includes(norm(line)));
  // Birth dates are accepted only from an explicitly labelled personal-info
  // section, never from education/work timelines or a stray year elsewhere.
  const personalLines = personalStart >= 0 ? lines.slice(personalStart + 1, personalEnd < 0 ? undefined : personalEnd) : [];
  const fromFile = extractCandidateFileNameParts(fileName || '');
  // TA's naming convention is deliberate metadata: "X - Y.pdf" means
  // candidate X applying for position Y. When both parts exist, keep this
  // source authoritative even if the CV contains an older title/name.
  const hasStructuredFileName = Boolean(fromFile.candidateName && fromFile.positionApplied);
  const nameLabel = labelled(['ho va ten', 'ho ten', 'full name', 'name', 'candidate name']);
  if (nameLabel && hasStructuredFileName && norm(nameLabel) !== norm(fromFile.candidateName))
    data.warnings.push('Tên trong CV khác cấu trúc tên tệp X - Y. Hệ thống dùng X trong tên tệp; vui lòng đối chiếu.');
  if (hasStructuredFileName) put('candidate_name', fromFile.candidateName, 'filename', fileName || '');
  else if (isPersonName(nameLabel, true)) put('candidate_name', nameLabel, 'label', nameLabel);
  else {
    const name = header.find(line => isPersonName(line));
    if (name) put('candidate_name', name, 'header', name, 'review');
    else if (isPersonName(fromFile.candidateName)) put('candidate_name', fromFile.candidateName, 'filename', fileName || '', 'review');
  }
  const role = labelled(['vi tri ung tuyen', 'ung tuyen', 'position applied', 'applied position', 'desired position', 'vi tri mong muon', 'vi tri du tuyen', 'job title']);
  if (role && hasStructuredFileName && norm(role) !== norm(fromFile.positionApplied))
    data.warnings.push('Vị trí trong CV khác cấu trúc tên tệp X - Y. Hệ thống dùng Y trong tên tệp; vui lòng đối chiếu.');
  if (hasStructuredFileName) put('position_applied', fromFile.positionApplied, 'filename', fileName || '');
  else if (role && role.length <= 140) put('position_applied', role, 'label', role);
  else {
    const headline = header.find(line => !line.includes(':') && isRole(line));
    if (headline) put('position_applied', headline, 'header', headline, 'review');
    else if (isRole(fromFile.positionApplied)) put('position_applied', fromFile.positionApplied, 'filename', fileName || '', 'review');
  }
  const emailLabel = labelled(['email', 'e mail', 'thu dien tu']);
  const emails = (value: string) => [...new Set((value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(email => email.toLowerCase()))];
  const primaryEmails = emails(emailLabel || header.join('\n'));
  const documentEmails = emails(text);
  const nameTokens = stripDiacritics(data.candidate_name).toLowerCase().split(/[^a-z]+/).filter(token => token.length >= 3);
  const nameEmails = documentEmails.filter(email => {
    const local = email.split('@')[0].replace(/[^a-z]/g, '');
    return nameTokens.length >= 2 && local.includes(nameTokens.slice(-2).join(''));
  });
  const allEmails = nameEmails.length === 1 ? nameEmails : primaryEmails.length ? primaryEmails : documentEmails;
  if (allEmails.length === 1) put('candidate_email', allEmails[0], emailLabel ? 'label' : 'content', allEmails[0]);
  else if (allEmails.length > 1) data.warnings.push('CV có nhiều email; cần xác nhận email chính của ứng viên.');
  const phoneLabel = labelled(['dien thoai', 'so dien thoai', 'sdt', 'phone', 'mobile', 'tel', 'telephone']);
  const markerPhone = phoneFromMarker(lines);
  // A labelled/marked number is strongest. Otherwise inspect the WHOLE CV,
  // not merely its header, because contact rows are often beside a sidebar.
  const rawPhones = phoneLabel || markerPhone ? phoneSequences(phoneLabel || markerPhone?.value || '') : phoneSequences(text);
  const phones = [...new Set(rawPhones.map(normalizePhone).filter((value): value is string => Boolean(value)))];
  if (phones.length) put('candidate_phone', phones[0], phoneLabel ? 'label' : 'content', markerPhone?.excerpt || phones[0], markerPhone?.confidence || 'high');
  if (phones.length > 1) data.warnings.push('CV có nhiều số điện thoại; hệ thống điền số đầu tiên, cần xác nhận số liên hệ chính.');
  const locationScope = [...header, ...personalLines];
  const rawLocationLabel = labelled(['dia chi sinh song', 'dia chi lien he', 'khu vuc noi o', 'noi o', 'dia chi', 'address', 'location', 'khu vuc'], locationScope);
  const locationLabel = isLocationValue(rawLocationLabel) ? rawLocationLabel : '';
  const pinLocation = locationFromMarker(locationScope);
  const wordLocation = locationFromPlaceWords(locationScope);
  // An explicit text label is more reliable than an icon if both are present.
  if (locationLabel) put('location', locationLabel, 'label', locationLabel);
  else if (pinLocation) put('location', pinLocation.value, 'content', pinLocation.excerpt, pinLocation.confidence);
  else if (wordLocation) put('location', wordLocation.value, 'content', wordLocation.excerpt, 'review');
  if (locationLabel && pinLocation && norm(locationLabel) !== norm(pinLocation.value)) {
    data.warnings.push('Địa chỉ ghi bằng nhãn và biểu tượng ghim khác nhau; hệ thống ưu tiên địa chỉ có nhãn, cần đối chiếu CV.');
  }
  const currentTitle = labelled(['chuc danh hien tai', 'vi tri hien tai', 'current title', 'current position']);
  if (currentTitle) put('current_title', currentTitle, 'label', currentTitle);
  const eduLines = section(['education', 'hoc van', 'hoc van truong hoc', 'trinh do hoc van', 'dao tao', 'truong hoc', 'school']);
  const school = labelled(['hoc van', 'truong dai hoc', 'truong cao dang', 'truong hoc', 'school', 'university', 'university name', 'college', 'education']);
  // Keep every explicitly educational line, including degree and school name.
  // This provides Talent Acquisition with the full academic history, not just
  // the first school detected from a label.
  const educationLine = /\b(?:university|college|school|academy|institute|truong\s+(?:dai hoc|cao dang|trung cap|hoc)|dai hoc|cao dang|trung cap|thpt|cu nhan|bachelor|thac si|masters?|tien si|phd|doctorate|associate(?:\s+degree)?|certificate|chung chi)\b/;
  const isAcademicLine = (line: string) => educationLine.test(norm(line)) && !/\b(?:tieng anh|tieng trung|english|language|ielts|toeic|tuyen dung|recruit|cong ty|company)\b/.test(norm(line));
  const schoolLines = lines.filter(isAcademicLine);
  const academicContext = lines.flatMap((line, index) => {
    if (!isAcademicLine(line)) return [];
    const previous = lines[index - 1] || '';
    const major = lines[index - 2] || '';
    if (/^(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}$/.test(previous) && /\b(?:chuyen nganh|major|quan tri|kinh te|cong nghe)\b/.test(norm(major)) && major.length < 160) return [`${major} | ${previous}`, line];
    const related = /\b(?:chuyen nganh|major|quan tri|kinh te|cong nghe)\b/.test(norm(previous)) && /(?:19|20)\d{2}/.test(previous) && previous.length < 160;
    return related ? [previous, line] : [line];
  });
  // PDF columns can place the education heading after its actual content.
  // Only trust that section when it contains academic evidence itself.
  const trustedSection = eduLines.some(isAcademicLine) ? eduLines : [];
  const education = [...new Set([...(school && isAcademicLine(school) ? [school] : []), ...trustedSection, ...academicContext].filter(Boolean))]
    .filter(line => !['education', 'hoc van', 'hoc van truong hoc', 'trinh do hoc van', 'dao tao', 'truong hoc', 'school'].includes(norm(line)))
    .join('\n').slice(0, 4000);
  put('education_level', education, 'content', education);
  const degreeLabel = labelled(['bang cap', 'trinh do', 'trinh do hoc van', 'education level', 'degree', 'qualification']);
  const completedDegrees: string[] = [];
  // The education/school area itself is an explicit TA convention. A school
  // named "University" or "College" therefore selects the matching degree
  // even when the CV does not repeat a separate "Bằng cấp" label.
  const educationDegreeLines = [...new Set([degreeLabel, ...trustedSection, ...schoolLines].filter(Boolean))];
  for (const line of educationDegreeLines) {
    const value = norm(line);
    if (/\b(?:thac si|tien si|masters?|phd|doctorate|postgraduate)\b/.test(value)) completedDegrees.push('Sau đại học');
    else if (/\b(?:dai hoc|university|cu nhan|bachelor)\b/.test(value)) completedDegrees.push('Đại học');
    else if (/\b(?:cao dang|college|associate degree)\b/.test(value)) completedDegrees.push('Cao đẳng');
    else if (/\b(?:trung cap|intermediate)\b/.test(value)) completedDegrees.push('Trung cấp');
    else {
      const explicit = normalizeCvEducationDegree(line);
      if (explicit) completedDegrees.push(explicit);
    }
  }
  const degree = inferCvEducationDegree(education) || [...completedDegrees].sort((a, b) => CV_EDUCATION_LEVELS.indexOf(b as typeof CV_EDUCATION_LEVELS[number]) - CV_EDUCATION_LEVELS.indexOf(a as typeof CV_EDUCATION_LEVELS[number]))[0];
  if (degree) put('education_degree', degree, degreeLabel ? 'label' : 'content', degreeLabel || education);
  const yearsLabel = labelled(['so nam kinh nghiem', 'tong kinh nghiem', 'tong so nam kinh nghiem', 'years of experience', 'total experience']);
  const years = yearsLabel ? Number(yearsLabel.match(/^\d{1,2}(?:[.,]\d)?/)?.[0]?.replace(',', '.')) : guessYearsExperience(text);
  if (years != null && Number.isFinite(years) && years >= 0 && years <= 50) put('years_experience', years, yearsLabel ? 'label' : 'content', yearsLabel || 'Số năm kinh nghiệm nêu trong CV');
  else {
    const experienceLines = section(['kinh nghiem', 'kinh nghiem lam viec', 'qua trinh lam viec', 'lich su lam viec', 'work experience', 'work history', 'employment history', 'career history', 'professional experience', 'experience']);
    const intervals: [number, number][] = [];
    for (const [lineIndex, line] of experienceLines.entries()) {
      const context = experienceLines.slice(Math.max(0, lineIndex - 2), Math.min(experienceLines.length, lineIndex + 2)).join(' ');
      if (/\b(?:thuc tap|intern(?:ship)?|trainee)\b/.test(norm(context))) continue;
      const monthRange = /(0?[1-9]|1[0-2])[/.\-](19\d{2}|20\d{2})\s*(?:-|–|—|to|den)\s*(?:(0?[1-9]|1[0-2])[/.\-](19\d{2}|20\d{2})|(present|current|now|hien tai|nay))/gi;
      const normalized = stripDiacritics(line).toLowerCase();
      const monthMatches = [...normalized.matchAll(monthRange)];
      for (const match of monthMatches) {
        const start = Number(match[2]) * 12 + Number(match[1]) - 1;
        const end = match[5] ? now.getFullYear() * 12 + now.getMonth() : Number(match[4]) * 12 + Number(match[3]);
        if (start < end && end <= now.getFullYear() * 12 + now.getMonth() + 1 && end - start <= 600) intervals.push([start, end]);
      }
      if (!monthMatches.length) {
        const yearRange = /(?<!\d)(19\d{2}|20\d{2})\s*(?:-|–|—|to|den)\s*(?:(19\d{2}|20\d{2})|(present|current|now|hien tai|nay))(?!\d)/gi;
        for (const match of normalized.matchAll(yearRange)) {
          const start = Number(match[1]) * 12;
          const end = match[3] ? now.getFullYear() * 12 + now.getMonth() : Number(match[2]) * 12;
          if (start < end && end <= now.getFullYear() * 12 + now.getMonth() + 1 && end - start <= 600) intervals.push([start, end]);
        }
      }
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let months = 0, lastEnd = -Infinity;
    for (const [start, end] of intervals) { months += Math.max(0, end - Math.max(start, lastEnd)); lastEnd = Math.max(lastEnd, end); }
    if (months) put('years_experience', Math.round(months / 12 * 10) / 10, 'timeline', experienceLines.join('\n'), 'review');
  }
  const skillLines = section(['ky nang', 'skills']);
  const skillsLabel = labelled(['ky nang', 'skills', 'technical skills']);
  const skillsText = [skillsLabel, ...skillLines].filter(Boolean).join('\n');
  const customSkills = skillsText.split(/[,;\n•●▪]+/).map(value => value.trim()).filter(value => value.length > 1 && value.length <= 70 && !value.includes(':') && !/\b(?:khong biet|chua biet|not proficient|no experience)\b/.test(norm(value)));
  put('skills', [...new Set([...customSkills, ...guessSkills(skillsText || text)])], skillsText ? 'label' : 'content', skillsText || 'Kỹ năng được đề cập trong CV', skillsText ? 'high' : 'review');
  const languageText = [labelled(['ngoai ngu', 'ngon ngu', 'languages', 'language']), ...section(['ngoai ngu', 'languages']), text].join('\n');
  const languages = [['Tiếng Anh', /\b(?:tieng anh|english|ielts|toeic|toefl)\b/], ['Tiếng Trung', /\b(?:tieng trung|tieng hoa|chinese|hsk)\b/],
    ['Tiếng Nhật', /\b(?:tieng nhat|japanese|jlpt)\b/], ['Tiếng Hàn', /\b(?:tieng han|korean|topik)\b/], ['Tiếng Pháp', /\b(?:tieng phap|french|delf|dalf)\b/], ['Tiếng Đức', /\b(?:tieng duc|german)\b/]] as const;
  put('languages', languages.filter(([, regex]) => languageText.split(/\n+/).some(line => {
    const normalized = stripDiacritics(line).toLowerCase();
    const match = normalized.match(regex);
    return match && !/\b(?:khong(?: biet)?|chua(?: biet)?|no|not)\s*$/.test(normalized.slice(0, match.index).trim());
  })).map(([label]) => label), 'content', 'Ngoại ngữ / chứng chỉ được đề cập trong CV');
  const birthday = labelled(['ngay sinh', 'nam sinh', 'date of birth', 'dob', 'birth date', 'year of birth'], personalLines);
  const birth = birthday.match(/^(\d{4})-(\d{2})-(\d{2})/) || birthday.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/) || birthday.match(/^(\d{4})$/);
  if (birth) {
    let iso: string;
    if (birth[1].length === 4 && birth[2]) iso = `${birth[1]}-${birth[2]}-${birth[3]}`;
    else if (birth[3]) {
      // CV convention is mm/dd/yyyy. Retain dd/mm/yyyy when the first number
      // cannot be a month so valid Vietnamese dates are not discarded.
      const [first, second] = [Number(birth[1]), Number(birth[2])];
      iso = first > 12 ? `${birth[3]}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}` : `${birth[3]}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
    } else iso = `${birth[1]}-01-01`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso && date <= now && Number(iso.slice(0, 4)) >= 1900) {
      put('date_of_birth', iso, 'label', birthday, birth[0].length === 4 ? 'review' : 'high');
      if (birth[0].length === 4) data.warnings.push('CV chỉ nêu năm sinh; hệ thống tạm dùng ngày 01/01 để hỗ trợ lọc, cần xác nhận ngày sinh chính xác.');
    }
    else data.warnings.push('Ngày sinh trong CV không hợp lệ; cần kiểm tra.');
  }
  const gender = labelled(['gioi tinh', 'gender', 'sex']);
  const genderCode = ({ nam: 'male', male: 'male', nu: 'female', female: 'female', khac: 'other', other: 'other' } as Record<string, string>)[norm(gender)];
  if (genderCode) put('gender', genderCode, 'label', gender);
  const salary = labelled(['luong mong muon', 'muc luong mong muon', 'expected salary', 'desired salary', 'salary expectation']);
  if (salary) {
    const normalized = stripDiacritics(salary).toLowerCase();
    const numbers = normalized.match(/\d[\d.,]*/g) || [];
    if (numbers.length === 1 && !/usd|\$|eur|euro|thoa thuan|negotiable|nam|year/.test(normalized)) {
      const millions = /trieu|million/.test(normalized), thousands = /\bk\b|nghin|ngan/.test(normalized);
      const value = Number(millions || thousands ? numbers[0].replace(',', '.') : numbers[0].replace(/[.,]/g, '')) * (millions ? 1e6 : thousands ? 1000 : 1);
      if (value > 0 && value <= 1e12 && (millions || thousands || /vnd|vnđ|dong|₫/.test(normalized) || value >= 1e6)) put('expected_salary', value, 'label', salary);
      else data.warnings.push('Lương mong muốn chưa rõ đơn vị VNĐ; cần bổ sung.');
    } else data.warnings.push('Lương mong muốn là khoảng, ngoại tệ hoặc thỏa thuận; chưa tự điền một số VNĐ để tránh sai.');
  }
  for (const [field, labels, aliases] of [
    ['employment_type', ['hinh thuc lam viec', 'work type', 'employment type'], { 'toan thoi gian': 'full_time', 'full time': 'full_time', 'ban thoi gian': 'part_time', 'part time': 'part_time', 'hop dong': 'contract', contract: 'contract', 'thuc tap': 'internship', internship: 'internship', freelance: 'freelance', 'tu xa': 'remote', remote: 'remote', 'ket hop': 'hybrid', hybrid: 'hybrid', 'tai van phong': 'onsite', onsite: 'onsite' }],
    ['job_search_status', ['trang thai tim viec', 'job search status'], { 'dang tim viec': 'actively_looking', 'actively looking': 'actively_looking', 'san sang nhan co hoi': 'open_to_offers', 'open to offers': 'open_to_offers', 'chua tim viec': 'not_looking', 'not looking': 'not_looking' }],
  ] as const) {
    const value = labelled([...labels]); const code = (aliases as Record<string, string>)[norm(value)]; if (code) put(field, code, 'label', value);
  }
  const industry = inferIndustryFromCandidate(data.position_applied, data.languages);
  if (industry) put('industry', industry, data.evidence.position_applied?.source || 'content', data.position_applied, data.evidence.position_applied?.confidence || 'review');
  else if (data.position_applied) data.warnings.push('Vị trí chưa xác định được một ngành nghề rõ ràng; lưu vào Chưa phân loại nếu bạn chưa chọn thư mục.');
  data.missing_fields = (Object.keys(CV_IMPORT_FIELDS) as CvImportField[]).filter(key => !data.evidence[key]);
  return data;
}

/** Gọn text: bỏ ký tự điều khiển, gộp khoảng trắng/dòng trống thừa. */
function cleanText(t: string): string {
  return stripControlChars(t)
    .replace(/\r\n?/g, '\n')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '') // marker phân trang của pdf-parse
    .replace(/ +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 100_000); // chặn CV bất thường quá lớn
}

/**
 * Loại byte NUL (0x00) và ký tự điều khiển C0/C1 — PostgreSQL TEXT từ chối NUL
 * (lỗi 22021). Giữ lại \n và \t.
 */
export function stripControlChars(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

// ── Từ điển kỹ năng (alias không dấu → nhãn chuẩn) ───────────────────────────
// Mở rộng tự do; khớp theo chuỗi con trên search_text (đã bỏ dấu, lowercase).
const SKILL_DICT: { label: string; aliases: string[] }[] = [
  // Tin học văn phòng
  { label: 'Excel', aliases: ['excel', 'ms excel', 'microsoft excel', 'bang tinh'] },
  { label: 'Word', aliases: ['ms word', 'microsoft word'] },
  { label: 'PowerPoint', aliases: ['powerpoint', 'power point', 'ms powerpoint'] },
  { label: 'Google Sheets', aliases: ['google sheet', 'google sheets', 'gsheet'] },
  // Kế toán / tài chính
  { label: 'Kế toán giá thành', aliases: ['ke toan gia thanh', 'gia thanh san pham', 'cost accounting'] },
  { label: 'Kế toán tổng hợp', aliases: ['ke toan tong hop', 'general accounting'] },
  { label: 'Kế toán thuế', aliases: ['ke toan thue', 'tax accounting', 'thue gtgt', 'thue tncn'] },
  { label: 'Kế toán công nợ', aliases: ['ke toan cong no', 'cong no', 'accounts payable', 'accounts receivable'] },
  { label: 'IFRS', aliases: ['ifrs'] },
  { label: 'VAS', aliases: ['vas', 'chuan muc ke toan viet nam'] },
  { label: 'MISA', aliases: ['misa'] },
  { label: 'Fast Accounting', aliases: ['fast accounting', 'phan mem fast'] },
  { label: 'BRAVO', aliases: ['bravo'] },
  { label: 'SAP', aliases: ['sap', 'sap erp'] },
  // CNTT / lập trình
  { label: 'SQL', aliases: ['sql', 'mysql', 'postgresql', 'sql server'] },
  { label: 'Python', aliases: ['python'] },
  { label: 'JavaScript', aliases: ['javascript', 'js', 'typescript'] },
  { label: 'React', aliases: ['react', 'reactjs', 'react.js'] },
  { label: 'Power BI', aliases: ['power bi', 'powerbi'] },
  // Ngoại ngữ
  { label: 'Tiếng Anh', aliases: ['tieng anh', 'english', 'ielts', 'toeic'] },
  { label: 'Tiếng Trung', aliases: ['tieng trung', 'chinese', 'hsk', 'tieng hoa'] },
  { label: 'Tiếng Nhật', aliases: ['tieng nhat', 'japanese', 'jlpt'] },
  { label: 'Tiếng Hàn', aliases: ['tieng han', 'korean', 'topik'] },
  { label: 'Tiếng Khmer', aliases: ['tieng khmer', 'khmer', 'campuchia'] },
  // Kỹ năng khác phổ biến
  { label: 'Logistics', aliases: ['logistics', 'xuat nhap khau', 'forwarding', 'khai bao hai quan'] },
  { label: 'Marketing', aliases: ['marketing', 'digital marketing', 'seo', 'facebook ads', 'google ads'] },
  { label: 'Bán hàng', aliases: ['ban hang', 'sales', 'kinh doanh', 'telesales'] },
  { label: 'Chăm sóc khách hàng', aliases: ['cham soc khach hang', 'customer service', 'cskh'] },
  { label: 'Nhân sự', aliases: ['nhan su', 'human resource', 'hr', 'tuyen dung', 'c&b'] },
];

/**
 * Gợi ý kỹ năng từ text (đã/ chưa bỏ dấu đều được — hàm tự chuẩn hoá).
 * Khớp alias dạng "ranh giới từ" để tránh false-positive (vd 'js' trong 'json').
 */
export function guessSkills(rawText: string): string[] {
  if (!rawText) return [];
  const norm = stripDiacritics(rawText).toLowerCase();
  const found = new Set<string>();
  for (const { label, aliases } of SKILL_DICT) {
    for (const a of aliases) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(a)}([^a-z0-9]|$)`, 'i');
      const match = norm.match(re);
      if (match && !/\b(?:khong biet|chua biet|no experience(?: with| in)?|not proficient(?: in)?)\s*$/.test(norm.slice(0, match.index).trim())) { found.add(label); break; }
    }
  }
  return [...found];
}

/** A single explicit experience claim, not the largest of conflicting claims. */
export function guessYearsExperience(rawText: string): number | null {
  if (!rawText) return null;
  const norm = stripDiacritics(rawText).toLowerCase();
  const patterns = [
    /(\d{1,2}(?:[.,]\d)?)\s*\+?\s*nam\s+(?:kinh nghiem|kn|lam viec)/g,
    /(\d{1,2}(?:[.,]\d)?)\s*\+?\s*years?\s+(?:of\s+)?experience/g,
    /experience[:\s]+(\d{1,2}(?:[.,]\d)?)\s*\+?\s*years?/g,
    /kinh nghiem[:\s]+(\d{1,2}(?:[.,]\d)?)\s*\+?\s*nam/g,
  ];
  const values = new Set<number>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(norm)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(v) && v >= 0 && v <= 50) values.add(v);
    }
  }
  return values.size === 1 ? [...values][0] : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
