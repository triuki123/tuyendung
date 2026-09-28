'use client';

import { useMemo } from 'react';
import { NAV_ITEMS, NAV_GROUPS } from '@/components/Sidebar';
import { shouldShowNavigationModule } from '@/lib/rolePolicy';
import type { UserModulePermissions } from '@/lib/modules';

interface Props {
  role: string | undefined;
  perms: UserModulePermissions | undefined;
  active: string;
  onChange: (label: string) => void;
}

/** Thanh chọn khu vực (kiểu switcher) — chỉ hiện các nhóm có ít nhất 1 mục được phép. */
export default function AreaTabs({ role, perms, active, onChange }: Props) {
  const groups = useMemo(() => {
    if (!role) return [] as string[];
    return NAV_GROUPS.filter((g) =>
      g.ids.some((id) => {
        const item = NAV_ITEMS.find((i) => i.id === id);
        return item && shouldShowNavigationModule(role, id, perms);
      })
    ).map((g) => g.label);
  }, [role, perms]);

  if (groups.length === 0) return null;

  return (
    <div className="hidden lg:flex items-center gap-1 px-4 lg:px-6 border-b border-line-subtle overflow-x-auto"
      style={{ background: 'var(--card)' }}>
      {groups.map((label) => {
        const on = active === label;
        return (
          <button
            key={label}
            onClick={() => onChange(label)}
            className={`px-3.5 py-2.5 text-sm font-600 whitespace-nowrap border-b-2 -mb-px transition-colors ${
              on ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
