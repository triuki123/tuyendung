/**
 * bulkFields — danh sách trường ĐƯỢC PHÉP sửa hàng loạt (whitelist).
 *
 * An toàn: server CHỈ chấp nhận các key có ở đây → client không thể bulk-update
 * các cột nhạy cảm/cá nhân (email, mật khẩu, CCCD, ngân hàng...). UI modal cũng
 * render từ danh sách này (field-level toggle: chỉ trường BẬT mới ghi đè).
 *
 * Phạm vi v1: Lao động & nơi làm việc · Chế độ & đãi ngộ · vài trường hồ sơ dùng chung.
 */
import { NATIONALITIES } from '@/lib/constants/nationalities';

export type BulkFieldType = 'select' | 'boolean' | 'money' | 'text' | 'time';

export interface BulkField {
  key: string;
  label: string;
  group: string;
  type: BulkFieldType;
  options?: { value: string; label: string }[];
  hint?: string;
  step?: number;
}

export const BULK_FIELDS: BulkField[] = [
  // ── Lao động & nơi làm việc ──
  {
    key: 'work_location', label: 'Địa chỉ công tác', group: 'Lao động & nơi làm việc', type: 'select',
    options: [
      { value: 'fado_hcm', label: 'FADO Building — TP.HCM' },
      { value: 'fado_hn', label: 'FADO Hà Nội' },
      { value: 'fado_cambodia', label: 'FADO Cambodia' },
    ],
  },
  {
    key: 'nationality', label: 'Quốc tịch', group: 'Lao động & nơi làm việc', type: 'select',
    options: NATIONALITIES.map((n) => ({ value: n, label: n })),
  },
  { key: 'work_start_time', label: 'Giờ vào làm', group: 'Lao động & nơi làm việc', type: 'time', hint: 'dùng cho minigame Solace' },

  // ── Chế độ & đãi ngộ ──
  { key: 'meal_allowance_enabled', label: 'Phụ cấp cơm trưa (bật/tắt)', group: 'Chế độ & đãi ngộ', type: 'boolean' },
  { key: 'meal_allowance_rate', label: 'Mức phụ cấp cơm trưa', group: 'Chế độ & đãi ngộ', type: 'money', step: 1000, hint: 'đồng/ngày' },
  { key: 'parking_allowance_enabled', label: 'Phụ cấp gửi xe (bật/tắt)', group: 'Chế độ & đãi ngộ', type: 'boolean' },
  { key: 'parking_allowance_rate', label: 'Mức phụ cấp gửi xe', group: 'Chế độ & đãi ngộ', type: 'money', step: 1000, hint: 'đồng/ngày' },
  { key: 'travel_allowance_rate', label: 'Phụ cấp đi lại', group: 'Chế độ & đãi ngộ', type: 'money', step: 1000, hint: 'đồng/tháng' },
  { key: 'social_insurance_unit', label: 'Đơn vị BHXH', group: 'Chế độ & đãi ngộ', type: 'text' },
  { key: 'salary_entity', label: 'Pháp nhân trả lương', group: 'Chế độ & đãi ngộ', type: 'text' },
  { key: 'cost_center_code', label: 'Mã trung tâm chi phí', group: 'Chế độ & đãi ngộ', type: 'text' },
];

/** Whitelist key — server kiểm tra mọi key gửi lên phải nằm trong đây. */
export const BULK_FIELD_KEYS = new Set(BULK_FIELDS.map((f) => f.key));

/** Nhóm theo group (giữ thứ tự xuất hiện) cho UI. */
export function bulkFieldsByGroup(): { group: string; fields: BulkField[] }[] {
  const order: string[] = [];
  const map = new Map<string, BulkField[]>();
  for (const f of BULK_FIELDS) {
    if (!map.has(f.group)) { map.set(f.group, []); order.push(f.group); }
    map.get(f.group)!.push(f);
  }
  return order.map((group) => ({ group, fields: map.get(group)! }));
}
