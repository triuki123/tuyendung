import RecruitmentLayout from '@/components/RecruitmentLayout';
import PermissionGate from '@/components/PermissionGate';
import EmailTemplatesClient from './components/EmailTemplatesClient';

export const metadata = { title: 'Mẫu Email Tuyển Dụng — Nguồn Nhân Lực' };

export default function EmailTuyenDungPage() {
  return (
    <RecruitmentLayout>
      <PermissionGate unitId="hr-cv" backHref="/nguon-nhan-luc" backLabel="Tuyển Dụng">
        <EmailTemplatesClient />
      </PermissionGate>
    </RecruitmentLayout>
  );
}
