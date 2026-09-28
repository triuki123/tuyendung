'use client';

import { useState } from 'react';
import { Lock, Unlock, Loader2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { inputCls, Field, Modal } from './shared';

/**
 * Quản lý khóa BMHS cho 1 bản ghi Pháp Chế — hiện với:
 * (a) người có quyền 'Đặt khóa' (legal.lock) — nhóm pháp chế tự quản khóa của mình;
 * (b) quản trị BMHS (super_admin + bmhs.manage) — chìa khóa tổng dự phòng.
 * Server enforce lại ở API (canManageLegalLock) — đây chỉ là ẩn/hiện nút.
 */
export function canManageBmhsClient(): boolean {
  const u = getCurrentUser() as any;
  if (!u) return false;
  const legalPerms = u.module_permissions?.legal;
  if (Array.isArray(legalPerms) && legalPerms.includes('lock')) return true;
  if (u.role !== 'super_admin') return false;
  const p = u.module_permissions?.bmhs;
  return Array.isArray(p) && p.includes('manage');
}

export default function LockManageModal({ entityType, entityId, title, locked, onClose, onDone }: {
  entityType: 'document' | 'contract';
  entityId: string;
  title: string;
  locked: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const setLock = async () => {
    if (password.length < 6) { setErr('Mật khẩu tối thiểu 6 ký tự'); return; }
    if (password !== confirm) { setErr('Xác nhận mật khẩu không khớp'); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/legal/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, password, confirm }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi đặt khóa'); return; }
      onDone();
    } finally { setBusy(false); }
  };

  const removeLock = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/legal/lock?entityType=${entityType}&entityId=${entityId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi gỡ khóa'); return; }
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Khóa BMHS — ${title}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {locked
            ? 'Bản ghi ĐANG KHÓA: xem/tải file và sửa/xóa đều phải nhập mật khẩu. Đặt mật khẩu mới sẽ thay mật khẩu cũ.'
            : 'Sau khi khóa: xem/tải file và sửa/xóa bản ghi này phải nhập mật khẩu. Tiêu đề vẫn hiện trong danh sách để không trôi hạn.'}
        </p>

        <Field label={locked ? 'Mật khẩu mới' : 'Mật khẩu khóa *'}>
          <input type="password" value={password} autoFocus
            onChange={(e) => { setPassword(e.target.value); setErr(''); }}
            placeholder="Tối thiểu 6 ký tự" className={inputCls} />
        </Field>
        <Field label="Nhập lại mật khẩu *">
          <input type="password" value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void setLock(); }}
            className={inputCls} />
        </Field>

        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/5 px-6 py-4 -mx-6 -mb-6 mt-6">
        {locked ? (
          <button onClick={() => void removeLock()} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 text-red-400 hover:bg-red-500/10 disabled:opacity-50">
            <Unlock className="h-4 w-4" /> Gỡ khóa
          </button>
        ) : <span />}
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Hủy</button>
          <button onClick={() => void setLock()} disabled={busy || !password}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {locked ? 'Đổi mật khẩu' : 'Đặt khóa'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
