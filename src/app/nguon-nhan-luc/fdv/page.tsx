import RecruitmentLayout from '@/components/RecruitmentLayout';
import PermissionGate from '@/components/PermissionGate';
import FdvClient from './FdvClient';
export const metadata = { title: 'FDV — FADO Visions' };
export default function FdvPage() {
  return <RecruitmentLayout><PermissionGate unitId="hr-requisitions" backHref="/nguon-nhan-luc" backLabel="Tuyển dụng"><FdvClient /></PermissionGate></RecruitmentLayout>;
}
