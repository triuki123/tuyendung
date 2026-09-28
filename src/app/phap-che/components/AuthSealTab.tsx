'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Stamp, FileSignature, Plus, History, Trash2, Pencil } from 'lucide-react';
import RecordHistoryDrawer from '@/components/ui/RecordHistoryDrawer';
import {
  inputCls, fmtDate, ExpiryBadge, Field, Modal, ModalFooter, CompanyFilter, EmptyState,
  type Company, type LegalPerms,
} from './shared';
import { DeleteFooter } from './DocumentsTab';

interface Auth {
  id: string; company_id: string; company_name: string | null;
  grantor: string; grantee: string; scope: string | null; doc_number: string | null;
  effective_from: string | null; effective_to: string | null;
  status: string; note: string | null; days_left: number | null;
}

interface SealLog {
  id: string; company_id: string; company_name: string | null;
  used_at: string; document_desc: string; used_by: string; note: string | null;
}

const AUTH_STATUS: Record<string, { label: string; cls: string }> = {
  active:  { label: 'Hiệu lực',   cls: 'bg-emerald-500/15 text-emerald-400' },
  expired: { label: 'Hết hạn',    cls: 'bg-red-500/15 text-red-400' },
  revoked: { label: 'Đã thu hồi', cls: 'bg-orange-500/15 text-orange-400' },
};

/** Tab Ủy quyền & Con dấu — 2 sổ song song. */
export default function AuthSealTab({ companies, perms }: { companies: Company[]; perms: LegalPerms }) {
  const [auths, setAuths] = useState<Auth[]>([]);
  const [seals, setSeals] = useState<SealLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('');
  const [editAuth, setEditAuth] = useState<Auth | 'new' | null>(null);
  const [newSeal, setNewSeal] = useState(false);
  const [historyFor, setHistoryFor] = useState<Auth | null>(null);
  const [deleteAuth, setDeleteAuth] = useState<Auth | null>(null);
  const [deleteSeal, setDeleteSeal] = useState<SealLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = companyFilter ? `?companyId=${companyFilter}` : '';
      const [a, s] = await Promise.all([
        fetch(`/api/legal/authorizations${qs}`).then((r) => r.json()),
        fetch(`/api/legal/seal-logs${qs}`).then((r) => r.json()),
      ]);
      setAuths(a.data || []);
      setSeals(s.data || []);
    } finally { setLoading(false); }
  }, [companyFilter]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <CompanyFilter companies={companies} value={companyFilter} onChange={setCompanyFilter} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── Ủy quyền ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-600 text-foreground flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-purple-400" /> Giấy ủy quyền ({auths.length})
            </h2>
            {perms.create && (
              <button onClick={() => setEditAuth('new')}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-600 text-white flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Thêm
              </button>
            )}
          </div>

          {auths.length === 0 ? (
            <EmptyState icon={<FileSignature />} text="Chưa có ủy quyền nào" />
          ) : (
            <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
              {auths.map((a) => {
                const st = AUTH_STATUS[a.status] ?? AUTH_STATUS.active;
                return (
                  <div key={a.id} className="p-3.5 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-600 text-foreground">{a.grantor} → {a.grantee}</p>
                      <span className={`px-1.5 py-0.5 rounded text-2xs font-600 ${st.cls}`}>{st.label}</span>
                      {a.status === 'active' && <ExpiryBadge daysLeft={a.days_left} />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.company_name}{a.scope && <> · {a.scope}</>}
                      {a.doc_number && <> · Số {a.doc_number}</>}
                    </p>
                    <p className="text-2xs text-muted-foreground/70">
                      {fmtDate(a.effective_from)} → {a.effective_to ? fmtDate(a.effective_to) : 'đến khi thu hồi'}
                    </p>
                    <div className="flex gap-1.5">
                      {perms.edit && (
                        <button onClick={() => setEditAuth(a)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Sửa">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => setHistoryFor(a)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Lịch sử">
                        <History className="h-3.5 w-3.5" />
                      </button>
                      {perms.remove && (
                        <button onClick={() => setDeleteAuth(a)} className="p-1.5 text-red-400/60 hover:text-red-400 ml-auto" title="Xóa">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Sổ con dấu ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-600 text-foreground flex items-center gap-2">
              <Stamp className="h-4 w-4 text-amber-400" /> Sổ con dấu ({seals.length})
            </h2>
            {perms.create && (
              <button onClick={() => setNewSeal(true)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-600 text-white flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Ghi sổ
              </button>
            )}
          </div>

          {seals.length === 0 ? (
            <EmptyState icon={<Stamp />} text="Sổ con dấu trống"
              hint="Ghi lại mỗi lượt đóng dấu: ngày, văn bản, người thực hiện" />
          ) : (
            <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
              {seals.map((s) => (
                <div key={s.id} className="flex items-start gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{s.document_desc}</p>
                    <p className="text-2xs text-muted-foreground/70 mt-0.5">
                      {fmtDate(s.used_at)} · {s.used_by} · {s.company_name}
                      {s.note && <> · {s.note}</>}
                    </p>
                  </div>
                  {perms.remove && (
                    <button onClick={() => setDeleteSeal(s)} className="p-1.5 text-red-400/60 hover:text-red-400 shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editAuth && (
        <AuthFormModal auth={editAuth === 'new' ? null : editAuth} companies={companies}
          onClose={() => setEditAuth(null)} onDone={() => { setEditAuth(null); load(); }} />
      )}
      {newSeal && (
        <SealFormModal companies={companies}
          onClose={() => setNewSeal(false)} onDone={() => { setNewSeal(false); load(); }} />
      )}
      {historyFor && (
        <RecordHistoryDrawer entityType="authorization" entityId={historyFor.id}
          title={`${historyFor.grantor} → ${historyFor.grantee}`} apiBase="/api/legal/audit"
          onClose={() => setHistoryFor(null)} />
      )}
      {deleteAuth && (
        <Modal title="Xóa ủy quyền" onClose={() => setDeleteAuth(null)}>
          <p className="text-sm text-foreground">Xóa ủy quyền <b>{deleteAuth.grantor} → {deleteAuth.grantee}</b>?</p>
          <DeleteFooter url={`/api/legal/authorizations?id=${deleteAuth.id}`}
            onClose={() => setDeleteAuth(null)} onDone={() => { setDeleteAuth(null); load(); }} />
        </Modal>
      )}
      {deleteSeal && (
        <Modal title="Xóa dòng sổ con dấu" onClose={() => setDeleteSeal(null)}>
          <p className="text-sm text-foreground">Xóa dòng <b>{deleteSeal.document_desc}</b> (ghi nhầm)?</p>
          <DeleteFooter url={`/api/legal/seal-logs?id=${deleteSeal.id}`}
            onClose={() => setDeleteSeal(null)} onDone={() => { setDeleteSeal(null); load(); }} />
        </Modal>
      )}
    </div>
  );
}

function AuthFormModal({ auth, companies, onClose, onDone }: {
  auth: Auth | null; companies: Company[]; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({
    companyId: auth?.company_id ?? '',
    grantor: auth?.grantor ?? '',
    grantee: auth?.grantee ?? '',
    scope: auth?.scope ?? '',
    docNumber: auth?.doc_number ?? '',
    effectiveFrom: auth?.effective_from?.slice(0, 10) ?? '',
    effectiveTo: auth?.effective_to?.slice(0, 10) ?? '',
    status: auth?.status ?? 'active',
    note: auth?.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.companyId) { setErr('Chọn công ty'); return; }
    if (!form.grantor.trim() || !form.grantee.trim()) { setErr('Nhập người ủy quyền và người được ủy quyền'); return; }
    setSaving(true); setErr('');
    try {
      const isNew = !auth;
      const res = await fetch('/api/legal/authorizations', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : {
          id: auth!.id, company_id: form.companyId, grantor: form.grantor, grantee: form.grantee,
          scope: form.scope, doc_number: form.docNumber,
          effective_from: form.effectiveFrom, effective_to: form.effectiveTo,
          status: form.status, note: form.note,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi lưu'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal title={auth ? 'Sửa ủy quyền' : 'Thêm ủy quyền'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Công ty *">
          <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className={inputCls}>
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Người ủy quyền *">
            <input value={form.grantor} onChange={(e) => setForm({ ...form, grantor: e.target.value })}
              placeholder="VD: TGĐ Nguyễn Văn A" className={inputCls} />
          </Field>
          <Field label="Người được ủy quyền *">
            <input value={form.grantee} onChange={(e) => setForm({ ...form, grantee: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Field label="Phạm vi ủy quyền">
          <input value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}
            placeholder="VD: Ký hợp đồng mua bán ≤ 500 triệu" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hiệu lực từ">
            <input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Hiệu lực đến" hint="Trống = đến khi thu hồi">
            <input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Số văn bản">
            <input value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} className={inputCls} />
          </Field>
          {auth && (
            <Field label="Trạng thái">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                <option value="active">Hiệu lực</option>
                <option value="expired">Hết hạn</option>
                <option value="revoked">Đã thu hồi</option>
              </select>
            </Field>
          )}
        </div>
        <Field label="Ghi chú">
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
        </Field>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={auth ? 'Lưu' : 'Thêm'} />
    </Modal>
  );
}

function SealFormModal({ companies, onClose, onDone }: {
  companies: Company[]; onClose: () => void; onDone: () => void;
}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const [form, setForm] = useState({ companyId: '', usedAt: today, documentDesc: '', usedBy: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.companyId) { setErr('Chọn công ty'); return; }
    if (!form.documentDesc.trim()) { setErr('Nhập văn bản được đóng dấu'); return; }
    if (!form.usedBy.trim()) { setErr('Nhập người thực hiện'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/legal/seal-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Lỗi lưu'); return; }
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Ghi sổ con dấu" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Công ty *">
            <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className={inputCls}>
              <option value="">— Chọn —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Ngày sử dụng *">
            <input type="date" value={form.usedAt} onChange={(e) => setForm({ ...form, usedAt: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Field label="Văn bản được đóng dấu *">
          <input value={form.documentDesc} onChange={(e) => setForm({ ...form, documentDesc: e.target.value })}
            placeholder="VD: Hợp đồng số 12/2026/HĐMB" className={inputCls} autoFocus />
        </Field>
        <Field label="Người thực hiện *">
          <input value={form.usedBy} onChange={(e) => setForm({ ...form, usedBy: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Ghi chú">
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
        </Field>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Ghi sổ" />
    </Modal>
  );
}
