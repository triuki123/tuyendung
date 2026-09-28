import RecruitmentLayout from '@/components/RecruitmentLayout';
import PermissionGate from '@/components/PermissionGate';
import InterviewCalendarClient from './InterviewCalendarClient';

export const metadata = { title: 'Lịch Phỏng Vấn — Tuyển Dụng' };

export default function InterviewCalendarPage() {
  return <RecruitmentLayout><PermissionGate unitId="hr-requisitions" backHref="/nguon-nhan-luc" backLabel="Tuyển Dụng"><InterviewCalendarClient /></PermissionGate></RecruitmentLayout>;
}
