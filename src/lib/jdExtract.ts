import { JD_WORK_TIMES, parseJdFields } from './jdForm';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, '');
export function extractJdFields(text: string, fileName = '') {
  const fields = { title: '', department_name: '', ...parseJdFields('') };
  type Key = keyof typeof fields;
  const sections: Record<string, Key> = { motacongviec: 'duties', yeucaucongviec: 'requirements', yeucauungvien: 'requirements', chinhsachphucloi: 'benefits', quyenloiungvien: 'benefits', quyenloi: 'benefits', phucloi: 'benefits', mucdichcongviec: 'purpose', muctieucongviec: 'objectives', caccongviecchinh: 'duties' };
  const metadata: Record<string, Key> = { vitrituyendung: 'title', vitri: 'title', chucdanh: 'title', tenvitri: 'title', jobtitle: 'title', position: 'title', donvi: 'unit', phongban: 'department_name', diadiemlamviec: 'location', noilamviec: 'location', worklocation: 'location', location: 'location', thoigianlamviec: 'work_time', khungluong: 'salary', mucluong: 'salary', soluong: 'headcount', soluongtuyen: 'headcount' };
  let current: Key | null = null;
  let pending: Key | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const heading = line.replace(/^[\dIVXivx.\s)–-]+\s*/, '').replace(/[:：]\s*$/, '');
    const section = sections[norm(heading)];
    if (section) { current = section; pending = null; continue; }
    const colon = line.search(/[:：]/);
    const label = norm(colon >= 0 ? line.slice(0, colon) : line);
    const meta = metadata[label];
    if (meta) { const value = colon >= 0 ? line.slice(colon + 1).trim() : ''; if (value) fields[meta] = value; else pending = meta; continue; }
    if (label === 'motacongviec' && colon >= 0 && !fields.title) { fields.title = line.slice(colon + 1).trim(); continue; }
    if (pending) { fields[pending] = line; pending = null; continue; }
    if (current) fields[current] += (fields[current] ? '\n' : '') + line;
  }
  const warnings: string[] = [];
  if (!fields.title) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const labeled = lines.find(line => /^(?:mô tả công việc|job description|tuyển dụng)\s*[:：–-]\s*\S/i.test(line));
    const role = lines.slice(0, 20).find(line => line.length < 140 && /^(?:nhân viên|chuyên viên|trưởng phòng|trưởng nhóm|giám đốc|phó giám đốc|trợ lý|kế toán|thực tập sinh|[a-z ]*(?:executive|manager|leader|director|specialist|officer))\b/i.test(line) && !/[:：]/.test(line));
    fields.title = labeled?.replace(/^[^:：–-]+[:：–-]\s*/, '') || role || '';
    if (!fields.title && fileName) {
      fields.title = fileName.replace(/\.[^.]+$/, '').replace(/^JD\s*[-–_]\s*/i, '').split(/\s+[-–]\s+/).slice(1).join(' - ') || fileName.replace(/\.[^.]+$/, '').replace(/^JD\s*[-–_]\s*/i, '');
      warnings.push('Tiêu đề được lấy từ tên file; hãy kiểm tra lại trong tab Nháp.');
    }
  }
  const unit = norm(fields.unit);
  if (unit) { fields.unit = unit.includes('fadogroup') ? 'FADO Group' : /fadoservices?/.test(unit) ? 'FADO Service' : unit.includes('fadotech') ? 'FADO Tech' : ''; if (!fields.unit) warnings.push('Đơn vị chưa khớp danh sách lựa chọn.'); }
  const detectLocation = (value: string) => {
    const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
    const hn = /ha\s*noi|\bhn\b/.test(normalized);
    const hcm = /ho\s*chi\s*minh|\bhcm\b|sai\s*gon|hcmc/.test(normalized);
    return hn !== hcm ? hn ? 'HN' : 'HCM' : '';
  };
  const originalLocation = fields.location;
  fields.location = detectLocation(originalLocation);
  if (!fields.location && !originalLocation) {
    const locationLines = text.split(/\r?\n/).filter(line => /dia\s*diem|noi\s*lam\s*viec|work\s*location|location|dia\s*chi/.test(line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()));
    fields.location = detectLocation(locationLines.join('\n')) || (locationLines.length ? '' : detectLocation(text));
  }
  if (!fields.location) warnings.push('Địa điểm chưa rõ hoặc có nhiều địa điểm; hãy kiểm tra trong tab Nháp.');
  if (fields.work_time) {
    const time = norm(fields.work_time).replace(/:/g, 'h');
    fields.work_time = /08h30.*17h30/.test(time) ? JD_WORK_TIMES[0] : /08h00.*17h00/.test(time) ? JD_WORK_TIMES[1] : '';
    if (!fields.work_time) warnings.push('Thời gian làm việc chưa khớp hai khung giờ đã thiết lập.');
  }
  fields.headcount = fields.headcount.match(/\d+/)?.[0] || '';
  for (const key of ['title', 'duties', 'requirements', 'benefits'] as const) if (!fields[key]) warnings.push(`Chưa xác định được ${({ title: 'vị trí tuyển dụng', duties: 'mô tả công việc', requirements: 'yêu cầu ứng viên', benefits: 'quyền lợi ứng viên' })[key]}.`);
  return { fields, warnings };
}
