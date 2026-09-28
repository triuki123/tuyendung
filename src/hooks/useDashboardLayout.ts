'use client';

/**
 * useDashboardLayout — đọc/lưu cấu hình Dashboard tuỳ biến per-user.
 * Nguồn: users.dashboard_layout (JSONB, NULL = mặc định).
 * Đọc nhanh từ localStorage auth blob → refresh từ DB (đồng bộ đa thiết bị).
 * Lưu: PUT /api/users/{id} (pattern giống preferred_theme) + cập nhật blob.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardLayoutConfig, normalizeLayout } from '@/app/dashboard/widgets';

const AUTH_KEYS = ['assetflow_auth', 'currentUser'] as const;

function readAuthBlob(): { key: string; user: any } | null {
  if (typeof window === 'undefined') return null;
  for (const key of AUTH_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        return { key, user: JSON.parse(raw) };
      } catch {
        /* blob hỏng — bỏ qua */
      }
    }
  }
  return null;
}

/** Ghi dashboard_layout vào auth blob để lần tải sau đọc ngay không chờ API. */
function writeBlobLayout(layout: DashboardLayoutConfig | null) {
  const blob = readAuthBlob();
  if (!blob) return;
  try {
    localStorage.setItem(blob.key, JSON.stringify({ ...blob.user, dashboard_layout: layout }));
  } catch {
    /* quota — bỏ qua */
  }
}

function authHeaders(user: any): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.id) h['x-current-user-id'] = user.id;
  if (user?.role) h['x-current-user-role'] = user.role;
  if (user?.company_id) h['x-current-user-company'] = user.company_id;
  return h;
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayoutConfig | null>(null);
  const userRef = useRef<any>(null);

  useEffect(() => {
    const blob = readAuthBlob();
    if (!blob?.user?.id) return;
    userRef.current = blob.user;
    // 1) Áp ngay từ blob (không nháy layout)
    setLayout(normalizeLayout(blob.user.dashboard_layout));
    // 2) Refresh từ DB — user có thể đã chỉnh trên thiết bị khác
    fetch(`/api/users/${blob.user.id}`, { headers: authHeaders(blob.user) })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const fresh = normalizeLayout(data.dashboard_layout);
        setLayout(fresh);
        writeBlobLayout(fresh);
      })
      .catch(() => {
        /* offline — dùng bản blob */
      });
  }, []);

  /** Lưu config (null = khôi phục mặc định). Optimistic: áp ngay, DB lỗi vẫn giữ local. */
  const saveLayout = useCallback(async (cfg: DashboardLayoutConfig | null): Promise<boolean> => {
    setLayout(cfg);
    writeBlobLayout(cfg);
    const user = userRef.current;
    if (!user?.id) return false;
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: authHeaders(user),
        body: JSON.stringify({ dashboard_layout: cfg }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return { layout, saveLayout };
}
