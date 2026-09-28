'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Loader2, FileText, Paperclip, SlidersHorizontal, X, ChevronUp, ChevronDown, ChevronsUpDown, Columns3, Check, History } from 'lucide-react';
import {
  Contract, LookupItem, CompanyOption, DepartmentOption,
  listContracts, deleteContract, daysLeft,
  listCompanies, listDepartments,
} from './hrApi';
import ContractFormModal from './ContractFormModal';
import ContractDetailModal from './ContractDetailModal';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import ErrorState from '@/components/ui/ErrorState';
import RecordHistoryDrawer from '@/components/ui/RecordHistoryDrawer';

interface Props {
  contractTypes: LookupItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

type ModalState = { mode: 'create' | 'edit' | 'renew'; contract?: Contract | null } | null;

export function ExpiryBadge({ endDate, status }: { endDate: string | null; status: string }) {
  if (status !== 'active') return <span className="text-2xs text-muted-foreground">—</span>;
  const d = daysLeft(endDate);
  if (d === null) return <span className="text-2xs text-emerald-400">Vô thời hạn</span>;
  let cls = 'text-muted-foreground';
  let label = `Còn ${d} ngày`;
  if (d < 0) { cls = 'text-red-400 font-600'; label = `Quá hạn ${Math.abs(d)} ngày`; }
  else if (d <= 5) cls = 'text-red-400 font-600';
  else if (d <= 15) cls = 'text-amber-400 font-600';
  else if (d <= 30) cls = 'text-amber-300';
  return <span className={`text-2xs ${cls}`}>{label}</span>;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:           { label: 'Nháp',        cls: 'bg-hover-strong text-muted-foreground' },
  pending_signing: { label: 'Chờ ký',      cls: 'bg-amber-500/15 text-amber-400' },
  active:          { label: 'Hiệu lực',    cls: 'bg-emerald-500/15 text-emerald-400' },
  renewed:         { label: 'Đã gia hạn',  cls: 'bg-indigo-500/15 text-indigo-400' },
  terminated:      { label: 'Chấm dứt',    cls: 'bg-red-500/15 text-red-400' },
};

function fmtDate(val: string | null | undefined): string {
  if (!val) return 'Vô thời hạn';
  // Lấy phần YYYY-MM-DD rồi format thành DD/MM/YYYY
  const s = val.slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return val;
  return `${d}/${m}/${y}`;
}

const SELECT_CLS = 'rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500 w-full';

type SortKey = 'contract_number' | 'employee_name' | 'end_date' | 'days_left' | 'status';

function SortTh({ label, sk, cur, dir, onSort }: {
  label: string; sk: SortKey; cur: SortKey; dir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
}) {
  const active = cur === sk;
  const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className="px-4 py-3 cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(sk)}>
      <span className="inline-flex items-center gap-1">
        {label} <Icon className={`h-3 w-3 ${active ? 'text-indigo-400' : 'opacity-40'}`} />
      </span>
    </th>
  );
}

function fmtDateDash(val: string | null | undefined): string {
  if (!val) return '—';
  const s = val.slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return val;
  return `${d}/${m}/${y}`;
}

// ── Cột tuỳ biến (bật/tắt). Số HĐ / Nhân viên / Chức vụ / Thao tác là cột CỐ ĐỊNH. ──
type ColId = 'department' | 'company' | 'contract_type' | 'employment_type' | 'sign_date' | 'start_date' | 'end_date' | 'days_left' | 'salary' | 'status';
interface ToggleCol { id: ColId; label: string; sortKey?: SortKey; defaultOn: boolean; render: (c: Contract) => ReactNode; }
const TOGGLE_COLUMNS: ToggleCol[] = [
  { id: 'department',      label: 'Phòng ban',           defaultOn: true,  render: (c) => <span className="text-xs">{c.employee_department_name || '—'}</span> },
  { id: 'company',         label: 'Công ty',             defaultOn: false, render: (c) => <span className="text-xs">{c.employee_company_name || '—'}</span> },
  { id: 'contract_type',   label: 'Loại HĐ',             defaultOn: true,  render: (c) => c.contract_type_name || '—' },
  { id: 'employment_type', label: 'Hình thức làm việc',  defaultOn: false, render: (c) => c.employment_type_name || '—' },
  { id: 'sign_date',       label: 'Ngày ký',             defaultOn: false, render: (c) => fmtDateDash(c.sign_date) },
  { id: 'start_date',      label: 'Ngày bắt đầu',        defaultOn: false, render: (c) => fmtDateDash(c.start_date) },
  { id: 'end_date',        label: 'Hết hạn', sortKey: 'end_date', defaultOn: true, render: (c) => fmtDate(c.end_date) },
  { id: 'days_left',       label: 'Còn lại', sortKey: 'days_left', defaultOn: true, render: (c) => <ExpiryBadge endDate={c.end_date} status={c.status} /> },
  { id: 'salary',          label: 'Lương / Chế độ',      defaultOn: false, render: (c) => <span className="text-xs">{c.salary_info || '—'}</span> },
  { id: 'status',          label: 'Trạng thái', sortKey: 'status', defaultOn: true, render: (c) => { const st = STATUS_LABEL[c.status] || STATUS_LABEL.draft; return <span className={`rounded-full px-2 py-0.5 text-2xs ${st.cls}`}>{st.label}</span>; } },
];
const COL_KEY = 'hr_contract_cols_v1';

export default function ContractsTab({ contractTypes, canCreate, canEdit, canDelete }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<Contract | null>(null);

  // Bộ lọc server-side (trạng thái cố định: chỉ nháp + chờ ký)
  const [typeFilter, setTypeFilter]         = useState('');
  const [expiryFilter, setExpiryFilter]     = useState('');
  const [companyFilter, setCompanyFilter]   = useState('');
  const [deptFilter, setDeptFilter]         = useState('');

  // Tìm kiếm client-side
  const [search, setSearch] = useState('');

  // Sắp xếp
  const [sortKey, setSortKey] = useState<SortKey>('end_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  // Danh sách dropdown
  const [companies, setCompanies]   = useState<CompanyOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Cột tuỳ biến (lưu localStorage)
  const [visibleCols, setVisibleCols] = useState<ColId[]>(() => TOGGLE_COLUMNS.filter((c) => c.defaultOn).map((c) => c.id));
  const [showCols, setShowCols] = useState(false);
  useEffect(() => {
    try { const s = localStorage.getItem(COL_KEY); if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) setVisibleCols(arr); } } catch { /* noop */ }
  }, []);
  function toggleCol(id: ColId) {
    setVisibleCols((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(COL_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }
  const shownCols = TOGGLE_COLUMNS.filter((c) => visibleCols.includes(c.id));

  // Load danh sách công ty 1 lần
  useEffect(() => {
    listCompanies().then(setCompanies);
  }, []);

  // Khi đổi công ty → reload phòng ban theo công ty đó + reset phòng ban đã chọn
  useEffect(() => {
    setDeptFilter('');
    listDepartments(companyFilter || undefined).then(setDepartments);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter]);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string> = { status: 'draft,pending_signing' };
      if (typeFilter)    params.contract_type_id = typeFilter;
      if (expiryFilter)  params.expiry         = expiryFilter;
      if (companyFilter) params.company_id     = companyFilter;
      if (deptFilter)    params.department_id  = deptFilter;
      setData(await listContracts(params));
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [typeFilter, expiryFilter, companyFilter, deptFilter]);

  const filtered = data
    .filter((c) =>
      !search ||
      c.contract_number.toLowerCase().includes(search.toLowerCase()) ||
      (c.employee_name || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'contract_number') { va = a.contract_number; vb = b.contract_number; }
      else if (sortKey === 'employee_name') { va = a.employee_name || ''; vb = b.employee_name || ''; }
      else if (sortKey === 'end_date') { va = a.end_date ?? '9999'; vb = b.end_date ?? '9999'; }
      else if (sortKey === 'days_left') { va = daysLeft(a.end_date) ?? 99999; vb = daysLeft(b.end_date) ?? 99999; }
      else if (sortKey === 'status') { va = a.status; vb = b.status; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  function clearFilters() {
    setTypeFilter('');
    setExpiryFilter('');
    setCompanyFilter(''); // useEffect sẽ tự reload departments + reset deptFilter
    setSearch('');
  }

  const hasFilter = !!(typeFilter || expiryFilter || companyFilter || deptFilter || search);

  async function onDelete(c: Contract) {
    const ok = await confirm({ title: 'Xóa hợp đồng?', message: `Xóa hợp đồng ${c.contract_number}?`, confirmLabel: 'Xóa', danger: true });
    if (!ok) return;
    try {
      await deleteContract(c.id);
      toast.success('Đã xóa hợp đồng');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không xóa được hợp đồng');
    }
  }

  return (
    <div className="space-y-4">

      {/* ── Thanh tìm kiếm + nút bộ lọc + thêm ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm số HĐ hoặc tên nhân viên…"
          className="flex-1 rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
          style={{ background: 'var(--input)' }}
        />
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-sm flex items-center gap-1.5 ${
              showFilters || hasFilter
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                : 'border-line text-muted-foreground hover:text-foreground hover:bg-hover'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Bộ lọc
            {hasFilter && (
              <span className="ml-1 rounded-full bg-indigo-500 text-white text-2xs px-1.5 py-0.5 leading-none">
                {[typeFilter, expiryFilter, companyFilter, deptFilter, search].filter(Boolean).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowCols((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-sm flex items-center gap-1.5 ${
              showCols ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-line text-muted-foreground hover:text-foreground hover:bg-hover'
            }`}
          >
            <Columns3 className="h-4 w-4" /> Cột
          </button>
          {canCreate && (
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Thêm
            </button>
          )}
        </div>
      </div>

      {/* ── Bộ lọc mở rộng ── */}
      {showFilters && (
        <div className="rounded-2xl border border-line-subtle p-4 space-y-3" style={{ background: 'var(--card)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">

            {/* Loại hợp đồng */}
            <div className="space-y-1">
              <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Loại hợp đồng</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                className={SELECT_CLS} style={{ background: 'var(--input)' }}>
                <option value="">Tất cả loại</option>
                {contractTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Thời hạn */}
            <div className="space-y-1">
              <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Thời hạn</label>
              <select value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)}
                className={SELECT_CLS} style={{ background: 'var(--input)' }}>
                <option value="">Tất cả</option>
                <option value="30">Sắp hết hạn ≤ 30 ngày</option>
                <option value="60">Sắp hết hạn ≤ 60 ngày</option>
                <option value="90">Sắp hết hạn ≤ 90 ngày</option>
                <option value="overdue">Đã quá hạn</option>
                <option value="indefinite">Vô thời hạn</option>
              </select>
            </div>

            {/* Công ty */}
            <div className="space-y-1">
              <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Công ty</label>
              <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
                className={SELECT_CLS} style={{ background: 'var(--input)' }}>
                <option value="">Tất cả công ty</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Phòng ban — chỉ bật khi đã chọn công ty */}
            <div className="space-y-1">
              <label className={`text-2xs font-600 uppercase tracking-wider ${companyFilter ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                Phòng ban {!companyFilter && <span className="normal-case font-400">(chọn công ty trước)</span>}
              </label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                disabled={!companyFilter}
                className={`${SELECT_CLS} ${!companyFilter ? 'opacity-40 cursor-not-allowed' : ''}`}
                style={{ background: 'var(--input)' }}
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {hasFilter && (
            <button onClick={clearFilters}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" /> Xóa tất cả bộ lọc
            </button>
          )}
        </div>
      )}

      {/* ── Chọn cột hiển thị ── */}
      {showCols && (
        <div className="rounded-2xl border border-line-subtle p-4 space-y-2" style={{ background: 'var(--card)' }}>
          <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Cột cố định: Số HĐ · Nhân viên · Chức vụ · Thao tác. Bật/tắt các cột khác:</p>
          <div className="flex flex-wrap gap-1.5">
            {TOGGLE_COLUMNS.map((col) => {
              const on = visibleCols.includes(col.id);
              return (
                <button key={col.id} type="button" onClick={() => toggleCol(col.id)}
                  className={`rounded-full px-2.5 py-1 text-2xs border transition flex items-center gap-1 ${on ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:text-foreground'}`}>
                  {on && <Check className="h-3 w-3" />}{col.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bảng danh sách ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <ErrorState message="Không tải được danh sách hợp đồng. Vui lòng thử lại." onRetry={load} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <FileText className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">{hasFilter ? 'Không tìm thấy hợp đồng phù hợp' : 'Chưa có hợp đồng'}</p>
          <p className="text-xs mt-1 opacity-60">
            {hasFilter ? 'Thử thay đổi hoặc xóa bộ lọc.' : 'Bấm "Thêm" để tạo hợp đồng đầu tiên.'}
          </p>
          {hasFilter && (
            <button onClick={clearFilters}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <X className="h-3 w-3" /> Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground px-1">
            Đang hiển thị <span className="text-foreground font-600">{filtered.length}</span> hợp đồng
            {data.length !== filtered.length && ` (lọc từ ${data.length})`}
          </p>

          {/* ── Mobile cards (< sm) ── */}
          <div className="sm:hidden space-y-2">
            {filtered.map((c) => {
              const st = STATUS_LABEL[c.status] || STATUS_LABEL.draft;
              return (
                <div key={c.id} onClick={() => setDetailId(c.id)}
                  className="rounded-2xl border border-line-subtle p-4 cursor-pointer active:bg-hover"
                  style={{ background: 'var(--card)' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-600 text-foreground flex items-center gap-1.5">
                        {c.contract_number}
                        {(c.attachment_count || 0) > 0 && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                      </p>
                      <p className="text-xs text-foreground mt-0.5">{c.employee_name || '—'}</p>
                      {c.employee_job_title && (
                        <p className="text-2xs text-muted-foreground truncate">{c.employee_job_title}</p>
                      )}
                      {c.employee_company_name && (
                        <p className="text-2xs text-muted-foreground truncate">{c.employee_company_name}</p>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-2xs shrink-0 ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-2xs text-muted-foreground">
                      {[c.contract_type_name, c.employment_type_name, c.employee_department_name].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <ExpiryBadge endDate={c.end_date} status={c.status} />
                  </div>
                  <p className="text-2xs text-muted-foreground mt-0.5">Hết hạn: {fmtDate(c.end_date)}</p>
                  <div className="flex items-center justify-end gap-1 mt-3 pt-2.5 border-t border-line-subtle"
                    onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setHistoryOf(c)} title="Lịch sử xử lý"
                      className="rounded-lg p-2 text-muted-foreground hover:text-sky-400 hover:bg-hover">
                      <History className="h-4 w-4" />
                    </button>
                    {canCreate && c.status === 'active' && (
                      <button onClick={() => setModal({ mode: 'renew', contract: c })} title="Gia hạn"
                        className="rounded-lg p-2 text-muted-foreground hover:text-emerald-400 hover:bg-hover">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => setModal({ mode: 'edit', contract: c })} title="Sửa"
                        className="rounded-lg p-2 text-muted-foreground hover:text-indigo-400 hover:bg-hover">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => onDelete(c)} title="Xóa"
                        className="rounded-lg p-2 text-muted-foreground hover:text-red-400 hover:bg-hover">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop table (sm+) ── */}
          <div className="hidden sm:block rounded-2xl border border-line-subtle overflow-x-auto" style={{ background: 'var(--card)' }}>
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-line-subtle text-left text-2xs uppercase tracking-wider text-muted-foreground">
                <SortTh label="Số HĐ"     sk="contract_number" cur={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortTh label="Nhân viên"  sk="employee_name"  cur={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-3">Chức vụ</th>
                {shownCols.map((col) => col.sortKey
                  ? <SortTh key={col.id} label={col.label} sk={col.sortKey} cur={sortKey} dir={sortDir} onSort={toggleSort} />
                  : <th key={col.id} className="px-4 py-3">{col.label}</th>)}
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                return (
                  <tr key={c.id}
                    onClick={() => setDetailId(c.id)}
                    className="border-b border-line-subtle last:border-0 hover:bg-hover cursor-pointer">
                    <td className="px-4 py-3 text-foreground font-600">
                      <span className="flex items-center gap-1.5">
                        {c.contract_number}
                        {(c.attachment_count || 0) > 0 && (
                          <Paperclip className="h-3 w-3 text-muted-foreground" />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{c.employee_name || '—'}</p>
                      {c.employee_job_title && (
                        <p className="text-2xs text-muted-foreground">{c.employee_job_title}</p>
                      )}
                      {c.employee_company_name && (
                        <p className="text-2xs text-muted-foreground">{c.employee_company_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.employee_job_title || '—'}</td>
                    {shownCols.map((col) => (
                      <td key={col.id} className="px-4 py-3 text-muted-foreground">{col.render(c)}</td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setHistoryOf(c)} title="Lịch sử xử lý"
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-sky-400 hover:bg-hover">
                          <History className="h-4 w-4" />
                        </button>
                        {canCreate && c.status === 'active' && (
                          <button onClick={() => setModal({ mode: 'renew', contract: c })} title="Gia hạn"
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-emerald-400 hover:bg-hover">
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => setModal({ mode: 'edit', contract: c })} title="Sửa"
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400 hover:bg-hover">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => onDelete(c)} title="Xóa"
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-hover">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {modal && (
        <ContractFormModal
          mode={modal.mode}
          contract={modal.contract}
          contractTypes={contractTypes}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}

      {detailId && (
        <ContractDetailModal
          contractId={detailId}
          canEdit={canEdit}
          canCreate={canCreate}
          contractTypes={contractTypes}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const c = data.find((x) => x.id === detailId) ?? null;
            setModal({ mode: 'edit', contract: c });
            setDetailId(null);
          }}
          onRenew={() => {
            const c = data.find((x) => x.id === detailId) ?? null;
            setModal({ mode: 'renew', contract: c });
            setDetailId(null);
          }}
          onStatusChanged={() => load()}
        />
      )}

      {historyOf && (
        <RecordHistoryDrawer
          entityType="contract"
          entityId={historyOf.id}
          title={`${historyOf.contract_number}${historyOf.employee_name ? ` · ${historyOf.employee_name}` : ''}`}
          onClose={() => setHistoryOf(null)}
        />
      )}
    </div>
  );
}
