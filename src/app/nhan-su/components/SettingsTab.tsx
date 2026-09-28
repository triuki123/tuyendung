'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import {
  LookupItem,
  EmploymentType,
  listLookup, createLookup, updateLookup, deleteLookup,
  listEmploymentTypes, createEmploymentType, updateEmploymentType, deleteEmploymentType,
  getEmpTypeContractTypes, setEmpTypeContractTypes,
  EmploymentTransition,
  listEmploymentTransitions, createEmploymentTransition, updateEmploymentTransition, deleteEmploymentTransition,
} from './hrApi';
import { DEFAULT_CODE_TEMPLATE, previewContractCode } from './contractCodePreview';
import HrNotifyRecipientsPanel from './HrNotifyRecipientsPanel';
import ConfigReminderRecipientLens from '@/components/config/ConfigReminderRecipientLens';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

export default function SettingsTab() {
  return (
    <div className="space-y-6">
      <HrNotifyRecipientsPanel />
      <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
        <h3 className="text-base font-600 text-foreground mb-3">Nhắc nhở &amp; người nhận hợp đồng / đánh giá</h3>
        <ConfigReminderRecipientLens
          reminderTypes={['contract', 'evaluation']}
          recipientTypes={['evaluation']}
        />
      </div>
      <ContractTypeEditor />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LookupEditor kind="hr-document-types" title="Loại hồ sơ nhân sự" />
      </div>
      <EmploymentTypeEditor />
      <TransitionEditor />
    </div>
  );
}

// ── Luồng chuyển tiếp sau thử việc ────────────────────────────────────────────
function TransitionEditor() {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<EmploymentTransition[]>([]);
  const [empTypes, setEmpTypes] = useState<EmploymentType[]>([]);
  const [cts, setCts] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCts, setEditCts] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    try { setItems(await listEmploymentTransitions()); } finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    listEmploymentTypes(true).then(setEmpTypes).catch(() => toast.error('Không tải được danh sách hình thức làm việc, vui lòng thử lại'));
    listLookup('contract-types', false).then(setCts).catch(() => toast.error('Không tải được danh sách loại hợp đồng, vui lòng thử lại'));
    /* eslint-disable-next-line */
  }, []);

  async function add() {
    if (!fromId || !toId) return;
    setSaving(true);
    try { await createEmploymentTransition(fromId, toId); setShowAdd(false); setFromId(''); setToId(''); await load(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }
  function startEditCts(t: EmploymentTransition) { setEditId(t.id); setEditCts(t.contract_types.map((c) => c.id)); }
  function toggle(id: string) { setEditCts((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); }
  async function saveCts(id: string) {
    setSaving(true);
    try { await updateEmploymentTransition(id, { contract_type_ids: editCts }); setEditId(null); await load(); }
    finally { setSaving(false); }
  }
  async function toggleActive(t: EmploymentTransition) { await updateEmploymentTransition(t.id, { is_active: !t.is_active }); load(); }
  async function del(t: EmploymentTransition) {
    if (await confirm({ title: 'Xoá luồng?', message: `Xoá luồng "${t.from_employment_type_name} → ${t.to_employment_type_name}"?`, confirmLabel: 'Xoá', danger: true })) { await deleteEmploymentTransition(t.id); load(); }
  }

  const activeTypes = empTypes.filter((t) => t.is_active);

  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-600 text-foreground">Luồng chuyển tiếp sau thử việc</h3>
        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setFromId(''); setToId(''); }}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs text-white flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Thêm luồng
          </button>
        )}
      </div>
      <p className="text-2xs text-muted-foreground mb-3">
        Khi đánh giá thử việc <b>ĐẠT</b>: chuyển nhân viên sang hình thức đích & <b>tự sinh các hợp đồng nháp</b> gán dưới đây.
        Tách biệt với cấu hình Onboarding.
      </p>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div className="space-y-1">
              <label className="text-2xs text-muted-foreground uppercase tracking-wider">Từ hình thức (thử việc)</label>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500" style={{ background: 'var(--input)' }}>
                <option value="">— Chọn —</option>
                {activeTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <span className="text-muted-foreground pb-2 text-center hidden sm:block">→</span>
            <div className="space-y-1">
              <label className="text-2xs text-muted-foreground uppercase tracking-wider">Đến hình thức (chính thức)</label>
              <select value={toId} onChange={(e) => setToId(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500" style={{ background: 'var(--input)' }}>
                <option value="">— Chọn —</option>
                {activeTypes.filter((t) => t.id !== fromId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="btn-ghost rounded-xl px-3 py-1.5 text-sm">Hủy</button>
            <button onClick={add} disabled={saving || !fromId || !toId}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 text-sm text-white disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Tạo luồng
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t) => (
            <li key={t.id} className={`rounded-lg px-3 py-2.5 ${!t.is_active ? 'opacity-50' : ''}`} style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-foreground font-500">{t.from_employment_type_name} <span className="text-indigo-400">→</span> {t.to_employment_type_name}</span>
                  {!t.is_active && <span className="ml-2 text-2xs text-muted-foreground">(tắt)</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleActive(t)} className="text-2xs px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground border border-line">{t.is_active ? 'Tắt' : 'Bật'}</button>
                  <button onClick={() => del(t)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {editId === t.id ? (
                <div className="mt-2 space-y-2">
                  <p className="text-2xs text-muted-foreground uppercase tracking-wider">Loại hợp đồng tự sinh khi ĐẠT</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cts.length === 0 ? <span className="text-2xs text-muted-foreground">Chưa có loại hợp đồng nào.</span> : cts.map((ct) => {
                      const on = editCts.includes(ct.id);
                      return (
                        <button key={ct.id} type="button" onClick={() => toggle(ct.id)}
                          className={`rounded-full px-2.5 py-1 text-2xs border transition flex items-center gap-1 ${on ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:text-foreground'}`}>
                          {on && <Check className="h-3 w-3" />}{ct.name}{ct.code && <span className="font-mono opacity-70">({ct.code})</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="btn-ghost rounded-xl px-3 py-1.5 text-sm">Hủy</button>
                    <button onClick={() => saveCts(t.id)} disabled={saving}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 text-sm text-white disabled:opacity-50 flex items-center gap-1.5">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Lưu
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  {t.contract_types.length === 0
                    ? <span className="text-2xs text-amber-400">Chưa gán loại HĐ nào → khi đạt sẽ sinh HĐ mặc định</span>
                    : t.contract_types.map((c) => <span key={c.id} className="text-2xs rounded-full px-2 py-0.5 bg-indigo-500/15 text-indigo-300">{c.name}</span>)}
                  <button onClick={() => startEditCts(t)} className="text-2xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"><Pencil className="h-3 w-3" /> Sửa loại HĐ</button>
                </div>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="text-xs text-muted-foreground text-center py-4">Chưa có luồng chuyển tiếp. Thêm để tự động hoá khi đạt thử việc.</li>}
        </ul>
      )}
    </div>
  );
}

// ── Hình Thức Làm Việc ────────────────────────────────────────────────────────
function EmploymentTypeEditor() {
  const toast = useToast();
  const [items, setItems] = useState<EmploymentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [requiresEval, setRequiresEval] = useState(false);
  const [saving, setSaving] = useState(false);

  // Loại hợp đồng áp dụng (mapping many-to-many)
  const [contractTypes, setContractTypes] = useState<LookupItem[]>([]);
  const [selectedCt, setSelectedCt] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    try { setItems(await listEmploymentTypes(true)); } finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    listLookup('contract-types', false).then(setContractTypes).catch(() => toast.error('Không tải được danh sách loại hợp đồng, vui lòng thử lại'));
    /* eslint-disable-next-line */
  }, []);

  async function startEdit(it: EmploymentType) {
    setEditingId(it.id);
    setName(it.name);
    setDurationDays(it.default_duration_days?.toString() ?? '');
    setRequiresEval(it.requires_evaluation);
    setShowAdd(false);
    setSelectedCt([]);
    try {
      const mapped = await getEmpTypeContractTypes(it.id);
      setSelectedCt(mapped.map((m) => m.id));
    } catch { /* noop */ }
  }

  function cancelEdit() { setEditingId(null); setShowAdd(false); resetForm(); }
  function resetForm() { setName(''); setDurationDays(''); setRequiresEval(false); setSelectedCt([]); }

  function toggleCt(id: string) {
    setSelectedCt((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        default_duration_days: durationDays ? Number(durationDays) : null,
        requires_evaluation: requiresEval,
      };
      let targetId = editingId;
      if (editingId) {
        await updateEmploymentType(editingId, payload);
      } else {
        const created = await createEmploymentType(payload);
        targetId = created.id;
      }
      if (targetId) {
        try { await setEmpTypeContractTypes(targetId, selectedCt); } catch { /* noop */ }
      }
      setEditingId(null);
      setShowAdd(false);
      resetForm();
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không lưu được hình thức làm việc'); } finally { setSaving(false); }
  }

  async function handleDeactivate(it: EmploymentType) {
    await deleteEmploymentType(it.id);
    load();
  }

  async function handleRestore(it: EmploymentType) {
    await updateEmploymentType(it.id, { is_active: true });
    load();
  }

  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-600 text-foreground">Hình thức làm việc</h3>
        {!showAdd && !editingId && (
          <button onClick={() => { setShowAdd(true); resetForm(); }}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs text-white flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Thêm
          </button>
        )}
      </div>

      {/* Form thêm / sửa */}
      {(showAdd || editingId) && (
        <div className="mb-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2.5">
          <p className="text-xs font-600 text-indigo-400">{editingId ? 'Sửa hình thức' : 'Thêm hình thức mới'}</p>
          <div className="space-y-1">
            <label className="text-2xs text-muted-foreground uppercase tracking-wider">Tên *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="VD: Cộng tác viên"
              className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-2xs text-muted-foreground uppercase tracking-wider">Thời hạn mặc định (ngày)</label>
              <input type="number" min="1" max="365" value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="Bỏ trống = vô thời hạn"
                className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
                style={{ background: 'var(--input)' }} />
            </div>
            <div className="flex flex-col justify-end space-y-1 pb-0.5">
              <label className="text-2xs text-muted-foreground uppercase tracking-wider">Cần đánh giá</label>
              <button type="button" onClick={() => setRequiresEval((v) => !v)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${requiresEval ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-line text-muted-foreground'}`}>
                <span className={`h-4 w-4 rounded flex items-center justify-center ${requiresEval ? 'bg-indigo-500' : 'border border-line-strong'}`}>
                  {requiresEval && <Check className="h-3 w-3 text-white" />}
                </span>
                {requiresEval ? 'Có' : 'Không'}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-2xs text-muted-foreground uppercase tracking-wider">Loại hợp đồng áp dụng</label>
            <p className="text-2xs text-muted-foreground">Dùng để gợi ý khi tạo HĐ và tự sinh nháp lúc onboarding. Chọn nhiều loại.</p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {contractTypes.length === 0 ? (
                <span className="text-2xs text-muted-foreground">Chưa có loại hợp đồng nào.</span>
              ) : contractTypes.map((ct) => {
                const on = selectedCt.includes(ct.id);
                return (
                  <button key={ct.id} type="button" onClick={() => toggleCt(ct.id)}
                    className={`rounded-full px-2.5 py-1 text-2xs border transition flex items-center gap-1 ${on ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:text-foreground'}`}>
                    {on && <Check className="h-3 w-3" />}{ct.name}
                    {ct.code && <span className="font-mono opacity-70">({ct.code})</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={cancelEdit} className="btn-ghost rounded-xl px-3 py-1.5 text-sm">Hủy</button>
            <button onClick={handleSave} disabled={saving || !name.trim()}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 text-sm text-white disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Lưu
            </button>
          </div>
        </div>
      )}

      {/* Danh sách */}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${editingId === it.id ? 'bg-indigo-500/10 border border-indigo-500/30' : ''} ${!it.is_active ? 'opacity-40' : ''}`}
              style={{ background: editingId === it.id ? undefined : 'rgba(255,255,255,0.03)' }}>
              <div className="min-w-0 flex-1">
                <span className="text-foreground font-500">{it.name}</span>
                <div className="flex gap-2 mt-0.5">
                  {it.default_duration_days && (
                    <span className="text-2xs text-muted-foreground">{it.default_duration_days} ngày</span>
                  )}
                  {it.requires_evaluation && (
                    <span className="text-2xs rounded-full px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400">Cần đánh giá</span>
                  )}
                  {!it.default_duration_days && !it.requires_evaluation && (
                    <span className="text-2xs text-muted-foreground">Vô thời hạn</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                {it.is_active && editingId !== it.id && (
                  <button onClick={() => startEdit(it)}
                    className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {it.is_active ? (
                  <button onClick={() => handleDeactivate(it)}
                    className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button onClick={() => handleRestore(it)}
                    className="text-2xs px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground border border-line hover:border-line-strong">
                    Khôi phục
                  </button>
                )}
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-xs text-muted-foreground text-center py-4">Chưa có hình thức làm việc</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Loại Hợp Đồng (kèm mã + template sinh mã) ─────────────────────────────────
function ContractTypeEditor() {
  const confirm = useConfirm();
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  // Form sửa inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fCode, setFCode] = useState('');
  const [fTemplate, setFTemplate] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems(await listLookup('contract-types', true)); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add() {
    if (!newName.trim()) return;
    setAdding(true);
    try { await createLookup('contract-types', newName.trim()); setNewName(''); await load(); }
    finally { setAdding(false); }
  }

  function startEdit(it: LookupItem) {
    setEditingId(it.id);
    setFName(it.name);
    setFCode(it.code ?? '');
    setFTemplate(it.code_template ?? '');
  }
  function cancel() { setEditingId(null); }

  async function save() {
    if (!editingId || !fName.trim()) return;
    setSaving(true);
    try {
      await updateLookup('contract-types', editingId, {
        name: fName.trim(),
        code: fCode.trim() || null,
        code_template: fTemplate.trim() || null,
      });
      setEditingId(null);
      await load();
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-600 text-foreground">Loại hợp đồng &amp; mã tự sinh</h3>
      </div>
      <p className="text-2xs text-muted-foreground mb-3">
        Mỗi loại có <b>Mã</b> ngắn (VD: TTHT, NDA) và <b>Template</b> sinh mã. Token:{' '}
        <code>{'{DD}{MM}'}</code> ngày-tháng, <code>{'{YYYY}'}</code>/<code>{'{YY}'}</code> năm,{' '}
        <code>{'{SEQ}'}</code> STT trong ngày, <code>{'{TYPE}'}</code> mã loại, <code>{'{COMPANY}'}</code> mã công ty.
      </p>

      {/* Thêm loại mới (chỉ tên — đặt mã/template ở bước sửa) */}
      <div className="flex gap-2 mb-3">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Thêm loại hợp đồng mới…"
          className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500" style={{ background: 'var(--input)' }} />
        <button onClick={add} disabled={adding}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-white disabled:opacity-50">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className={`rounded-lg px-3 py-2.5 ${it.is_active === false ? 'opacity-40' : ''}`} style={{ background: 'rgba(255,255,255,0.03)' }}>
              {editingId === it.id ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <div className="space-y-1">
                      <label className="text-2xs text-muted-foreground uppercase tracking-wider">Tên *</label>
                      <input value={fName} onChange={(e) => setFName(e.target.value)}
                        className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500" style={{ background: 'var(--input)' }} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-2xs text-muted-foreground uppercase tracking-wider">Mã</label>
                      <input value={fCode} onChange={(e) => setFCode(e.target.value)} placeholder="TTHT"
                        className="w-full sm:w-28 rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500" style={{ background: 'var(--input)' }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-2xs text-muted-foreground uppercase tracking-wider">Template sinh mã</label>
                    <input value={fTemplate} onChange={(e) => setFTemplate(e.target.value)} placeholder={DEFAULT_CODE_TEMPLATE}
                      className="w-full rounded-xl border border-line px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-indigo-500" style={{ background: 'var(--input)' }} />
                    <p className="text-2xs text-muted-foreground">
                      Mẫu: <span className="text-indigo-400 font-mono">{previewContractCode(fTemplate, fCode)}</span>
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancel} className="btn-ghost rounded-xl px-3 py-1.5 text-sm">Hủy</button>
                    <button onClick={save} disabled={saving || !fName.trim()}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 text-sm text-white disabled:opacity-50 flex items-center gap-1.5">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Lưu
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-foreground font-500">{it.name}</span>
                    <div className="flex flex-wrap gap-2 mt-0.5 items-center">
                      {it.code
                        ? <span className="text-2xs rounded-full px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 font-mono">{it.code}</span>
                        : <span className="text-2xs text-amber-400">Chưa có mã</span>}
                      <span className="text-2xs text-muted-foreground font-mono">
                        {previewContractCode(it.code_template ?? '', it.code ?? '')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button onClick={() => startEdit(it)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    {it.is_active !== false && (
                      <button onClick={async () => { if (await confirm({ title: 'Ẩn loại hợp đồng?', message: `Ẩn "${it.name}"?`, confirmLabel: 'Ẩn', danger: true })) { await deleteLookup('contract-types', it.id); load(); } }}
                        className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="text-xs text-muted-foreground text-center py-4">Chưa có loại hợp đồng</li>}
        </ul>
      )}
    </div>
  );
}

// ── Generic Lookup Editor ─────────────────────────────────────────────────────
function LookupEditor({ kind, title }: { kind: 'contract-types' | 'hr-document-types'; title: string }) {
  const confirm = useConfirm();
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems(await listLookup(kind, true)); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    try { await createLookup(kind, name.trim()); setName(''); await load(); }
    finally { setAdding(false); }
  }

  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <h3 className="text-base font-600 text-foreground mb-3">{title}</h3>
      <div className="flex gap-2 mb-3">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Thêm mục mới…"
          className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500" style={{ background: 'var(--input)' }} />
        <button onClick={add} disabled={adding}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-white disabled:opacity-50">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${it.is_active === false ? 'opacity-40' : ''}`} style={{ background: 'rgba(255,255,255,0.03)' }}>
              <span className="text-foreground">{it.name}</span>
              {it.is_active !== false && (
                <button onClick={async () => { if (await confirm({ title: 'Ẩn mục?', message: `Ẩn "${it.name}"?`, confirmLabel: 'Ẩn', danger: true })) { await deleteLookup(kind, it.id); load(); } }}
                  className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

