'use client';

import React from 'react';
import {
  AlertCircle, AlertTriangle, BarChart, Bell, BookOpen, Cake, Calendar, CalendarX,
  CheckCircle, CheckSquare, ClipboardCheck, ClipboardList, Clock, Coffee, DoorOpen,
  FileText, Folder, Gift, LogOut, Megaphone, MessageCircle, MessageSquare, Package,
  PartyPopper, RefreshCw, ShoppingBag, Ticket, Timer, Trash2, Truck, UserCheck,
  UserMinus, UserPlus, UserX, Users, Wallet, XCircle,
  type LucideIcon,
} from 'lucide-react';

/**
 * Map tên icon (kebab-case) lưu trong notification templates → component Lucide.
 * Dùng cho Trung Tâm Thông Báo để render icon THẬT thay vì in chuỗi tên ra màn hình.
 * Tên không có trong map → fallback Bell.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'bar-chart': BarChart,
  'bell': Bell,
  'book-open': BookOpen,
  'cake': Cake,
  'calendar': Calendar,
  'calendar-x': CalendarX,
  'check-circle': CheckCircle,
  'clipboard-check': ClipboardCheck,
  'clipboard-list': ClipboardList,
  'clock': Clock,
  'coffee': Coffee,
  'comment': MessageSquare,
  'door-open': DoorOpen,
  'file-text': FileText,
  'folder': Folder,
  'gift': Gift,
  'log-out': LogOut,
  'megaphone': Megaphone,
  'message-circle': MessageCircle,
  'package': Package,
  'party-popper': PartyPopper,
  'refresh-cw': RefreshCw,
  'shopping-bag': ShoppingBag,
  'task': CheckSquare,
  'ticket': Ticket,
  'timer': Timer,
  'trash': Trash2,
  'truck': Truck,
  'update': RefreshCw,
  'user-check': UserCheck,
  'user-minus': UserMinus,
  'user-plus': UserPlus,
  'user-x': UserX,
  'users': Users,
  'wallet': Wallet,
  'x-circle': XCircle,
};

interface NotifIconProps {
  name?: string | null;
  className?: string;
}

/** Render icon Lucide theo tên kebab-case; fallback Bell nếu không nhận diện được. */
export default function NotifIcon({ name, className = 'h-5 w-5' }: NotifIconProps) {
  const Icon = (name && ICON_MAP[name]) || Bell;
  return <Icon className={className} />;
}
