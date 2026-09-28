'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, AlertCircle, BellRing } from 'lucide-react';
import { ParticipantsSelector } from '@/app/room-bookings/components/ParticipantsSelector';
import { fetchUsers } from '@/lib/api-client';

interface User { id: string; name: string; email: string }

/**
 * Tab Cài Đặt → Người Nhận Thông Báo Quản Lý Hồ Sơ.
 *
 * Cấu hình danh sách user nhận in-app + Telegram cho:
 *   • Bản nháp thoả thuận onboarding tự sinh
 *   • (Có thể mở rộng cho các sự kiện HR khác sau này)
 *
 * Để trống = KHÔNG có ai nhận (trừ watcher từng hợp đồng). User trong danh sách
 * nhưng đã tắt "Bật Thông Báo" ở Phân Quyền → tự động không nhận.
 */
export default function HrNotifyRecipientsPanel() {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [recipients, setRecipients] = useState<User[]>([]);
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [users, settingsRes] = await Promise.all([
          fetchUsers(),
          fetch('/api/hr/settings/notify-recipients').then(r => r.json()).catch(() => null),
        ]);
        const userList: User[] = Array.isArray(users) ? users : [];
        setAllUsers(userList);
        const ids: string[] = settingsRes?.data?.userIds || [];
        setInitialIds(ids);
        setRecipients(userList.filter(u => ids.includes(u.id)));
      } catch (e) {
        console.error('Load HR recipients error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dirty =
    recipients.length !== initialIds.length ||
    recipients.some(r => !initialIds.includes(r.id));

  const handleSave = async () => {
    setSaving(true);
    setSaveErr('');
    try {
      const res = await fetch('/api/hr/settings/notify-recipients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: recipients.map(r => r.id) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Lưu thất bại');
      setInitialIds(recipients.map(r => r.id));
      setSavedAt(Date.now());
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line-subtle p-4 sm:p-5" style={{ background: 'var(--card)' }}>
      <div className="flex items-center gap-2 mb-3">
        <BellRing className="h-4 w-4 text-indigo-400" />
        <h3 className="text-base font-600 text-foreground">Người Nhận Thông Báo Quản Lý Hồ Sơ</h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/05">
            <BellRing className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              Người được chọn ở đây sẽ nhận thông báo (in-app + Telegram) cho các sự kiện
              Quản Lý Hồ Sơ — bao gồm bản nháp thoả thuận tự sinh cho nhân sự mới.
              <br />Người đính kèm theo dõi (watcher) riêng từng hợp đồng vẫn nhận thông báo
              cho hợp đồng của họ. <strong>Để trống = không ai nhận thông báo chung</strong>
              {' '}(chỉ watcher riêng từng hợp đồng).
            </div>
          </div>

          <ParticipantsSelector
            selectedParticipants={recipients}
            onParticipantsChange={setRecipients as any}
            allUsers={allUsers.map(u => ({ id: u.id, name: u.name, email: u.email }))}
            label="Người Nhận Thông Báo"
            emptyText="Chưa chọn người nhận"
            searchPlaceholder="Tìm theo tên hoặc email..."
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="text-xs">
              {saveErr ? (
                <span className="text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> {saveErr}
                </span>
              ) : savedAt && !dirty ? (
                <span className="text-emerald-400">✓ Đã lưu</span>
              ) : dirty ? (
                <span className="text-amber-400">Có thay đổi chưa lưu</span>
              ) : (
                <span className="text-muted-foreground">Không có thay đổi</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Lưu cấu hình
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
