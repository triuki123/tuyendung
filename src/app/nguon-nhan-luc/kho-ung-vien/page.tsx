import RecruitmentLayout from '@/components/RecruitmentLayout';
import PermissionGate from '@/components/PermissionGate';
import CandidatePoolClient from './components/CandidatePoolClient';

export const metadata = { title: 'Kho Ứng Viên — Nguồn Nhân Lực' };

export default function KhoUngVienPage() {
  return (
    <RecruitmentLayout>
      <PermissionGate unitId="hr-cv" backHref="/nguon-nhan-luc" backLabel="Tuyển Dụng">
        <CandidatePoolClient />
      </PermissionGate>
    </RecruitmentLayout>
  );
}
