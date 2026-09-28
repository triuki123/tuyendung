/**
 * Quy tắc field biểu mẫu Onboarding dùng chung cho cả server & client (không import gì
 * nặng để an toàn ở mọi phía).
 *
 * RECRUITER_ONLY_FIELD_KEYS: các trường do bộ phận Tuyển dụng điền/phân bổ khi xác nhận
 * hồ sơ — KHÔNG hiển thị trên form public nhân sự tự điền (nhân sự không tự chọn công ty/
 * phòng ban/chức vụ của mình). Các trường này vẫn hiện trong panel xác nhận của Tuyển dụng.
 */
export const RECRUITER_ONLY_FIELD_KEYS = [
  'company_id',
  'department_id',
  'sub_department_id',
  'position_id',
  'job_title',
] as const;

/** true nếu field chỉ dành cho Tuyển dụng (ẩn khỏi form public). */
export function isRecruiterOnlyField(fieldKey: string): boolean {
  return (RECRUITER_ONLY_FIELD_KEYS as readonly string[]).includes(fieldKey);
}
