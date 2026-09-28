/**
 * Danh sách Quốc Tịch chuẩn (tiếng Việt) cho ô "Quốc Tịch" trong hồ sơ nhân sự.
 *
 * Mục đích: chuẩn hoá giá trị nhập để thống kê "lao động nước ngoài" chính xác
 * (logic đếm coi mọi quốc tịch KHÁC 'Việt Nam' là nước ngoài — xem
 * workforceMovementService). 'Việt Nam' luôn đứng đầu & là mặc định.
 *
 * Thêm quốc tịch mới: chèn vào đúng vị trí; KHÔNG đổi cách viết 'Việt Nam'.
 */
export const VIETNAM_NATIONALITY = 'Việt Nam';

export const NATIONALITIES: string[] = [
  VIETNAM_NATIONALITY,
  // Đông Á & Đông Nam Á (phổ biến với DN Việt)
  'Hàn Quốc', 'Nhật Bản', 'Trung Quốc', 'Đài Loan', 'Hồng Kông',
  'Singapore', 'Malaysia', 'Thái Lan', 'Indonesia', 'Philippines',
  'Lào', 'Campuchia', 'Myanmar', 'Brunei', 'Mông Cổ',
  // Nam Á
  'Ấn Độ', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal',
  // Châu Âu
  'Anh', 'Pháp', 'Đức', 'Ý', 'Tây Ban Nha', 'Bồ Đào Nha', 'Hà Lan',
  'Bỉ', 'Thụy Sĩ', 'Áo', 'Thụy Điển', 'Na Uy', 'Đan Mạch', 'Phần Lan',
  'Ba Lan', 'Séc', 'Hy Lạp', 'Ireland', 'Nga', 'Ukraine', 'Thổ Nhĩ Kỳ',
  // Châu Mỹ
  'Hoa Kỳ', 'Canada', 'Mexico', 'Brazil', 'Argentina',
  // Châu Đại Dương
  'Úc', 'New Zealand',
  // Trung Đông & Châu Phi (phổ biến)
  'Israel', 'Các Tiểu vương quốc Ả Rập', 'Ả Rập Xê Út', 'Ai Cập', 'Nam Phi',
];
