/**
 * Danh sách ĐỊA CHỈ CÔNG TÁC (văn phòng làm việc) dùng chung:
 *  - Hồ sơ người dùng (Địa Chỉ Công Tác)
 *  - Chọn địa điểm phỏng vấn trực tiếp khi soạn email ứng viên
 * Nguồn duy nhất để tránh trôi lệch giữa các nơi. `value` là mã lưu DB,
 * `label` là địa chỉ hiển thị/điền vào email.
 */
export interface WorkLocation {
  value: string;
  label: string;
}

export const WORK_LOCATIONS: WorkLocation[] = [
  { value: 'fado_hcm', label: 'FADO Building — 161/1-3 Cộng Hoà, P.Bảy Hiền, TP.HCM' },
  { value: 'fado_hn', label: 'FADO Hà Nội — 95-97 Lê Duẩn, P.Cửa Nam, Hà Nội' },
  { value: 'fado_cambodia', label: 'FADO Cambodia' },
];

/** Đổi mã địa điểm → nhãn địa chỉ đầy đủ. Không khớp → trả nguyên value. */
export function workLocationLabel(value: string | null | undefined): string {
  if (!value) return '';
  return WORK_LOCATIONS.find((w) => w.value === value)?.label ?? value;
}
