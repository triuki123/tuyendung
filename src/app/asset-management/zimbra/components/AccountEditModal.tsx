'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface ZimbraAccount {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
}

interface Props {
  account: ZimbraAccount;
  getHeaders: () => Record<string, string>;
  onToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onSuccess: () => void;
  onClose: () => void;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return (data && typeof data.error === 'string' && data.error) || fallback;
  } catch {
    return fallback;
  }
}

export default function AccountEditModal({ account, getHeaders, onToast, onSuccess, onClose }: Props) {
  const [form, setForm] = useState({ email: account.name, displayName: account.displayName ?? '', description: account.description ?? '' });
  const [saving, setSaving] = useState(false);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  // Sync form when account prop changes
  useEffect(() => {
    setForm({ email: account.name, displayName: account.displayName ?? '', description: account.description ?? '' });
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    const emailChanged = form.email.trim() !== account.name;
    const displayNameChanged = form.displayName.trim() !== (account.displayName ?? '');
    const descriptionChanged = form.description.trim() !== (account.description ?? '');

    if (!emailChanged && !displayNameChanged && !descriptionChanged) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = { id: account.id };
      if (emailChanged) body.newEmail = form.email.trim();
      if (displayNameChanged) body.displayName = form.displayName.trim();
      if (descriptionChanged) body.description = form.description.trim();

      const res = await fetch('/api/zimbra/accounts', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const msg = await readError(
          res,
          res.status === 409 ? 'Email đã tồn tại' : 'Không thể cập nhật tài khoản'
        );
        onToast(msg, 'error');
        return;
      }

      onToast('Cập nhật thành công', 'success');
      markClean();
      onSuccess();
    } catch (err) {
      console.error('Zimbra edit account error:', err);
      onToast('Không thể cập nhật tài khoản', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) guardedClose(); }}>
      <div onClick={(e) => e.stopPropagation()} onChange={markDirty} className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Chỉnh sửa tài khoản</h3>
          <button onClick={guardedClose} className="text-ink-muted hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs text-ink-muted mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Tên hiển thị</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="(để trống nếu không đặt)"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="(để trống nếu không đặt)"
              rows={3}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-y"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={guardedClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm transition disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
