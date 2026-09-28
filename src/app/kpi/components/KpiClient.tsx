'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Target, Loader2, Trophy, Settings2, Plus, Trash2, BarChart3, Eye, Power, Building2, Pencil, X, Archive } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import DateInputVN from '@/components/ui/DateInputVN';
import AssignmentDetailModal from './AssignmentDetailModal';
import AssignmentReportModal from './AssignmentReportModal';
import UnitAssignmentDetailModal from './UnitAssignmentDetailModal';
import KpiUserPicker, { KpiUserOption } from './KpiUserPicker';
import {
  KpiAssignment, KpiCycle, KpiTemplate, KpiTemplateItemInput, STATUS_LABEL, STATUS_COLOR, PERIOD_LABEL, KpiPeriodType,
  KpiUnitAssignment, KpiUnitType, UNIT_STATUS_LABEL, UNIT_STATUS_COLOR, ROLLUP_ELIGIBLE_PERIODS,
} from './kpiTypes';

type Tab = 'mine' | 'manager' | 'senior' | 'unit' | 'ranking' | 'admin' | 'config';

/** Nối ?company_id= vào URL nếu Super Admin đang chọn 1 công ty tường minh (không có = dùng công ty đang làm việc qua Đa Công Ty). */
function withCompany(url: string, companyId: string | null): string {
  if (!companyId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}company_id=${companyId}`;
}

export default function KpiClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const user = useMemo(() => getCurrentUser() as any, []);
  const userId: string | undefined = user?.id;
  const role = user?.role || 'user';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isSuperAdmin = role === 'super_admin';

  // Super Admin không nhất thiết có membership ở mọi công ty (switcher Đa Công Ty thông
  // thường chỉ hiện khi thuộc >=2 công ty) — nên có dropdown RIÊNG chọn công ty cần xử lý.
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch('/api/organizations/companies').then((r) => r.json()).then((j) => {
      const list = j.data || j || [];
      setCompanies(list);
      if (list[0]) setCompanyId(list[0].id);
    });
  }, [isSuperAdmin]);

  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<KpiAssignment[]>([]);
  const [managerQueue, setManagerQueue] = useState<KpiAssignment[]>([]);
  const [seniorQueue, setSeniorQueue] = useState<KpiAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const [myUnits, setMyUnits] = useState<KpiUnitAssignment[]>([]);
  const [unitApproveQueue, setUnitApproveQueue] = useState<KpiUnitAssignment[]>([]);
  const [unitOpenId, setUnitOpenId] = useState<string | null>(null);

  // Mở đúng phiếu khi bấm vào từ thông báo (relatedUrl /kpi?open=... hoặc ?openUnit=...).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const open = sp.get('open');
    const openUnit = sp.get('openUnit');
    if (open) setOpenId(open);
    if (openUnit) { setUnitOpenId(openUnit); setTab('unit'); }
  }, []);

  // Công tắc tổng theo công ty — mặc định TẮT (opt-in), chỉ Admin/Super Admin bật được.
  const [kpiEnabled, setKpiEnabled] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);
  const loadCompanyGate = useCallback(() => {
    if (isSuperAdmin && !companyId) return; // chờ chọn công ty trước
    fetch(withCompany('/api/kpi/config', companyId)).then((r) => r.json()).then((j) => {
      setKpiEnabled(!!j.data?.settings?.kpi_enabled);
      // Chốt lại company_id ĐÃ RESOLVE (kể cả Admin thường, không chỉ Super Admin) — để mọi
      // fetch phụ thuộc công ty sau đó (phòng ban, bộ phận, nhân sự...) LUÔN có company_id
      // tường minh, không phụ thuộc các endpoint cũ chưa đọc header Đa Công Ty.
      const resolved = j.data?.settings?.company_id;
      if (resolved) setCompanyId(resolved);
    }).catch(() => setKpiEnabled(false));
  }, [companyId, isSuperAdmin]);
  useEffect(() => { loadCompanyGate(); }, [loadCompanyGate]);

  const enableForCompany = async () => {
    setEnabling(true);
    try {
      const cur = await fetch(withCompany('/api/kpi/config', companyId)).then((r) => r.json());
      const settings = { ...cur.data.settings, kpi_enabled: true };
      const r = await fetch('/api/kpi/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings, company_id: companyId }) });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Lỗi bật module'); return; }
      toast.success('Đã bật KPI & Đánh Giá cho công ty này');
      setKpiEnabled(true);
    } finally {
      setEnabling(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, mg, sn, mu, uq] = await Promise.all([
        fetch(withCompany('/api/kpi/assignments?scope=mine', companyId)).then((r) => r.json()),
        fetch(withCompany('/api/kpi/assignments?scope=manager', companyId)).then((r) => r.json()),
        fetch(withCompany('/api/kpi/assignments?scope=senior', companyId)).then((r) => r.json()),
        fetch(withCompany('/api/kpi/unit-assignments?scope=mine', companyId)).then((r) => r.json()),
        fetch(withCompany('/api/kpi/unit-assignments?scope=approve', companyId)).then((r) => r.json()),
      ]);
      setMine(m.data || []);
      setManagerQueue(mg.data || []);
      setSeniorQueue(sn.data || []);
      setMyUnits(mu.data || []);
      setUnitApproveQueue(uq.data || []);
    } catch {
      toast.error('Lỗi tải dữ liệu KPI');
    } finally {
      setLoading(false);
    }
  }, [toast, companyId]);

  useEffect(() => { if (kpiEnabled) load(); }, [load, kpiEnabled]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'mine', label: 'KPI Của Tôi', count: mine.length },
    ...(managerQueue.length || role === 'manager' || isAdmin ? [{ id: 'manager' as Tab, label: 'Cần Tôi Chấm', count: managerQueue.filter((a) => a.status === 'manager_review').length }] : []),
    ...(seniorQueue.length ? [{ id: 'senior' as Tab, label: 'Cần Tôi Chốt', count: seniorQueue.filter((a) => a.status === 'senior_review').length }] : []),
    ...(myUnits.length || unitApproveQueue.length ? [{ id: 'unit' as Tab, label: 'Đơn Vị', count: unitApproveQueue.length }] : []),
    { id: 'ranking', label: 'Xếp Hạng' },
    ...(isAdmin ? [{ id: 'admin' as Tab, label: 'Quản Trị' }] : []),
    ...(isAdmin ? [{ id: 'config' as Tab, label: 'Cấu Hình' }] : []),
  ];

  // Xoá phiếu KPI (quản lý xoá phiếu mình giao nhầm). Chặn phiếu đã chốt phía server.
  const deleteAssignmentRow = async (a: KpiAssignment) => {
    const ok = await confirm({
      title: 'Xóa phiếu KPI', danger: true, confirmLabel: 'Xóa phiếu',
      message: `Xóa phiếu KPI của "${a.employee_name || a.employee_id}" — kỳ "${a.cycle_name}"? Toàn bộ dữ liệu đã nhập sẽ mất, không thể hoàn tác.`,
    });
    if (!ok) return;
    const r = await fetch(`/api/kpi/assignments/${a.id}?company_id=${companyId || ''}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error || 'Lỗi xóa phiếu'); return; }
    toast.success('Đã xóa phiếu KPI');
    load();
  };

  const renderList = (rows: KpiAssignment[], emptyText: string, opts?: { canDelete?: (a: KpiAssignment) => boolean }) => {
    if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    if (!rows.length) {
      return (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Target className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{emptyText}</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((a) => (
          <div key={a.id}
            className="text-left rounded-2xl border border-white/5 p-4 hover:border-indigo-500/40 transition-colors cursor-pointer relative"
            style={{ background: 'var(--card)' }} onClick={() => setOpenId(a.id)}>
            <div className="absolute top-3 right-3 flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setReportId(a.id); }}
                title="Xem biểu đồ/thống kê & in phiếu"
                className="btn-ghost rounded-lg p-1.5"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              {opts?.canDelete?.(a) && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAssignmentRow(a); }}
                  title="Xóa phiếu (giao nhầm)"
                  className="btn-ghost rounded-lg p-1.5 text-rose-400 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mb-1 pr-8">
              <p className="text-sm font-600 text-foreground">{a.cycle_name || 'Kỳ đánh giá'}</p>
              {a.final_score != null && <span className="text-sm font-800 text-emerald-400 tabular-nums">{a.final_score} đ</span>}
            </div>
            {a.employee_name && <p className="text-xs text-muted-foreground mb-1">{a.employee_name}</p>}
            <p className={`text-2xs font-600 ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderUnitList = (rows: KpiUnitAssignment[], emptyText: string) => {
    if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    if (!rows.length) {
      return (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Target className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{emptyText}</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((a) => (
          <div key={a.id}
            className="text-left rounded-2xl border border-white/5 p-4 hover:border-indigo-500/40 transition-colors cursor-pointer"
            style={{ background: 'var(--card)' }} onClick={() => setUnitOpenId(a.id)}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-sm font-600 text-foreground">{a.unit_name || 'Đơn vị'}</p>
              {a.final_score != null && <span className="text-sm font-800 text-emerald-400 tabular-nums">{a.final_score} đ</span>}
            </div>
            <p className="text-xs text-muted-foreground mb-1">{a.cycle_name}</p>
            <p className={`text-2xs font-600 ${UNIT_STATUS_COLOR[a.status]}`}>{UNIT_STATUS_LABEL[a.status]}</p>
          </div>
        ))}
      </div>
    );
  };

  const companyPicker = isSuperAdmin && (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 w-fit" style={{ background: 'var(--card)' }}>
      <Building2 className="h-3.5 w-3.5 text-indigo-400" />
      <span className="text-2xs text-muted-foreground">Công ty đang xử lý:</span>
      <select value={companyId || ''} onChange={(e) => setCompanyId(e.target.value)} className="bg-transparent text-sm text-foreground outline-none">
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );

  if (isSuperAdmin && !companyId) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (kpiEnabled === null) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!kpiEnabled) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">KPI & Đánh Giá</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Chỉ tiêu theo kỳ · tự nhận xét → quản lý đánh giá → cấp cao chốt điểm</p>
        </div>
        {companyPicker}
        <div className="flex flex-col items-center py-20 text-center rounded-2xl border border-white/5" style={{ background: 'var(--card)' }}>
          <Power className="h-10 w-10 mb-3 opacity-30 text-muted-foreground" />
          <p className="text-sm text-foreground font-600">Công ty này chưa bật module KPI & Đánh Giá</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">Mỗi công ty tự quyết định có dùng KPI & Đánh Giá hay không, và tự cấu hình bộ chỉ tiêu/quy tắc riêng — không ảnh hưởng công ty khác.</p>
          {isAdmin ? (
            <button onClick={enableForCompany} disabled={enabling} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 mt-4">
              {enabling ? 'Đang bật...' : 'Bật KPI & Đánh Giá cho công ty này'}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground mt-3">Liên hệ Quản trị viên công ty để bật tính năng này.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">KPI & Đánh Giá</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Chỉ tiêu theo kỳ · tự nhận xét → quản lý đánh giá → cấp cao chốt điểm</p>
      </div>

      {companyPicker}

      <div className="flex gap-2 border-b border-white/10 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}{t.count ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'mine' && renderList(mine, 'Chưa có phiếu KPI nào — khi được giao chỉ tiêu, phiếu sẽ hiện ở đây.')}
      {tab === 'manager' && renderList(managerQueue, 'Không có phiếu nào chờ bạn chấm điểm.', { canDelete: (a) => isAdmin || a.manager_id === userId })}
      {tab === 'senior' && renderList(seniorQueue, 'Không có phiếu nào chờ bạn chốt điểm.')}
      {tab === 'unit' && (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-700 text-muted-foreground uppercase tracking-wider mb-2">Đơn vị tôi phụ trách (tự nhận xét)</p>
            {renderUnitList(myUnits, 'Bạn chưa được giao phụ trách phiếu đánh giá đơn vị nào.')}
          </div>
          <div>
            <p className="text-xs font-700 text-muted-foreground uppercase tracking-wider mb-2">Cần tôi duyệt</p>
            {renderUnitList(unitApproveQueue, 'Không có phiếu đơn vị nào chờ bạn duyệt.')}
          </div>
        </div>
      )}
      {tab === 'ranking' && <RankingTab companyId={companyId} />}
      {tab === 'admin' && isAdmin && (
        <div className="space-y-4">
          {isSuperAdmin && (
            <Link href="/kpi/tong-quan" className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
              <BarChart3 className="h-3.5 w-3.5" /> Xem tổng quan KPI toàn hệ thống
            </Link>
          )}
          <AdminTab companyId={companyId} onAssignmentCreated={load} />
        </div>
      )}
      {tab === 'config' && isAdmin && <KpiConfigTab companyId={companyId} onGateChanged={loadCompanyGate} />}

      {openId && (
        <AssignmentDetailModal
          assignmentId={openId}
          currentUserId={user?.id}
          companyId={companyId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
      {reportId && (
        <AssignmentReportModal assignmentId={reportId} companyId={companyId} onClose={() => setReportId(null)} />
      )}
      {unitOpenId && (
        <UnitAssignmentDetailModal
          assignmentId={unitOpenId}
          currentUserId={user?.id}
          companyId={companyId}
          onClose={() => setUnitOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function RankingTab({ companyId }: { companyId: string | null }) {
  const toast = useToast();
  const [cycles, setCycles] = useState<KpiCycle[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [rows, setRows] = useState<{ employee_id: string; employee_name: string; final_score: number; rank: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(withCompany('/api/kpi/cycles', companyId)).then((r) => r.json()).then((j) => {
      setCycles(j.data || []);
      if (j.data?.[0]) setCycleId(j.data[0].id);
    });
  }, [companyId]);

  useEffect(() => {
    if (!cycleId) return;
    setLoading(true);
    fetch(withCompany(`/api/kpi/ranking?cycle_id=${cycleId}`, companyId)).then((r) => r.json()).then((j) => setRows(j.data || [])).catch(() => toast.error('Lỗi tải xếp hạng')).finally(() => setLoading(false));
  }, [cycleId, companyId, toast]);

  const max = rows[0]?.final_score || 100;

  return (
    <div className="space-y-4">
      <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} className="rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm">
        {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !rows.length ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Trophy className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có ai được chốt điểm trong kỳ này, hoặc chưa bật xếp hạng.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
          {rows.map((r) => (
            <div key={r.employee_id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
              <span className={`text-sm font-800 w-6 text-center ${r.rank === 1 ? 'text-amber-400' : r.rank === 2 ? 'text-slate-300' : r.rank === 3 ? 'text-orange-400' : 'text-muted-foreground'}`}>#{r.rank}</span>
              <span className="text-sm text-foreground flex-1 min-w-0 truncate">{r.employee_name}</span>
              <div className="flex items-center gap-2 w-40 shrink-0">
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(4, (r.final_score / max) * 100)}%` }} />
                </div>
                <span className="text-sm font-700 text-foreground tabular-nums w-10 text-right">{r.final_score}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminTab({ companyId, onAssignmentCreated }: { companyId: string | null; onAssignmentCreated: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [listKey, setListKey] = useState(0);
  const refreshAll = () => { onAssignmentCreated(); setListKey((k) => k + 1); };
  const [cycles, setCycles] = useState<KpiCycle[]>([]);
  const [templates, setTemplates] = useState<KpiTemplate[]>([]);

  const [cycleName, setCycleName] = useState('');
  const [periodType, setPeriodType] = useState<KpiPeriodType>('quarter');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);

  const [tplName, setTplName] = useState('');
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [tplItems, setTplItems] = useState<KpiTemplateItemInput[]>([{ name: '', weight: 0, target_type: 'number' }]);
  const [tplSources, setTplSources] = useState<{ source: 'attendance' | 'task'; enabled: boolean; weight: number }[]>([
    { source: 'attendance', enabled: false, weight: 0 },
    { source: 'task', enabled: false, weight: 0 },
  ]);

  // Phạm vi áp dụng bộ chỉ tiêu: toàn công ty, hoặc hẹp hơn theo phòng ban/bộ phận/chức danh.
  // Bộ phận NẰM DƯỚI phòng ban (1 phòng ban có nhiều bộ phận) — chọn phòng ban trước để lọc bộ phận.
  const [tplScopeType, setTplScopeType] = useState<'company' | 'department' | 'sub_department' | 'job_title'>('company');
  const [tplDepartments, setTplDepartments] = useState<{ id: string; name: string }[]>([]);
  const [tplSubDepartments, setTplSubDepartments] = useState<{ id: string; name: string }[]>([]);
  const [tplJobTitles, setTplJobTitles] = useState<{ id: string; title: string }[]>([]);
  const [tplParentDeptId, setTplParentDeptId] = useState(''); // phòng ban cha, dùng khi scope=department hoặc để lọc bộ phận
  const [tplScopeId, setTplScopeId] = useState(''); // id cuối cùng gửi lên (sub_department/job_title), hoặc = tplParentDeptId khi scope=department
  // Nhóm chỉ tiêu — đọc từ cấu hình công ty (Tab "Cấu Hình"), không còn hardcode.
  const [categoryOptions, setCategoryOptions] = useState<{ key: string; label: string }[]>([]);

  useEffect(() => {
    fetch(withCompany('/api/organizations/departments', companyId)).then((r) => r.json()).then((j) => setTplDepartments(j.data || j || []));
    fetch(withCompany('/api/organizations/job-titles', companyId)).then((r) => r.json()).then((j) => setTplJobTitles(j.data || j || [])).catch(() => {});
    fetch(withCompany('/api/kpi/config', companyId)).then((r) => r.json()).then((j) => setCategoryOptions(j.data?.categories || []));
  }, [companyId]);

  useEffect(() => {
    if (tplScopeType !== 'sub_department' || !tplParentDeptId) { setTplSubDepartments([]); return; }
    fetch(`/api/organizations/sub-departments?department_id=${tplParentDeptId}`).then((r) => r.json()).then((j) => setTplSubDepartments(j.data || j || []));
  }, [tplScopeType, tplParentDeptId]);

  const [assignCycleId, setAssignCycleId] = useState('');
  const [assignTemplateId, setAssignTemplateId] = useState('');
  const [employee, setEmployee] = useState<KpiUserOption | null>(null);
  const [manager, setManager] = useState<KpiUserOption | null>(null);
  const [senior, setSenior] = useState<KpiUserOption | null>(null);

  const reload = useCallback(() => {
    fetch(withCompany('/api/kpi/cycles', companyId)).then((r) => r.json()).then((j) => setCycles(j.data || []));
    fetch(withCompany('/api/kpi/templates', companyId)).then((r) => r.json()).then((j) => setTemplates(j.data || []));
  }, [companyId]);
  useEffect(() => { reload(); }, [reload]);

  const resetCycleForm = () => { setEditingCycleId(null); setCycleName(''); setPeriodType('quarter'); setStartDate(''); setEndDate(''); };

  const saveCycle = async () => {
    if (!cycleName || !startDate || !endDate) { toast.error('Điền đủ tên kỳ + ngày bắt đầu/kết thúc'); return; }
    const url = editingCycleId ? `/api/kpi/cycles/${editingCycleId}` : '/api/kpi/cycles';
    const r = await fetch(url, {
      method: editingCycleId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cycleName, period_type: periodType, start_date: startDate, end_date: endDate, company_id: companyId }),
    });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi lưu kỳ'); return; }
    toast.success(editingCycleId ? 'Đã cập nhật kỳ đánh giá' : 'Đã tạo kỳ đánh giá');
    resetCycleForm();
    reload();
  };

  const [wizardBusy, setWizardBusy] = useState(false);
  const saveCycleWithMonths = async () => {
    if (!cycleName || !startDate || !endDate) { toast.error('Điền đủ tên kỳ + ngày bắt đầu/kết thúc'); return; }
    setWizardBusy(true);
    try {
      const r = await fetch('/api/kpi/cycles/rollup-wizard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cycleName, period_type: periodType, start_date: startDate, end_date: endDate, company_id: companyId }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Lỗi tạo kỳ tổng hợp'); return; }
      toast.success(`Đã tạo kỳ + tự sinh ${j.data.monthsCreated} kỳ tháng mới, liên kết ${j.data.monthsLinked} kỳ tháng (chia đều trọng số, chỉnh lại ở panel bên dưới nếu cần)`);
      resetCycleForm();
      reload();
    } finally {
      setWizardBusy(false);
    }
  };

  const startEditCycle = (c: KpiCycle) => {
    setEditingCycleId(c.id); setCycleName(c.name); setPeriodType(c.period_type); setStartDate(c.start_date); setEndDate(c.end_date);
  };

  const deleteCycleRow = async (c: KpiCycle) => {
    const ok = await confirm({ title: 'Xóa kỳ đánh giá', message: `Xóa kỳ "${c.name}"? Chỉ xóa được nếu kỳ chưa có phiếu KPI nào.`, danger: true, confirmLabel: 'Xóa' });
    if (!ok) return;
    const r = await fetch(`/api/kpi/cycles/${c.id}?company_id=${companyId || ''}`, { method: 'DELETE' });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi xóa kỳ'); return; }
    toast.success('Đã xóa kỳ đánh giá');
    if (editingCycleId === c.id) resetCycleForm();
    reload();
  };

  const changeCycleStatus = async (c: KpiCycle, status: string) => {
    if (status === 'closed') {
      const ok = await confirm({
        title: 'Đóng & lưu trữ kỳ', danger: true, confirmLabel: 'Đóng kỳ',
        message: `Đóng kỳ "${c.name}" sẽ KHOÁ toàn bộ: không giao được phiếu mới, không tự nhận xét/chấm/chốt nữa, mọi phiếu chuyển sang chỉ-đọc. Dữ liệu vẫn giữ nguyên để tra cứu. Có thể mở lại nếu cần. Tiếp tục?`,
      });
      if (!ok) return;
    }
    const r = await fetch(`/api/kpi/cycles/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, company_id: companyId }) });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi đổi trạng thái'); return; }
    toast.success(status === 'closed' ? 'Đã đóng & lưu trữ kỳ' : 'Đã đổi trạng thái kỳ');
    reload();
  };

  // Kỳ đang mở (draft/active) — chỉ những kỳ này mới cho giao phiếu mới.
  const openCycles = cycles.filter((c) => c.status !== 'closed');
  const activeCycles = cycles.filter((c) => c.status !== 'closed');
  const archivedCycles = cycles.filter((c) => c.status === 'closed');

  const resetTplForm = () => {
    setEditingTplId(null); setTplName('');
    setTplItems([{ name: '', weight: 0, target_type: 'number', category: null }]);
    setTplSources([{ source: 'attendance', enabled: false, weight: 0 }, { source: 'task', enabled: false, weight: 0 }]);
    setTplScopeType('company'); setTplParentDeptId(''); setTplScopeId('');
  };

  const saveTemplate = async () => {
    if (!tplName || tplItems.some((i) => !i.name)) { toast.error('Điền tên bộ mẫu và tên từng chỉ tiêu'); return; }
    const scopeId = tplScopeType === 'department' ? tplParentDeptId : tplScopeType === 'company' ? null : tplScopeId;
    if (tplScopeType !== 'company' && !scopeId) { toast.error('Chọn phòng ban/bộ phận/chức danh áp dụng'); return; }
    const url = editingTplId ? `/api/kpi/templates/${editingTplId}` : '/api/kpi/templates';
    const r = await fetch(url, {
      method: editingTplId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tplName, scope_type: tplScopeType, scope_id: scopeId, items: tplItems, integration_sources: tplSources, company_id: companyId }),
    });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi lưu bộ chỉ tiêu'); return; }
    toast.success(editingTplId ? 'Đã cập nhật bộ chỉ tiêu' : 'Đã tạo bộ chỉ tiêu mẫu');
    resetTplForm();
    reload();
  };

  const loadTemplateForEdit = async (t: KpiTemplate) => {
    const r = await fetch(withCompany(`/api/kpi/templates/${t.id}`, companyId));
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi tải bộ chỉ tiêu'); return; }
    const d = j.data;
    setEditingTplId(t.id);
    setTplName(d.name || '');
    setTplScopeType(d.scope_type || 'company');
    if (d.scope_type === 'department') { setTplParentDeptId(d.scope_id || ''); setTplScopeId(''); }
    else { setTplScopeId(d.scope_id || ''); setTplParentDeptId(''); }
    setTplItems((d.items || []).map((it: any) => ({
      name: it.name, description: it.description ?? null, weight: Number(it.weight) || 0,
      target_type: it.target_type || 'number', target_value: it.target_value ?? null, unit: it.unit ?? null, category: it.category ?? null,
    })));
    const srcArr = Array.isArray(d.integration_sources) ? d.integration_sources : [];
    const find = (s: string) => srcArr.find((x: any) => x.source === s);
    setTplSources([
      { source: 'attendance', enabled: !!find('attendance')?.enabled, weight: Number(find('attendance')?.weight) || 0 },
      { source: 'task', enabled: !!find('task')?.enabled, weight: Number(find('task')?.weight) || 0 },
    ]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteTemplateRow = async (t: KpiTemplate) => {
    const ok = await confirm({ title: 'Xóa bộ chỉ tiêu', message: `Xóa bộ chỉ tiêu "${t.name}"? Phiếu KPI đã giao từ mẫu này KHÔNG bị ảnh hưởng (đã sao chép chỉ tiêu riêng).`, danger: true, confirmLabel: 'Xóa' });
    if (!ok) return;
    const r = await fetch(`/api/kpi/templates/${t.id}?company_id=${companyId || ''}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error || 'Lỗi xóa bộ chỉ tiêu'); return; }
    toast.success('Đã xóa bộ chỉ tiêu');
    if (editingTplId === t.id) resetTplForm();
    reload();
  };

  const assign = async () => {
    if (!assignCycleId || !employee) { toast.error('Chọn kỳ và chọn nhân viên'); return; }
    const r = await fetch('/api/kpi/assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle_id: assignCycleId, employee_id: employee.id, template_id: assignTemplateId || null, manager_id: manager?.id || null, senior_id: senior?.id || null, company_id: companyId }),
    });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi giao KPI'); return; }
    toast.success('Đã giao phiếu KPI');
    setEmployee(null); setManager(null); setSenior(null);
    refreshAll();
  };

  const inputCls = 'rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs w-full';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <AssignmentAdminList companyId={companyId} reloadKey={listKey} />
      <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-700 text-foreground">{editingCycleId ? 'Sửa Kỳ Đánh Giá' : 'Tạo Kỳ Đánh Giá'}</p>
          {editingCycleId && <button onClick={resetCycleForm} className="btn-ghost rounded-lg p-1"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <input className={inputCls} placeholder="Tên kỳ, vd Quý 3/2026" value={cycleName} onChange={(e) => setCycleName(e.target.value)} />
        <select className={inputCls} value={periodType} onChange={(e) => setPeriodType(e.target.value as KpiPeriodType)}>
          {Object.entries(PERIOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DateInputVN className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <DateInputVN className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button onClick={saveCycle} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 w-full">{editingCycleId ? 'Lưu thay đổi' : 'Tạo kỳ'}</button>
        {!editingCycleId && ROLLUP_ELIGIBLE_PERIODS.includes(periodType) && (
          <button onClick={saveCycleWithMonths} disabled={wizardBusy} className="btn-ghost rounded-xl px-4 py-2 text-xs font-600 w-full border border-white/10">
            {wizardBusy ? 'Đang tạo...' : `Tạo kỳ + tự sinh ${periodType === 'quarter' ? '3' : periodType === 'half_year' ? '6' : '12'} kỳ Tháng con`}
          </button>
        )}
        <div className="pt-2 space-y-1.5">
          {activeCycles.length > 0 && <p className="text-2xs font-700 uppercase tracking-wider text-muted-foreground/60">Đang diễn ra</p>}
          {activeCycles.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap sm:flex-nowrap">
              <span className="truncate flex-1 min-w-0 basis-full sm:basis-auto">{c.name} · {PERIOD_LABEL[c.period_type]}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <select value={c.status} onChange={(e) => changeCycleStatus(c, e.target.value)} className="bg-transparent text-2xs border border-white/10 rounded-md px-1 py-1.5">
                  <option value="draft">Nháp</option>
                  <option value="active">Đang chạy</option>
                  <option value="closed">Đóng &amp; lưu trữ</option>
                </select>
                <button onClick={() => startEditCycle(c)} title="Sửa" className="btn-ghost rounded-md p-2 -m-0.5"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => deleteCycleRow(c)} title="Xóa" className="btn-ghost rounded-md p-2 -m-0.5"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {archivedCycles.length > 0 && (
            <>
              <p className="text-2xs font-700 uppercase tracking-wider text-muted-foreground/60 pt-2 flex items-center gap-1"><Archive className="h-3 w-3" /> Đã lưu trữ ({archivedCycles.length})</p>
              {archivedCycles.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground/70 flex-wrap sm:flex-nowrap">
                  <span className="truncate flex-1 min-w-0 basis-full sm:basis-auto">{c.name} · {PERIOD_LABEL[c.period_type]}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs bg-white/5 border border-white/10">🔒 Đã khoá</span>
                    <button onClick={() => changeCycleStatus(c, 'active')} title="Mở lại kỳ" className="btn-ghost rounded-md px-2 py-1.5 text-2xs">Mở lại</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <RollupLinkForm companyId={companyId} cycles={cycles} />

      <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-700 text-foreground">{editingTplId ? 'Sửa Bộ Chỉ Tiêu' : 'Bộ Chỉ Tiêu Mẫu'}</p>
          {editingTplId && <button onClick={resetTplForm} title="Hủy sửa, tạo mới" className="btn-ghost rounded-lg p-1 text-2xs">Hủy sửa</button>}
        </div>

        {/* Danh sách bộ chỉ tiêu đã tạo — Sửa / Xóa */}
        {templates.length > 0 && (
          <div className="space-y-1 rounded-xl border border-white/5 p-2" style={{ background: 'var(--background)' }}>
            {templates.map((t) => (
              <div key={t.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${editingTplId === t.id ? 'bg-indigo-500/10' : 'hover:bg-white/5'}`}>
                <span className="text-xs text-foreground truncate flex-1 min-w-0">{t.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => loadTemplateForEdit(t)} title="Sửa" className="btn-ghost rounded-md p-2 -m-0.5"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => deleteTemplateRow(t)} title="Xóa" className="btn-ghost rounded-md p-2 -m-0.5 text-rose-400 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input className={inputCls} placeholder="Tên bộ chỉ tiêu" value={tplName} onChange={(e) => setTplName(e.target.value)} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select className={inputCls} value={tplScopeType} onChange={(e) => { setTplScopeType(e.target.value as any); setTplParentDeptId(''); setTplScopeId(''); }}>
            <option value="company">Áp dụng: Toàn công ty</option>
            <option value="department">Áp dụng: 1 Phòng ban</option>
            <option value="sub_department">Áp dụng: 1 Bộ phận</option>
            <option value="job_title">Áp dụng: 1 Chức danh</option>
          </select>
          {tplScopeType === 'department' && (
            <select className={inputCls} value={tplParentDeptId} onChange={(e) => setTplParentDeptId(e.target.value)}>
              <option value="">Chọn phòng ban</option>
              {tplDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {tplScopeType === 'sub_department' && (
            <>
              <select className={inputCls} value={tplParentDeptId} onChange={(e) => { setTplParentDeptId(e.target.value); setTplScopeId(''); }}>
                <option value="">Chọn phòng ban cha</option>
                {tplDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className={inputCls} value={tplScopeId} onChange={(e) => setTplScopeId(e.target.value)} disabled={!tplParentDeptId}>
                <option value="">Chọn bộ phận</option>
                {tplSubDepartments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          )}
          {tplScopeType === 'job_title' && (
            <select className={inputCls} value={tplScopeId} onChange={(e) => setTplScopeId(e.target.value)}>
              <option value="">Chọn chức danh</option>
              {tplJobTitles.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          )}
        </div>
        {tplItems.map((it, i) => (
          <div key={i} className="rounded-xl border border-white/5 p-2 space-y-1.5" style={{ background: 'var(--background)' }}>
            <div className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
              <input className={inputCls} placeholder="Tên chỉ tiêu" value={it.name} onChange={(e) => setTplItems(tplItems.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <button onClick={() => setTplItems(tplItems.filter((_, j) => j !== i))} className="btn-ghost rounded-lg p-2.5 -m-1"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5">
              <select className={inputCls} value={it.category ?? ''} onChange={(e) => setTplItems(tplItems.map((x, j) => j === i ? { ...x, category: e.target.value || null } : x))} title="Nhóm tiêu chí">
                <option value="">Nhóm…</option>
                {categoryOptions.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <input type="number" className={inputCls} placeholder="Trọng số %" value={it.weight || ''} onChange={(e) => setTplItems(tplItems.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
              <input className={inputCls} placeholder="Chỉ tiêu (vd ≥95)" value={it.target_value ?? ''} onChange={(e) => setTplItems(tplItems.map((x, j) => j === i ? { ...x, target_value: e.target.value || null } : x))} />
              <input className={inputCls} placeholder="Đơn vị (%, cái…)" value={it.unit ?? ''} onChange={(e) => setTplItems(tplItems.map((x, j) => j === i ? { ...x, unit: e.target.value || null } : x))} />
            </div>
          </div>
        ))}
        <button onClick={() => setTplItems([...tplItems, { name: '', weight: 0, target_type: 'number', category: null }])} className="btn-ghost rounded-lg px-3 py-1.5 text-xs flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Thêm chỉ tiêu</button>

        <div className="pt-2 border-t border-white/5">
          <p className="text-2xs text-muted-foreground mb-2">Tính thêm nguồn tích hợp vào bộ chỉ tiêu NÀY (tùy chọn):</p>
          {tplSources.map((s, i) => (
            <div key={s.source} className="flex items-center gap-3 mb-1.5">
              <label className="flex items-center gap-2 text-xs text-foreground w-28">
                <input type="checkbox" checked={s.enabled} onChange={(e) => setTplSources(tplSources.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))} />
                {s.source === 'attendance' ? 'Chấm công' : 'Task'}
              </label>
              <input type="number" disabled={!s.enabled} className={`${inputCls} w-24`} placeholder="Trọng số %" value={s.weight || ''}
                onChange={(e) => setTplSources(tplSources.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
            </div>
          ))}
        </div>

        <button onClick={saveTemplate} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 w-full">{editingTplId ? 'Cập nhật bộ chỉ tiêu' : 'Lưu bộ chỉ tiêu'}</button>
      </div>

      <div className="rounded-2xl border border-white/5 p-4 space-y-3 lg:col-span-2" style={{ background: 'var(--card)' }}>
        <p className="text-sm font-700 text-foreground flex items-center gap-2"><Settings2 className="h-4 w-4" /> Giao KPI Cho Nhân Viên</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <select className={inputCls} value={assignCycleId} onChange={(e) => setAssignCycleId(e.target.value)}>
            <option value="">Chọn kỳ</option>
            {openCycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={inputCls} value={assignTemplateId} onChange={(e) => setAssignTemplateId(e.target.value)}>
            <option value="">Không dùng mẫu (tùy chỉnh sau)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <KpiUserPicker value={employee} onChange={setEmployee} companyId={companyId} placeholder="Nhân viên được giao" />
          <KpiUserPicker value={manager} onChange={setManager} companyId={companyId} placeholder="Quản lý chấm (tùy chọn)" />
          <KpiUserPicker value={senior} onChange={setSenior} companyId={companyId} placeholder="Cấp cao chốt (tùy chọn)" />
        </div>
        <button onClick={assign} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">Giao phiếu KPI</button>
      </div>

      <BulkAssignForm companyId={companyId} cycles={openCycles} onCreated={refreshAll} />

      <UnitAssignmentForm companyId={companyId} cycles={openCycles} templates={templates} onCreated={refreshAll} />
    </div>
  );
}

function RollupLinkForm({ companyId, cycles }: { companyId: string | null; cycles: KpiCycle[] }) {
  const toast = useToast();
  const rollupCycles = cycles.filter((c) => ROLLUP_ELIGIBLE_PERIODS.includes(c.period_type));
  const [parentId, setParentId] = useState('');
  const [candidates, setCandidates] = useState<KpiCycle[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weights, setWeights] = useState<Record<string, string>>({}); // cycleId → % (chuỗi để điều khiển input)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!parentId) { setCandidates([]); setSelected(new Set()); setWeights({}); return; }
    fetch(withCompany(`/api/kpi/cycles/${parentId}/rollup`, companyId)).then((r) => r.json()).then((j) => {
      const children: (KpiCycle & { rollup_weight?: number | null })[] = j.data?.children || [];
      const cands: KpiCycle[] = j.data?.candidates || [];
      // Gộp: kỳ đã liên kết luôn hiện trong danh sách dù không còn nằm trọn khoảng ngày (hiếm khi đổi ngày sau khi liên kết).
      const merged = [...cands, ...children.filter((c) => !cands.some((x) => x.id === c.id))];
      setCandidates(merged);
      setSelected(new Set(children.map((c) => c.id)));
      const w: Record<string, string> = {};
      children.forEach((c) => { if (c.rollup_weight !== null && c.rollup_weight !== undefined) w[c.id] = String(c.rollup_weight); });
      setWeights(w);
    });
  }, [parentId, companyId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedIds = [...selected];
  const weightSum = selectedIds.reduce((s, id) => s + (parseFloat(weights[id]) || 0), 0);
  const anyWeightSet = selectedIds.some((id) => weights[id]?.trim());

  const save = async () => {
    setSaving(true);
    try {
      // Chỉ gửi trọng số của các kỳ ĐANG chọn; ô để trống → null (chia đều).
      const weightPayload: Record<string, number | null> = {};
      selectedIds.forEach((id) => {
        const v = weights[id]?.trim();
        weightPayload[id] = v ? parseFloat(v) : null;
      });
      const r = await fetch(`/api/kpi/cycles/${parentId}/rollup`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_cycle_ids: selectedIds, weights: weightPayload, company_id: companyId }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Lỗi liên kết kỳ'); return; }
      toast.success('Đã liên kết kỳ tháng vào kỳ tổng hợp');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs w-full';

  if (!rollupCycles.length) return null;

  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
      <p className="text-sm font-700 text-foreground">Liên Kết Kỳ Tháng Vào Kỳ Tổng Hợp</p>
      <p className="text-2xs text-muted-foreground">Kỳ Quý/6 Tháng/Năm vẫn tự nhận xét → duyệt như bình thường. Điểm từ các kỳ tháng liên kết ở đây chỉ là điểm <span className="text-foreground font-600">THAM KHẢO</span> (trung bình <span className="text-foreground font-600">có trọng số</span> các kỳ đã chốt), không tự cộng vào điểm chính thức. Đặt % trọng số cho từng tháng — để trống = chia đều.</p>
      <select className={inputCls} value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <option value="">Chọn kỳ Quý/6 Tháng/Năm</option>
        {rollupCycles.map((c) => <option key={c.id} value={c.id}>{c.name} ({PERIOD_LABEL[c.period_type]})</option>)}
      </select>
      {parentId && (
        <>
          {!candidates.length ? (
            <p className="text-2xs text-muted-foreground">Không có kỳ tháng nào nằm trọn trong khoảng ngày của kỳ này để liên kết.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {candidates.map((c) => {
                const on = selected.has(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2 text-xs text-foreground flex-wrap sm:flex-nowrap">
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer basis-full sm:basis-auto">
                      <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="h-4 w-4" />
                      <span className="truncate">{c.name} <span className="text-muted-foreground">({c.start_date} → {c.end_date})</span></span>
                    </label>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-6 sm:ml-0">
                      <input
                        type="number" min="0" max="100" step="1" inputMode="numeric"
                        disabled={!on}
                        value={on ? (weights[c.id] ?? '') : ''}
                        onChange={(e) => setWeights((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="chia đều"
                        className="w-20 rounded-lg border border-white/10 bg-[#162033] px-2 py-1 text-xs text-right disabled:opacity-40"
                      />
                      <span className="text-muted-foreground">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {anyWeightSet && (
            <p className={`text-2xs ${Math.round(weightSum) === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
              Tổng trọng số: {Math.round(weightSum * 10) / 10}%{Math.round(weightSum) !== 100 ? ' — nên bằng 100% (hệ thống vẫn tự chuẩn hoá theo các kỳ đã chốt).' : ''}
            </p>
          )}
          <button onClick={save} disabled={saving} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">{saving ? 'Đang lưu...' : 'Lưu liên kết'}</button>
        </>
      )}
    </div>
  );
}

/** Danh sách QUẢN TRỊ — mọi phiếu KPI đã giao trong công ty, lọc + xoá phiếu giao nhầm. */
function AssignmentAdminList({ companyId, reloadKey }: { companyId: string | null; reloadKey: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<KpiAssignment[]>([]);
  const [cycles, setCycles] = useState<KpiCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [fCycle, setFCycle] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [search, setSearch] = useState('');
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    fetch(withCompany('/api/kpi/cycles', companyId)).then((r) => r.json()).then((j) => setCycles(j.data || [])).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    fetch(withCompany('/api/kpi/assignments?scope=company', companyId))
      .then((r) => r.json())
      .then((j) => setRows(Array.isArray(j.data) ? j.data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [companyId, reloadKey, tick]);

  const del = async (a: KpiAssignment) => {
    const concluded = a.status === 'concluded';
    const ok = await confirm({
      title: 'Xóa phiếu KPI', danger: true, confirmLabel: 'Xóa phiếu',
      message: `Xóa phiếu KPI của "${a.employee_name || a.employee_id}" — kỳ "${a.cycle_name}"?${concluded ? ' ⚠️ Phiếu ĐÃ CHỐT — xóa sẽ mất điểm chính thức và toàn bộ lịch sử chấm.' : ' Toàn bộ tự nhận xét/điểm đã nhập sẽ mất.'} Không thể hoàn tác.`,
    });
    if (!ok) return;
    const r = await fetch(`/api/kpi/assignments/${a.id}?company_id=${companyId || ''}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error || 'Lỗi xóa phiếu'); return; }
    toast.success('Đã xóa phiếu KPI');
    setSelected((s) => { const n = new Set(s); n.delete(a.id); return n; });
    setTick((t) => t + 1);
  };

  const filtered = rows.filter((a) => {
    if (fCycle && a.cycle_id !== fCycle) return false;
    if (fStatus && a.status !== fStatus) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!(a.employee_name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Chọn nhiều đồng bộ theo bộ lọc hiện tại.
  const filteredIds = filtered.map((a) => a.id);
  const selInView = filteredIds.filter((id) => selected.has(id));
  const allSelected = filteredIds.length > 0 && selInView.length === filteredIds.length;
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allSelected) filteredIds.forEach((id) => n.delete(id));
    else filteredIds.forEach((id) => n.add(id));
    return n;
  });

  const delSelected = async () => {
    const ids = filteredIds.filter((id) => selected.has(id));
    if (!ids.length) return;
    const anyConcluded = filtered.some((a) => ids.includes(a.id) && a.status === 'concluded');
    const ok = await confirm({
      title: `Xóa ${ids.length} phiếu KPI`, danger: true, confirmLabel: `Xóa ${ids.length} phiếu`,
      message: `Xóa ${ids.length} phiếu KPI đã chọn?${anyConcluded ? ' ⚠️ Trong đó có phiếu ĐÃ CHỐT — xóa sẽ mất điểm chính thức và lịch sử chấm.' : ''} Không thể hoàn tác.`,
    });
    if (!ok) return;
    setBulkDeleting(true);
    let done = 0, fail = 0;
    for (const id of ids) {
      try {
        const r = await fetch(`/api/kpi/assignments/${id}?company_id=${companyId || ''}`, { method: 'DELETE' });
        if (r.ok) done++; else fail++;
      } catch { fail++; }
    }
    setBulkDeleting(false);
    setSelected(new Set());
    if (done) toast.success(`Đã xóa ${done} phiếu${fail ? `, ${fail} phiếu lỗi` : ''}`);
    else toast.error('Không xóa được phiếu nào');
    setTick((t) => t + 1);
  };

  const inputCls = 'rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs';

  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3 lg:col-span-2" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-700 text-foreground">Phiếu KPI Đã Giao <span className="text-2xs text-muted-foreground font-400">({filtered.length})</span></p>
        <div className="flex items-center gap-2">
          {selInView.length > 0 && (
            <button onClick={delSelected} disabled={bulkDeleting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-2xs font-600 text-white disabled:opacity-50">
              {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Xóa đã chọn ({selInView.length})
            </button>
          )}
          <button onClick={() => setTick((t) => t + 1)} className="btn-ghost rounded-lg px-2 py-1 text-2xs">Làm mới</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select className={inputCls} value={fCycle} onChange={(e) => setFCycle(e.target.value)}>
          <option value="">Tất cả kỳ</option>
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'closed' ? ' (đã lưu trữ)' : ''}</option>)}
        </select>
        <select className={inputCls} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className={inputCls} placeholder="Tìm theo tên nhân viên…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !filtered.length ? (
        <div className="flex flex-col items-center py-10 text-muted-foreground">
          <Target className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-xs">Chưa có phiếu KPI nào khớp bộ lọc.</p>
        </div>
      ) : (
        <>
          {/* Mobile: card list (bảng nhiều cột không phù hợp màn hẹp) */}
          <div className="space-y-2 sm:hidden">
            {filtered.map((a) => (
              <div key={a.id} className={`rounded-xl border border-white/5 p-3 space-y-1.5 ${selected.has(a.id) ? 'bg-rose-500/5' : ''}`} style={{ background: 'var(--background)' }}>
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-600 text-foreground truncate">{a.employee_name || a.employee_id}</span>
                  </label>
                  <button onClick={() => del(a)} title="Xóa phiếu (giao nhầm)" className="btn-ghost rounded-lg p-2 -m-1 text-rose-400 hover:text-rose-300 shrink-0"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="text-2xs text-muted-foreground truncate">{a.cycle_name}{a.cycle_status === 'closed' && <span className="ml-1">🔒</span>} · QL chấm: {a.manager_name || '—'}</div>
                <div className="flex items-center justify-between text-2xs">
                  <span className={`font-600 ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  <span className="tabular-nums text-foreground">Điểm: {a.final_score ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop/tablet: bảng đầy đủ */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-2xs uppercase tracking-wider text-muted-foreground/70 text-left border-b border-white/5">
                  <th className="py-2 pr-2 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} title="Chọn tất cả" /></th>
                  <th className="py-2 pr-2 font-600">Nhân viên</th>
                  <th className="py-2 px-2 font-600">Kỳ</th>
                  <th className="py-2 px-2 font-600">Quản lý chấm</th>
                  <th className="py-2 px-2 font-600">Trạng thái</th>
                  <th className="py-2 px-2 font-600 text-right">Điểm</th>
                  <th className="py-2 pl-2 font-600 text-right">Xóa</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className={`border-b border-white/5 hover:bg-white/5 ${selected.has(a.id) ? 'bg-rose-500/5' : ''}`}>
                    <td className="py-2 pr-2"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} /></td>
                    <td className="py-2 pr-2 text-foreground">{a.employee_name || a.employee_id}</td>
                    <td className="py-2 px-2 text-muted-foreground">{a.cycle_name}{a.cycle_status === 'closed' && <span className="ml-1 text-2xs">🔒</span>}</td>
                    <td className="py-2 px-2 text-muted-foreground">{a.manager_name || '—'}</td>
                    <td className={`py-2 px-2 font-600 ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-foreground">{a.final_score ?? '—'}</td>
                    <td className="py-2 pl-2 text-right">
                      <button onClick={() => del(a)} title="Xóa phiếu (giao nhầm)" className="btn-ghost rounded-md p-1 text-rose-400 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function BulkAssignForm({ companyId, cycles, onCreated }: { companyId: string | null; cycles: KpiCycle[]; onCreated: () => void }) {
  const toast = useToast();
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [subDepartments, setSubDepartments] = useState<{ id: string; name: string }[]>([]);
  const [scope, setScope] = useState<'company' | 'department' | 'sub_department'>('department');
  const [departmentId, setDepartmentId] = useState('');   // phòng ban (hoặc phòng ban cha khi giao theo bộ phận)
  const [subDepartmentId, setSubDepartmentId] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  useEffect(() => {
    fetch(withCompany('/api/organizations/departments', companyId)).then((r) => r.json()).then((j) => setDepartments(j.data || j || []));
  }, [companyId]);

  // Bộ phận nằm dưới phòng ban → chọn phòng ban cha trước để lọc bộ phận.
  useEffect(() => {
    if (scope !== 'sub_department' || !departmentId) { setSubDepartments([]); return; }
    fetch(`/api/organizations/sub-departments?department_id=${departmentId}`).then((r) => r.json()).then((j) => setSubDepartments(j.data || j || []));
  }, [scope, departmentId]);

  const run = async () => {
    if (!cycleId) { toast.error('Chọn kỳ'); return; }
    if (scope === 'department' && !departmentId) { toast.error('Chọn phòng ban'); return; }
    if (scope === 'sub_department' && (!departmentId || !subDepartmentId)) { toast.error('Chọn phòng ban cha và bộ phận'); return; }
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch('/api/kpi/assignments/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycle_id: cycleId,
          scope,
          department_id: scope === 'department' ? departmentId : undefined,
          sub_department_id: scope === 'sub_department' ? subDepartmentId : undefined,
          company_id: companyId,
        }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Lỗi giao KPI hàng loạt'); return; }
      setResult(j.data);
      toast.success(`Đã giao ${j.data.created} phiếu KPI (bỏ qua ${j.data.skipped} người đã có phiếu)`);
      onCreated();
    } finally {
      setRunning(false);
    }
  };

  const inputCls = 'rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs w-full';

  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3 lg:col-span-2" style={{ background: 'var(--card)' }}>
      <p className="text-sm font-700 text-foreground">Giao KPI Hàng Loạt</p>
      <p className="text-2xs text-muted-foreground">Mỗi nhân viên tự động nhận bộ chỉ tiêu phù hợp nhất (chức danh &gt; phòng ban &gt; toàn công ty) + quản lý trực tiếp của họ. Người đã có phiếu trong kỳ này sẽ được bỏ qua.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select className={inputCls} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
          <option value="">Chọn kỳ</option>
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={inputCls} value={scope} onChange={(e) => { setScope(e.target.value as 'company' | 'department' | 'sub_department'); setDepartmentId(''); setSubDepartmentId(''); }}>
          <option value="department">Theo phòng ban</option>
          <option value="sub_department">Theo bộ phận</option>
          <option value="company">Toàn công ty</option>
        </select>
        {scope === 'department' && (
          <select className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Chọn phòng ban</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {scope === 'sub_department' && (
          <>
            <select className={inputCls} value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setSubDepartmentId(''); }}>
              <option value="">Chọn phòng ban cha</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className={inputCls} value={subDepartmentId} onChange={(e) => setSubDepartmentId(e.target.value)} disabled={!departmentId}>
              <option value="">Chọn bộ phận</option>
              {subDepartments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        )}
      </div>
      <button onClick={run} disabled={running} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">{running ? 'Đang giao...' : 'Giao KPI Hàng Loạt'}</button>
      {result && <p className="text-xs text-muted-foreground">Kết quả: đã giao <span className="text-emerald-400 font-700">{result.created}</span> phiếu, bỏ qua <span className="text-amber-400 font-700">{result.skipped}</span> người đã có phiếu.</p>}
    </div>
  );
}

function UnitAssignmentForm({ companyId, cycles, templates, onCreated }: { companyId: string | null; cycles: KpiCycle[]; templates: KpiTemplate[]; onCreated: () => void }) {
  const toast = useToast();
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [subDepartments, setSubDepartments] = useState<{ id: string; name: string }[]>([]);
  const [unitType, setUnitType] = useState<KpiUnitType>('department');
  const [departmentId, setDepartmentId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selfReviewer, setSelfReviewer] = useState<KpiUserOption | null>(null);
  const [approvers, setApprovers] = useState<(KpiUserOption | null)[]>([null]);

  useEffect(() => {
    fetch(withCompany('/api/organizations/departments', companyId)).then((r) => r.json()).then((j) => setDepartments(j.data || j || []));
  }, [companyId]);

  useEffect(() => {
    if (unitType !== 'sub_department' || !departmentId) { setSubDepartments([]); return; }
    fetch(`/api/organizations/sub-departments?department_id=${departmentId}`).then((r) => r.json()).then((j) => setSubDepartments(j.data || j || []));
  }, [unitType, departmentId]);

  const create = async () => {
    const finalUnitId = unitType === 'department' ? departmentId : unitId;
    const approverIds = approvers.filter((a): a is KpiUserOption => !!a).map((a) => a.id);
    if (!cycleId || !finalUnitId || !approverIds.length) { toast.error('Chọn kỳ, đơn vị và ít nhất 1 người duyệt'); return; }

    const r = await fetch('/api/kpi/unit-assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycle_id: cycleId, unit_type: unitType, unit_id: finalUnitId, template_id: templateId || null,
        self_reviewer_id: selfReviewer?.id || null, approver_ids: approverIds, company_id: companyId,
      }),
    });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi tạo phiếu đơn vị'); return; }
    toast.success('Đã tạo phiếu đánh giá đơn vị');
    setDepartmentId(''); setUnitId(''); setSelfReviewer(null); setApprovers([null]);
    onCreated();
  };

  const inputCls = 'rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs w-full';

  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3 lg:col-span-2" style={{ background: 'var(--card)' }}>
      <p className="text-sm font-700 text-foreground">Tạo Phiếu Đánh Giá Đơn Vị (Phòng Ban/Bộ Phận)</p>
      <p className="text-2xs text-muted-foreground">Tự nhận xét mặc định = trưởng đơn vị (tự động xác định); chuỗi duyệt tùy chỉnh số cấp.</p>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select className={inputCls} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
          <option value="">Chọn kỳ</option>
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={inputCls} value={unitType} onChange={(e) => { setUnitType(e.target.value as KpiUnitType); setDepartmentId(''); setUnitId(''); }}>
          <option value="department">Phòng ban</option>
          <option value="sub_department">Bộ phận</option>
        </select>
        <select className={inputCls} value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); if (unitType === 'department') setUnitId(e.target.value); }}>
          <option value="">{unitType === 'department' ? 'Chọn phòng ban' : 'Chọn phòng ban cha'}</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {unitType === 'sub_department' && (
          <select className={inputCls} value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!departmentId}>
            <option value="">Chọn bộ phận</option>
            {subDepartments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      <select className={inputCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        <option value="">Không dùng mẫu (tùy chỉnh sau)</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <KpiUserPicker value={selfReviewer} onChange={setSelfReviewer} companyId={companyId} placeholder="Người tự nhận xét (để trống = tự động lấy trưởng đơn vị)" />

      <div>
        <p className="text-2xs text-muted-foreground mb-1.5">Chuỗi duyệt (theo thứ tự):</p>
        {approvers.map((a, i) => (
          <div key={i} className="flex items-center gap-2 mb-1.5">
            <span className="text-2xs text-muted-foreground w-14 shrink-0">Tầng {i + 1}</span>
            <KpiUserPicker value={a} onChange={(u) => setApprovers(approvers.map((x, j) => j === i ? u : x))} companyId={companyId} placeholder="Chọn người duyệt" className="flex-1" />
            {approvers.length > 1 && (
              <button onClick={() => setApprovers(approvers.filter((_, j) => j !== i))} className="btn-ghost rounded-lg p-2.5 -m-1 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            )}
          </div>
        ))}
        <button onClick={() => setApprovers([...approvers, null])} className="btn-ghost rounded-lg px-3 py-1.5 text-xs flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Thêm tầng duyệt</button>
      </div>

      <button onClick={create} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">Tạo phiếu đơn vị</button>
    </div>
  );
}

/** Bỏ dấu tiếng Việt, chỉ giữ a-z0-9, nối "-" — dùng làm key nhóm chỉ tiêu (lưu trong DB). */
function slugifyVi(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Tab "Cấu Hình" — gom mọi cấu hình trước đây hardcode/rải rác: cấu hình chung, nhóm chỉ tiêu, ngưỡng xếp loại. */
function KpiConfigTab({ companyId, onGateChanged }: { companyId: string | null; onGateChanged: () => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <IntegrationConfig companyId={companyId} onGateChanged={onGateChanged} />
      <KpiCategoryConfig companyId={companyId} />
      <KpiGradeConfig companyId={companyId} />
    </div>
  );
}

interface EditableCategory { key: string; label: string }

function KpiCategoryConfig({ companyId }: { companyId: string | null }) {
  const toast = useToast();
  const [categories, setCategories] = useState<EditableCategory[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(withCompany('/api/kpi/config', companyId)).then((r) => r.json()).then((j) => {
      const rows = (j.data?.categories || []) as { key: string; label: string }[];
      setCategories(rows.map((r) => ({ key: r.key, label: r.label })));
      setLoaded(true);
    });
  }, [companyId]);

  const save = async () => {
    if (categories.some((c) => !c.label.trim())) { toast.error('Tên nhóm không được để trống'); return; }
    const payload = categories.map((c) => ({ key: c.key || slugifyVi(c.label), label: c.label.trim() }));
    const r = await fetch('/api/kpi/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: payload, company_id: companyId }),
    });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi lưu nhóm chỉ tiêu'); return; }
    toast.success('Đã lưu nhóm chỉ tiêu');
  };

  const inputCls = 'rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs w-full';

  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
      <p className="text-sm font-700 text-foreground">Nhóm Chỉ Tiêu</p>
      <p className="text-2xs text-muted-foreground">Nhóm hiển thị khi tạo Bộ Chỉ Tiêu Mẫu (vd Kết quả công việc, Năng lực...) — mỗi công ty tự định nghĩa riêng.</p>
      {!loaded ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-1.5">
          {categories.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input className={inputCls} placeholder="Tên nhóm" value={c.label}
                onChange={(e) => setCategories(categories.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <button onClick={() => setCategories(categories.filter((_, j) => j !== i))} className="btn-ghost rounded-lg p-2.5 -m-1 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setCategories([...categories, { key: '', label: '' }])} className="btn-ghost rounded-lg px-3 py-1.5 text-xs flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Thêm nhóm</button>
      <button onClick={save} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 w-full">Lưu nhóm chỉ tiêu</button>
    </div>
  );
}

function KpiGradeConfig({ companyId }: { companyId: string | null }) {
  const toast = useToast();
  const [thresholds, setThresholds] = useState<{ grade_a_min: string; grade_b_min: string; grade_c_min: string } | null>(null);

  useEffect(() => {
    fetch(withCompany('/api/kpi/config', companyId)).then((r) => r.json()).then((j) => {
      const t = j.data?.gradeThresholds;
      if (t) setThresholds({ grade_a_min: String(t.grade_a_min), grade_b_min: String(t.grade_b_min), grade_c_min: String(t.grade_c_min) });
    });
  }, [companyId]);

  const save = async () => {
    if (!thresholds) return;
    const a = Number(thresholds.grade_a_min), b = Number(thresholds.grade_b_min), c = Number(thresholds.grade_c_min);
    if (!(a > b && b > c)) { toast.error('Ngưỡng phải giảm dần: A > B > C'); return; }
    const r = await fetch('/api/kpi/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gradeThresholds: { grade_a_min: a, grade_b_min: b, grade_c_min: c }, company_id: companyId }),
    });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi lưu ngưỡng xếp loại'); return; }
    toast.success('Đã lưu ngưỡng xếp loại');
  };

  const inputCls = 'rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs w-full';

  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
      <p className="text-sm font-700 text-foreground">Ngưỡng Xếp Loại</p>
      <p className="text-2xs text-muted-foreground">Điểm chính thức (0-100) ≥ ngưỡng nào thì xếp loại đó. Dưới ngưỡng C = D. Mặc định 90/75/60.</p>
      {!thresholds ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-2xs text-emerald-400 mb-1">A ≥</p>
              <input type="number" className={inputCls} value={thresholds.grade_a_min} onChange={(e) => setThresholds({ ...thresholds, grade_a_min: e.target.value })} />
            </div>
            <div>
              <p className="text-2xs text-sky-400 mb-1">B ≥</p>
              <input type="number" className={inputCls} value={thresholds.grade_b_min} onChange={(e) => setThresholds({ ...thresholds, grade_b_min: e.target.value })} />
            </div>
            <div>
              <p className="text-2xs text-amber-400 mb-1">C ≥</p>
              <input type="number" className={inputCls} value={thresholds.grade_c_min} onChange={(e) => setThresholds({ ...thresholds, grade_c_min: e.target.value })} />
            </div>
          </div>
          <button onClick={save} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 w-full">Lưu ngưỡng xếp loại</button>
        </>
      )}
    </div>
  );
}

function IntegrationConfig({ companyId, onGateChanged }: { companyId: string | null; onGateChanged: () => void }) {
  const toast = useToast();
  const [settings, setSettings] = useState<{ kpi_enabled: boolean; period_type: KpiPeriodType; ranking_enabled_default: boolean } | null>(null);

  useEffect(() => {
    fetch(withCompany('/api/kpi/config', companyId)).then((r) => r.json()).then((j) => setSettings(j.data.settings));
  }, [companyId]);

  const save = async () => {
    if (!settings) return;
    const r = await fetch('/api/kpi/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, company_id: companyId }),
    });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Lỗi lưu cấu hình'); return; }
    toast.success('Đã lưu cấu hình KPI');
    onGateChanged();
  };

  const inputCls = 'rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs w-full';

  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3 lg:col-span-2" style={{ background: 'var(--card)' }}>
      <p className="text-sm font-700 text-foreground">Cấu Hình Chung Của Công Ty</p>
      {!settings ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs text-foreground sm:col-span-2 rounded-lg border border-white/10 px-3 py-2" style={{ background: '#162033' }}>
              <input type="checkbox" checked={settings.kpi_enabled} onChange={(e) => setSettings({ ...settings, kpi_enabled: e.target.checked })} />
              Bật KPI & Đánh Giá cho công ty này
            </label>
            <select className={inputCls} value={settings.period_type} onChange={(e) => setSettings({ ...settings, period_type: e.target.value as KpiPeriodType })}>
              {Object.entries(PERIOD_LABEL).map(([k, v]) => <option key={k} value={k}>Chu kỳ mặc định: {v}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={settings.ranking_enabled_default} onChange={(e) => setSettings({ ...settings, ranking_enabled_default: e.target.checked })} />
              Nhân viên mới mặc định có trong bảng xếp hạng
            </label>
          </div>
          <button onClick={save} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600">Lưu cấu hình</button>
        </>
      )}
    </div>
  );
}
