'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Settings, Pencil, Trash2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { canAccess } from '@/lib/permissions';
import { inputCls, Field, Modal, ModalFooter, EmptyState } from './shared';

interface DocType {
  id: string; name: string; group_key: string;
  default_validity_months: number | null; sort: number; active: boolean;
}

const GROUP_LABEL: Record<string, string> = {
  dang_ky_dn: 'Hồ sơ đăng ký doanh nghiệp',
  giay_phep_con: 'Giấy phép ngành nghề có điều kiện',
  noi_bo: 'Văn bản quản trị nội bộ',
};

/**
 * Tab Cài đặt — danh mục loại văn bản CẤU HÌNH ĐƯỢC (thêm/sửa/ẩn/xóa).
 * Luật đổi (thêm loại giấy phép mới, đổi thời hạn) → sửa ở đây, KHÔNG cần sửa code.
 * Xóa bị CHẶN khi loại đang có văn bản dùng (server enforce) — khi đó dùng "Ẩn".
 */
export default function LegalSettingsTab() {
  const [types, setTypes] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editType, setEditType] = useState<DocType | 'new' | null>(null);
  const [deleteFor, setDeleteFor] = useState<DocType | null>(null);
  const [busyId, setBusyId] = useState('');
  const [canDelete, setCanDelete] = useState(false);

  useEffect(() => {
    setCanDelete(canAccess((getCurrentUser() as any)?.module_permissions, 'legal', 'delete'));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch('/api/legal/document-types?all=1').then((r) => r.json());
      setTypes(j.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleActive = async (t: DocType) => {
    setBusyId(t.id);
    try {
      await fetch('/api/legal/document-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, active: !t.active }),
      });
      load();
    } finally { setBusyId(''); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const groups = ['dang_ky_dn', 'giay_phep_con', 'noi_bo'] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Danh mục loại văn bản — luật thay đổi thì thêm/sửa ở đây, hệ thống không hardcode
        </p>
        <button onClick={() => setEditType('new')}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 justify-center">
          <Plus className="h-4 w-4" /> Thêm loại văn bản
        </button>
      </div>

      {types.length === 0 ? (
        <EmptyState icon={<Settings />} text="Chưa có loại văn bản nào" />
      ) : (
        groups.map((g) => {
          const list = types.filter((t) => t.group_key === g);
          if (!list.length) return null;
          return (
            <div key={g} className="space-y-2">
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{GROUP_LABEL[g]}</p>
              <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
                {list.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${t.active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{t.name}</p>
                      <p className="text-2xs text-muted-foreground/60">
                        {t.default_validity_months
                          ? `Gợi ý thời hạn: ${t.default_validity_months} tháng`
                          : 'Vô thời hạn / không gợi ý'}
                      </p>
                    </div>
                    <button onClick={() => setEditType(t)} title="Sửa"
                      className="p-2 rounded-lg text-muted-foreground hover:text-indigo-400 hover:bg-white/5">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleActive(t)} disabled={busyId === t.id}
                      className={`rounded-lg px-2.5 py-1.5 text-2xs font-600 border ${
                        t.active
                          ? 'border-white/10 text-muted-foreground hover:text-amber-400 hover:border-amber-500/30'
                          : 'border-emerald-500/30 text-emerald-400'
                      }`}>
                      {busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t.active ? 'Ẩn' : 'Kích hoạt lại'}
                    </button>
                    {canDelete && (
                      <button onClick={() => setDeleteFor(t)} title="Xóa"
                        className="p-2 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {editType && (
        <TypeFormModal type={editType === 'new' ? null : editType}
          onClose={() => setEditType(null)} onDone={() => { setEditType(null); load(); }} />
      )}
      {deleteFor && (
        <DeleteTypeModal type={deleteFor}
          onClose={() => setDeleteFor(null)} onDone={() => { setDeleteFor(null); load(); }} />
      )}
    </div>
  );
}

function TypeFormModal({ type, onClose, onDone }: { type: DocType | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: type?.name ?? '',
    groupKey: type?.group_key ?? 'giay_phep_con',
    defaultValidityMonths: type?.default_validity_months ? String(type.default_validity_months) : '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.name.trim()) { setErr('Nhập tên loại văn bản'); return; }
    setSaving(true); setErr('');
    try {
      const isNew = !type;
      const res = await fetch('/api/legal/document-types', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : {
          id: type!.id,
          name: form.name,
          group_key: form.groupKey,
          default_validity_months: form.defaultValidityMonths ? Number(form.defaultValidityMonths) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi lưu'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={type ? 'Sửa loại văn bản' : 'Thêm loại văn bản'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Tên loại văn bản *">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Giấy phép quảng cáo" className={inputCls} autoFocus />
        </Field>
        <Field label="Nhóm">
          <select value={form.groupKey} onChange={(e) => setForm({ ...form, groupKey: e.target.value })} className={inputCls}>
            <option value="dang_ky_dn">Hồ sơ đăng ký doanh nghiệp</option>
            <option value="giay_phep_con">Giấy phép ngành nghề có điều kiện</option>
            <option value="noi_bo">Văn bản quản trị nội bộ</option>
          </select>
        </Field>
        <Field label="Gợi ý thời hạn (tháng)" hint="Để trống nếu vô thời hạn. Khi tạo văn bản, hệ thống tự tính ngày hết hạn từ ngày cấp. Đổi ở đây KHÔNG ảnh hưởng văn bản đã tạo.">
          <input inputMode="numeric" value={form.defaultValidityMonths}
            onChange={(e) => setForm({ ...form, defaultValidityMonths: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            placeholder="VD: 60 (= 5 năm)" className={inputCls} />
        </Field>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={type ? 'Lưu' : 'Thêm'} />
    </Modal>
  );
}

function DeleteTypeModal({ type, onClose, onDone }: { type: DocType; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/legal/document-types?id=${type.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi xóa'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Xóa loại văn bản" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-foreground">Xóa loại <b>{type.name}</b> khỏi danh mục?</p>
        <p className="text-xs text-muted-foreground">
          Chỉ xóa được khi chưa có văn bản nào dùng loại này. Nếu đang được dùng, hệ thống sẽ
          chặn — hãy dùng "Ẩn" để ngừng cho chọn mà vẫn giữ nghĩa dữ liệu cũ.
        </p>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Xóa" danger />
    </Modal>
  );
}
