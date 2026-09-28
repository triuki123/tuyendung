'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Pencil, X, ShieldCheck, Building2 } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface LeaveTypeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  paid_by: 'company' | 'insurance' | 'unpaid';
  deducts_balance: boolean;
  max_days: number | null;
  max_days_scope: 'per_year' | 'per_occurrence';
  allow_hourly: boolean;
  applies_to_adjustment: boolean;
  allow_half_day: boolean;
  count_sunday: boolean;
  color: string;
  is_system: boolean;
  active: boolean;
  company_ids: string[];
  company_names: string[];
}

interface CompanyRow { id: string; name: string; }

interface Props {
  userId: string;
  role: string;
}

const PAID_BY_LABEL: Record<string, string> = {
  company: 'Công ty trả',
  insurance: 'BHXH',
  unpaid: 'Không lương',
};

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  paid_by: 'company' as LeaveTypeRow['paid_by'],
  deducts_balance: false,
  max_days: '' as string,
  max_days_scope: 'per_year' as LeaveTypeRow['max_days_scope'],
  allow_hourly: true,
  applies_to_adjustment: false,
  allow_half_day: false,
  count_sunday: false,
  color: '#6366f1',
  company_ids: [] as string[],
};

export default function LeaveTypesTab({ userId, role }: Props) {
  const [items, setItems] = useState<LeaveTypeRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LeaveTypeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'x-current-user-id': userId,
    'x-current-user-role': role,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, compRes] = await Promise.all([
        fetch('/api/leave/types?all=true', { headers }),
        fetch('/api/companies', { headers }),
      ]);
      const [typesJson, compJson] = await Promise.all([typesRes.json(), compRes.json()]);
      // Phép năm là loại hệ thống dùng cho đơn nghỉ/ledger, nhưng chính sách của
      // nó được cấu hình cố định tại Quy tắc chấm công nên không xuất hiện ở đây.
      if (typesRes.ok && typesJson.success) {
        setItems((typesJson.data as LeaveTypeRow[]).filter((t) => t.code !== 'annual'));
      }
      if (compRes.ok && (compJson.success || Array.isArray(compJson.data))) {
        setCompanies(compJson.data ?? []);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  useEffect(() => { if (userId) void load(); }, [userId, load]);

  function openEdit(t: LeaveTypeRow) {
    setEditing(t);
    setCreating(false);
    setForm({
      code: t.code,
      name: t.name,
      description: t.description ?? '',
      paid_by: t.paid_by,
      deducts_balance: t.deducts_balance,
      max_days: t.max_days != null ? String(t.max_days) : '',
      max_days_scope: t.max_days_scope,
      allow_hourly: t.allow_hourly,
      applies_to_adjustment: t.applies_to_adjustment,
      allow_half_day: t.allow_half_day,
      count_sunday: t.count_sunday,
      color: t.color,
      company_ids: t.company_ids ?? [],
    });
    setError(null);
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function save() {
    if (!form.name.trim() || (creating && !form.code.trim())) {
      setError('Thiếu tên hoặc mã loại phép');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        paid_by: form.paid_by,
        deducts_balance: form.deducts_balance,
        max_days: form.max_days === '' ? null : Number(form.max_days),
        max_days_scope: form.max_days_scope,
        allow_hourly: form.allow_hourly,
        applies_to_adjustment: form.applies_to_adjustment,
        allow_half_day: form.allow_half_day,
        count_sunday: form.count_sunday,
        color: form.color,
        company_ids: form.company_ids,
      };
      const res = creating
        ? await fetch('/api/leave/types', { method: 'POST', headers, body: JSON.stringify(payload) })
        : await fetch(`/api/leave/types/${editing!.id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
      const json = await res.json();
      if (res.ok && json.success) {
        markClean();
        setEditing(null);
        setCreating(false);
        void load();
      } else {
        setError(json.error ?? 'Không lưu được');
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: LeaveTypeRow) {
    await fetch(`/api/leave/types/${t.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ active: !t.active }),
    });
    void load();
  }

  const showModal = creating || editing !== null;
  const lockCore = editing?.is_system === true;

  // UX modal thêm/sửa loại phép (form): ESC + cảnh báo thay đổi chưa lưu
  const closeModal = useCallback(() => { setEditing(null); setCreating(false); }, []);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(closeModal);
  useEscapeKey(guardedClose, showModal);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={openCreate}
          className="btn-indigo inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600"
        >
          <Plus className="h-4 w-4" /> Thêm loại phép
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((t) => (
            <div
              key={t.id}
              className={`rounded-2xl border border-line-subtle p-4 ${t.active ? '' : 'opacity-50'}`}
              style={{ background: 'var(--card)' }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <span className="text-sm font-600 text-foreground">{t.name}</span>
                    {t.is_system && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-400">
                        <ShieldCheck className="h-3 w-3" /> Theo luật
                      </span>
                    )}
                    {t.company_names && t.company_names.length > 0 ? (
                      t.company_names.map((cn) => (
                        <span key={cn} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                          <Building2 className="h-3 w-3" /> {cn}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-line bg-hover px-2 py-0.5 text-xs text-muted-foreground">
                        Tất cả công ty
                      </span>
                    )}
                    {!t.active && (
                      <span className="rounded-full border border-line bg-hover px-2 py-0.5 text-xs text-muted-foreground">
                        Đã tắt
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded-full bg-hover px-2 py-0.5">{PAID_BY_LABEL[t.paid_by]}</span>
                    {t.deducts_balance && <span className="rounded-full bg-teal-500/15 text-teal-400 px-2 py-0.5">Trừ quỹ phép năm</span>}
                    {t.max_days != null && (
                      <span className="rounded-full bg-hover px-2 py-0.5">
                        Tối đa {t.max_days} ngày{t.max_days_scope === 'per_year' ? '/năm' : '/lần'}
                      </span>
                    )}
                    {t.allow_hourly && <span className="rounded-full bg-hover px-2 py-0.5">Cho nghỉ theo giờ</span>}
                    {t.allow_half_day && <span className="rounded-full bg-hover px-2 py-0.5">Cho nghỉ theo buổi</span>}
                    {t.applies_to_adjustment && <span className="rounded-full bg-sky-500/15 text-sky-400 px-2 py-0.5">Áp dụng Bù công</span>}
                    {t.count_sunday && <span className="rounded-full bg-violet-500/15 text-violet-400 px-2 py-0.5">Tính Chủ nhật</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(t)}
                    className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Sửa
                  </button>
                  <button
                    onClick={() => toggleActive(t)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-600 ${
                      t.active
                        ? 'border-line text-muted-foreground hover:bg-hover'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    {t.active ? 'Tắt' : 'Bật lại'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal sửa / thêm */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-line overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">
                {creating ? 'Thêm loại phép' : `Sửa: ${editing?.name}`}
              </h2>
              <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4" onChange={markDirty}>
              {creating && (
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Mã (code)</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="vd: birthday_leave"
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Tên loại phép</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Mô tả</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground resize-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                  Áp dụng cho công ty
                </label>
                <div className="rounded-xl border border-line bg-surface-2 p-3 space-y-2 max-h-52 overflow-y-auto">
                  {/* Tất cả = không chọn công ty nào */}
                  <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.company_ids.length === 0}
                      onChange={() => setForm({ ...form, company_ids: [] })}
                      className="h-4 w-4 rounded accent-indigo-500"
                    />
                    <span className="font-600">Tất cả công ty (dùng chung)</span>
                  </label>
                  <div className="border-t border-line-subtle" />
                  {companies.map((c) => {
                    const checked = form.company_ids.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              company_ids: e.target.checked
                                ? [...form.company_ids, c.id]
                                : form.company_ids.filter((id) => id !== c.id),
                            })
                          }
                          className="h-4 w-4 rounded accent-amber-500"
                        />
                        <Building2 className="h-3.5 w-3.5 text-amber-400/70" />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tích các công ty có chính sách riêng. Không tích công ty nào = áp dụng cho tất cả.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Chi trả</label>
                  <select
                    value={form.paid_by}
                    onChange={(e) => setForm({ ...form, paid_by: e.target.value as LeaveTypeRow['paid_by'] })}
                    disabled={lockCore}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground disabled:opacity-50"
                  >
                    <option value="company">Công ty trả lương</option>
                    <option value="insurance">Hưởng BHXH</option>
                    <option value="unpaid">Không lương</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Màu</label>
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-[42px] w-full rounded-xl border border-line bg-surface-2 px-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Giới hạn ngày</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.max_days}
                    onChange={(e) => setForm({ ...form, max_days: e.target.value })}
                    placeholder="Trống = không giới hạn"
                    disabled={lockCore}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Phạm vi giới hạn</label>
                  <select
                    value={form.max_days_scope}
                    onChange={(e) => setForm({ ...form, max_days_scope: e.target.value as LeaveTypeRow['max_days_scope'] })}
                    disabled={lockCore}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground disabled:opacity-50"
                  >
                    <option value="per_year">Mỗi năm</option>
                    <option value="per_occurrence">Mỗi lần</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <label className="flex items-center gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.deducts_balance}
                    onChange={(e) => setForm({ ...form, deducts_balance: e.target.checked })}
                    disabled={lockCore}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  Trừ vào quỹ phép năm
                </label>
                <label className="flex items-center gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.allow_hourly}
                    onChange={(e) => setForm({ ...form, allow_hourly: e.target.checked })}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  Cho phép nghỉ theo giờ
                </label>
                <label className="flex items-center gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.allow_half_day}
                    onChange={(e) => setForm({ ...form, allow_half_day: e.target.checked })}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  Cho phép nghỉ theo buổi (Sáng / Chiều)
                </label>
                <label className="flex items-start gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.applies_to_adjustment}
                    onChange={(e) => setForm({ ...form, applies_to_adjustment: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded accent-sky-500"
                  />
                  <span>
                    Áp dụng cho Bù công / Bù giờ
                    <span className="block text-xs text-muted-foreground">
                      Loại này (vd Làm việc tại nhà, Công tác) sẽ xuất hiện khi khai báo Bù công — dùng chung 1 định danh với luồng nghỉ phép.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.count_sunday}
                    onChange={(e) => setForm({ ...form, count_sunday: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded accent-violet-500"
                  />
                  <span>
                    Tính cả Chủ nhật
                    <span className="block text-xs text-muted-foreground">
                      Khi tạo đề xuất nhiều ngày, Chủ nhật vẫn tính là 1 ca làm việc bình thường (không bỏ qua, không tính tăng ca). Dùng cho ca làm việc gồm cả cuối tuần — vd Làm theo ca, nhân sự đã được nghỉ bù trong tuần.
                    </span>
                  </span>
                </label>
              </div>
              {lockCore && (
                <p className="text-xs text-muted-foreground">
                  Loại phép theo luật: cơ chế chi trả / trừ quỹ / giới hạn ngày bị khóa để bảo đảm đúng luật.
                </p>
              )}
              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button
                onClick={guardedClose}
                className="btn-ghost rounded-xl px-4 py-2 text-sm"
              >
                Hủy
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="btn-indigo inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
