'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Gift, Loader2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import type { UserModulePermissions } from '@/lib/modules';
import MinigameTab from '../quan-ly/components/MinigameTab';

export default function MinigameAdminClient({ embedded }: { embedded?: boolean } = {}) {
  const [perms, setPerms] = useState<UserModulePermissions | undefined>();
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getCurrentUser() as { role?: string; module_permissions?: UserModulePermissions } | null;
    setPerms(u?.module_permissions); setRole(u?.role ?? ''); setLoading(false);
  }, []);

  const { canAccessInherited } = useUserPermissions(perms);
  const canManage = role === 'super_admin' || canAccessInherited('solace-minigame', 'view');

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!canManage) {
    return (
      <div className="flex flex-col items-center py-20 text-muted-foreground">
        <Gift className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Bạn không có quyền cấu hình minigame</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {!embedded && (
        <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
        </Link>
      )}
      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2"><Gift className="h-6 w-6 text-indigo-400" /> Minigame Quà Tặng</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Cấu hình "đến sớm nhận quà" — tách riêng, có thể bật/tắt hoặc gỡ bất cứ lúc nào.</p>
      </div>
      <MinigameTab />
    </div>
  );
}
