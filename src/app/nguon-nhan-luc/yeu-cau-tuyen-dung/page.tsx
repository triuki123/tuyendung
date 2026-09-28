import RecruitmentLayout from '@/components/RecruitmentLayout';
import PermissionGate from '@/components/PermissionGate';
import RequisitionsClient from './components/RequisitionsClient';

export const metadata = { title: 'Yêu Cầu Tuyển Dụng — Nguồn Nhân Lực' };

export default function YeuCauTuyenDungPage() {
  return (
    <RecruitmentLayout>
      <PermissionGate unitId="hr-requisitions" backHref="/nguon-nhan-luc" backLabel="Tuyển Dụng">
        <RequisitionsClient />
      </PermissionGate>
    </RecruitmentLayout>
  );
}
