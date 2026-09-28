import RecruitmentLayout from '@/components/RecruitmentLayout';
import PermissionGate from '@/components/PermissionGate';
import JdPoolClient from './components/JdPoolClient';

export const metadata = { title: 'Kho Mô Tả Công Việc — Nguồn Nhân Lực' };

export default function KhoMoTaCongViecPage() {
  return (
    <RecruitmentLayout>
      <PermissionGate unitId="hr-jd" backHref="/nguon-nhan-luc" backLabel="Tuyển Dụng">
        <JdPoolClient />
      </PermissionGate>
    </RecruitmentLayout>
  );
}
