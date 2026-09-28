import RecruitmentLayout from '@/components/RecruitmentLayout';
import SubModuleCards from './components/SubModuleCards';

export const metadata = { title: 'Tuyển Dụng — FADO AssetFlow' };

export default function NguonNhanLucPage() {
  return (
    <RecruitmentLayout>
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Tuyển Dụng</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Quản lý tuyển dụng, kho ứng viên và quy trình tuyển chọn
          </p>
        </div>

        <SubModuleCards />
      </div>
    </RecruitmentLayout>
  );
}
