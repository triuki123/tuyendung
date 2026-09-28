'use client';

import { useState } from 'react';
import UserForm from '@/app/components/UserForm';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CreateUserPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  // Get user role from localStorage on mount
  useState(() => {
    const role = localStorage.getItem('userRole');
    setUserRole(role || '');
  });

  const handleSubmit = async (formData: any) => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Tạo tài khoản thất bại');
        return;
      }

      router.push('/admin/users?success=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/admin/users" className="text-blue-600 hover:text-blue-700 text-sm">
          ← Quay lại
        </Link>
        <h1 className="text-3xl font-bold mt-4">Tạo Tài Khoản Người Dùng</h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">{error}</div>}

      {loading && <div className="bg-blue-50 text-blue-700 p-4 rounded-lg mb-6">Đang tạo tài khoản...</div>}

      <UserForm onSubmit={handleSubmit} isAdmin={userRole === 'super_admin' || userRole === 'admin'} />
    </div>
  );
}
