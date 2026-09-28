'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, ClipboardList } from 'lucide-react';

interface SubModule {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const subModules: SubModule[] = [
  {
    id: 'employees',
    label: 'Tags Nhân Viên',
    href: '/organization/tags/employees',
    icon: <Users size={15} />,
  },
  {
    id: 'tags_dept',
    label: 'Tags Tổ Chức',
    href: '/organization/tags/tags_dept',
    icon: <ClipboardList size={15} />,
  },
];

export default function TagsSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1.5 mb-6 p-1 rounded-xl bg-hover border border-line w-fit">
      {subModules.map((mod) => {
        const active = pathname?.startsWith(mod.href);
        return (
          <Link
            key={mod.id}
            href={mod.href}
            className={`
              flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-2xs sm:text-xs font-600
              transition-all duration-200
              ${
                active
                  ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-hover'
              }
            `}
          >
            {mod.icon}
            <span>{mod.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
