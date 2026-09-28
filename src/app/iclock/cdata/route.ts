/**
 * /iclock/cdata — ZKTeco ADMS legacy endpoint
 *
 * Máy ZKTeco firmware cũ gửi dữ liệu đến /iclock/cdata thay vì /api/attendance/adms.
 * Route này chuyển tiếp thẳng sang handler ADMS để dùng chung logic.
 */

export { GET, POST } from '@/app/api/attendance/adms/route';
