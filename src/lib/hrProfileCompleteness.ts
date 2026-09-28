/**
 * Tính % hoàn thiện Hồ Sơ Nhân Sự (tab "🗂️ Nhân Sự" trong modal người dùng).
 *
 * Danh sách field = đúng các field xuất hiện trong tab Hồ Sơ Nhân Sự, KHÔNG tính
 * nhóm "Người Thân Liên Hệ 2" (UI ghi rõ không bắt buộc) và probation_duration_days
 * (chỉ áp dụng khi đang thử việc) — để 100% là khả thi khi điền đủ thông tin cốt lõi.
 */
export const HR_PROFILE_FIELDS: readonly string[] = [
  // 👤 Thông tin cá nhân
  'date_of_birth',
  'gender',
  'personal_email',
  'nationality',
  'ethnicity',
  'religion',
  'marital_status',
  'children_count',
  'education_level',
  'major',
  // 💼 Thông tin lao động
  'employee_code',
  'hire_date',
  'employment_type_id',
  // 📍 Địa chỉ
  'home_address',
  'temporary_address',
  'work_location',
  // 🏦 Ngân hàng
  'bank_name',
  'bank_account_no',
  'bank_account_name',
  // 🪪 Giấy tờ tùy thân
  'national_id',
  'national_id_issue_date',
  'national_id_issue_place',
  // 🚗 Phương tiện
  'vehicle_type',
  'vehicle_plate',
  'vehicle_model',
  // 🆘 Người thân liên hệ 1
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_phone',
  'emergency_contact_address',
];

/** Một field được coi là "đã điền" khi có giá trị (số 0 vẫn tính là đã điền). */
function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

export interface HrCompleteness {
  filled: number;
  total: number;
  percent: number; // 0–100, làm tròn
}

/** Đếm số field đã điền trong Hồ Sơ Nhân Sự và tính %. */
export function computeHrCompleteness(user: Record<string, unknown> | null | undefined): HrCompleteness {
  const total = HR_PROFILE_FIELDS.length;
  if (!user) return { filled: 0, total, percent: 0 };
  let filled = 0;
  for (const f of HR_PROFILE_FIELDS) {
    if (isFilled(user[f])) filled++;
  }
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  return { filled, total, percent };
}
