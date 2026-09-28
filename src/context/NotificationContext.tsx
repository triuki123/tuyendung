'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

export interface Notification {
  id: string;
  type: 'task' | 'ticket' | 'asset' | 'system';
  title: string;
  message: string;
  assignedBy?: string;
  assignedAt: Date;
  read: boolean;
  icon?: React.ReactNode;
  relatedId?: string; // Ticket ID, Task ID, or Asset ID
  relatedUrl?: string; // URL to navigate to
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'assignedAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // LƯU Ý: Context này hiện KHÔNG còn tự poll /api/notifications.
  // Chuông thông báo in-app do <NotificationBell> (Topbar) đảm nhiệm và tự fetch.
  // Trước đây context poll 10s để nuôi <NotificationPanel>, nhưng panel đó không
  // được render ở đâu → poll thừa, gây tải DB vô ích. Đã gỡ để còn 1 nguồn duy nhất.
  // Các hàm add/markAsRead/... vẫn giữ để dùng cho thông báo phía client (in-memory).

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'read' | 'assignedAt'>) => {
    const id = Date.now().toString();
    const newNotification: Notification = {
      ...notification,
      id,
      read: false,
      assignedAt: new Date(),
    };
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

export const useNotification = useNotifications;
