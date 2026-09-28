'use client';

import DateInputVN from '@/components/ui/DateInputVN';

import { useEffect, useRef, useState } from 'react';
import { X, Loader2, Paperclip, Trash2, Download, Wand2 } from 'lucide-react';
import EmployeePicker from './EmployeePicker';
import MultiUserPicker from './MultiUserPicker';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useToast } from '@/context/ToastContext';
import {
  Contract, LookupItem, UserOption, AttachmentMeta, EmploymentType,
  createContract, updateContract, renewContract,
  listContractAttachments, uploadContractAttachments, deleteContractAttachment,
  addContractWatcher, fmtBytes,
  generateContractCode, suggestedContractTypes, listEmploymentTypes,
} from './hrApi';

type Mode = 'create' | 'edit' | 'renew';

interface Props {
  mode: Mode;
  contract?: Contract | null;
  contractTypes: LookupItem[];
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = [
  { value: 'draft',           label: 'Nháp (chỉ C&B thấy)' },
  { value: 'pending_signing', label: 'Chờ ký' },
  { value: 'active',         label: 'Đang hiệu lực' },
  { value: 'renewed',        label: 'Đã gia hạn' },
  { value: 'terminated',     label: 'Đã chấm dứt' },
];

export default function ContractFormModal({ mode, contract, contractTypes, onClose, onSaved }: Props) {
  const isEdit = mode === 'edit';
  const isRenew = mode === 'renew';

  const toast = useToast();
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  const [employee, setEmployee] = useState<UserOption | null>(
    contract ? { id: contract.employee_id, name: contract.employee_name || 'Nhân viên' } : null
  );
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>([]);
  useEffect(() => { listEmploymentTypes().then(setEmploymentTypes).catch(() => toast.error('Không tải được danh sách hình thức làm việc, vui lòng thử lại')); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const [form, setForm] = useState({
    contract_type_id: contract?.contract_type_id || '',
    employment_type_id: contract?.employment_type_id || '',
    contract_number: isRenew ? '' : contract?.contract_number || '',
    sign_date: isRenew ? '' : contract?.sign_date || '',
    start_date: isRenew ? '' : contract?.start_date || '',
    end_date: isRenew ? '' : contract?.end_date || '',
    salary_info: contract?.salary_info || '',
    notes: '',
    status: contract?.status || 'active',
  });
  const [watchers, setWatchers] = useState<UserOption[]>([]);
  const [coHandlers, setCoHandlers] = useState<UserOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [suggestedIds, setSuggestedIds] = useState<string[]>([]);
  const autoGenDone = useRef(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Sinh mã hợp đồng theo template của loại HĐ + công ty của nhân viên.
  async function handleGenerateCode() {
    if (!employee || !form.contract_type_id) {
      setError('Chọn nhân viên và loại hợp đồng trước khi sinh mã');
      return;
    }
    setError('');
    setGenLoading(true);
    try {
      const code = await generateContractCode(form.contract_type_id, employee.id);
      set('contract_number', code);
    } catch (e: any) {
      setError(e.message || 'Không sinh được mã');
    } finally {
      setGenLoading(false);
    }
  }

  // Gợi ý loại HĐ phù hợp theo hình thức làm việc của nhân viên (mode create).
  useEffect(() => {
    if (mode !== 'create' || !employee) { setSuggestedIds([]); return; }
    suggestedContractTypes(employee.id).then((list) => setSuggestedIds(list.map((c) => c.id))).catch(() => setSuggestedIds([]));
  }, [mode, employee]);

  // Tự sinh mã 1 lần khi đã đủ nhân viên + loại HĐ và ô số HĐ đang trống (mode create).
  useEffect(() => {
    if (mode !== 'create' || autoGenDone.current) return;
    if (employee && form.contract_type_id && !form.contract_number.trim()) {
      autoGenDone.current = true;
      handleGenerateCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, form.contract_type_id]);

  // Sắp xếp loại HĐ: nhóm "phù hợp" lên đầu (mode create).
  const orderedTypes = mode === 'create' && suggestedIds.length > 0
    ? [...contractTypes].sort((a, b) => {
        const sa = suggestedIds.includes(a.id) ? 0 : 1;
        const sb = suggestedIds.includes(b.id) ? 0 : 1;
        return sa - sb;
      })
    : contractTypes;

  async function handleSubmit() {
    setError('');
    if (mode === 'create' && !employee) return setError('Vui lòng chọn nhân viên');
    if (!form.contract_number.trim()) return setError('Vui lòng nhập số hợp đồng');
    setSaving(true);
    try {
      const payload = {
        contract_type_id: form.contract_type_id || null,
        employment_type_id: form.employment_type_id || null,
        contract_number: form.contract_number,
        sign_date: form.sign_date || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        salary_info: form.salary_info || null,
        notes: form.notes || null,
      };
      if (mode === 'create') {
        const created = await createContract({ ...payload, employee_id: employee!.id, status: form.status });
        // Thêm watchers + Người Đồng Phụ Trách sau khi tạo xong
        for (const w of watchers) {
          try { await addContractWatcher(created.id, w.id); } catch { /* noop */ }
        }
        for (const c of coHandlers) {
          try { await addContractWatcher(created.id, c.id, 'co_handler'); } catch { /* noop */ }
        }
      } else if (isEdit) {
        await updateContract(contract!.id, { ...payload, status: form.status });
      } else {
        await renewContract(contract!.id, payload);
      }
      markClean();
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Lỗi khi lưu');
    } finally {
      setSaving(false);
    }
  }

  const title = mode === 'create' ? 'Thêm hợp đồng' : isRenew ? 'Gia hạn hợp đồng' : 'Sửa hợp đồng';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={guardedClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-line overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()} onChange={markDirty}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-base font-700 text-foreground">{title}</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {isRenew && contract && (
            <p className="text-xs text-amber-400">
              Gia hạn từ HĐ {contract.contract_number}. Hệ thống sẽ tạo hợp đồng mới và đánh dấu HĐ cũ là "Đã gia hạn".
            </p>
          )}

          <Field label="Nhân viên">
            {mode === 'create' ? (
              <EmployeePicker value={employee} onChange={setEmployee} />
            ) : (
              <div className="rounded-xl border border-line px-3 py-2 text-sm text-muted-foreground" style={{ background: 'var(--input)' }}>
                {employee?.name}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Số hợp đồng *">
              <div className="flex gap-2">
                <input value={form.contract_number} onChange={(e) => set('contract_number', e.target.value)}
                  className="hr-input flex-1" placeholder="VD: 2206.01/2026/TTHT-PS" />
                {mode === 'create' && (
                  <button type="button" onClick={handleGenerateCode} disabled={genLoading || !employee || !form.contract_type_id}
                    title={!employee || !form.contract_type_id ? 'Chọn nhân viên và loại HĐ trước' : 'Sinh mã theo template'}
                    className="shrink-0 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-3 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40 flex items-center gap-1.5">
                    {genLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Sinh mã
                  </button>
                )}
              </div>
            </Field>
            <Field label="Loại hợp đồng">
              <select value={form.contract_type_id} onChange={(e) => set('contract_type_id', e.target.value)} className="hr-input">
                <option value="">— Chọn loại —</option>
                {orderedTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{mode === 'create' && suggestedIds.includes(t.id) ? ' — phù hợp' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Hình thức làm việc">
            <select value={form.employment_type_id} onChange={(e) => set('employment_type_id', e.target.value)} className="hr-input">
              <option value="">— Không gắn —</option>
              {employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <p className="text-2xs text-muted-foreground mt-1">Hình thức làm việc mà hợp đồng này áp dụng (vd Chính thức - Toàn thời gian). HĐ tự sinh sau thử việc đã gắn sẵn.</p>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Ngày ký"><DateInputVN value={form.sign_date || ''} onChange={(e) => set('sign_date', e.target.value)} className="hr-input" /></Field>
            <Field label="Ngày bắt đầu"><DateInputVN value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} className="hr-input" /></Field>
            <Field label="Ngày hết hạn"><DateInputVN value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} className="hr-input" /></Field>
          </div>
          <p className="text-2xs text-muted-foreground -mt-2">Để trống "Ngày hết hạn" nếu là hợp đồng không xác định thời hạn (sẽ không nhắc gia hạn).</p>

          <Field label="Mức lương / Chế độ">
            <textarea value={form.salary_info} onChange={(e) => set('salary_info', e.target.value)} rows={2}
              className="hr-input resize-none" placeholder="VD: 15.000.000đ/tháng + phụ cấp ăn trưa…" />
          </Field>

          <Field label={isRenew ? 'Ghi chú gia hạn' : 'Ghi chú'}>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="hr-input resize-none" />
          </Field>

          {(mode === 'create' || isEdit) && (
            <Field label="Trạng thái">
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className="hr-input">
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          )}

          {mode === 'create' && (
            <Field label="Người theo dõi (tuỳ chọn)">
              <MultiUserPicker
                value={watchers}
                onChange={setWatchers}
                excludeIds={employee ? [employee.id] : []}
                placeholder="Thêm người theo dõi hợp đồng này…"
              />
              <p className="text-2xs text-muted-foreground mt-1">Họ sẽ nhận thông báo khi hợp đồng thay đổi trạng thái.</p>
            </Field>
          )}

          {mode === 'create' && (
            <Field label="Người Đồng Phụ Trách (tuỳ chọn)">
              <MultiUserPicker
                value={coHandlers}
                onChange={setCoHandlers}
                excludeIds={employee ? [employee.id] : []}
                placeholder="Thêm người đồng phụ trách hồ sơ này…"
              />
              <p className="text-2xs text-muted-foreground mt-1">Nếu hồ sơ chưa hoàn thành sau nhiều lần nhắc, hệ thống tự báo cáo lên quản lý của họ.</p>
            </Field>
          )}

          {isEdit && contract && <AttachmentManager contractId={contract.id} />}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isRenew ? 'Tạo hợp đồng gia hạn' : 'Lưu'}
          </button>
        </div>
      </div>
      <style jsx global>{`
        .hr-input {
          width: 100%; border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.1);
          background: var(--input); padding: 0.5rem 0.75rem; font-size: 0.875rem; color: var(--foreground);
          outline: none;
        }
        .hr-input:focus { border-color: rgb(99 102 241); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function AttachmentManager({ contractId }: { contractId: string }) {
  const [items, setItems] = useState<AttachmentMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try { setItems(await listContractAttachments(contractId)); } catch { /* noop */ }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [contractId]);

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try { await uploadContractAttachments(contractId, files); await refresh(); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line-subtle p-3">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">Tệp đính kèm</span>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />} Tải lên
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onUpload(e.target.files)} />
      </div>
      {items.length === 0 ? (
        <p className="text-2xs text-muted-foreground">Chưa có tệp.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs text-foreground">
              <span className="truncate">{a.file_name} <span className="text-muted-foreground">{fmtBytes(a.size_bytes)}</span></span>
              <span className="flex items-center gap-2 shrink-0">
                <a href={`/api/contracts/attachments/${a.id}?download=1`} className="text-muted-foreground hover:text-foreground"><Download className="h-3.5 w-3.5" /></a>
                <button type="button" onClick={async () => { await deleteContractAttachment(a.id); refresh(); }}
                  className="text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
