import SolacePosWorkspace from './components/SolacePosWorkspace';

/**
 * /solace-pos — Workspace VẬN HÀNH QUÁN cho nhân viên Solace.
 * Shell độc lập KHÔNG có sidebar tổng (khác /solace của hệ thống chính),
 * responsive desktop + điện thoại/máy POS. Mỗi người chỉ thấy mục mình có quyền.
 */
export default function SolacePosPage() {
  return <SolacePosWorkspace />;
}
