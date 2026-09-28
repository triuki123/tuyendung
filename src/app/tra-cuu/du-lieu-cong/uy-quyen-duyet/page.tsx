import PermissionGate from '@/components/PermissionGate';
import UyQuyenDuyetClient from './components/UyQuyenDuyetClient';

/**
 * Ủy Quyền Duyệt Công — gán người duyệt thay quản lý trực tiếp, vượt cây sơ đồ.
 * Áp cho cả 3 luồng: Nghỉ Phép / Bù Công / Tăng Ca. Đặt ở hub Dữ Liệu Chấm Công vì
 * phạm vi là toàn bộ "duyệt công", không riêng nghỉ phép.
 */
export default function UyQuyenDuyetPage() {
  return (
    <div className="flex-1 p-4 sm:p-6">
      <PermissionGate unitId="cham-cong-leave-config" backHref="/tra-cuu/du-lieu-cong" backLabel="Dữ Liệu Chấm Công">
        <UyQuyenDuyetClient />
      </PermissionGate>
    </div>
  );
}
