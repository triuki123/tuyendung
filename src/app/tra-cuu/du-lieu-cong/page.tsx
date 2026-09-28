'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, Search, ClipboardCheck, Settings, BarChart3, CalendarDays, Award, ShieldCheck, ClipboardList } from 'lucide-react';
import { clientCanAccess } from '@/lib/clientPermissions';

const SUB_MODULES = [
  {
    href: '/tra-cuu/du-lieu-cong/yeu-cau-cua-toi',
    icon: ClipboardList,
    title: 'Yêu Cầu Của Tôi',
    description: 'Lịch & trạng thái mọi đơn nghỉ phép, bù công, tăng ca của bạn — bấm vào ngày để tạo đơn mới',
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/15',
    borderHover: 'hover:border-sky-500/40',
    badge: null,
  },
  {
    href: '/tra-cuu/du-lieu-cong/tra-cuu',
    unitId: 'cham-cong-lookup',
    icon: Search,
    title: 'Tra Cứu Dữ Liệu Công',
    description: 'Xem lại lịch sử chấm công của bạn theo tháng, xuất dữ liệu, kiểm tra số ngày công thực tế',
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/15',
    borderHover: 'hover:border-indigo-500/40',
    badge: null,
  },
  {
    href: '/tra-cuu/du-lieu-cong/cham-cong',
    unitId: 'cham-cong-checkin',
    icon: Clock,
    title: 'Chấm Công',
    description: 'Điểm danh vào / ra ca làm việc. Ghi nhận GPS và thông báo Telegram ngay lập tức',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15',
    borderHover: 'hover:border-emerald-500/40',
    badge: null,
  },
  {
    href: '/tra-cuu/du-lieu-cong/nghi-phep',
    icon: CalendarDays,
    title: 'Nghỉ Phép',
    description: 'Xin nghỉ phép theo ngày hoặc theo giờ, theo dõi số phép năm còn lại của bạn',
    iconColor: 'text-teal-400',
    iconBg: 'bg-teal-500/15',
    borderHover: 'hover:border-teal-500/40',
    badge: null,
  },
  {
    href: '/tra-cuu/du-lieu-cong/bang-cong',
    icon: ClipboardCheck,
    title: 'Theo Dõi Dữ Liệu Chấm Công',
    description: 'Dành cho Quản Lý — xem bảng công của nhân sự cấp dưới; hệ thống tự gửi về Bộ Phận Chấm Công khi tới hạn',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15',
    borderHover: 'hover:border-amber-500/40',
    badge: 'Quản Lý',
  },
  {
    href: '/tra-cuu/du-lieu-cong/chuyen-can',
    unitId: 'cham-cong-diligence',
    icon: Award,
    title: 'Theo Dõi Chuyên Cần',
    description: 'Tổng hợp chỉ số chuyên cần: đúng giờ, đi trễ, về sớm, nghỉ phép theo loại, điểm & xếp loại từng nhân sự',
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/15',
    borderHover: 'hover:border-rose-500/40',
    badge: null,
  },
  {
    href: '/tra-cuu/du-lieu-cong/tong-hop',
    icon: BarChart3,
    title: 'Tổng Hợp Dữ Liệu Công',
    description: 'Tiếp nhận và tổng hợp bảng công từ các quản lý gửi về — chỉ dành cho Phòng Hành Chính Nhân Sự',
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/15',
    borderHover: 'hover:border-violet-500/40',
    badge: 'HCNS',
  },
  {
    href: '/tra-cuu/du-lieu-cong/uy-quyen-duyet',
    unitId: 'cham-cong-leave-config',
    icon: ShieldCheck,
    title: 'Ủy Quyền Duyệt Công',
    description: 'Giao quyền duyệt Nghỉ Phép · Bù Công · Tăng Ca của nhân sự cho người ngoài nhánh sơ đồ tổ chức',
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/15',
    borderHover: 'hover:border-cyan-500/40',
    badge: 'Admin',
  },
  {
    href: '/tra-cuu/du-lieu-cong/cau-hinh',
    unitId: 'cham-cong-machines',
    icon: Settings,
    title: 'Cấu Hình Máy Chấm Công',
    description: 'Gán mã nhân viên trên máy vân tay với tài khoản hệ thống, xử lý bản ghi chưa khớp',
    iconColor: 'text-ink-muted',
    iconBg: 'bg-slate-500/15',
    borderHover: 'hover:border-slate-500/40',
    badge: 'Admin',
  },
];

export default function DuLieuCongPage() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Thẻ có unitId được lọc theo quyền con (kế thừa mẹ) sau khi mount;
  // thẻ không gắn unitId (Nghỉ Phép, Xác Nhận, Tổng Hợp) luôn hiển thị theo cơ chế cũ.
  const visibleModules = mounted
    ? SUB_MODULES.filter((m) => !m.unitId || clientCanAccess(m.unitId, 'view'))
    : SUB_MODULES;

  return (
    <div className="flex-1 p-4 sm:p-6 animate-fadeIn">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-foreground">Dữ Liệu Chấm Công</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Điểm danh, tra cứu dữ liệu và xác nhận bảng công
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleModules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={`glass-card glass-card-hover group relative flex flex-col rounded-2xl border border-line-subtle p-5 transition-all duration-200 ${mod.borderHover}`}
            >
              {mod.badge && (
                <span className={`absolute right-4 top-4 rounded-full border px-2 py-0.5 text-xs font-500 ${
                  mod.badge === 'HCNS'
                    ? 'border-violet-500/30 bg-violet-500/15 text-violet-400'
                    : mod.badge === 'Admin'
                    ? 'border-slate-500/30 bg-slate-500/15 text-ink-muted'
                    : 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                }`}>
                  {mod.badge}
                </span>
              )}
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${mod.iconBg}`}>
                <Icon className={`h-5 w-5 ${mod.iconColor}`} />
              </div>
              <h2 className="mb-1.5 text-sm font-600 text-foreground group-hover:text-white">
                {mod.title}
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">{mod.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
