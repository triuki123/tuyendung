'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Pencil, X, Building2, Trash2, CalendarDays, CheckSquare, Square } from 'lucide-react';
import DateInputVN from '@/components/ui/DateInputVN';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface PolicyCompany {
  id: string;
  name: string;
}

interface PolicyRow {
  id: string;
  name: string;
  employment_type_id: string | null;
  employment_type_name: string | null;
  base_days_per_year: number;
  accrual_frequency: 'monthly' | 'yearly_upfront';
  seniority_bonus_days: number;
  seniority_every_years: number;
  carryover_max_days: number;
  carryover_expiry_mmdd: string;
  accrual_day: number;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
  companies: PolicyCompany[];
}

interface EmploymentType {
  id: string;
  name: string;
}

interface Company {
  id: string;
  name: string;
}

interface Props {
  userId: string;
  role: string;
}

const EMPTY_FORM = {
  name: '',
  employment_type_id: '',
  base_days_per_year: '12',
  accrual_frequency: 'monthly' as PolicyRow['accrual_frequency'],
  seniority_bonus_days: '1',
  seniority_every_years: '5',
  carryover_max_days: '12',
  carryover_expiry_mmdd: '03-31',
  accrual_day: '1',
  valid_from: '',
  valid_until: '',
  active: true,
  company_ids: [] as string[],
};

/** Format YYYY-MM-DD → DD/MM/YYYY để hiển thị */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function PoliciesTab({ userId, role }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<PolicyRow[]>([]);
  const [etypes, setEtypes] = useState<EmploymentType[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PolicyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PolicyRow | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'x-current-user-id': userId,
    'x-current-user-role': role,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, eRes, cRes] = await Promise.all([
        fetch('/api/leave/policies', { headers }),
        fetch('/api/employment-types', { headers }),
        fetch('/api/companies', { headers }),
      ]);
      const [pJson, eJson, cJson] = await Promise.all([pRes.json(), eRes.json(), cRes.json()]);
      if (pRes.ok && pJson.success) setItems(pJson.data);
      if (eRes.ok && eJson.success) setEtypes(eJson.data);
      if (cRes.ok && cJson.success) setCompanies(cJson.data);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  useEffect(() => { if (userId) void load(); }, [userId, load]);

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function openEdit(p: PolicyRow) {
    setEditing(p);
    setCreating(false);
    setForm({
      name: p.name,
      employment_type_id: p.employment_type_id ?? '',
      base_days_per_year: String(p.base_days_per_year),
      accrual_frequency: p.accrual_frequency,
      seniority_bonus_days: String(p.seniority_bonus_days),
      seniority_every_years: String(p.seniority_every_years),
      carryover_max_days: String(p.carryover_max_days ?? 0),
      carryover_expiry_mmdd: p.carryover_expiry_mmdd || '03-31',
      accrual_day: String(p.accrual_day ?? 1),
      valid_from: p.valid_from ? p.valid_from.slice(0, 10) : '',
      valid_until: p.valid_until ? p.valid_until.slice(0, 10) : '',
      active: p.active,
      company_ids: (p.companies ?? []).map((c) => c.id),
    });
    setError(null);
  }

  function toggleCompany(id: string) {
    setForm((f) => ({
      ...f,
      company_ids: f.company_ids.includes(id)
        ? f.company_ids.filter((c) => c !== id)
        : [...f.company_ids, id],
    }));
  }

  async function save() {
    if (!form.name.trim()) { setError('Thiếu tên chính sách'); return; }
    if (!form.employment_type_id) { setError('Phải chọn hình thức lao động'); return; }
    if (!form.valid_from || !form.valid_until) { setError('Phải chọn ngày bắt đầu và kết thúc hiệu lực'); return; }
    if (form.valid_until < form.valid_from) { setError('Ngày kết thúc phải sau ngày bắt đầu'); return; }
    if (Number(form.carryover_max_days) > 0 && !/^\d{2}-\d{2}$/.test(form.carryover_expiry_mmdd)) {
      setError('Ngày hết hạn phép chuyển năm phải đúng định dạng MM-DD (vd 03-31)'); return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        employment_type_id: form.employment_type_id,
        base_days_per_year: Number(form.base_days_per_year),
        accrual_frequency: form.accrual_frequency,
        seniority_bonus_days: Number(form.seniority_bonus_days),
        seniority_every_years: Number(form.seniority_every_years),
        carryover_max_days: Number(form.carryover_max_days),
        carryover_expiry_mmdd: form.carryover_expiry_mmdd,
        accrual_day: Number(form.accrual_day),
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        active: form.active,
        company_ids: form.company_ids,
      };
      const res = creating
        ? await fetch('/api/leave/policies', { method: 'POST', headers, body: JSON.stringify(payload) })
        : await fetch(`/api/leave/policies/${editing!.id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
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

  async function confirmDelete(p: PolicyRow) {
    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/leave/policies/${p.id}`, { method: 'DELETE', headers });
      const json = await res.json();
      if (res.ok && json.success) {
        setDeleteConfirm(null);
        void load();
      } else {
        toast.error(json.error ?? 'Không xóa được');
      }
    } finally {
      setDeletingId(null);
    }
  }

  const showModal = creating || editing !== null;

  // UX modal thêm/sửa chính sách (form): ESC + cảnh báo thay đổi chưa lưu
  const closeModal = useCallback(() => { setEditing(null); setCreating(false); }, []);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(closeModal);
  useEscapeKey(guardedClose, showModal);
  // UX modal xác nhận xóa (chỉ xác nhận): ESC đóng
  const closeDelete = useCallback(() => setDeleteConfirm(null), []);
  useEscapeKey(closeDelete, !!deleteConfirm);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Chính sách quyết định cách quỹ phép năm được cộng tự động. Mỗi hình thức lao động có thể có chính sách riêng.
        </p>
        <button
          onClick={openCreate}
          className="btn-indigo inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600"
        >
          <Plus className="h-4 w-4" /> Thêm chính sách
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có chính sách nào</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border border-line-subtle p-4 ${p.active ? '' : 'opacity-50'}`}
              style={{ background: 'var(--card)' }}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-600 text-foreground">{p.name}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-hover px-2 py-0.5 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {p.employment_type_name ?? '—'}
                    </span>
                    {!p.active && (
                      <span className="rounded-full border border-line bg-hover px-2 py-0.5 text-xs text-muted-foreground">Đã tắt</span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded-full bg-teal-500/15 text-teal-400 px-2 py-0.5 font-500">
                      {p.base_days_per_year} ngày/năm
                    </span>
                    <span className="rounded-full bg-hover px-2 py-0.5">
                      {p.accrual_frequency === 'monthly'
                        ? `Cộng dần ngày ${p.accrual_day ?? 1} hằng tháng`
                        : 'Cấp đủ đầu năm'}
                    </span>
                    {Number(p.seniority_bonus_days) > 0 && (
                      <span className="rounded-full bg-hover px-2 py-0.5">
                        +{p.seniority_bonus_days} ngày mỗi {p.seniority_every_years} năm thâm niên
                      </span>
                    )}
                    <span className="rounded-full bg-hover px-2 py-0.5">
                      {Number(p.carryover_max_days) > 0
                        ? `Chuyển năm tối đa ${p.carryover_max_days} ngày (hết hạn ${(p.carryover_expiry_mmdd || '03-31').replace('-', '/')})`
                        : 'Không chuyển năm'}
                    </span>
                    {(p.valid_from || p.valid_until) && (
                      <span className="rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5">
                        {p.valid_from && p.valid_until
                          ? `${fmtDate(p.valid_from)} – ${fmtDate(p.valid_until)}`
                          : p.valid_from
                            ? `Từ ${fmtDate(p.valid_from)}`
                            : `Đến ${fmtDate(p.valid_until)}`}
                      </span>
                    )}
                  </div>

                  {(p.companies ?? []).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.companies.map((c) => (
                        <span key={c.id} className="rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 text-xs">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => openEdit(p)}
                    className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Sửa
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(p)}
                    className="btn-ghost rounded-xl px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                    title="Xóa chính sách"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal thêm/sửa */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedClose(); }}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-line overflow-hidden flex flex-col"
            style={{ background: 'var(--card)', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 flex-shrink-0">
              <h2 className="text-base font-700 text-foreground">
                {creating ? 'Thêm chính sách phép năm' : `Sửa: ${editing?.name}`}
              </h2>
              <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4" onChange={markDirty}>
              {/* Tên */}
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Tên chính sách</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                />
              </div>

              {/* Áp dụng cho — chỉ Hình Thức Lao Động */}
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Áp dụng cho hình thức lao động</label>
                <select
                  value={form.employment_type_id}
                  onChange={(e) => setForm({ ...form, employment_type_id: e.target.value })}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                >
                  <option value="">— Chọn hình thức lao động —</option>
                  {etypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Công ty áp dụng — multi-select */}
              {companies.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">
                    Công ty áp dụng
                    <span className="ml-1 font-400 normal-case">(không chọn = áp dụng cho tất cả)</span>
                  </label>
                  <div className="rounded-xl border border-line bg-surface-2 p-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {companies.map((c) => {
                      const checked = form.company_ids.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { toggleCompany(c.id); markDirty(); }}
                          className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors ${checked ? 'bg-indigo-500/15 text-indigo-300' : 'text-muted-foreground hover:bg-hover'}`}
                        >
                          {checked
                            ? <CheckSquare className="h-4 w-4 flex-shrink-0 text-indigo-400" />
                            : <Square className="h-4 w-4 flex-shrink-0" />}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Số ngày + Cách cộng */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Số ngày phép/năm</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.base_days_per_year}
                    onChange={(e) => setForm({ ...form, base_days_per_year: e.target.value })}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Cách cộng phép</label>
                  <select
                    value={form.accrual_frequency}
                    onChange={(e) => setForm({ ...form, accrual_frequency: e.target.value as PolicyRow['accrual_frequency'] })}
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                  >
                    <option value="monthly">Cộng dần hằng tháng</option>
                    <option value="yearly_upfront">Cấp đủ đầu năm</option>
                  </select>
                </div>
              </div>

              {/* Ngày cộng phép — chỉ hiện khi monthly */}
              {form.accrual_frequency === 'monthly' && (
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Ngày cộng phép hằng tháng</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Ngày</span>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={form.accrual_day}
                      onChange={(e) => setForm({ ...form, accrual_day: e.target.value })}
                      className="w-24 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    />
                    <span className="text-sm text-muted-foreground">hằng tháng</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground opacity-70">Tối đa 28 để an toàn cho tháng Hai</p>
                </div>
              )}

              {/* Thâm niên */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Thâm niên: cộng thêm</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={form.seniority_bonus_days}
                      onChange={(e) => setForm({ ...form, seniority_bonus_days: e.target.value })}
                      className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">ngày</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Cho mỗi</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={form.seniority_every_years}
                      onChange={(e) => setForm({ ...form, seniority_every_years: e.target.value })}
                      className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">năm làm</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground opacity-70">Điều 114 BLLĐ: 1 ngày / 5 năm</p>
                </div>
              </div>

              {/* Phép chuyển năm (carryover) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Tối đa phép chuyển năm</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={form.carryover_max_days}
                      onChange={(e) => setForm({ ...form, carryover_max_days: e.target.value })}
                      className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">ngày</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground opacity-70">0 = không cho chuyển năm</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Phép chuyển năm hết hạn</label>
                  <input
                    value={form.carryover_expiry_mmdd}
                    onChange={(e) => setForm({ ...form, carryover_expiry_mmdd: e.target.value })}
                    placeholder="03-31"
                    pattern="\d{2}-\d{2}"
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground font-mono"
                  />
                  <p className="mt-1 text-xs text-muted-foreground opacity-70">Định dạng MM-DD (vd 03-31 = 31/03)</p>
                </div>
              </div>

              {/* Thời hạn hiệu lực */}
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Hạn dùng phép</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Từ ngày</p>
                    <DateInputVN
                      value={form.valid_from}
                      onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                      className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Đến ngày</p>
                    <DateInputVN
                      value={form.valid_until}
                      min={form.valid_from || undefined}
                      onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                      className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground opacity-70">
                  Đơn nghỉ phép năm ngoài khoảng này sẽ bị từ chối tự động
                </p>
              </div>

              {/* Trạng thái — chỉ khi sửa */}
              {!creating && (
                <label className="flex items-center gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 rounded accent-teal-500"
                  />
                  Đang áp dụng
                </label>
              )}

              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4 flex-shrink-0">
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

      {/* Modal xác nhận xóa */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}
        >
          <div className="w-full max-w-sm rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 flex-shrink-0">
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-600 text-foreground">Xóa chính sách?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">"{deleteConfirm.name}" sẽ bị xóa vĩnh viễn. Quỹ phép đã cộng không bị ảnh hưởng.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost rounded-xl px-4 py-2 text-sm">
                Hủy
              </button>
              <button
                onClick={() => confirmDelete(deleteConfirm)}
                disabled={deletingId === deleteConfirm.id}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-600 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
              >
                {deletingId === deleteConfirm.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
