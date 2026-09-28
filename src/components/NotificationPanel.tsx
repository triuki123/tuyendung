'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, CheckCheck, Trash2, Package, Ticket, AlertCircle, Zap, CheckCircle, XCircle } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}p trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}g trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification, clearNotifications } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const handleNotificationClick = async (notification: any) => {
    // Mark as read (client-side)
    markAsRead(notification.id);

    // Sync to server
    try {
      await fetch(`/api/notifications/${notification.id}`, {
        method: 'PUT',
      });
    } catch (error) {
      console.error('Failed to mark notification as read on server:', error);
    }

    // Navigate based on relatedUrl first, then type
    if (notification.relatedUrl) {
      router.push(notification.relatedUrl);
      onClose();
    } else if (notification.type === 'ticket' && notification.relatedId) {
      // Fallback: navigate to ticket by ID
      const url = `/tickets/admin?ticketId=${notification.relatedId}`;
      router.push(url);
      onClose();
    } else if (notification.type === 'asset' && notification.relatedId) {
      const url = `/asset-management?assetId=${notification.relatedId}`;
      router.push(url);
      onClose();
    } else if (notification.type === 'task' && notification.relatedId) {
      const url = `/tasks?taskId=${notification.relatedId}`;
      router.push(url);
      onClose();
    } else {
      console.warn('⚠️ No navigation route found for notification:', {
        relatedUrl: notification.relatedUrl,
        relatedId: notification.relatedId,
        type: notification.type,
      });
    }
  };

  const handleRemoveNotification = async (notificationId: string) => {
    // Remove from client-side state
    removeNotification(notificationId);

    // Delete on server
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Failed to delete notification on server:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    // Update client-side state
    markAllAsRead();

    // Sync to server
    try {
      const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
      if (userId) {
        await fetch('/api/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      }
    } catch (error) {
      console.error('Failed to mark all as read on server:', error);
    }
  };

  const handleClearNotifications = async () => {
    // Clear client-side state
    clearNotifications();
    onClose();

    // Delete all notifications on server
    try {
      for (const notif of notifications) {
        await fetch(`/api/notifications/${notif.id}`, {
          method: 'DELETE',
        });
      }
    } catch (error) {
      console.error('Failed to clear notifications on server:', error);
    }
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const getNotificationIcon = (type: string, notification?: any) => {
    // Special handling for room booking approval/rejection
    if (notification?.title?.includes('✅') || notification?.title?.includes('đã được duyệt')) {
      return <CheckCircle size={16} className="text-emerald-400" />;
    }
    if (notification?.title?.includes('❌') || notification?.title?.includes('bị từ chối')) {
      return <XCircle size={16} className="text-red-400" />;
    }

    switch (type) {
      case 'task':
        return <AlertCircle size={16} className="text-amber-400" />;
      case 'ticket':
        return <Ticket size={16} className="text-indigo-400" />;
      case 'asset':
        return <Package size={16} className="text-emerald-400" />;
      case 'system':
        return <Zap size={16} className="text-blue-400" />;
      default:
        return <Bell size={16} className="text-muted-foreground" />;
    }
  };

  const getNotificationColor = (type: string, notification?: any) => {
    // Special handling for room booking approval/rejection
    if (notification?.title?.includes('✅') || notification?.title?.includes('đã được duyệt')) {
      return 'bg-emerald-500/10 border-emerald-500/20';
    }
    if (notification?.title?.includes('❌') || notification?.title?.includes('bị từ chối')) {
      return 'bg-red-500/10 border-red-500/20';
    }

    switch (type) {
      case 'task':
        return 'bg-amber-500/10 border-amber-500/20';
      case 'ticket':
        return 'bg-indigo-500/10 border-indigo-500/20';
      case 'asset':
        return 'bg-emerald-500/10 border-emerald-500/20';
      case 'system':
        return 'bg-blue-500/10 border-blue-500/20';
      default:
        return 'bg-slate-500/10 border-slate-500/20';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="absolute left-0 right-0 sm:left-auto sm:right-0 top-14 sm:top-16 mx-2 sm:mx-0 w-[calc(100%-1rem)] sm:w-96 max-h-[70vh] sm:max-h-[600px] rounded-2xl border border-white/08 z-50 flex flex-col modal-entrance overflow-hidden"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-4 border-b border-white/08 shrink-0">
          <div>
            <h3 className="text-sm font-700 text-foreground">Thông báo</h3>
            {unreadCount > 0 && (
              <p className="text-2xs text-muted-foreground mt-0.5">
                {unreadCount} thông báo chưa đọc
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg btn-ghost text-muted-foreground"
            title="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 px-3 sm:px-5 py-2 border-b border-white/08 shrink-0">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-500 transition-colors ${
              filter === 'all'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tất cả ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 rounded-lg text-xs font-500 transition-colors ${
              filter === 'unread'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Chưa đọc ({unreadCount})
          </button>
        </div>

        {/* Notifications list */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Bell size={28} className="text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground text-center">
                {filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Không có thông báo'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 sm:space-y-1 p-2 sm:p-3">
              {filteredNotifications.map(notification => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-3 rounded-xl border transition-colors cursor-pointer hover:border-white/15 ${getNotificationColor(notification.type, notification)} ${
                    notification.read ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notification.type, notification)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-sm font-600 text-foreground">{notification.title}</h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveNotification(notification.id);
                          }}
                          className="flex-shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Xóa"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1.5">{notification.message}</p>
                      {notification.assignedBy && (
                        <p className="text-2xs text-muted-foreground/70 mb-1.5">
                          Giao bởi: <span className="text-muted-foreground">{notification.assignedBy}</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-2xs text-muted-foreground/60">
                          {formatTimeAgo(notification.assignedAt)}
                        </p>
                        {!notification.read && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="text-2xs text-indigo-400 hover:text-indigo-300 font-500"
                          >
                            Đánh dấu đã đọc
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {notifications.length > 0 && (
          <div className="flex gap-2 px-3 sm:px-5 py-2.5 border-t border-white/08 shrink-0">
            <button
              onClick={handleMarkAllAsRead}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/05 transition-colors"
              disabled={unreadCount === 0}
            >
              <CheckCheck size={14} />
              Đánh dấu tất cả đã đọc
            </button>
            <button
              onClick={handleClearNotifications}
              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-600 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
              Xóa tất cả
            </button>
          </div>
        )}
      </div>
    </>
  );
}
