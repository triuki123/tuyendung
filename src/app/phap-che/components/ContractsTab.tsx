'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Handshake, Plus, Search, History, Trash2, Paperclip, Pencil, Lock } from 'lucide-react';
import RecordHistoryDrawer from '@/components/ui/RecordHistoryDrawer';
import LockManageModal, { canManageBmhsClient } from './LockManageModal';
import MoneyInput from '@/components/ui/MoneyInput';
import { formatVND } from '@/lib/format';
import {
  inputCls, fmtDate, ExpiryBadge, Field, Modal, ModalFooter, CompanyFilter, EmptyState,
  type Company, type LegalPerms,
} from './shared';
import { DeleteFooter, FilesModal } from './DocumentsTab';

interface Contract {
  id: string; company_id: string; company_name: string | null;
  partner_name: string; partner_tax_code: string | null;
  title: string; contract_number: string | null;
  value: number | null;
  signed_date: string | null; effective_from: string | null; effective_to: string | null;
  status: string; owner_id: string | null; owner_name: string | null;
  note: string | null; days_left: number | null; file_count: number;
  locked: boolean;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:      { label: 'Nháp',        cls: 'bg-slate-500/15 text-muted-foreground' },
  active:     { label: 'Hiệu lực',    cls: 'bg-emerald-500/15 text-emerald-400' },
  expired:    { label: 'Hết hạn',     cls: 'bg-red-500/15 text-red-400' },
  liquidated: { label: 'Đã thanh lý', cls: 'bg-sky-500/15 text-sky-400' },
  terminated: { label: 'Chấm dứt',    cls: 'bg-orange-500/15 text-orange-400' },
};

/** Tab Hợp đồng thương mại — vòng đời trạng thái (v1 không duyệt phân cấp). */
export default function ContractsTab({ companies, perms }: { companies: Company[]; perms: LegalPerms }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [edit, setEdit] = useState<Contract | 'new' | null>(null);
  const [filesFor, setFilesFor] = useState<Contract | null>(null);
  const [historyFor, setHistoryFor] = useState<Contract | null>(null);
  const [deleteFor, setDeleteFor] = useState<Contract | null>(null);
  const [lockFor, setLockFor] = useState<Contract | null>(null);
  const canLock = canManageBmhsClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch('/api/legal/contracts').then((r) => r.json());
      setContracts(j.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (companyFilter && c.company_id !== companyFilter) return false;
      if (q && !`${c.title} ${c.partner_name} ${c.contract_number ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [contracts, search, companyFilter]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{contracts.length} hợp đồng</p>
        {perms.create && (
          <button onClick={() => setEdit('new')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 justify-center">
            <Plus className="h-4 w-4" /> Thêm hợp đồng
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, đối tác, số hợp đồng..." className={`${inputCls} pl-9`} />
        </div>
        <CompanyFilter companies={companies} value={companyFilter} onChange={setCompanyFilter} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Handshake />}
          text={contracts.length === 0 ? 'Chưa có hợp đồng nào' : 'Không tìm thấy hợp đồng phù hợp'}
          hint={contracts.length === 0 ? 'Bấm "Thêm hợp đồng" để theo dõi hợp đồng với đối tác' : 'Thử đổi từ khóa hoặc bộ lọc'} />
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
          {filtered.map((c) => {
            const st = STATUS_META[c.status] ?? STATUS_META.draft;
            return (
              <div key={c.id} className="p-4 space-y-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-600 text-foreground">{c.title}</p>
                    <span className={`px-1.5 py-0.5 rounded text-2xs font-600 ${st.cls}`}>{st.label}</span>
                    {c.locked && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-600 bg-amber-500/15 text-amber-400">
                        <Lock className="h-3 w-3" /> BMHS
                      </span>
                    )}
                    {c.status === 'active' && <ExpiryBadge daysLeft={c.days_left} />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <b className="text-foreground/90">{c.company_name ?? '—'}</b> ↔ {c.partner_name}
                    {c.contract_number && <> · Số {c.contract_number}</>}
                    {c.value != null && <> · <b className="text-amber-400">{formatVND(c.value)}</b></>}
                  </p>
                  <p className="text-2xs text-muted-foreground/70 mt-0.5">
                    Hiệu lực {fmtDate(c.effective_from)} → {c.effective_to ? fmtDate(c.effective_to) : 'không thời hạn'}
                    {c.owner_name && <> · Phụ trách: {c.owner_name}</>}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => setFilesFor(c)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5">
                    <Paperclip className="h-3.5 w-3.5 text-amber-400" /> Tệp ({c.file_count})
                  </button>
                  {perms.edit && (
                    <button onClick={() => setEdit(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5">
                      <Pencil className="h-3.5 w-3.5 text-indigo-400" /> Sửa / đổi trạng thái
                    </button>
                  )}
                  <button onClick={() => setHistoryFor(c)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground hover:bg-white/5">
                    <History className="h-3.5 w-3.5" /> Lịch sử
                  </button>
                  {canLock && (
                    <button onClick={() => setLockFor(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-amber-400/80 hover:text-amber-400 hover:bg-amber-500/10">
                      <Lock className="h-3.5 w-3.5" /> {c.locked ? 'Khóa' : 'Đặt khóa'}
                    </button>
                  )}
                  {perms.remove && (
                    <button onClick={() => setDeleteFor(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-2xs font-600 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 ml-auto">
                      <Trash2 className="h-3.5 w-3.5" /> Xóa
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <ContractFormModal contract={edit === 'new' ? null : edit} companies={companies}
          onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />
      )}
      {filesFor && (
        <FilesModal
          title={`Tệp đính kèm — ${filesFor.title}`}
          listUrl={`/api/legal/contracts/${filesFor.id}/files`}
          uploadUrl={`/api/legal/contracts/${filesFor.id}/files`}
          fileUrlOf={(id) => `/api/legal/files/${id}?scope=contract`}
          deleteUrlOf={(id) => `/api/legal/files/${id}?scope=contract`}
          canEdit={perms.edit} canDelete={perms.remove}
          onClose={() => { setFilesFor(null); load(); }} />
      )}
      {historyFor && (
        <RecordHistoryDrawer entityType="contract" entityId={historyFor.id}
          title={historyFor.title} apiBase="/api/legal/audit" onClose={() => setHistoryFor(null)} />
      )}
      {lockFor && (
        <LockManageModal entityType="contract" entityId={lockFor.id} title={lockFor.title}
          locked={lockFor.locked} onClose={() => setLockFor(null)}
          onDone={() => { setLockFor(null); load(); }} />
      )}
      {deleteFor && (
        <Modal title="Xóa hợp đồng" onClose={() => setDeleteFor(null)}>
          <p className="text-sm text-foreground">
            Xóa <b>{deleteFor.title}</b> và toàn bộ tệp đính kèm? Không khôi phục được.
          </p>
          <DeleteFooter url={`/api/legal/contracts?id=${deleteFor.id}`}
            onClose={() => setDeleteFor(null)} onDone={() => { setDeleteFor(null); load(); }} />
        </Modal>
      )}
    </div>
  );
}

function ContractFormModal({ contract, companies, onClose, onDone }: {
  contract: Contract | null; companies: Company[]; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({
    companyId: contract?.company_id ?? '',
    partnerName: contract?.partner_name ?? '',
    partnerTaxCode: contract?.partner_tax_code ?? '',
    title: contract?.title ?? '',
    contractNumber: contract?.contract_number ?? '',
    value: contract?.value ?? null as number | null,
    signedDate: contract?.signed_date?.slice(0, 10) ?? '',
    effectiveFrom: contract?.effective_from?.slice(0, 10) ?? '',
    effectiveTo: contract?.effective_to?.slice(0, 10) ?? '',
    status: contract?.status ?? 'draft',
    note: contract?.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.companyId) { setErr('Chọn công ty ký'); return; }
    if (!form.partnerName.trim()) { setErr('Nhập tên đối tác'); return; }
    if (!form.title.trim()) { setErr('Nhập tiêu đề'); return; }
    setSaving(true); setErr('');
    try {
      const isNew = !contract;
      const res = await fetch('/api/legal/contracts', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : {
          id: contract!.id, company_id: form.companyId,
          partner_name: form.partnerName, partner_tax_code: form.partnerTaxCode,
          title: form.title, contract_number: form.contractNumber,
          value: form.value, signed_date: form.signedDate,
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
    <Modal title={contract ? 'Sửa hợp đồng' : 'Thêm hợp đồng'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Công ty ký *">
          <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className={inputCls}>
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Đối tác *">
          <input value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Tiêu đề *">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Hợp đồng cung cấp dịch vụ vận chuyển 2026" className={inputCls} />
          </Field>
        </div>
        <Field label="Số hợp đồng">
          <input value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} className={inputCls} />
        </Field>
        <Field label="MST đối tác">
          <input value={form.partnerTaxCode} onChange={(e) => setForm({ ...form, partnerTaxCode: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Giá trị hợp đồng (đ)">
          {/* MoneyInput: onValueChange trả SỐ NGUYÊN ĐỒNG — đúng quy tắc tiền của dự án */}
          <MoneyInput value={form.value ?? ''} onValueChange={(n) => setForm({ ...form, value: n || null })}
            className={inputCls} placeholder="0" />
        </Field>
        <Field label="Ngày ký">
          <input type="date" value={form.signedDate} onChange={(e) => setForm({ ...form, signedDate: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Hiệu lực từ">
          <input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Hiệu lực đến" hint="Để trống = không thời hạn">
          <input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Trạng thái">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
            <option value="draft">Nháp</option>
            <option value="active">Hiệu lực</option>
            <option value="expired">Hết hạn</option>
            <option value="liquidated">Đã thanh lý</option>
            <option value="terminated">Chấm dứt</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Ghi chú">
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>
      {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={contract ? 'Lưu' : 'Thêm'} />
    </Modal>
  );
}
