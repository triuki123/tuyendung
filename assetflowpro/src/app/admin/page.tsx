'use client';

import { Users, Settings, Lock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const role = localStorage.getItem('userRole');
    const name = localStorage.getItem('userName');
    setUserRole(role || '');
    setUserName(name || '');
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold">Admin Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Chào mừng, <span className="font-semibold">{userName}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/admin/users"
          className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold">Quản Lý Người Dùng</h2>
          </div>
          <p className="text-gray-600 text-sm">Xem, tạo mới, và quản lý tài khoản người dùng</p>
        </Link>

        <Link
          href="/admin/system-config"
          className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <Settings className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-xl font-bold">Cấu Hình Hệ Thống</h2>
          </div>
          <p className="text-gray-600 text-sm">Quản lý vai trò, phòng ban, và công ty</p>
        </Link>

        {userRole === 'super_admin' && (
          <Link
            href="/admin/change-password"
            className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-purple-100 p-3 rounded-lg">
                <Lock className="h-6 w-6 text-purple-600" />
              </div>
              <h2 className="text-xl font-bold">Đổi Mật Khẩu</h2>
            </div>
            <p className="text-gray-600 text-sm">Thay đổi mật khẩu cho người dùng khác</p>
          </Link>
        )}
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-bold text-blue-900 mb-2">Thông Tin Vai Trò</h3>
        <p className="text-blue-700 text-sm">
          Vai trò hiện tại: <span className="font-semibold">{userRole}</span>
        </p>
      </div>
    </div>
  );
}
