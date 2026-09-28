'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useClickOutside } from '@/hooks/useClickOutside';
import { resolveRouteModule } from '@/lib/notifications/routeModuleMap';
import { hasModuleAccess } from '@/lib/permissions';
import type { UserModulePermissions } from '@/lib/modules';
import NotificationPopup from '@/components/NotificationPopup';
import PushToggle from '@/components/PushToggle';

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  domain_id?: string;
  icon: string;
  read: boolean;
  created_at: string;
  related_id?: string;
  related_url?: string;
  relatedUrl?: string;
}

interface NotificationBellProps {
  userId?: string;
  /** Vai trò + quyền để gate điều hướng (không truyền = cho click tất cả). */
  role?: string;
  permissions?: UserModulePermissions;
}

/**
 * Loại thông báo "thuần" (chỉ để đọc, không cần xử lý) → luôn bật popup nổi,
 * kể cả khi có related_url. Kết hợp với quy tắc "không có link ⇒ popup".
 */
const POPUP_TYPES = new Set<string>([
  'announcement',
  'document',
  'onboarding_welcome',
  'birthday_digest',
  'birthday_vip',
]);

const SEEN_KEY = 'notif_seen_ids_v1';

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<string>) {
  try {
    // Giữ tối đa 300 id gần nhất để localStorage không phình.
    const arr = Array.from(ids).slice(-300);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* bỏ qua */
  }
}

export default function NotificationBell({ userId, role, permissions }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [popupQueue, setPopupQueue] = useState<Notification[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false); // lần fetch đầu chỉ "mồi" seen, không popup dồn cũ
  useClickOutside(rootRef, () => setIsOpen(false), isOpen);

  // Mở từ tab "Thông báo" của thanh điều hướng dưới (mobile).
  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener('open-notifications', open);
    return () => window.removeEventListener('open-notifications', open);
  }, []);

  useEffect(() => {
    seenRef.current = loadSeen();
  }, []);

  // Fetch notifications on mount + định kỳ 30s (tạm dừng khi tab ẩn).
  useEffect(() => {
    if (!userId) return;

    const tick = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };

    fetchNotifications();
    const interval = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [userId]);

  const isInformational = (n: Notification) =>
    !urlOf(n) || POPUP_TYPES.has(n.type);

  const urlOf = (n: Notification) => n.relatedUrl || n.related_url || '';

  const detectPopups = (data: Notification[]) => {
    const seen = seenRef.current;
    // Ứng viên popup: chưa đọc, chưa từng thấy, thuộc loại "thuần thông báo".
    const fresh = data.filter((n) => !n.read && !seen.has(n.id) && isInformational(n));

    // Đánh dấu MỌI tin hiện tại là đã thấy (để không popup lại lần sau).
    for (const n of data) seen.add(n.id);
    saveSeen(seen);

    if (!primedRef.current) {
      // Lần đầu load: không bắn dồn thông báo cũ.
      primedRef.current = true;
      return;
    }
    if (fresh.length > 0) {
      setPopupQueue((prev) => [...fresh.slice(0, 3), ...prev].slice(0, 3));
    }
  };

  const fetchNotifications = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/notifications?userId=${userId}`);
      if (response.ok) {
        const data: Notification[] = await response.json();
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.read).length);
        detectPopups(data);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, { method: 'PUT' });
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, { method: 'DELETE' });
      if (response.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!userId) return;
    try {
      const response = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  /** Có được phép điều hướng tới URL này không (gate quyền, fail-open). */
  const canNavigate = (url: string): boolean => {
    if (!url) return false;
    if (role === 'super_admin' || !permissions) return true;
    const moduleId = resolveRouteModule(url);
    if (!moduleId) return true; // không map ⇒ cho phép (trang đích tự chặn nếu cần)
    return hasModuleAccess(permissions, moduleId);
  };

  /** Click vào thông báo → đánh dấu đã đọc + điều hướng (nếu được phép). */
  const handleOpen = (n: Notification) => {
    const url = urlOf(n);
    if (!n.read) handleMarkAsRead(n.id);
    if (url && canNavigate(url)) {
      setIsOpen(false);
      router.push(url);
    }
  };

  const getNotificationColor = (type: string) => {
    if (type.includes('expiring')) {
      if (type.includes('_1')) return 'border-red-500 bg-red-900/20';
      if (type.includes('_10')) return 'border-orange-500 bg-orange-900/20';
      return 'border-yellow-500 bg-yellow-900/20';
    }
    if (type === 'domain_expired') return 'border-red-500 bg-red-900/20';
    return 'border-blue-500 bg-blue-900/20';
  };

  const dismissPopup = (id: string) => setPopupQueue((prev) => prev.filter((n) => n.id !== id));

  return (
    <div className="relative" ref={rootRef}>
      {/* Popup nổi cho thông báo "thuần" */}
      <NotificationPopup
        items={popupQueue.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          icon: n.icon,
          url: canNavigate(urlOf(n)) ? urlOf(n) : '',
        }))}
        onDismiss={dismissPopup}
        onOpen={(id) => {
          const n = popupQueue.find((x) => x.id === id);
          dismissPopup(id);
          if (n) handleOpen(n);
        }}
      />

      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-300 hover:text-white transition"
        title="Thông báo"
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-96 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center">
            <h3 className="text-white font-semibold">Thông báo ({notifications.length})</h3>
            <div className="flex items-center gap-3">
              {userId && <PushToggle userId={userId} />}
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Đánh dấu tất cả
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              Không có thông báo nào
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {notifications.map((notification) => {
                const url = urlOf(notification);
                const clickable = !!url && canNavigate(url);
                return (
                  <div
                    key={notification.id}
                    onClick={clickable ? () => handleOpen(notification) : undefined}
                    className={`p-4 transition border-l-4 ${getNotificationColor(
                      notification.type
                    )} ${clickable ? 'cursor-pointer hover:bg-slate-700/50' : 'hover:bg-slate-700/30'}`}
                  >
                    {/* Notification Title */}
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-white font-semibold text-sm">
                        {notification.title}
                      </h4>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {!notification.read && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="text-gray-400 hover:text-blue-400 transition"
                            title="Đánh dấu đã đọc"
                          >
                            <Check size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(notification.id)}
                          className="text-gray-400 hover:text-red-400 transition"
                          title="Xóa"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Notification Message */}
                    <p className="text-gray-300 text-sm mb-2">
                      {notification.message}
                    </p>

                    {/* Notification Time */}
                    <p className="text-gray-500 text-xs">
                      {new Date(notification.created_at).toLocaleString('vi-VN')}
                    </p>

                    {/* Unread Indicator */}
                    {!notification.read && (
                      <div className="mt-2 h-1 bg-blue-500 rounded-full" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer: mở Trung Tâm Thông Báo */}
          <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 p-2 text-center">
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/thong-bao');
              }}
              className="w-full rounded-md py-1.5 text-xs font-medium text-blue-400 hover:bg-slate-700/50 hover:text-blue-300 transition"
            >
              Xem tất cả thông báo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
