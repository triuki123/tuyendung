'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, Archive, Trash2, X, Check, ChevronRight, ArrowLeft, Loader2, Save, AlertCircle } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { TicketConfig, DEFAULT_TICKET } from '@/lib/config/systemConfig';

interface RequestType {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  request_type: string | null;
  default_unit_tag_id: string | null;
  custom_fields: CustomField[];
  sort_order: number;
  is_active: boolean;
}

interface OrgTag {
  id: string;
  name: string;
}

const FIELD_TYPES: { value: CustomField['type']; label: string }[] = [
  { value: 'text', label: 'Văn bản ngắn' },
  { value: 'textarea', label: 'Văn bản dài' },
  { value: 'number', label: 'Số' },
  { value: 'date', label: 'Ngày' },
  { value: 'select', label: 'Chọn (danh sách)' },
];

const inputCls =
  'w-full h-10 min-h-[44px] sm:min-h-0 px-3 rounded-lg text-xs text-foreground bg-surface-2 border border-line transition-colors focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 placeholder:text-muted-foreground/50';
const primaryButtonCls =
  'inline-flex items-center justify-center gap-2 h-10 min-h-[44px] px-4 rounded-lg text-xs font-600 whitespace-nowrap btn-accent disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonCls =
  'inline-flex items-center justify-center gap-2 h-10 min-h-[44px] px-4 rounded-lg text-xs font-600 whitespace-nowrap btn-ghost text-muted-foreground hover:text-foreground';
const iconButtonCls =
  'inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

export default function TicketConfigClient() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const user = getCurrentUser();
    setIsSuperAdmin(user?.role === 'super_admin');
    setCurrentUserId(user?.id);
  }, []);

  const [tab, setTab] = useState<'types' | 'categories' | 'lifecycle'>('types');
  const [requestTypes, setRequestTypes] = useState<RequestType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orgTags, setOrgTags] = useState<OrgTag[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [rt, cat, tags] = await Promise.all([
        fetch('/api/ticket-request-types?all=1').then((r) => r.json()),
        fetch('/api/ticket-categories?all=1').then((r) => r.json()),
        fetch('/api/org-tags').then((r) => r.json()),
      ]);
      setRequestTypes(Array.isArray(rt) ? rt : []);
      setCategories(Array.isArray(cat) ? cat : []);
      setOrgTags(Array.isArray(tags) ? tags : []);
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          onClick={() => router.push('/tickets/admin')}
          className={`${iconButtonCls} shrink-0 text-muted-foreground hover:bg-hover hover:text-foreground`}
          title="Quay lại Quản Lý Ticket"
          aria-label="Quay lại Quản Lý Ticket"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 pt-0.5">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground">Cấu Hình Ticket</h1>
          <p className="mt-1 text-2xs sm:text-xs leading-relaxed text-muted-foreground">
            {isSuperAdmin
              ? 'Quản lý loại yêu cầu, danh mục và vòng đời ticket cho hệ thống tác vụ.'
              : 'Chỉ Super Admin mới có thể chỉnh sửa cấu hình.'}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1 leading-relaxed">{error}</span>
          <button
            onClick={() => setError('')}
            className={`${iconButtonCls} -my-1 -mr-1 h-8 w-8 text-red-300 hover:bg-red-500/10 hover:text-red-200`}
            aria-label="Đóng thông báo lỗi"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="-mx-1 overflow-x-auto border-b border-line px-1">
        <div className="flex min-w-max gap-1">
          {([
            ['types', 'Loại Yêu Cầu'],
            ['categories', 'Danh Mục'],
            ['lifecycle', 'Vòng Đời'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`h-11 min-h-[44px] border-b-2 px-3 sm:px-4 text-xs font-600 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/30 ${
                tab === key
                  ? 'border-indigo-500 bg-indigo-500/5 text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-hover/60 hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'types' ? (
        <RequestTypesSection
          items={requestTypes}
          isSuperAdmin={isSuperAdmin}
          currentUserId={currentUserId}
          loading={loading}
          onError={setError}
          onChanged={loadAll}
        />
      ) : tab === 'categories' ? (
        <CategoriesSection
          items={categories}
          requestTypes={requestTypes}
          orgTags={orgTags}
          isSuperAdmin={isSuperAdmin}
          currentUserId={currentUserId}
          loading={loading}
          onError={setError}
          onChanged={loadAll}
        />
      ) : (
        <LifecycleSection isSuperAdmin={isSuperAdmin} onError={setError} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vòng đời ticket — tự đóng / tự lưu trữ (lưu chung system_settings)
// ---------------------------------------------------------------------------
function LifecycleSection({ isSuperAdmin, onError }: { isSuperAdmin: boolean; onError: (m: string) => void }) {
  const [cfg, setCfg] = useState<TicketConfig>(DEFAULT_TICKET);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch('/api/system-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.success && j.data?.ticket) setCfg(j.data.ticket); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setOk(false); onError('');
    try {
      const res = await fetch('/api/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: cfg }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Lưu thất bại');
      if (j.data?.ticket) setCfg(j.data.ticket);
      setOk(true);
    } catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-center py-8 text-muted-foreground text-xs">Đang tải...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 sm:p-4 text-2xs leading-relaxed text-muted-foreground">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-indigo-300" />
        <p>Ticket sau khi kết thúc được hệ thống tự dọn dẹp theo các mốc dưới đây. Thay đổi áp dụng từ lần scheduler chạy kế tiếp.</p>
      </div>
      <div className="space-y-5 rounded-xl border border-line bg-slate-900/50 p-4 sm:p-5">
        <div className="border-b border-line pb-5">
          <label className="mb-2 block text-2xs font-600 uppercase tracking-wide text-muted-foreground">Tự đóng ticket sau (ngày)</label>
          <input type="number" min={1} max={365} value={cfg.autoCloseDays} disabled={!isSuperAdmin}
            onChange={(e) => setCfg((c) => ({ ...c, autoCloseDays: parseInt(e.target.value) || 0 }))}
            className={inputCls + ' w-full sm:w-44 disabled:cursor-not-allowed disabled:opacity-50'} />
          <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">Ticket đã xử lý hoặc từ chối quá số ngày này mà không phản hồi sẽ tự đóng.</p>
        </div>
        <div>
          <label className="mb-2 block text-2xs font-600 uppercase tracking-wide text-muted-foreground">Tự lưu trữ ticket sau (ngày)</label>
          <input type="number" min={1} max={365} value={cfg.autoArchiveDays} disabled={!isSuperAdmin}
            onChange={(e) => setCfg((c) => ({ ...c, autoArchiveDays: parseInt(e.target.value) || 0 }))}
            className={inputCls + ' w-full sm:w-44 disabled:cursor-not-allowed disabled:opacity-50'} />
          <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">Ticket đã kết thúc quá số ngày này sẽ được ẩn vào lưu trữ.</p>
        </div>
      </div>
      {isSuperAdmin && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button onClick={save} disabled={saving} className={primaryButtonCls}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
          {ok && <span role="status" className="text-xs font-600 text-emerald-400">Đã lưu cấu hình</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loại Yêu Cầu
// ---------------------------------------------------------------------------
function RequestTypesSection({
  items,
  isSuperAdmin,
  currentUserId,
  loading,
  onError,
  onChanged,
}: {
  items: RequestType[];
  isSuperAdmin: boolean;
  currentUserId?: string;
  loading: boolean;
  onError: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setForm({ code: '', name: '', sort_order: 0 });
    setEditingId(null);
    setShowForm(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      onError('Vui lòng nhập mã và tên loại yêu cầu');
      return;
    }
    try {
      setSaving(true);
      const url = editingId ? `/api/ticket-request-types/${editingId}` : '/api/ticket-request-types';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          sort_order: Number(form.sort_order) || 0,
          [editingId ? 'updated_by' : 'created_by']: currentUserId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Lưu thất bại');
      await onChanged();
      reset();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Lưu trữ loại yêu cầu này?')) return;
    try {
      const res = await fetch(`/api/ticket-request-types/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted_by: currentUserId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Lưu trữ thất bại');
      await onChanged();
    } catch (err: any) {
      onError(err.message);
    }
  };

  // Xóa vĩnh viễn — gọi ?hard=1; nếu còn ticket/danh mục dùng (409) thì hỏi xác nhận lần 2 với force=1.
  const hardRemove = async (t: RequestType) => {
    if (!confirm(`Xóa VĨNH VIỄN loại yêu cầu "${t.name}"?\nHành động này không thể hoàn tác.`)) return;
    try {
      let res = await fetch(`/api/ticket-request-types/${t.id}?hard=1`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted_by: currentUserId }),
      });
      if (res.status === 409) {
        const info = await res.json();
        if (!confirm(`${info.error}\n\nVẫn tiếp tục xóa vĩnh viễn?`)) return;
        res = await fetch(`/api/ticket-request-types/${t.id}?hard=1&force=1`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_by: currentUserId }),
        });
      }
      if (!res.ok) throw new Error((await res.json()).error || 'Xóa thất bại');
      await onChanged();
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-700 text-foreground">Loại yêu cầu</h2>
          <p className="mt-1 text-2xs text-muted-foreground">Phân loại ticket để điều hướng luồng xử lý phù hợp.</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => (showForm ? reset() : setShowForm(true))} className={`${primaryButtonCls} w-full sm:w-auto`}>
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Đóng biểu mẫu' : 'Thêm loại yêu cầu'}
          </button>
        )}
      </div>

      {showForm && isSuperAdmin && (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-slate-900/50 p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-700 text-foreground">{editingId ? 'Sửa loại yêu cầu' : 'Thêm loại yêu cầu'}</h3>
            <p className="mt-1 text-2xs text-muted-foreground">Thiết lập mã, tên hiển thị và thứ tự trong danh sách.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Mã (code)</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="incident"
                className={inputCls}
              />
              {editingId && (
                <p className="text-2xs text-amber-400/80 mt-1">
                  Đổi mã có thể làm ticket/danh mục cũ mất liên kết.
                </p>
              )}
            </div>
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Tên hiển thị</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sự cố"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Thứ tự</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={saving} className={primaryButtonCls}>
              <Check size={16} /> {saving ? 'Đang lưu...' : 'Lưu loại yêu cầu'}
            </button>
            <button type="button" onClick={reset} className={secondaryButtonCls}>
              <X size={16} /> Hủy
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted-foreground">Đang tải loại yêu cầu...</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted-foreground">Chưa có loại yêu cầu nào.</p>
        ) : (
          items.map((t) => (
            <div
              key={t.id}
              className={`flex flex-col gap-3 rounded-xl border border-line bg-slate-900/50 p-3 sm:flex-row sm:items-center sm:p-4 ${
                t.is_active ? '' : 'opacity-50'
              }`}
            >
              <span className="w-fit rounded-md bg-hover px-2 py-1 text-2xs font-mono text-muted-foreground">{t.code}</span>
              <span className="flex-1 text-sm font-600 text-foreground">{t.name}</span>
              {!t.is_active && <span className="w-fit text-2xs font-600 text-red-400">Đã ẩn</span>}
              {isSuperAdmin && (
                <div className="flex items-center gap-1 self-end sm:self-auto">
                  <button onClick={() => { setForm({ code: t.code, name: t.name, sort_order: t.sort_order }); setEditingId(t.id); setShowForm(true); }} title="Sửa loại yêu cầu" aria-label={`Sửa loại yêu cầu ${t.name}`} className={`${iconButtonCls} h-9 w-9 text-muted-foreground hover:bg-hover hover:text-foreground`}>
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => remove(t.id)} title="Lưu trữ loại yêu cầu" aria-label={`Lưu trữ loại yêu cầu ${t.name}`} className={`${iconButtonCls} h-9 w-9 text-amber-400 hover:bg-amber-500/10`}>
                    <Archive size={15} />
                  </button>
                  <button onClick={() => hardRemove(t)} title="Xóa vĩnh viễn loại yêu cầu" aria-label={`Xóa vĩnh viễn loại yêu cầu ${t.name}`} className={`${iconButtonCls} h-9 w-9 text-red-400 hover:bg-red-500/10`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danh Mục (gồm editor custom_fields)
// ---------------------------------------------------------------------------
function CategoriesSection({
  items,
  requestTypes,
  orgTags,
  isSuperAdmin,
  currentUserId,
  loading,
  onError,
  onChanged,
}: {
  items: Category[];
  requestTypes: RequestType[];
  orgTags: OrgTag[];
  isSuperAdmin: boolean;
  currentUserId?: string;
  loading: boolean;
  onError: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const emptyForm = {
    name: '',
    parent_id: '' as string,
    request_type: '' as string,
    default_unit_tag_id: '' as string,
    sort_order: 0,
    custom_fields: [] as CustomField[],
  };
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const parents = items.filter((c) => !c.parent_id);
  const childrenOf = (pid: string) => items.filter((c) => c.parent_id === pid);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (c: Category) => {
    setForm({
      name: c.name,
      parent_id: c.parent_id || '',
      request_type: c.request_type || '',
      default_unit_tag_id: c.default_unit_tag_id || '',
      sort_order: c.sort_order,
      custom_fields: Array.isArray(c.custom_fields) ? c.custom_fields : [],
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      onError('Vui lòng nhập tên danh mục');
      return;
    }
    // Validate custom field keys
    for (const f of form.custom_fields) {
      if (!f.key.trim() || !f.label.trim()) {
        onError('Mỗi trường động phải có key và nhãn');
        return;
      }
    }
    try {
      setSaving(true);
      const url = editingId ? `/api/ticket-categories/${editingId}` : '/api/ticket-categories';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          parent_id: form.parent_id || null,
          request_type: form.request_type || null,
          default_unit_tag_id: form.default_unit_tag_id || null,
          sort_order: Number(form.sort_order) || 0,
          custom_fields: form.custom_fields,
          [editingId ? 'updated_by' : 'created_by']: currentUserId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Lưu thất bại');
      await onChanged();
      reset();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Lưu trữ danh mục này? Danh mục con vẫn giữ nguyên.')) return;
    try {
      const res = await fetch(`/api/ticket-categories/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted_by: currentUserId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Lưu trữ thất bại');
      await onChanged();
    } catch (err: any) {
      onError(err.message);
    }
  };

  // Xóa vĩnh viễn — gọi ?hard=1; nếu còn danh mục con/ticket dùng (409) thì hỏi xác nhận lần 2 với force=1.
  const hardRemove = async (c: Category) => {
    if (!confirm(`Xóa VĨNH VIỄN danh mục "${c.name}"?\nHành động này không thể hoàn tác.`)) return;
    try {
      let res = await fetch(`/api/ticket-categories/${c.id}?hard=1`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted_by: currentUserId }),
      });
      if (res.status === 409) {
        const info = await res.json();
        if (!confirm(`${info.error}\n\nVẫn tiếp tục xóa vĩnh viễn?`)) return;
        res = await fetch(`/api/ticket-categories/${c.id}?hard=1&force=1`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_by: currentUserId }),
        });
      }
      if (!res.ok) throw new Error((await res.json()).error || 'Xóa thất bại');
      await onChanged();
    } catch (err: any) {
      onError(err.message);
    }
  };

  // custom_fields editor helpers
  const updateField = (idx: number, patch: Partial<CustomField>) => {
    setForm((f) => ({
      ...f,
      custom_fields: f.custom_fields.map((cf, i) => (i === idx ? { ...cf, ...patch } : cf)),
    }));
  };
  const addField = () =>
    setForm((f) => ({
      ...f,
      custom_fields: [...f.custom_fields, { key: '', label: '', type: 'text', required: false }],
    }));
  const removeField = (idx: number) =>
    setForm((f) => ({ ...f, custom_fields: f.custom_fields.filter((_, i) => i !== idx) }));

  const renderRow = (c: Category, depth: number) => (
    <div
      key={c.id}
      className={`flex flex-col gap-3 rounded-xl border border-line bg-slate-900/50 p-3 sm:flex-row sm:items-center sm:p-4 ${c.is_active ? '' : 'opacity-50'}`}
      style={{ marginLeft: depth * 20 }}
    >
      {depth > 0 && <ChevronRight size={14} className="shrink-0 text-muted-foreground/50" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-600 text-foreground">{c.name}</span>
          {c.request_type && (
            <span className="rounded-md bg-indigo-500/15 px-2 py-1 text-2xs font-600 text-indigo-300">
              {requestTypes.find((r) => r.code === c.request_type)?.name || c.request_type}
            </span>
          )}
          {c.default_unit_tag_id && (
            <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-2xs font-600 text-emerald-300">
              {orgTags.find((t) => t.id === c.default_unit_tag_id)?.name || 'Đơn vị'}
            </span>
          )}
          {c.custom_fields?.length > 0 && <span className="text-2xs text-muted-foreground">{c.custom_fields.length} trường động</span>}
          {!c.is_active && <span className="text-2xs font-600 text-red-400">Đã ẩn</span>}
        </div>
      </div>
      {isSuperAdmin && (
        <div className="flex items-center gap-1 self-end sm:self-auto">
          <button onClick={() => startEdit(c)} title="Sửa danh mục" aria-label={`Sửa danh mục ${c.name}`} className={`${iconButtonCls} h-9 w-9 text-muted-foreground hover:bg-hover hover:text-foreground`}>
            <Edit2 size={15} />
          </button>
          <button onClick={() => remove(c.id)} title="Lưu trữ danh mục" aria-label={`Lưu trữ danh mục ${c.name}`} className={`${iconButtonCls} h-9 w-9 text-amber-400 hover:bg-amber-500/10`}>
            <Archive size={15} />
          </button>
          <button onClick={() => hardRemove(c)} title="Xóa vĩnh viễn danh mục" aria-label={`Xóa vĩnh viễn danh mục ${c.name}`} className={`${iconButtonCls} h-9 w-9 text-red-400 hover:bg-red-500/10`}>
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-700 text-foreground">Danh mục</h2>
          <p className="mt-1 text-2xs text-muted-foreground">Nhóm ticket theo danh mục, đơn vị xử lý và trường thông tin cần thu thập.</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => (showForm ? reset() : setShowForm(true))} className={`${primaryButtonCls} w-full sm:w-auto`}>
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Đóng biểu mẫu' : 'Thêm danh mục'}
          </button>
        )}
      </div>

      {showForm && isSuperAdmin && (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-slate-900/50 p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-700 text-foreground">{editingId ? 'Sửa danh mục' : 'Thêm danh mục'}</h3>
            <p className="mt-1 text-2xs text-muted-foreground">Xác định vị trí, luồng xử lý và dữ liệu cần nhập cho danh mục này.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Tên danh mục</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Sự cố thiết bị" />
            </div>
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Danh mục cha</label>
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} className={inputCls}>
                <option value="">— Là danh mục gốc —</option>
                {parents
                  .filter((p) => p.id !== editingId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Loại yêu cầu mặc định</label>
              <select value={form.request_type} onChange={(e) => setForm({ ...form, request_type: e.target.value })} className={inputCls}>
                <option value="">— Không ràng buộc —</option>
                {requestTypes
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Đơn vị xử lý mặc định</label>
              <select
                value={form.default_unit_tag_id}
                onChange={(e) => setForm({ ...form, default_unit_tag_id: e.target.value })}
                className={inputCls}
              >
                <option value="">— Không gán —</option>
                {orgTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Thứ tự</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                className={inputCls}
              />
            </div>
          </div>

          {/* custom_fields editor */}
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label className="block text-2xs font-600 uppercase tracking-wide text-muted-foreground">Trường động</label>
                <p className="mt-1 text-2xs text-muted-foreground">Thông tin cần bổ sung khi người dùng tạo ticket.</p>
              </div>
              <button type="button" onClick={addField} className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 text-2xs font-600 text-indigo-300 hover:bg-indigo-500/10 hover:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                <Plus size={14} /> Thêm trường
              </button>
            </div>
            {form.custom_fields.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-3 py-4 text-2xs text-muted-foreground">Chưa có trường động nào.</p>
            )}
            {form.custom_fields.map((cf, idx) => (
              <div key={idx} className="space-y-3 rounded-lg border border-line-subtle bg-[#0f1626] p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    value={cf.key}
                    onChange={(e) => updateField(idx, { key: e.target.value })}
                    placeholder="key (vd: asset_code)"
                    className={inputCls}
                  />
                  <input
                    value={cf.label}
                    onChange={(e) => updateField(idx, { label: e.target.value })}
                    placeholder="Nhãn hiển thị"
                    className={inputCls}
                  />
                  <select value={cf.type} onChange={(e) => updateField(idx, { type: e.target.value as CustomField['type'] })} className={inputCls}>
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>
                        {ft.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-2xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cf.required}
                        onChange={(e) => updateField(idx, { required: e.target.checked })}
                        className="accent-indigo-500"
                      />
                      Bắt buộc
                    </label>
                    <button type="button" onClick={() => removeField(idx)} title="Xóa trường động" aria-label={`Xóa trường động ${idx + 1}`} className={`${iconButtonCls} h-9 w-9 text-red-400 hover:bg-red-500/10`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {cf.type === 'select' && (
                  <input
                    value={(cf.options || []).join(', ')}
                    onChange={(e) =>
                      updateField(idx, {
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Lựa chọn, cách nhau dấu phẩy: Laptop, Màn hình, Khác"
                    className={inputCls}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={saving} className={primaryButtonCls}>
              <Check size={16} /> {saving ? 'Đang lưu...' : 'Lưu danh mục'}
            </button>
            <button type="button" onClick={reset} className={secondaryButtonCls}>
              <X size={16} /> Hủy
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted-foreground">Đang tải danh mục...</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-muted-foreground">Chưa có danh mục nào.</p>
        ) : (
          parents.map((p) => (
            <React.Fragment key={p.id}>
              {renderRow(p, 0)}
              {childrenOf(p.id).map((c) => renderRow(c, 1))}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
