'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Megaphone, Package, Users, ClipboardList } from 'lucide-react';
import { clientCanAccess } from '@/lib/clientPermissions';

const SUB_MODULES = [
  {
    href: '/tra-cuu/van-ban',
    unit: 'tra-cuu-van-ban',
    icon: FileText,
    title: 'Văn Bản - Quyết Định',
    description: 'Văn bản, quyết định, thông tư do công ty ban hành',
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/15',
    borderHover: 'hover:border-indigo-500/40',
  },
  {
    href: '/tra-cuu/thong-bao',
    unit: 'tra-cuu-thong-bao',
    icon: Megaphone,
    title: 'Thông Báo - Truyền Thông',
    description: 'Bản tin nội bộ từ phòng nhân sự, tự động gửi Telegram khi phát hành',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15',
    borderHover: 'hover:border-amber-500/40',
  },
  {
    href: '/tra-cuu/tai-san',
    unit: 'tra-cuu-tai-san',
    icon: Package,
    title: 'Tra Cứu Tài Sản',
    description: 'Xem tài sản được gán cho bạn. Quản lý thấy thêm tài sản cấp dưới',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15',
    borderHover: 'hover:border-emerald-500/40',
  },
  {
    href: '/tra-cuu/dau-moi',
    unit: 'tra-cuu-dau-moi',
    icon: Users,
    title: 'Đầu Mối Liên Hệ',
    description: 'Danh sách nhân sự phụ trách từng mảng để liên hệ khi cần',
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/15',
    borderHover: 'hover:border-purple-500/40',
  },
  {
    href: '/tra-cuu/lich-su',
    unit: 'tra-cuu-lich-su',
    icon: ClipboardList,
    title: 'Lịch Sử Hoạt Động',
    description: 'Xem lại những gì bạn đã làm, ai giao task, ai nhắc đến bạn',
    iconColor: 'text-ink-muted',
    iconBg: 'bg-slate-500/15',
    borderHover: 'hover:border-slate-500/40',
  },
];

export default function TraCuuPage() {
  // Lọc tile theo quyền (kế thừa mẹ 'tra-cuu'). Đọc localStorage sau mount để tránh hydration mismatch.
  const [visible, setVisible] = useState(SUB_MODULES);
  useEffect(() => {
    setVisible(SUB_MODULES.filter((m) => clientCanAccess(m.unit, 'view')));
  }, []);

  return (
    <div className="flex-1 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-foreground">Tra Cứu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tìm kiếm và xem thông tin nội bộ của tổ chức
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={`glass-card glass-card-hover group flex flex-col rounded-2xl border border-line-subtle p-5 transition-all duration-200 ${mod.borderHover}`}
            >
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${mod.iconBg}`}>
                <Icon className={`h-5 w-5 ${mod.iconColor}`} />
              </div>
              <h2 className="mb-1.5 text-sm font-600 text-foreground group-hover:text-white">
                {mod.title}
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {mod.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
