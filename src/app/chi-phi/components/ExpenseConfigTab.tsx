'use client';

/**
 * Tab Cấu hình Chi Phí (expense.manage): danh mục loại chi phí (flow_type) ·
 * quy tắc duyệt fallback per-company · quy tắc số phiếu per-company.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import MoneyInput from '@/components/ui/MoneyInput';
import { formatVND } from '@/lib/format';
import { useToast } from '@/context/ToastContext';

interface Props { companies: Array<{ id: string; name: string }> }
interface Cat { id: string; code: string; name: string; description: string | null; flow_type: string; company_id: string | null; color: string; active: boolean }
interface Rule { id: string; company_id: string | null; min_amount: number; max_amount: number | null; steps: Array<{ order: number; approver_type: string; approver_value?: string; label?: string }>; active: boolean }
interface Person { id: string; name: string }

const INPUT = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500';
const LABEL = 'block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1';

const FLOW_TYPES = [
  { v: 'operational', l: 'Vận hành (chỉ duyệt)' },
  { v: 'asset_purchase', l: 'Mua tài sản (tự treo tài sản Chờ mua)' },
  { v: 'service', l: 'Dịch vụ / thuê ngoài' },
  { v: 'reimbursement', l: 'Hoàn ứng nhân viên' },
  { v: 'advance', l: 'Tạm ứng (quyết toán sau)' },
];

export default function ExpenseConfigTab({ companies }: Props) {
  const toast = useToast();
  const [cats, setCats] = useState<Cat[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal danh mục
  const [catOpen, setCatOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<Cat | null>(null);
  const [catForm, setCatForm] = useState({ code: '', name: '', description: '', flow_type: 'operational', company_id: '', color: '#6366f1' });
  // Modal rule
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleEdit, setRuleEdit] = useState<Rule | null>(null);
  const [ruleForm, setRuleForm] = useState<{ company_id: string; min_amount: number; max_amount: number | null; steps: Array<{ approver_type: string; approver_value: string; label: string }> }>({ company_id: '', min_amount: 0, max_amount: null, steps: [{ approver_type: 'manager_chain', approver_value: '', label: 'Quản lý trực tiếp' }] });
  // Số phiếu
  const [codeCompany, setCodeCompany] = useState('');
  const [codePattern, setCodePattern] = useState('CP-{YYYY}-{SEQ:5}');
  const [codeResetYearly, setCodeResetYearly] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/expense-categories?all=true'),
        fetch('/api/expense-approval-rules'),
        fetch('/api/users'),
      ]);
      const [j1, j2, j3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
      if (Array.isArray(j1?.data)) setCats(j1.data);
      if (Array.isArray(j2?.data)) setRules(j2.data);
      const arr = Array.isArray(j3) ? j3 : (j3?.data ?? []);
      setPeople(arr.map((u: any) => ({ id: u.id, name: u.name })));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveCat = async () => {
    if (!catForm.name.trim() || (!catEdit && !catForm.code.trim())) { toast.error('Thiếu mã hoặc tên'); return; }
    setSaving(true);
    try {
      const payload = { ...catForm, company_id: catForm.company_id || null, description: catForm.description || null };
      const r = catEdit
        ? await fetch(`/api/expense-categories/${catEdit.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/expense-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) { toast.error(j?.error || 'Lưu thất bại'); return; }
      toast.success('Đã lưu'); setCatOpen(false); void load();
    } finally { setSaving(false); }
  };

  const saveRule = async () => {
    if (!ruleForm.steps.length) { toast.error('Thêm ít nhất 1 bước duyệt'); return; }
    for (const s of ruleForm.steps) {
      if (s.approver_type === 'specific_user' && !s.approver_value) { toast.error('Chọn người duyệt cho bước đích danh'); return; }
    }
    setSaving(true);
    try {
      const payload = {
        company_id: ruleForm.company_id || null,
        min_amount: ruleForm.min_amount, max_amount: ruleForm.max_amount,
        steps: ruleForm.steps.map((s, i) => ({ order: i + 1, approver_type: s.approver_type, approver_value: s.approver_value || undefined, label: s.label || undefined })),
      };
      const r = ruleEdit
        ? await fetch(`/api/expense-approval-rules/${ruleEdit.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/expense-approval-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) { toast.error(j?.error || 'Lưu thất bại'); return; }
      toast.success('Đã lưu quy tắc'); setRuleOpen(false); void load();
    } finally { setSaving(false); }
  };

  const saveCodeRule = async () => {
    if (!codeCompany) { toast.error('Chọn công ty'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/expense-code-rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: codeCompany, pattern: codePattern, reset_yearly: codeResetYearly }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j?.error || 'Lưu thất bại'); return; }
      toast.success('Đã lưu quy tắc số phiếu');
    } finally { setSaving(false); }
  };

  const companyName = (id: string | null) => id ? (companies.find((c) => c.id === id)?.name || id) : 'Tất cả công ty';

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Danh mục loại chi phí */}
      <section className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-700 text-foreground">Danh mục loại chi phí (flow_type = hành vi dòng chảy)</h3>
          <button onClick={() => { setCatEdit(null); setCatForm({ code: '', name: '', description: '', flow_type: 'operational', company_id: '', color: '#6366f1' }); setCatOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-600 text-white"><Plus size={14} /> Thêm loại</button>
        </div>
        <div className="space-y-2">
          {cats.map((c) => (
            <div key={c.id} className={`flex items-center gap-2 rounded-xl border border-white/5 px-3 py-2 ${c.active ? '' : 'opacity-50'}`}>
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="text-sm font-600 text-foreground">{c.name}</span>
              <span className="text-2xs text-muted-foreground">({c.code})</span>
              <span className="rounded-full bg-hover px-2 py-0.5 text-2xs text-muted-foreground">{FLOW_TYPES.find((f) => f.v === c.flow_type)?.l || c.flow_type}</span>
              <span className="ml-auto text-2xs text-muted-foreground">{companyName(c.company_id)}</span>
              <button onClick={() => { setCatEdit(c); setCatForm({ code: c.code, name: c.name, description: c.description || '', flow_type: c.flow_type, company_id: c.company_id || '', color: c.color }); setCatOpen(true); }}
                className="btn-ghost rounded p-1"><Pencil size={13} /></button>
            </div>
          ))}
        </div>
      </section>

      {/* Rule duyệt fallback */}
      <section className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-700 text-foreground">Quy tắc duyệt theo hạn mức (lưới an toàn)</h3>
          <button onClick={() => { setRuleEdit(null); setRuleForm({ company_id: '', min_amount: 0, max_amount: null, steps: [{ approver_type: 'manager_chain', approver_value: '', label: 'Quản lý trực tiếp' }] }); setRuleOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-600 text-white"><Plus size={14} /> Thêm quy tắc</button>
        </div>
        <p className="mb-3 text-2xs text-muted-foreground">Dùng khi nhân sự CHƯA được ráp chuỗi riêng (Tab "Quyền Chi Phí" trong form Người Dùng luôn được ưu tiên).</p>
        <div className="space-y-2">
          {rules.length === 0 && <p className="text-xs text-muted-foreground py-2">Chưa có quy tắc nào — nhân sự chưa ráp chuỗi sẽ KHÔNG gửi duyệt được.</p>}
          {rules.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-xl border border-white/5 px-3 py-2 ${r.active ? '' : 'opacity-50'}`}>
              <span className="text-sm font-600 text-foreground tabular-nums">{formatVND(Number(r.min_amount))} → {r.max_amount != null ? formatVND(Number(r.max_amount)) : '∞'}</span>
              <span className="text-2xs text-muted-foreground">{companyName(r.company_id)}</span>
              <span className="rounded-full bg-hover px-2 py-0.5 text-2xs text-muted-foreground">
                {r.steps.map((s) => s.label || (s.approver_type === 'manager_chain' ? 'QL trực tiếp' : people.find((p) => p.id === s.approver_value)?.name || s.approver_type)).join(' → ')}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => { setRuleEdit(r); setRuleForm({ company_id: r.company_id || '', min_amount: Number(r.min_amount), max_amount: r.max_amount != null ? Number(r.max_amount) : null, steps: r.steps.map((s) => ({ approver_type: s.approver_type, approver_value: s.approver_value || '', label: s.label || '' })) }); setRuleOpen(true); }}
                  className="btn-ghost rounded p-1"><Pencil size={13} /></button>
                <button onClick={async () => { if (!confirm('Xóa quy tắc này?')) return; await fetch(`/api/expense-approval-rules/${r.id}`, { method: 'DELETE' }); void load(); }}
                  className="btn-ghost rounded p-1 text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quy tắc số phiếu */}
      <section className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
        <h3 className="mb-1 text-sm font-700 text-foreground">Quy tắc số phiếu — mỗi công ty tự quy định</h3>
        <p className="mb-3 text-2xs text-muted-foreground">Placeholder: {'{YYYY} {YY} {MM} {SEQ:5} {COMPANY}'} — VD: CP-{'{COMPANY}'}-{'{YYYY}'}-{'{SEQ:5}'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
          <div>
            <label className={LABEL}>Công ty</label>
            <select className={INPUT} value={codeCompany} onChange={async (e) => {
              setCodeCompany(e.target.value);
              if (e.target.value) {
                const r = await fetch(`/api/expense-code-rules?company_id=${e.target.value}`);
                const j = await r.json().catch(() => ({}));
                if (j?.data) { setCodePattern(j.data.pattern); setCodeResetYearly(!!j.data.reset_yearly); }
                else { setCodePattern('CP-{YYYY}-{SEQ:5}'); setCodeResetYearly(true); }
              }
            }}>
              <option value="">— Chọn công ty —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Pattern</label>
            <input className={INPUT} value={codePattern} onChange={(e) => setCodePattern(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" checked={codeResetYearly} onChange={(e) => setCodeResetYearly(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
            Reset đầu năm
          </label>
          <button onClick={() => void saveCodeRule()} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
            <Save size={14} /> Lưu
          </button>
        </div>
      </section>

      {/* Modal danh mục */}
      {catOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-700 text-foreground">{catEdit ? 'Sửa loại chi phí' : 'Thêm loại chi phí'}</h2>
              <button onClick={() => setCatOpen(false)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-3">
              {!catEdit && <div><label className={LABEL}>Mã (code)</label><input className={INPUT} value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} placeholder="vd: marketing" /></div>}
              <div><label className={LABEL}>Tên</label><input className={INPUT} value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
              <div><label className={LABEL}>Mô tả</label><input className={INPUT} value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} /></div>
              <div><label className={LABEL}>Hành vi dòng chảy (flow_type)</label>
                <select className={INPUT} value={catForm.flow_type} onChange={(e) => setCatForm({ ...catForm, flow_type: e.target.value })}>
                  {FLOW_TYPES.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>Công ty</label>
                  <select className={INPUT} value={catForm.company_id} onChange={(e) => setCatForm({ ...catForm, company_id: e.target.value })}>
                    <option value="">Tất cả công ty</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className={LABEL}>Màu</label><input type="color" className="h-[38px] w-full rounded-xl border border-white/10 bg-[#162033] px-2" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button onClick={() => setCatOpen(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={() => void saveCat()} disabled={saving} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 inline-flex items-center gap-2 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rule */}
      {ruleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-700 text-foreground">{ruleEdit ? 'Sửa quy tắc duyệt' : 'Thêm quy tắc duyệt'}</h2>
              <button onClick={() => setRuleOpen(false)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className={LABEL}>Áp dụng cho công ty</label>
                <select className={INPUT} value={ruleForm.company_id} onChange={(e) => setRuleForm({ ...ruleForm, company_id: e.target.value })}>
                  <option value="">Tất cả công ty (global)</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>Từ số tiền (≥)</label><MoneyInput className={INPUT} value={ruleForm.min_amount} onValueChange={(v) => setRuleForm({ ...ruleForm, min_amount: v })} showZero /></div>
                <div><label className={LABEL}>Đến số tiền (để trống = ∞)</label><MoneyInput className={INPUT} value={ruleForm.max_amount ?? 0} onValueChange={(v) => setRuleForm({ ...ruleForm, max_amount: v || null })} /></div>
              </div>
              <div>
                <label className={LABEL}>Chuỗi bước duyệt (tuần tự)</label>
                <div className="space-y-2">
                  {ruleForm.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                      <select className={INPUT} value={s.approver_type}
                        onChange={(e) => setRuleForm({ ...ruleForm, steps: ruleForm.steps.map((x, j) => j === i ? { ...x, approver_type: e.target.value, approver_value: '' } : x) })}>
                        <option value="manager_chain">Quản lý trực tiếp (leo dần)</option>
                        <option value="specific_user">Người cụ thể</option>
                      </select>
                      {s.approver_type === 'specific_user' && (
                        <select className={INPUT} value={s.approver_value}
                          onChange={(e) => setRuleForm({ ...ruleForm, steps: ruleForm.steps.map((x, j) => j === i ? { ...x, approver_value: e.target.value } : x) })}>
                          <option value="">— Chọn người —</option>
                          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}
                      <button onClick={() => setRuleForm({ ...ruleForm, steps: ruleForm.steps.filter((_, j) => j !== i) })} className="text-red-400 shrink-0"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setRuleForm({ ...ruleForm, steps: [...ruleForm.steps, { approver_type: 'specific_user', approver_value: '', label: '' }] })}
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"><Plus size={14} /> Thêm bước</button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button onClick={() => setRuleOpen(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={() => void saveRule()} disabled={saving} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 inline-flex items-center gap-2 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
