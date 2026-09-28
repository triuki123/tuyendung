'use client';

import React from 'react';
import Link from 'next/link';
import { LayoutDashboard, UserPlus, UserMinus, FolderKanban, FileText, ClipboardList, ArrowRightLeft, Mail, CalendarDays, Sparkles } from 'lucide-react';
import { clientCanAccess } from '@/lib/clientPermissions';

/** Thẻ điều hướng các khu vực con của Nguồn Nhân Lực, ẩn theo quyền (kế thừa mẹ). */
const SUB_MODULES = [
  {
    href: '/nguon-nhan-luc/fdv', unitId: 'hr-requisitions', icon: Sparkles,
    title: 'FDV · FADO Visions',
    description: 'Trợ lý TA: đối chiếu CV/JD, tóm tắt hồ sơ, tra cứu ngành và nhắc công việc.',
    iconColor: 'text-blue-500', iconBg: 'bg-blue-500/15',
    borderHover: 'hover:border-blue-500/40', badgeColor: 'bg-blue-500',
  },
  {
    href: '/nguon-nhan-luc/tinh-hinh-tuyen-dung',
    unitId: 'hr-recruitment-dashboard',
    icon: LayoutDashboard,
    title: 'Tình Hình Tuyển Dụng Nhân Sự',
    description: 'Dashboard biểu đồ: phễu tuyển dụng, xu hướng, cơ cấu lao động, nguồn ứng viên',
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/15',
    borderHover: 'hover:border-indigo-500/40',
    badgeColor: 'bg-indigo-500',
  },
  {
    href: '/nguon-nhan-luc/bien-dong-nhan-su',
    unitId: 'hr',
    icon: ArrowRightLeft,
    title: 'Tình Hình Biến Động Nhân Sự',
    description: 'Dành cho phòng Nhân Sự: vào/ra/ròng, tỷ lệ nghỉ việc, cơ cấu lao động, báo cáo tăng giảm mốc ngày 15',
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/15',
    borderHover: 'hover:border-violet-500/40',
    badgeColor: 'bg-violet-500',
  },
  {
    href: '/nguon-nhan-luc/yeu-cau-tuyen-dung',
    unitId: 'hr-requisitions',
    icon: ClipboardList,
    title: 'Tiếp Nhận Yêu Cầu Tuyển Dụng',
    description: 'Quản lý nhu cầu tuyển: số lượng cần, người phụ trách, tiến độ, thời gian tuyển',
    iconColor: 'text-teal-400',
    iconBg: 'bg-teal-500/15',
    borderHover: 'hover:border-teal-500/40',
    badgeColor: 'bg-teal-500',
  },
  {
    href: '/nguon-nhan-luc/lich-phong-van',
    unitId: 'hr-requisitions',
    icon: CalendarDays,
    title: 'Lịch Phỏng Vấn',
    description: 'Theo dõi lịch PV theo ngày, ứng viên, vị trí, người phỏng vấn và ghi chú tập trung.',
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-500/15',
    borderHover: 'hover:border-blue-500/40',
    badgeColor: 'bg-blue-500',
  },
  {
    href: '/nguon-nhan-luc/onboarding',
    unitId: 'hr-onboarding',
    icon: UserPlus,
    title: 'Onboarding',
    description: 'Tiếp nhận nhân sự mới: cấu hình biểu mẫu, chuẩn hóa thông tin, gửi duyệt tạo tài khoản',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15',
    borderHover: 'hover:border-emerald-500/40',
    badgeColor: 'bg-emerald-500',
  },
  {
    href: '/nguon-nhan-luc/offboarding',
    unitId: 'hr-offboarding',
    icon: UserMinus,
    title: 'Offboarding',
    description: 'Quy trình nghỉ việc: checklist bàn giao, thu hồi tài sản, vô hiệu hóa tài khoản',
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/15',
    borderHover: 'hover:border-rose-500/40',
    badgeColor: 'bg-rose-500',
  },
  {
    href: '/nguon-nhan-luc/kho-ung-vien',
    unitId: 'hr-cv',
    icon: FolderKanban,
    title: 'Kho Ứng Viên',
    description: 'Lưu trữ CV ứng viên, theo dõi pipeline tuyển dụng từ sàng lọc đến nhận việc',
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/15',
    borderHover: 'hover:border-purple-500/40',
    badgeColor: 'bg-purple-500',
  },
  {
    href: '/nguon-nhan-luc/kho-mo-ta-cong-viec',
    unitId: 'hr-jd',
    icon: FileText,
    title: 'Kho Mô Tả Công Việc',
    description: 'Quản lý bản mô tả công việc (JD) cho từng vị trí, dùng lại khi đăng tuyển',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15',
    borderHover: 'hover:border-amber-500/40',
    badgeColor: 'bg-amber-500',
  },
  {
    href: '/nguon-nhan-luc/email-tuyen-dung',
    unitId: 'hr-cv',
    icon: Mail,
    title: 'Mẫu Email Tuyển Dụng',
    description: 'Soạn & quản lý mẫu email gửi ứng viên: mời phỏng vấn, từ chối, mời nhận việc',
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/15',
    borderHover: 'hover:border-indigo-500/40',
    badgeColor: 'bg-indigo-500',
  },
];

export default function SubModuleCards() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const visible = mounted ? SUB_MODULES.filter(m => clientCanAccess(m.unitId, 'view')) : SUB_MODULES;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((mod) => {
        const Icon = mod.icon;
        return (
          <Link
            key={mod.href}
            href={mod.href}
            className={`group relative flex flex-col rounded-2xl border border-line-subtle p-5 transition-all duration-200 ${mod.borderHover}`}
            style={{ background: 'var(--card)' }}
          >
            <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${mod.iconBg}`}>
              <Icon className={`h-5 w-5 ${mod.iconColor}`} />
            </div>
            <h2 className="mb-1.5 text-sm font-600 text-foreground group-hover:text-white">{mod.title}</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">{mod.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
