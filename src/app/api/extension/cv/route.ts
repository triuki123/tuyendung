import { NextRequest, NextResponse } from 'next/server';
import { authenticateCvExtension, extensionCors } from '@/lib/cvExtensionAuth';
import * as pool from '@/lib/services/hrPoolService';

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: extensionCors }); }
const list = (v: FormDataEntryValue | null) => typeof v === 'string' ? v.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : [];
const num = (v: FormDataEntryValue | null) => typeof v === 'string' && v.trim() ? Number(v.replace(',', '.').replace(/[^\d.]/g, '')) || null : null;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const REMOTE_FILE_HOSTS = new Set(['s3.topcv.vn']);
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'odt', 'ods', 'rtf', 'txt',
  'md', 'markdown', 'csv', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'webp',
]);
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'txt',
};

function sniffCvMime(buffer: Buffer, fallback: string): string {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return fallback;
  return fallback;
}

function decodeFileName(value: string | null): string {
  if (!value) return '';
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = value.match(/filename="?([^";]+)"?/i)?.[1];
  const name = encoded || plain || '';
  try { return decodeURIComponent(name).split(/[\\/]/).pop() || ''; }
  catch { return name.split(/[\\/]/).pop() || ''; }
}

function fileExtension(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
}

/**
 * Trình duyệt gửi filename của multipart file part qua header Content-Disposition — một số
 * runtime parse header này theo latin1 thay vì UTF-8, làm tên tiếng Việt bị lỗi font (vd
 * JobsGO: "Trần Ngọc Chân" -> "Trá°§n Ngá»›c ChÃ¢n"). Các field text thường (candidate_name,
 * source...) không đi qua Content-Disposition nên luôn đúng UTF-8 — dùng chúng để dựng lại
 * tên file thay vì tin `file.name`, giữ nguyên đuôi mở rộng gốc (đã hỗ trợ nhiều định dạng).
 */
function safeFileName(candidateName: string, source: string, originalName: string, mimeType?: string): string {
  const ext = fileExtension(originalName) || MIME_EXTENSIONS[(mimeType || '').toLowerCase()] || 'bin';
  const base = (candidateName || 'ung-vien').trim();
  const suffix = (source || 'CV').trim();
  return `${base}-${suffix}.${ext}`;
}

function validateCvFormat(name: string) {
  if (!ALLOWED_EXTENSIONS.has(fileExtension(name))) {
    throw new Error('Định dạng tệp không được hỗ trợ cho hồ sơ ứng viên');
  }
}

function safeRemoteUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !REMOTE_FILE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('URL file CV không được phép');
  }
  return url;
}

async function fetchRemoteCv(value: string) {
  let url = safeRemoteUrl(value);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new Error('URL file CV chuyển hướng không hợp lệ');
      url = safeRemoteUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`Máy chủ CV trả lỗi ${response.status}`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > MAX_FILE_SIZE) throw new Error('File CV vượt quá 20 MB');
    const mimeType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    if (/text\/html/i.test(mimeType)) throw new Error('Máy chủ CV trả về HTML thay vì file');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('File CV tải về rỗng');
    if (buffer.length > MAX_FILE_SIZE) throw new Error('File CV vượt quá 20 MB');
    const headerName = decodeFileName(response.headers.get('content-disposition'));
    return { buffer, mimeType, finalUrl: url, fileName: headerName };
  }
  throw new Error('Không tải được file CV');
}

export async function POST(request: NextRequest) {
  const auth = await authenticateCvExtension(request);
  if (!auth) return NextResponse.json({ error: 'Kết nối extension không hợp lệ hoặc đã bị thu hồi' }, { status: 401, headers: extensionCors });
  const form = await request.formData();
  const suppliedCandidateName = String(form.get('candidate_name') || '').trim();
  const source = String(form.get('source') || '').trim();
  const file = form.get('file');
  const validFile = file instanceof File && file.size > 0;
  const remoteUrl = String(form.get('source_file_url') || '').trim();
  if (!validFile && !remoteUrl) return NextResponse.json({ error: 'Thiếu file CV' }, { status: 400, headers: extensionCors });
  if (validFile && file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File CV vượt quá 20 MB' }, { status: 413, headers: extensionCors });
  let remote: Awaited<ReturnType<typeof fetchRemoteCv>> | null = null;
  if (!validFile && remoteUrl) {
    try { remote = await fetchRemoteCv(remoteUrl); }
    catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Không tải được file CV nguồn' }, { status: 422, headers: extensionCors });
    }
  }
  const requestedName = String(form.get('file_name') || '').trim();
  const remoteName = remote ? decodeURIComponent(remote.finalUrl.pathname.split('/').pop() || '') : '';
  const originalName = validFile ? file.name : (remote?.fileName || requestedName || remoteName);
  const nameFromFile = originalName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+(?:TopCV|JobsGO|Vieclam24h)$/i, '').trim();
  // Collector may only obtain the file. Keep the import useful and let HR complete
  // missing fields later in the candidate drawer instead of rejecting the CV.
  const candidateName = suppliedCandidateName || nameFromFile || `Ứng viên ${source || 'CV'}`;
  const selectedName = validFile
    ? safeFileName(candidateName, source, file.name, file.type)
    : (remote?.fileName || requestedName || remoteName || `${candidateName}-CV.pdf`);
  const selectedBuffer = validFile ? Buffer.from(await file.arrayBuffer()) : remote!.buffer;
  const declaredMime = validFile ? (file.type || 'application/octet-stream') : (remote?.mimeType || 'application/octet-stream');
  const selectedMime = sniffCvMime(selectedBuffer, declaredMime);
  try { validateCvFormat(selectedName); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Định dạng CV không hợp lệ' }, { status: 415, headers: extensionCors });
  }
  try {
  const data = await pool.createCv({
    candidateName, candidateEmail: String(form.get('candidate_email') || '') || undefined,
    candidatePhone: String(form.get('candidate_phone') || '') || undefined,
    positionApplied: String(form.get('position_applied') || '') || undefined,
    currentTitle: String(form.get('current_title') || '') || undefined,
    // CV collected from external sites must enter the review queue first.
    // The recruiter explicitly assigns its AssetFlow industry folder later.
    industry: undefined, source: String(form.get('source') || '') || undefined,
    note: String(form.get('note') || '') || undefined, skills: list(form.get('skills')),
    yearsExperience: num(form.get('years_experience')), educationLevel: String(form.get('education_level') || '') || undefined,
    expectedSalary: num(form.get('expected_salary')), location: String(form.get('location') || '') || undefined,
    languages: list(form.get('languages')), tags: list(form.get('tags')),
    fileName: selectedName,
    mimeType: selectedMime,
    buffer: selectedBuffer,
    uploadedBy: auth.userId,
  });
  return NextResponse.json({ success: true, data }, { headers: extensionCors });
  } catch (error) {
    if (error instanceof pool.DuplicateCvError) return NextResponse.json({ error: error.message, code: 'DUPLICATE_CV' }, { status: 409, headers: extensionCors });
    throw error;
  }
}
