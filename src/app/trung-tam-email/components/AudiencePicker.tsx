'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Users2, Building2, Loader2 } from 'lucide-react';

export interface AudiencePerson {
  id: string;
  name: string;
  email?: string | null;
  has_telegram?: boolean;
}

type Mode = 'individual' | 'org' | 'all';

const INPUT = 'w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500';

/**
 * Chọn đối tượng nhận dùng chung cho 3 khối gửi (Email / Telegram / Telegram RSVP) trong tab
 * Nội Bộ — Trung Tâm Email. 3 chế độ: từng người, theo Công ty/Phòng ban/Bộ phận, toàn bộ nhân
 * sự (chỉ người đủ điều kiện theo channel — có email hoặc đã liên kết Telegram).
 */
export default function AudiencePicker({
  channel, allPeople, companyOptions, defaultCompanyId, onResolved,
}: {
  channel: 'email' | 'telegram';
  allPeople: AudiencePerson[];
  companyOptions: { id: string; name: string }[];
  defaultCompanyId: string | null;
  onResolved: (people: AudiencePerson[], summaryLabel: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('individual');

  // ── Từng người ──────────────────────────────────────────────────────────
  const [q, setQ] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const eligible = useMemo(
    () => allPeople.filter((p) => (channel === 'telegram' ? p.has_telegram : !!p.email)),
    [allPeople, channel]
  );
  const filtered = useMemo(
    () => eligible.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.email || '').toLowerCase().includes(q.toLowerCase())),
    [eligible, q]
  );

  const toggleOne = (p: AudiencePerson) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
      return next;
    });
  };

  useEffect(() => {
    if (mode !== 'individual') return;
    const people = eligible.filter((p) => selectedIds.has(p.id));
    onResolved(people, people.length ? `${people.length} người chọn tay` : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedIds, eligible]);

  // ── Toàn bộ nhân sự ─────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'all') return;
    onResolved(eligible, `Toàn bộ nhân sự (${eligible.length} người)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, eligible]);

  // ── Theo Công ty / Phòng ban / Bộ phận ──────────────────────────────────
  const [orgCompanyId, setOrgCompanyId] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [subDepartments, setSubDepartments] = useState<{ id: string; name: string }[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [subDepartmentId, setSubDepartmentId] = useState('');
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgResult, setOrgResult] = useState<AudiencePerson[] | null>(null);

  useEffect(() => {
    if (mode !== 'org') return;
    if (!orgCompanyId && defaultCompanyId) setOrgCompanyId(defaultCompanyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, defaultCompanyId]);

  useEffect(() => {
    if (!orgCompanyId) { setDepartments([]); return; }
    fetch(`/api/organizations/departments?company_id=${orgCompanyId}`).then((r) => r.json()).then((j) => setDepartments(j.data || j || []));
    setDepartmentId(''); setSubDepartmentId(''); setSubDepartments([]); setOrgResult(null);
  }, [orgCompanyId]);

  useEffect(() => {
    if (!departmentId) { setSubDepartments([]); return; }
    fetch(`/api/organizations/sub-departments?department_id=${departmentId}`).then((r) => r.json()).then((j) => setSubDepartments(j.data || j || []));
    setSubDepartmentId(''); setOrgResult(null);
  }, [departmentId]);

  const loadOrgAudience = async () => {
    if (!orgCompanyId) return;
    setOrgLoading(true);
    try {
      const params = new URLSearchParams({ company_id: orgCompanyId });
      if (departmentId) params.set('department_id', departmentId);
      if (subDepartmentId) params.set('sub_department_id', subDepartmentId);
      const r = await fetch(`/api/organizations/audience?${params.toString()}`);
      const j = await r.json();
      const rows: AudiencePerson[] = Array.isArray(j?.data) ? j.data : [];
      const people = rows.filter((p) => (channel === 'telegram' ? p.has_telegram : !!p.email));
      setOrgResult(people);
      const companyName = companyOptions.find((c) => c.id === orgCompanyId)?.name || 'công ty';
      const unitName = subDepartmentId
        ? subDepartments.find((s) => s.id === subDepartmentId)?.name
        : departmentId
          ? departments.find((d) => d.id === departmentId)?.name
          : null;
      const label = unitName ? `${unitName} · ${people.length} người` : `Toàn ${companyName} · ${people.length} người`;
      onResolved(people, label);
    } finally {
      setOrgLoading(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1 w-fit" style={{ background: 'var(--background)' }}>
        {([['individual', 'Từng người'], ['org', 'Theo Công ty/Phòng ban'], ['all', 'Toàn bộ nhân sự']] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-600 transition-colors ${mode === m ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'individual' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-[#162033] px-2.5">
            <Search size={13} className="text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên / email…"
              className="w-full bg-transparent py-2 text-sm text-foreground outline-none" />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-white/5 divide-y divide-white/5">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                {channel === 'telegram' ? 'Không có ai đã liên kết Telegram khớp tìm kiếm.' : 'Không có ai khớp tìm kiếm.'}
              </p>
            ) : filtered.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground cursor-pointer hover:bg-white/5">
                <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleOne(p)} />
                <span className="flex-1 min-w-0 truncate">{p.name}</span>
                <span className="text-2xs text-muted-foreground shrink-0">{channel === 'telegram' ? '💬 Telegram' : p.email}</span>
              </label>
            ))}
          </div>
          {selectedIds.size > 0 && <p className="text-2xs text-muted-foreground">Đã chọn {selectedIds.size} người.</p>}
        </div>
      )}

      {mode === 'org' && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select className={INPUT} value={orgCompanyId} onChange={(e) => setOrgCompanyId(e.target.value)}>
              <option value="">Chọn công ty</option>
              {companyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className={INPUT} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!orgCompanyId}>
              <option value="">Toàn công ty (mọi phòng ban)</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className={INPUT} value={subDepartmentId} onChange={(e) => setSubDepartmentId(e.target.value)} disabled={!departmentId}>
              <option value="">{departmentId ? 'Cả phòng ban (mọi bộ phận)' : '— Chọn phòng ban trước —'}</option>
              {subDepartments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button onClick={loadOrgAudience} disabled={!orgCompanyId || orgLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-50">
            {orgLoading ? <Loader2 size={13} className="animate-spin" /> : <Building2 size={13} />} Tải danh sách
          </button>
          {orgResult && (
            <p className="text-2xs text-muted-foreground">
              <Users2 size={11} className="inline mb-0.5 mr-1" />
              {orgResult.length === 0
                ? (channel === 'telegram' ? 'Không có ai trong phạm vi này đã liên kết Telegram.' : 'Không có ai trong phạm vi này có email.')
                : `Đã tải ${orgResult.length} người đủ điều kiện nhận.`}
            </p>
          )}
        </div>
      )}

      {mode === 'all' && (
        <p className="text-2xs text-muted-foreground">
          <Users2 size={11} className="inline mb-0.5 mr-1" />
          {channel === 'telegram'
            ? `Gửi cho toàn bộ ${eligible.length} nhân sự đã liên kết Telegram trong phạm vi bạn quản lý.`
            : `Gửi cho toàn bộ ${eligible.length} nhân sự có email trong phạm vi bạn quản lý.`}
        </p>
      )}
    </div>
  );
}
