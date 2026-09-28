'use client';

import { useEffect, useState } from 'react';

/**
 * Kiểu giao diện điều hướng — người dùng tự chọn trong Cài Đặt (lưu localStorage,
 * theo từng thiết bị). Mặc định 'sidebar' = giao diện cũ, không đổi gì.
 */
export type UiMode = 'sidebar' | 'compact' | 'switcher' | 'launcher';

export const UI_MODES: { key: UiMode; label: string; desc: string }[] = [
  { key: 'sidebar', label: 'Sidebar cổ điển', desc: 'Thanh bên trái đầy đủ như hiện tại (mặc định).' },
  { key: 'compact', label: 'Sidebar thu gọn', desc: 'Thanh bên thu về biểu tượng, rộng chỗ hơn. Rê chuột để mở rộng.' },
  { key: 'switcher', label: 'Thanh khu vực + sidebar', desc: 'Chọn khu vực trên đỉnh, sidebar chỉ hiện mục của khu vực đó (kiểu Workday/SAP).' },
  { key: 'launcher', label: 'App Launcher (lưới ứng dụng)', desc: 'Ẩn sidebar, mở lưới thẻ tất cả module như Odoo/Microsoft 365.' },
];

const KEY = 'assetflow_ui_mode';
const EVENT = 'assetflow-ui-mode-change';
const VALID: UiMode[] = ['sidebar', 'compact', 'switcher', 'launcher'];

export function getUiMode(): UiMode {
  if (typeof window === 'undefined') return 'sidebar';
  const v = localStorage.getItem(KEY) as UiMode | null;
  return v && VALID.includes(v) ? v : 'sidebar';
}

export function setUiMode(mode: UiMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

/** Hook đọc kiểu giao diện, cập nhật ngay khi đổi (không cần F5) */
export function useUiMode(): UiMode {
  const [mode, setMode] = useState<UiMode>('sidebar');
  useEffect(() => {
    setMode(getUiMode());
    const handler = () => setMode(getUiMode());
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return mode;
}

/** Bỏ dấu tiếng Việt để tìm kiếm không dấu (dùng chung cho ⌘K + launcher) */
export function normalizeVi(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}
