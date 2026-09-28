'use client';

import { useState, useEffect } from 'react';
import { Edit2, X, Check } from 'lucide-react';

interface SystemConfig {
  id?: string;
  type: 'role' | 'department' | 'company';
  name: string;
  created_at?: string;
  created_by?: string;
}

interface ConfigGroup {
  roles: SystemConfig[];
  departments: SystemConfig[];
  companies: SystemConfig[];
}

function RenameModal({
  config,
  onClose,
  onSuccess,
}: {
  config: SystemConfig | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (config) {
      setNewName(config.name);
    }
  }, [config]);

  if (!config) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newName.trim()) {
      setError('Tên không được để trống');
      return;
    }

    if (newName === config.name) {
      onClose();
      return;
    }

    try {
      setLoading(true);
      const adminEmail = localStorage.getItem('userEmail');
      const response = await fetch('/api/admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail,
          type: config.type,
          oldName: config.name,
          newName: newName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Thất bại');
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-lg">
        <h2 className="text-lg font-bold mb-4">Đổi tên {config.type}</h2>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên mới</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nhập tên mới"
              autoFocus
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-lg"
            >
              {loading ? 'Đang xử lý...' : 'Cập Nhật'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 rounded-lg"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfigSection({
  title,
  type,
  configs,
  onRename,
  isAdmin,
}: {
  title: string;
  type: 'role' | 'department' | 'company';
  configs: SystemConfig[];
  onRename: (config: SystemConfig) => void;
  isAdmin: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">{title}</h2>

      <div className="grid grid-cols-2 gap-2">
        {configs.map((config) => (
          <div key={config.id || config.name} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
            <span className="text-gray-800 font-medium">{config.name}</span>
            {isAdmin && (
              <button
                onClick={() => onRename(config)}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg"
                title="Đổi tên"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SystemConfigPage() {
  const [configs, setConfigs] = useState<ConfigGroup>({ roles: [], departments: [], companies: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedConfig, setSelectedConfig] = useState<SystemConfig | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    setUserEmail(email || '');
    setIsAdmin(email === 'admin@fadogroup.com.au');
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/system-config');
      const data = await response.json();
      setConfigs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch configs');
    } finally {
      setLoading(false);
    }
  };

  const handleRename = (config: SystemConfig) => {
    if (!isAdmin) {
      setError('Chỉ Admin Master mới có quyền đổi tên');
      return;
    }
    setSelectedConfig(config);
    setShowRenameModal(true);
  };

  if (loading) {
    return <div className="p-8">Đang tải...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Quản Lý Cấu Hình Hệ Thống</h1>

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">{error}</div>}

      {!isAdmin && (
        <div className="bg-blue-50 text-blue-700 p-4 rounded-lg mb-6">
          Bạn đang xem danh sách cấu hình. Chỉ Admin Master mới có thể đổi tên.
        </div>
      )}

      <ConfigSection title="Vai Trò" type="role" configs={configs.roles} onRename={handleRename} isAdmin={isAdmin} />

      <ConfigSection
        title="Phòng Ban"
        type="department"
        configs={configs.departments}
        onRename={handleRename}
        isAdmin={isAdmin}
      />

      <ConfigSection
        title="Công Ty/Đơn Vị"
        type="company"
        configs={configs.companies}
        onRename={handleRename}
        isAdmin={isAdmin}
      />

      <RenameModal
        config={selectedConfig}
        onClose={() => {
          setShowRenameModal(false);
          setSelectedConfig(null);
        }}
        onSuccess={fetchConfigs}
      />
    </div>
  );
}
