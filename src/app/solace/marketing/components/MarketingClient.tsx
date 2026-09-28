'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Link2,
  Loader2,
  Megaphone,
  Pencil,
  Send,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import type { UserModulePermissions, PermissionAction } from '@/lib/modules';
import { api } from '../../quan-ly/lib/solaceApi';
import { useConfirm } from '@/context/ConfirmContext';

interface Broadcast {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  button_label: string | null;
  button_url: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduled_at: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
}

const STATUS_META: Record<Broadcast['status'], { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'bg-white/5 text-muted-foreground border-white/10' },
  scheduled: { label: 'Đã hẹn', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  sending: { label: 'Đang gửi', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  sent: { label: 'Đã gửi', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Lỗi', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const emptyForm = {
  id: '',
  title: '',
  content: '',
  imageUrl: '',
  buttonLabel: '',
  buttonUrl: '',
  scheduledAt: '',
};

export default function MarketingClient({ embedded }: { embedded?: boolean } = {}) {
  const confirm = useConfirm();
  const [perms, setPerms] = useState<UserModulePermissions | undefined>();
  const [role, setRole] = useState('');
  const [authLoading, setAuthLoading] = useState(true);

  const [list, setList] = useState<Broadcast[]>([]);
  const [subCount, setSubCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const u = getCurrentUser() as { role?: string; module_permissions?: UserModulePermissions } | null;
    setPerms(u?.module_permissions);
    setRole(u?.role ?? '');
    setAuthLoading(false);
  }, []);

  const { canAccessInherited } = useUserPermissions(perms);
  const isSuper = role === 'super_admin';
  const canView = isSuper || canAccessInherited('solace-marketing', 'view' as PermissionAction);
  const canCreate = isSuper || canAccessInherited('solace-marketing', 'create' as PermissionAction);
  const canEdit = isSuper || canAccessInherited('solace-marketing', 'edit' as PermissionAction);
  const canDelete = isSuper || canAccessInherited('solace-marketing', 'delete' as PermissionAction);

  const flash = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bc, sc] = await Promise.all([
        api.get<{ data: Broadcast[] }>('/api/solace/marketing/broadcasts'),
        api.get<{ data: { count: number } }>('/api/solace/marketing/subscribers'),
      ]);
      setList(bc.data);
      setSubCount(sc.data.count);
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const resetForm = () => setForm(emptyForm);

  const onUploadImage = async (file: File | null) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload<{ data: { url: string } }>('/api/solace/marketing/images', fd);
      setForm(prev => ({ ...prev, imageUrl: res.data.url }));
      flash(true, 'Đã tải ảnh lên. Telegram sẽ nhận ảnh thật thay vì link.');
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setUploadingImage(false);
    }
  };

  const save = async (): Promise<string | null> => {
    if (!form.title.trim() || !form.content.trim()) {
      flash(false, 'Nhập tiêu đề và nội dung');
      return null;
    }
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      imageUrl: form.imageUrl.trim() || null,
      buttonLabel: form.buttonLabel.trim() || null,
      buttonUrl: form.buttonUrl.trim() || null,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
    };
    if (form.id) {
      await api.put(`/api/solace/marketing/broadcasts/${form.id}`, payload);
      return form.id;
    }
    const res = await api.post<{ data: Broadcast }>('/api/solace/marketing/broadcasts', payload);
    return res.data.id;
  };

  const onSaveDraft = async () => {
    setSaving(true);
    try {
      await save();
      flash(true, form.scheduledAt ? 'Đã lên lịch gửi' : 'Đã lưu nháp');
      resetForm();
      await load();
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onSendNow = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      flash(false, 'Nhập tiêu đề và nội dung');
      return;
    }
    if (!(await confirm({
      title: 'Gửi ngay?',
      message: `Gửi ngay tới ${subCount ?? '...'} người đã liên kết bot Solace?`,
      confirmLabel: 'Gửi ngay',
    }))) return;

    setSaving(true);
    try {
      const id = form.id || (await api.post<{ data: Broadcast }>('/api/solace/marketing/broadcasts', {
        title: form.title.trim(),
        content: form.content.trim(),
        imageUrl: form.imageUrl.trim() || null,
        buttonLabel: form.buttonLabel.trim() || null,
        buttonUrl: form.buttonUrl.trim() || null,
        scheduledAt: null,
      })).data.id;
      await api.post(`/api/solace/marketing/broadcasts/${id}/send`, {});
      flash(true, 'Đang gửi… danh sách sẽ cập nhật trạng thái');
      resetForm();
      await load();
      setTimeout(() => { void load(); }, 4000);
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sendExisting = async (b: Broadcast) => {
    if (!(await confirm({
      title: 'Gửi bài?',
      message: `Gửi "${b.title}" tới ${subCount ?? '...'} người?`,
      confirmLabel: 'Gửi',
    }))) return;
    try {
      await api.post(`/api/solace/marketing/broadcasts/${b.id}/send`, {});
      flash(true, 'Đang gửi…');
      await load();
      setTimeout(() => { void load(); }, 4000);
    } catch (e) {
      flash(false, (e as Error).message);
    }
  };

  const editExisting = (b: Broadcast) => {
    setForm({
      id: b.id,
      title: b.title,
      content: b.content,
      imageUrl: b.image_url ?? '',
      buttonLabel: b.button_label ?? '',
      buttonUrl: b.button_url ?? '',
      scheduledAt: b.scheduled_at ? new Date(b.scheduled_at).toISOString().slice(0, 16) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeExisting = async (b: Broadcast) => {
    if (!(await confirm({
      title: 'Xóa bài?',
      message: `Xóa bài "${b.title}"?`,
      confirmLabel: 'Xóa',
      danger: true,
    }))) return;
    try {
      await api.del(`/api/solace/marketing/broadcasts/${b.id}`);
      flash(true, 'Đã xóa');
      await load();
    } catch (e) {
      flash(false, (e as Error).message);
    }
  };

  if (authLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center py-20 text-muted-foreground">
        <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm">Bạn không có quyền truy cập Marketing</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {!embedded && (
        <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Quán Cà Phê Solace
        </Link>
      )}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg,#8B4513,#C77B3B)' }}>
            <Megaphone className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-700 text-foreground sm:text-2xl">Marketing</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">Soạn và gửi bài quảng bá tới khách qua bot Telegram Solace</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm" style={{ background: 'var(--card)' }}>
          <Users className="h-4 w-4 text-indigo-400" />
          <span className="text-muted-foreground">Người nhận:</span>
          <span className="font-700 text-foreground">{subCount ?? '—'}</span>
        </div>
      </div>

      {canCreate && (
        <div className="space-y-3 rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-600 text-foreground">{form.id ? 'Sửa bài' : 'Soạn bài mới'}</h2>
            {form.id && (
              <button onClick={resetForm} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" /> Hủy sửa
              </button>
            )}
          </div>

          <Field label="Tiêu đề (nội bộ)">
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Khuyến mãi cà phê sáng thứ 2"
              className="inp"
            />
          </Field>

          <Field label="Nội dung gửi đi">
            <textarea
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              rows={5}
              placeholder="Nội dung tin nhắn… Hỗ trợ *in đậm*, _nghiêng_ (Markdown)."
              className="inp resize-y"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={<span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Ảnh chiến dịch (tùy chọn)</span>}>
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-foreground hover:bg-white/5">
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span>{uploadingImage ? 'Đang tải ảnh...' : 'Tải ảnh lên trực tiếp'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null;
                      void onUploadImage(file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <input
                  value={form.imageUrl}
                  onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="hoặc dán link ảnh trực tiếp https://…/anh.jpg"
                  className="inp"
                />
                <p className="text-xs text-muted-foreground">
                  Ưu tiên tải ảnh lên trực tiếp. Nếu dán link thì phải là link ảnh thật, không phải link trang web.
                </p>
              </div>
            </Field>

            <Field label={<span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Hẹn giờ gửi (tùy chọn)</span>}>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={e => setForm({ ...form, scheduledAt: e.target.value })}
                className="inp"
              />
            </Field>

            <Field label={<span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> Nhãn nút (tùy chọn)</span>}>
              <input
                value={form.buttonLabel}
                onChange={e => setForm({ ...form, buttonLabel: e.target.value })}
                placeholder="VD: Đặt ngay"
                className="inp"
              />
            </Field>

            <Field label="Link nút (tùy chọn)">
              <input
                value={form.buttonUrl}
                onChange={e => setForm({ ...form, buttonUrl: e.target.value })}
                placeholder="https://…"
                className="inp"
              />
            </Field>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              onClick={onSaveDraft}
              disabled={saving || uploadingImage}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-4 py-2 text-sm font-600 text-foreground hover:bg-white/10 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              {form.scheduledAt ? 'Lên lịch' : 'Lưu nháp'}
            </button>
            {!form.scheduledAt && (
              <button
                onClick={onSendNow}
                disabled={saving || uploadingImage}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> Gửi ngay
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-base font-600 text-foreground">Lịch sử bài</h2>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <Megaphone className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Chưa có bài nào</p>
            <p className="mt-1 text-xs opacity-60">Soạn bài đầu tiên ở trên và bấm Gửi ngay</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map(b => {
              const meta = STATUS_META[b.status];
              const editable = b.status === 'draft' || b.status === 'scheduled';
              return (
                <div key={b.id} className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-2xs rounded-full border px-2 py-0.5 font-600 ${meta.cls}`}>{meta.label}</span>
                        <h3 className="truncate text-sm font-600 text-foreground">{b.title}</h3>
                      </div>
                      <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{b.content}</p>
                      <div className="mt-2 flex items-center gap-3 text-2xs text-muted-foreground">
                        {b.status === 'scheduled' && b.scheduled_at && (
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(b.scheduled_at).toLocaleString('vi-VN')}</span>
                        )}
                        {(b.status === 'sent' || b.status === 'sending') && (
                          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> {b.sent_count}/{b.total_count} gửi · {b.failed_count} lỗi</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {editable && canEdit && (
                        <button onClick={() => sendExisting(b)} title="Gửi ngay" className="rounded-lg p-2 text-indigo-400 hover:bg-white/5">
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {editable && canCreate && (
                        <button onClick={() => editExisting(b)} title="Sửa" className="rounded-lg p-2 text-muted-foreground hover:bg-white/5">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {b.status !== 'sending' && canDelete && (
                        <button onClick={() => removeExisting(b)} title="Xóa" className="rounded-lg p-2 text-red-400 hover:bg-white/5">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg ${toast.ok ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-red-500/20 bg-red-500/10 text-red-400'}`}
          style={{ backdropFilter: 'blur(8px)' }}
        >
          {toast.msg}
        </div>
      )}

      <style jsx>{`
        .inp {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: #162033;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--foreground);
        }
        .inp:focus {
          outline: none;
          border-color: rgb(99 102 241 / 0.5);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-600 uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
