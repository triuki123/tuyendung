'use client';

/** Helper fetch JSON cho UI quản lý SOLACE — luôn kèm credentials, ném lỗi với message từ server. */
async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Lỗi ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => jsonFetch<T>(url),
  post: <T>(url: string, body: unknown) =>
    jsonFetch<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown) =>
    jsonFetch<T>(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) =>
    jsonFetch<T>(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  del: <T>(url: string) => jsonFetch<T>(url, { method: 'DELETE' }),
  upload: <T>(url: string, form: FormData) => jsonFetch<T>(url, { method: 'POST', body: form }),
};
