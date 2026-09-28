'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/authStore';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      router?.push(
        process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true'
          ? '/nguon-nhan-luc/tinh-hinh-tuyen-dung'
          : user?.role === 'user' ? '/tickets' : '/dashboard'
      );
      return;
    }
    // localStorage rỗng có thể do vừa đăng nhập qua SSO (callback là 302 redirect,
    // không có JS nào chạy để ghi localStorage) — thử bootstrap từ cookie session
    // trước khi kết luận chưa đăng nhập, tránh redirect nhầm về màn hình login.
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((u) => {
        if (u && !u.error) {
          localStorage.setItem('assetflow_auth', JSON.stringify(u));
          router?.push(
            process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true'
              ? '/nguon-nhan-luc/tinh-hinh-tuyen-dung'
              : u?.role === 'user' ? '/tickets' : '/dashboard'
          );
        } else {
          router?.push('/sign-up-login-screen');
        }
      })
      .catch(() => router?.push('/sign-up-login-screen'));
  }, [router]);

  return null;
}
