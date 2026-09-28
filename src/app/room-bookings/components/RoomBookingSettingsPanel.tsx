'use client';

import { useEffect, useState } from 'react';
import { Bell, Loader2, DoorOpen, Save, AlertCircle, BellRing } from 'lucide-react';
import { ParticipantsSelector } from './ParticipantsSelector';
import { RoomManagementInterface } from './RoomManagementInterface';
import { fetchUsers } from '@/lib/api-client';

interface User {
  id: string;
  name: string;
  email: string;
  telegram_chat_id?: string | null;
  role?: string;
}

/**
 * Bảng Cấu Hình Phòng Họp (chỉ Super Admin).
 *  - Tab 1: Người nhận thông báo khi có booking mới (multi-select user picker)
 *  - Tab 2: Quản Lý Phòng (gộp từ component cũ "Hiển Thị Quản Lý Phòng")
 */
export function RoomBookingSettingsPanel() {
  const [tab, setTab] = useState<'notify' | 'rooms'>('notify');

  // ===== Notify recipients state =====
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
          fetch('/api/room-bookings/settings').then(r => r.json()).catch(() => null),
        ]);
        const userList: User[] = Array.isArray(users) ? users : [];
        setAllUsers(userList);
        const ids: string[] = settingsRes?.data?.notifyRecipients || [];
        setInitialIds(ids);
        setRecipients(userList.filter(u => ids.includes(u.id)));
      } catch (e) {
        console.error('Load settings error:', e);
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
      const res = await fetch('/api/room-bookings/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyRecipients: recipients.map(r => r.id) }),
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
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      {/* Header tabs */}
      <div className="flex border-b border-line-subtle">
        <button
          onClick={() => setTab('notify')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-600 border-b-2 transition-colors ${
            tab === 'notify'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BellRing className="h-4 w-4" />
          Người Nhận Thông Báo
        </button>
        <button
          onClick={() => setTab('rooms')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-600 border-b-2 transition-colors ${
            tab === 'rooms'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <DoorOpen className="h-4 w-4" />
          Quản Lý Phòng
        </button>
      </div>

      <div className="p-5">
        {tab === 'notify' ? (
          loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/05">
                <Bell className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground leading-relaxed">
                  Khi có người đặt phòng mới chờ duyệt, các tài khoản dưới đây sẽ nhận thông báo (in-app + Telegram nếu đã liên kết) kèm nút <strong className="text-foreground">Duyệt / Từ chối</strong>. Để trống = dùng tài khoản tối cao mặc định.
                </div>
              </div>

              <ParticipantsSelector
                selectedParticipants={recipients}
                onParticipantsChange={setRecipients as any}
                allUsers={allUsers.map(u => ({ id: u.id, name: u.name, email: u.email }))}
                label="Người Nhận Thông Báo"
                emptyText="Chưa chọn người nhận thông báo"
                searchPlaceholder="Tìm theo tên hoặc email..."
              />

              {/* Save area */}
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
          )
        ) : (
          <RoomManagementInterface />
        )}
      </div>
    </div>
  );
}
