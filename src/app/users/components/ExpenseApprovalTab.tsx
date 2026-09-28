'use client';

/**
 * Tab "Quyền Chi Phí" trong form Người Dùng (roadmap §2.6) — 2 phần:
 *  (a) Chuỗi duyệt cho đơn NGƯỜI NÀY tạo (per công ty, sắp thứ tự).
 *  (b) Hạn mức thẩm quyền khi NGƯỜI NÀY duyệt (per công ty; trống record = không có quyền chốt).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, ArrowUp, ArrowDown, GitBranch, Gauge } from 'lucide-react';
import MoneyInput from '@/components/ui/MoneyInput';
import { useToast } from '@/context/ToastContext';

interface Props { userId: string }
interface Person { id: string; name: string }
interface Chain { company_id: string | null; steps: Array<{ order: number; approver_user_id: string }> }
interface Limit { company_id: string | null; max_amount: number | null }

const INPUT = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500';
const LABEL = 'block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1';

export default function ExpenseApprovalTab({ userId }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleByCompany, setPeopleByCompany] = useState<Record<string, Person[]>>({});
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [limits, setLimits] = useState<Limit[]>([]);
  const [hasLimitRecord, setHasLimitRecord] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/users/${userId}/expense-approval`),
        fetch('/api/users'),
        fetch('/api/companies'),
      ]);
      const j1 = await r1.json();
      if (r1.ok) {
        setChains((j1.chains || []).map((c: any) => ({ company_id: c.company_id, steps: c.steps || [] })));
        const ls = (j1.limits || []).map((l: any) => ({ company_id: l.company_id, max_amount: l.max_amount != null ? Number(l.max_amount) : null }));
        setLimits(ls);
        setHasLimitRecord(ls.length > 0);
      }
      const j2 = await r2.json();
      const arr = Array.isArray(j2) ? j2 : (j2?.data ?? []);
      setPeople(arr.map((u: any) => ({ id: u.id, name: u.name })).filter((u: Person) => u.id !== userId));
      const j3 = await r3.json();
      const cArr = Array.isArray(j3) ? j3 : (j3?.data ?? []);
      setCompanies(cArr.map((c: any) => ({ id: c.id, name: c.name })));
    } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const companyIds = Array.from(new Set(
      chains.map((c) => c.company_id).filter((id): id is string => Boolean(id))
    ));
    companyIds.forEach((companyId) => {
      if (peopleByCompany[companyId]) return;
      fetch(`/api/users/managers?company_id=${companyId}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: any) => {
          const arr = Array.isArray(data) ? data : [];
          setPeopleByCompany((prev) => ({
            ...prev,
            [companyId]: arr
              .map((u: any) => ({ id: String(u.id), name: String(u.name || '') }))
              .filter((u: Person) => u.id !== userId && !!u.id && !!u.name),
          }));
        })
        .catch(() => {
          setPeopleByCompany((prev) => ({ ...prev, [companyId]: [] }));
        });
    });
  }, [chains, peopleByCompany, userId]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/users/${userId}/expense-approval`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chains: chains.map((c) => ({ company_id: c.company_id, steps: c.steps.filter((s) => s.approver_user_id) })),
          limits: hasLimitRecord
            ? limits.map((l) => ({ company_id: l.company_id, max_amount: l.max_amount }))
            : limits.map((l) => ({ company_id: l.company_id, remove: true })),
        }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j?.error || 'Lưu thất bại'); return; }
      toast.success('Đã lưu Quyền Chi Phí');
      void load();
    } finally { setSaving(false); }
  };

  const companyName = (id: string | null) => id ? (companies.find((c) => c.id === id)?.name || id) : 'Mọi công ty';
  const approverOptions = (companyId: string | null) => companyId ? (peopleByCompany[companyId] || []) : people;

  const updChainStep = (ci: number, si: number, approverId: string) =>
    setChains((cur) => cur.map((c, i) => i !== ci ? c : { ...c, steps: c.steps.map((s, j) => j !== si ? s : { ...s, approver_user_id: approverId }) }));
  const moveStep = (ci: number, si: number, dir: -1 | 1) =>
    setChains((cur) => cur.map((c, i) => {
      if (i !== ci) return c;
      const steps = [...c.steps];
      const t = si + dir;
      if (t < 0 || t >= steps.length) return c;
      [steps[si], steps[t]] = [steps[t], steps[si]];
      return { ...c, steps: steps.map((s, k) => ({ ...s, order: k + 1 })) };
    }));

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* (a) Chuỗi duyệt cho đơn người này tạo */}
      <section className="rounded-2xl border border-white/10 p-4 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-700 text-foreground"><GitBranch size={15} className="text-indigo-400" /> Chuỗi duyệt cho đơn NGƯỜI NÀY tạo</h3>
        <p className="text-2xs text-muted-foreground">Đơn đi tuần tự theo chuỗi; kết thúc ở đâu chốt ở đó (kết hợp hạn mức thẩm quyền — đơn nhỏ dừng sớm). Chưa ráp → dùng quy tắc hạn mức của công ty.</p>
        {chains.map((c, ci) => (
          <div key={ci} className="rounded-xl border border-white/5 bg-black/10 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <select className={INPUT} value={c.company_id || ''} onChange={(e) => setChains((cur) => cur.map((x, i) => i === ci ? { ...x, company_id: e.target.value || null } : x))}>
                <option value="">Mọi công ty (chuỗi chung)</option>
                {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
              </select>
              <button onClick={() => setChains((cur) => cur.filter((_, i) => i !== ci))} className="shrink-0 text-red-400 hover:text-red-300 p-1" title="Xóa chuỗi"><Trash2 size={15} /></button>
            </div>
            {c.steps.map((s, si) => (
              <div key={si} className="flex items-center gap-2">
                <span className="w-14 text-2xs text-muted-foreground">Cấp {si + 1}</span>
                <select className={INPUT} value={s.approver_user_id} onChange={(e) => updChainStep(ci, si, e.target.value)}>
                  <option value="">— Chọn người duyệt —</option>
                  {approverOptions(c.company_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={() => moveStep(ci, si, -1)} className="btn-ghost rounded p-1" title="Lên"><ArrowUp size={13} /></button>
                <button onClick={() => moveStep(ci, si, 1)} className="btn-ghost rounded p-1" title="Xuống"><ArrowDown size={13} /></button>
                <button onClick={() => setChains((cur) => cur.map((x, i) => i === ci ? { ...x, steps: x.steps.filter((_, j) => j !== si).map((st, k) => ({ ...st, order: k + 1 })) } : x))}
                  className="text-red-400 p-1"><Trash2 size={13} /></button>
              </div>
            ))}
            <button onClick={() => setChains((cur) => cur.map((x, i) => i === ci ? { ...x, steps: [...x.steps, { order: x.steps.length + 1, approver_user_id: '' }] } : x))}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"><Plus size={13} /> Thêm cấp duyệt</button>
          </div>
        ))}
        <button onClick={() => setChains((cur) => [...cur, { company_id: null, steps: [{ order: 1, approver_user_id: '' }] }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-600 text-indigo-300 hover:bg-indigo-500/20">
          <Plus size={14} /> Ráp chuỗi mới
        </button>
      </section>

      {/* (b) Hạn mức thẩm quyền khi người này DUYỆT */}
      <section className="rounded-2xl border border-white/10 p-4 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-700 text-foreground"><Gauge size={15} className="text-amber-400" /> Hạn mức thẩm quyền khi NGƯỜI NÀY duyệt</h3>
        <p className="text-2xs text-muted-foreground">Đơn ≤ hạn mức → người này duyệt là CHỐT (không cần cấp trên). Để trống số tiền = vô hạn. Không bật = duyệt xong vẫn đẩy tiếp (trừ khi là cuối chuỗi).</p>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" checked={hasLimitRecord}
            onChange={(e) => { setHasLimitRecord(e.target.checked); if (e.target.checked && limits.length === 0) setLimits([{ company_id: null, max_amount: null }]); }}
            className="h-4 w-4 accent-amber-500" />
          Cấp thẩm quyền chốt phiếu
        </label>
        {hasLimitRecord && (
          <div className="space-y-2">
            {limits.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select className={INPUT} value={l.company_id || ''} onChange={(e) => setLimits((cur) => cur.map((x, j) => j === i ? { ...x, company_id: e.target.value || null } : x))}>
                  <option value="">Mọi công ty</option>
                  {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
                </select>
                <MoneyInput className={INPUT} value={l.max_amount ?? 0}
                  onValueChange={(v) => setLimits((cur) => cur.map((x, j) => j === i ? { ...x, max_amount: v || null } : x))}
                  placeholder="Trống = vô hạn" />
                <button onClick={() => setLimits((cur) => cur.filter((_, j) => j !== i))} className="text-red-400 p-1 shrink-0"><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => setLimits((cur) => [...cur, { company_id: null, max_amount: null }])}
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300"><Plus size={13} /> Thêm hạn mức theo công ty</button>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <button onClick={() => void save()} disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Lưu Quyền Chi Phí
        </button>
      </div>
    </div>
  );
}
