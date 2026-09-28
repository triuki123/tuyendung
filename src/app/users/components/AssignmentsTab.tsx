'use client';

/**
 * Tab "Phân Công" trong modal người dùng — mô hình "một người – nhiều phân công"
 * (bảng org_assignments): kiêm nhiệm nhiều vị trí ở nhiều đơn vị/công ty,
 * đúng 1 phân công CHÍNH (is_primary) mỗi công ty, org_role = head|deputy|assistant|member.
 * CRUD qua /api/users/{userId}/assignments — mọi mutation trả về danh sách mới.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Loader2, Network, Star } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import AssignmentForm, {
  type AssignmentRow,
  type AssignmentFormValue,
  type Company,
  type Department,
  type SubDepartment,
  ORG_ROLE_CONFIG,
} from './AssignmentForm';

interface AssignmentsTabProps {
  userId: string;
  readOnly?: boolean;
}

/** Headers xác thực từ localStorage — giống pattern các fetch khác trong UsersModalTabside */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window === 'undefined') return headers;
  const stored = localStorage.getItem('assetflow_auth') || localStorage.getItem('currentUser');
  if (!stored) return headers;
  try {
    const u = JSON.parse(stored);
    if (u.id) headers['x-current-user-id'] = u.id;
    if (u.session_id) headers['x-session-id'] = u.session_id;
    const activeCompany = localStorage.getItem('active_company_id') || u.company_id;
    if (activeCompany) headers['x-current-user-company'] = activeCompany;
  } catch { /* ignore */ }
  return headers;
}

export default function AssignmentsTab({ userId, readOnly = false }: AssignmentsTabProps) {
  const toast = useToast();
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // form: null = đóng; 'new' = thêm mới; AssignmentRow = đang sửa
  const [editing, setEditing] = useState<'new' | AssignmentRow | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null); // card đang chờ xác nhận kết thúc

  // Dropdown data dùng chung
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subDepartments, setSubDepartments] = useState<SubDepartment[]>([]);

  const loadAssignments = useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${userId}/assignments`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setAssignments(data.data || []);
      else toast.error(data.error || 'Không tải được danh sách phân công');
    } catch {
      toast.error('Không tải được danh sách phân công');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    loadAssignments();
    // Dropdown tổ chức — cùng URL modal đang dùng cho tab Thông Tin
    fetch('/api/organizations/companies')
      .then(r => (r.ok ? r.json() : []))
      .then((d: any[]) => setCompanies((d || []).map(c => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    fetch('/api/organizations/departments')
      .then(r => (r.ok ? r.json() : []))
      .then((d: any[]) => setDepartments(d || []))
      .catch(() => {});
    fetch('/api/organizations/sub-departments')
      .then(r => (r.ok ? r.json() : []))
      .then((d: any[]) => setSubDepartments(d || []))
      .catch(() => {});
  }, [loadAssignments]);

  /** Gọi mutation rồi refresh danh sách từ data server trả về (server tự hạ primary cũ) */
  async function mutate(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: object): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data.error || 'Thao tác thất bại');
        return false;
      }
      setAssignments(data.data || []);
      return true;
    } catch {
      toast.error('Có lỗi xảy ra, vui lòng thử lại');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(value: AssignmentFormValue) {
    const body = {
      company_id: value.company_id,
      department_id: value.department_id || null,
      sub_department_id: value.sub_department_id || null,
      position_id: value.position_id || null,
      org_role: value.org_role,
      manager_id: value.manager_id || null,
      is_primary: value.is_primary,
      note: value.note || null,
    };
    const ok = editing === 'new' || editing === null
      ? await mutate(`/api/users/${userId}/assignments`, 'POST', body)
      : await mutate(`/api/users/${userId}/assignments/${editing.id}`, 'PUT', body);
    if (ok) {
      setEditing(null);
      toast.success(editing === 'new' ? 'Đã thêm phân công' : 'Đã cập nhật phân công');
    }
  }

  async function handleSetPrimary(a: AssignmentRow) {
    const ok = await mutate(`/api/users/${userId}/assignments/${a.id}`, 'PUT', { is_primary: true });
    if (ok) toast.success('Đã đặt làm phân công chính');
  }

  async function handleEnd(a: AssignmentRow) {
    const ok = await mutate(`/api/users/${userId}/assignments/${a.id}`, 'DELETE');
    setEndingId(null);
    if (ok) toast.success('Đã kết thúc phân công');
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map(i => (
          <div key={i} className="rounded-2xl border border-white/5 p-4 animate-pulse" style={{ background: 'var(--card)' }}>
            <div className="h-4 w-1/3 rounded bg-white/10 mb-3" />
            <div className="h-3 w-2/3 rounded bg-white/5 mb-2" />
            <div className="h-3 w-1/2 rounded bg-white/5" />
          </div>
        ))}
      </div>
    );
  }

  return (
    // stopPropagation: thay đổi trong tab này lưu ngay qua API riêng —
    // không để modal cha (onChange ở wrapper) đánh dấu form user là "chưa lưu".
    <div className="space-y-4" onChange={e => e.stopPropagation()}>
      {/* Header nhỏ của tab */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-600 text-foreground flex items-center gap-1.5">
            <Network className="h-4 w-4 text-indigo-400" /> Phân Công Tổ Chức
          </h3>
          <p className="text-2xs text-muted-foreground mt-0.5">
            Một người có thể kiêm nhiệm nhiều vị trí — đúng 1 phân công chính mỗi công ty.
          </p>
        </div>
        {!readOnly && editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="shrink-0 h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-600 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Thêm phân công
          </button>
        )}
      </div>

      {/* Form thêm mới (khối mở rộng inline, không modal chồng modal) */}
      {editing === 'new' && (
        <AssignmentForm
          companies={companies}
          departments={departments}
          subDepartments={subDepartments}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Danh sách card */}
      {assignments.length === 0 && editing !== 'new' ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground rounded-2xl border border-white/5" style={{ background: 'var(--card)' }}>
          <Network className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có phân công</p>
          <p className="text-xs mt-1 opacity-60">
            {readOnly ? 'Người dùng này chưa được phân công vào đơn vị nào' : 'Thêm phân công đầu tiên bằng nút phía trên'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map(a =>
            editing !== null && editing !== 'new' && editing.id === a.id ? (
              <AssignmentForm
                key={a.id}
                initial={a}
                companies={companies}
                departments={departments}
                subDepartments={subDepartments}
                saving={saving}
                onSubmit={handleSubmit}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={a.id} className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Dòng 1: Công ty • Đơn vị */}
                    <p className="text-sm font-600 text-foreground truncate">
                      {a.company_name || '—'}
                      {a.department_name ? (
                        <span className="text-muted-foreground font-400">
                          {' '}• {a.department_name}
                          {a.department_active === false && (
                            <span className="ml-1 text-2xs font-600 text-red-400">(đã xóa)</span>
                          )}
                          {a.sub_department_name ? ` / ${a.sub_department_name}` : ''}
                          {a.sub_department_name && a.sub_department_active === false && (
                            <span className="ml-1 text-2xs font-600 text-red-400">(đã xóa — sửa phân công để gỡ)</span>
                          )}
                        </span>
                      ) : (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-600 border bg-violet-500/15 text-violet-300 border-violet-500/30 align-middle">
                          Cấp công ty
                        </span>
                      )}
                    </p>
                    {/* Dòng 2: chức danh + quản lý */}
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {a.position_name || 'Chưa có chức danh'}
                      {a.manager_name && <span> · Quản lý: {a.manager_name}</span>}
                    </p>
                    {a.note && <p className="text-2xs text-muted-foreground/70 mt-1 truncate">📝 {a.note}</p>}
                    {/* Dòng 3: badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-600 border ${ORG_ROLE_CONFIG[a.org_role]?.badge || ORG_ROLE_CONFIG.member.badge}`}>
                        {ORG_ROLE_CONFIG[a.org_role]?.label || a.org_role}
                      </span>
                      {a.is_primary ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-600 border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                          <Star className="h-3 w-3" /> Chính
                        </span>
                      ) : (
                        !readOnly && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleSetPrimary(a)}
                            className="px-2 py-0.5 rounded-md text-2xs font-600 border border-white/10 text-muted-foreground hover:text-emerald-300 hover:border-emerald-500/40 disabled:opacity-50"
                          >
                            Đặt làm chính
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => { setEditing(a); setEndingId(null); }}
                      className="shrink-0 w-8 h-8 rounded-lg btn-ghost flex items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label="Sửa phân công"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Kết thúc phân công — confirm inline, không dùng window.confirm */}
                {!readOnly && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    {endingId === a.id ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <p className="text-xs text-red-300 flex-1">Kết thúc phân công này? Phân công sẽ không còn hiệu lực.</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setEndingId(null)}
                            className="h-8 px-3 rounded-lg btn-ghost text-xs font-500">Hủy</button>
                          <button type="button" disabled={saving} onClick={() => handleEnd(a)}
                            className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-600 disabled:opacity-50 flex items-center gap-1.5">
                            {saving && <Loader2 className="h-3 w-3 animate-spin" />} Kết thúc
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setEndingId(a.id)}
                        className="text-2xs font-500 text-muted-foreground hover:text-red-300 transition-colors">
                        Kết thúc phân công
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
