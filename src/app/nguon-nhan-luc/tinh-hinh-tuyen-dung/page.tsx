import RecruitmentLayout from '@/components/RecruitmentLayout';
import PermissionGate from '@/components/PermissionGate';
import dynamic from 'next/dynamic';
import RecruitmentFocusOverview from './RecruitmentFocusOverview';

const RecruitmentDashboard = dynamic(() => import('./RecruitmentDashboard'));

export const metadata = { title: 'Tình Hình Tuyển Dụng Nhân Sự — Nguồn Nhân Lực' };

export default function TinhHinhTuyenDungPage() {
  return (
    <RecruitmentLayout>
      <PermissionGate unitId="hr-recruitment-dashboard" backHref="/nguon-nhan-luc" backLabel="Tuyển Dụng">
        {process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true' ? <RecruitmentFocusOverview /> : <RecruitmentDashboard />}
      </PermissionGate>
    </RecruitmentLayout>
  );
}
