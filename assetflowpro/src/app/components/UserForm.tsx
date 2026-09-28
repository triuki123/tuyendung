'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Plus, X } from 'lucide-react';

interface SystemConfigs {
  roles: string[];
  departments: string[];
  companies: string[];
}

export default function UserForm({ onSubmit, isAdmin = false }: { onSubmit: (data: any) => void; isAdmin?: boolean }) {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
    role: 'user',
    department: '',
    company: 'FADO Group',
    position: '',
    phone: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [configs, setConfigs] = useState<SystemConfigs>({ roles: [], departments: [], companies: [] });
  const [newRole, setNewRole] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [showAddRole, setShowAddRole] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/admin/system-config');
      const data = await response.json();
      setConfigs(data);
      if (data.departments && data.departments.length > 0) {
        setFormData((prev) => ({ ...prev, department: data.departments[0] }));
      }
      if (data.companies && data.companies.length > 0) {
        setFormData((prev) => ({ ...prev, company: data.companies[0] }));
      }
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    }
  };

  const handleAddConfig = async (type: 'role' | 'department' | 'company', value: string, setShow: (v: boolean) => void) => {
    if (!value.trim()) return;

    try {
      setLoading(true);
      const adminId = localStorage.getItem('userId');
      const response = await fetch('/api/admin/system-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          type,
          name: value.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to add');
        return;
      }

      await fetchConfigs();
      setShow(false);
      if (type === 'role') setNewRole('');
      if (type === 'department') setNewDept('');
      if (type === 'company') setNewCompany('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.email || !formData.name || !formData.password) {
      setError('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Mật khẩu không khớp');
      return;
    }

    if (formData.password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự');
      return;
    }

    onSubmit({
      email: formData.email,
      name: formData.name,
      password: formData.password,
      role: formData.role,
      department: formData.department,
      company: formData.company,
      position: formData.position,
      phone: formData.phone,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="user@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tên *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Nhập tên"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu *</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Tối thiểu 8 ký tự"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2.5 text-gray-500"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu *</label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Nhập lại mật khẩu"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-2.5 text-gray-500"
          >
            {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-gray-700">Vai trò</label>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddRole(true)}
              className="text-blue-600 hover:text-blue-700 text-xs flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Thêm
            </button>
          )}
        </div>
        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {configs.roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        {showAddRole && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Tên vai trò mới"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={() => handleAddConfig('role', newRole, setShowAddRole)}
              disabled={loading}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-400"
            >
              Thêm
            </button>
            <button
              type="button"
              onClick={() => setShowAddRole(false)}
              className="px-2 py-2 text-gray-600 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-gray-700">Phòng ban</label>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddDept(true)}
              className="text-blue-600 hover:text-blue-700 text-xs flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Thêm
            </button>
          )}
        </div>
        <select
          value={formData.department}
          onChange={(e) => setFormData({ ...formData, department: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {configs.departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>
        {showAddDept && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              placeholder="Tên phòng ban mới"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={() => handleAddConfig('department', newDept, setShowAddDept)}
              disabled={loading}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-400"
            >
              Thêm
            </button>
            <button
              type="button"
              onClick={() => setShowAddDept(false)}
              className="px-2 py-2 text-gray-600 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-gray-700">Công ty/Đơn vị</label>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddCompany(true)}
              className="text-blue-600 hover:text-blue-700 text-xs flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Thêm
            </button>
          )}
        </div>
        <select
          value={formData.company}
          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {configs.companies.map((company) => (
            <option key={company} value={company}>
              {company}
            </option>
          ))}
        </select>
        {showAddCompany && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder="Tên công ty mới"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={() => handleAddConfig('company', newCompany, setShowAddCompany)}
              disabled={loading}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-400"
            >
              Thêm
            </button>
            <button
              type="button"
              onClick={() => setShowAddCompany(false)}
              className="px-2 py-2 text-gray-600 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Chức vụ</label>
        <input
          type="text"
          value={formData.position}
          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Nhập chức vụ"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Điện thoại</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Nhập số điện thoại"
        />
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg"
      >
        Tạo tài khoản
      </button>
    </form>
  );
}
