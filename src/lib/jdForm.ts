export const JD_UNITS = ['FADO Group', 'FADO Service', 'FADO Tech'];
export const JD_LOCATIONS = ['HCM', 'HN'];
export const JD_WORK_TIMES = [
  'Sáng 08h30 – 17h30 từ Thứ 2 – Thứ 6 (Thứ 7 làm việc tại nhà/VP)',
  'Sáng 08h00 – 17h00 từ Thứ 2 – Thứ 6 (Thứ 7 làm việc tại nhà/VP)',
];
export const JD_SECTIONS = {
  unit: 'Đơn vị', location: 'Địa điểm làm việc', work_time: 'Thời gian làm việc',
  salary: 'Khung lương', headcount: 'Số lượng tuyển',
  purpose: 'Mục đích công việc', objectives: 'Mục tiêu công việc',
  duties: 'Mô tả công việc', requirements: 'Yêu cầu ứng viên', benefits: 'Quyền lợi ứng viên',
} as const;
export type JdFields = Record<keyof typeof JD_SECTIONS, string>;
// Store readable sections in the existing description so all JD consumers remain compatible.
export function serializeJdFields(fields: JdFields): string {
  return Object.entries(JD_SECTIONS).map(([key, label]) => `【${label}】\n${fields[key as keyof JdFields].trim()}`).join('\n\n');
}
export function parseJdFields(description?: string | null): JdFields {
  const fields = Object.fromEntries(Object.keys(JD_SECTIONS).map(key => [key, ''])) as JdFields;
  const text = (description || '').replace(/\r\n?/g, '\n');
  const matches = [...text.matchAll(/^[ \t]*【([^\n]+)】[ \t]*\n/gm)];
  if (!matches.length) { fields.duties = text; return fields; }
  for (let i = 0; i < matches.length; i++) {
    const key = (Object.keys(JD_SECTIONS) as (keyof JdFields)[]).find(key => JD_SECTIONS[key] === matches[i][1]);
    if (key) fields[key] = text.slice(matches[i].index! + matches[i][0].length, matches[i + 1]?.index ?? text.length).trim();
  }
  return fields;
}
