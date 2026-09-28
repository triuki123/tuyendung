'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function TicketsPage() {
  const router = useRouter();

  useEffect(() => {
    // Get user role from localStorage
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      const user = JSON.parse(userData);
      const userRole = user.role;

      // Redirect based on role
      if (userRole === 'super_admin' || userRole === 'admin') {
        router.push('/tickets/admin');
      } else {
        router.push('/tickets/user');
      }
    }
  }, [router]);

  // Loading state while redirecting
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={32} className="text-indigo-400 animate-spin" />
        <p className="text-ink-bright text-sm">Đang tải...</p>
      </div>
    </div>
  );
}
