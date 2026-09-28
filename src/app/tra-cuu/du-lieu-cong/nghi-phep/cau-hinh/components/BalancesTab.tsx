'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, Search, X, History, SlidersHorizontal, Users, Wallet, AlertTriangle, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { normalizeVN } from '@/lib/utils/searchVN';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { fmtDays } from '@/lib/format';

interface BalanceRow {
  user_id: string;
  user_name: string;
  user_email: string;
  department: string | null;
  company_id: string | null;
  company_name: string | null;
  employment_type_name: string | null;
  balance: number;
  granted: number;
  used: number;
  carry_in: number;
}

type SortKey = 'user_name' | 'granted' | 'used' | 'balance';
type SortDir = 'asc' | 'desc';

interface TxRow {
  id: string;
  amount: number;
  source: string;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface Props {
  userId: string;
  role: string;
}

const SOURCE_LABEL: Record<string, string> = {
  accrual: 'Cộng tự động',
  seniority: 'Thâm niên',
  opening: 'Số dư đầu',
  manual: 'Điều chỉnh tay',
  usage: 'Nghỉ phép',
  usage_revert: 'Hoàn quỹ (hủy đơn)',
  carryover_in: 'Chuyển từ năm trước',
  carryover_expire: 'Hết hạn phép chuyển',
};

export default function BalancesTab({ userId, role }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('user_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [adjusting, setAdjusting] = useState<BalanceRow | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);

  const [historyFor, setHistoryFor] = useState<BalanceRow | null>(null);
  const [txRows, setTxRows] = useState<TxRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Chọn nhiều + điều chỉnh đồng loạt
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-current-user-id': userId,
    'x-current-user-role': role,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leave/balance/all?year=${year}`, { headers });
      const json = await res.json();
      if (res.ok && json.success) setRows(json.data);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, year]);

  useEffect(() => { if (userId) void load(); }, [userId, load]);

  async function openHistory(r: BalanceRow) {
    setHistoryFor(r);
    setTxLoading(true);
    try {
      const res = await fetch(`/api/leave/balance?year=${year}&userId=${r.user_id}&transactions=true`, { headers });
      const json = await res.json();
      if (res.ok && json.success) setTxRows(json.data.transactions ?? []);
    } finally {
      setTxLoading(false);
    }
  }

  async function saveAdjust() {
    const amount = Number(adjAmount);
    if (!Number.isFinite(amount) || amount === 0) { setAdjError('Số ngày phải khác 0 (âm = trừ)'); return; }
    if (!adjNote.trim()) { setAdjError('Bắt buộc nhập lý do điều chỉnh'); return; }
    setAdjSaving(true);
    setAdjError(null);
    try {
      const res = await fetch('/api/leave/balance/adjust', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: adjusting!.user_id, year, amount, note: adjNote.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        markAdjClean();
        setAdjusting(null);
        setAdjAmount('');
        setAdjNote('');
        void load();
      } else {
        setAdjError(json.error ?? 'Không lưu được');
      }
    } finally {
      setAdjSaving(false);
    }
  }

  // Danh sách công ty (cho dropdown lọc — hữu ích cho Super Admin xem nhiều công ty)
  const companyNames = useMemo(
    () => Array.from(new Set(rows.map((r) => r.company_name).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = normalizeVN(search).trim();
    const list = rows.filter(
      (r) =>
        (!q ||
          normalizeVN(r.user_name).includes(q) ||
          normalizeVN(r.user_email).includes(q) ||
          normalizeVN(r.department ?? '').includes(q)) &&
        (!companyFilter || r.company_name === companyFilter),
    );
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'user_name') return a.user_name.localeCompare(b.user_name) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [rows, search, companyFilter, sortKey, sortDir]);

  // Thẻ tổng quan (theo danh sách đã lọc)
  const summary = useMemo(() => {
    const totalBalance = filtered.reduce((s, r) => s + r.balance, 0);
    const negative = filtered.filter((r) => r.balance < 0).length;
    return { count: filtered.length, totalBalance, negative };
  }, [filtered]);

  // Chọn tất cả theo danh sách đang lọc
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.user_id));
  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (filtered.length > 0 && filtered.every((r) => prev.has(r.user_id))) {
        filtered.forEach((r) => next.delete(r.user_id));
      } else {
        filtered.forEach((r) => next.add(r.user_id));
      }
      return next;
    });
  }

  async function saveBulkAdjust() {
    const amount = Number(bulkAmount);
    if (!Number.isFinite(amount) || amount === 0) { setBulkError('Số ngày phải khác 0 (âm = trừ)'); return; }
    if (!bulkNote.trim()) { setBulkError('Bắt buộc nhập lý do điều chỉnh'); return; }
    const ids = Array.from(selected);
    if (ids.length === 0) { setBulkError('Chưa chọn nhân sự nào'); return; }
    setBulkSaving(true);
    setBulkError(null);
    try {
      const res = await fetch('/api/leave/balance/adjust-bulk', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_ids: ids, year, amount, note: bulkNote.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        markBulkClean();
        setBulkOpen(false);
        setBulkAmount('');
        setBulkNote('');
        setSelected(new Set());
        void load();
      } else {
        setBulkError(json.error ?? 'Không lưu được');
      }
    } finally {
      setBulkSaving(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'user_name' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="inline h-3 w-3 text-indigo-400" />
      : <ArrowDown className="inline h-3 w-3 text-indigo-400" />;
  }

  async function exportExcel() {
    const XLSX = (await import('xlsx-js-style')).default ?? (await import('xlsx-js-style'));
    const header = ['Nhân sự', 'Email', 'Công ty', 'Phòng ban', 'Hình thức', 'Đã cộng', 'Đã dùng', 'Còn lại'];
    const data = filtered.map((r) => [
      r.user_name, r.user_email, r.company_name ?? '', r.department ?? '',
      r.employment_type_name ?? '', r.granted, r.used, r.balance,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws['!cols'] = [{ wch: 24 }, { wch: 26 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    // In đậm hàng tiêu đề
    for (let c = 0; c < header.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E5E7EB' } } };
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Quỹ phép ${year}`);
    XLSX.writeFile(wb, `quy-phep-${year}.xlsx`);
  }

  const thisYear = new Date().getFullYear();

  // UX modal điều chỉnh hàng loạt (form): ESC + cảnh báo thay đổi chưa lưu
  const closeBulk = useCallback(() => setBulkOpen(false), []);
  const { markDirty: markBulkDirty, markClean: markBulkClean, guardedClose: guardedCloseBulk } = useUnsavedGuard(closeBulk);
  useEscapeKey(guardedCloseBulk, bulkOpen);
  // UX modal điều chỉnh đơn (form): ESC + cảnh báo thay đổi chưa lưu
  const closeAdjust = useCallback(() => setAdjusting(null), []);
  const { markDirty: markAdjDirty, markClean: markAdjClean, guardedClose: guardedCloseAdjust } = useUnsavedGuard(closeAdjust);
  useEscapeKey(guardedCloseAdjust, !!adjusting);
  // UX modal lịch sử (chỉ xem): ESC đóng
  const closeHistory = useCallback(() => setHistoryFor(null), []);
  useEscapeKey(closeHistory, !!historyFor);

  return (
    <div className="space-y-4">
      {/* Thẻ tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-line-subtle p-4 flex items-center gap-3" style={{ background: 'var(--card)' }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 flex-shrink-0">
            <Users className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Nhân sự</p>
            <p className="text-lg font-700 text-foreground">{summary.count}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line-subtle p-4 flex items-center gap-3" style={{ background: 'var(--card)' }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 flex-shrink-0">
            <Wallet className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tổng quỹ còn lại</p>
            <p className="text-lg font-700 text-teal-400">{fmtDays(summary.totalBalance)} <span className="text-xs font-400 text-muted-foreground">ngày</span></p>
          </div>
        </div>
        <div className="rounded-2xl border border-line-subtle p-4 flex items-center gap-3" style={{ background: 'var(--card)' }}>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${summary.negative > 0 ? 'bg-red-500/15' : 'bg-hover'}`}>
            <AlertTriangle className={`h-5 w-5 ${summary.negative > 0 ? 'text-red-400' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Đang âm quỹ</p>
            <p className={`text-lg font-700 ${summary.negative > 0 ? 'text-red-400' : 'text-foreground'}`}>{summary.negative}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, email, phòng ban..."
            className="w-full rounded-xl border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        {companyNames.length > 1 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
          >
            <option value="">Tất cả công ty</option>
            {companyNames.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
        >
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>Năm {y}</option>
          ))}
        </select>
        <button
          onClick={exportExcel}
          disabled={filtered.length === 0}
          className="btn-ghost inline-flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-600 disabled:opacity-40"
          title="Xuất Excel"
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Excel
        </button>
      </div>

      {/* Thanh hành động hàng loạt */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5">
          <span className="text-sm font-600 text-indigo-300">Đã chọn {selected.size} nhân sự</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setBulkOpen(true); setBulkAmount(''); setBulkNote(''); setBulkError(null); }}
              className="btn-indigo inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600"
            >
              <SlidersHorizontal className="h-4 w-4" /> Cộng / Trừ phép đồng loạt
            </button>
            <button onClick={() => setSelected(new Set())} className="btn-ghost rounded-xl px-3 py-2 text-sm">
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-600 uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded accent-indigo-500 cursor-pointer"
                      title="Chọn tất cả"
                    />
                  </th>
                  <th className="px-4 py-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('user_name')}>
                    Nhân sự <SortIcon col="user_name" />
                  </th>
                  <th className="px-4 py-3 hidden md:table-cell">Hình thức</th>
                  <th className="px-4 py-3 text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('granted')}>
                    Đã cộng <SortIcon col="granted" />
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('used')}>
                    Đã dùng <SortIcon col="used" />
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('balance')}>
                    Còn lại <SortIcon col="balance" />
                  </th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.user_id} className={`border-b border-line-subtle last:border-0 hover:bg-hover ${selected.has(r.user_id) ? 'bg-indigo-500/5' : ''}`}>
                    <td className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.has(r.user_id)}
                        onChange={() => toggleSelect(r.user_id)}
                        className="h-4 w-4 rounded accent-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-600 text-foreground">{r.user_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[r.department, r.company_name].filter(Boolean).join(' · ') || r.user_email}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {r.employment_type_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-indigo-400">{fmtDays(r.granted)}</td>
                    <td className="px-4 py-3 text-right text-amber-400">{fmtDays(r.used)}</td>
                    <td className={`px-4 py-3 text-right font-700 ${r.balance < 0 ? 'text-red-400' : 'text-teal-400'}`}>
                      {fmtDays(r.balance)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openHistory(r)}
                          title="Lịch sử giao dịch"
                          className="btn-ghost rounded-lg p-1.5"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setAdjusting(r); setAdjAmount(''); setAdjNote(''); setAdjError(null); }}
                          title="Điều chỉnh quỹ"
                          className="btn-ghost rounded-lg p-1.5"
                        >
                          <SlidersHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Không tìm thấy nhân sự
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal điều chỉnh hàng loạt */}
      {bulkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedCloseBulk(); }}
        >
          <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Điều chỉnh quỹ phép đồng loạt</h2>
              <button onClick={guardedCloseBulk} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4" onChange={markBulkDirty}>
              <p className="text-xs text-muted-foreground">
                Áp dụng cho <span className="font-700 text-indigo-300">{selected.size} nhân sự</span> đã chọn, năm {year}.
                Nhập số dương để <span className="text-teal-400">cộng</span>, số âm để <span className="text-red-400">trừ</span>.
                Mỗi nhân sự được ghi 1 giao dịch vào lịch sử.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Số ngày (+/−)</label>
                <input
                  type="number"
                  step="0.5"
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                  placeholder="vd: 12 (cấp phép năm) hoặc -2"
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Lý do (bắt buộc)</label>
                <textarea
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  rows={2}
                  placeholder="vd: Cấp số dư phép đầu kỳ khi chuyển hệ thống..."
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground resize-none"
                />
              </div>
              {bulkError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{bulkError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedCloseBulk} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button
                onClick={saveBulkAdjust}
                disabled={bulkSaving}
                className="btn-indigo inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-50"
              >
                {bulkSaving && <Loader2 className="h-4 w-4 animate-spin" />} Áp dụng cho {selected.size} nhân sự
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal điều chỉnh */}
      {adjusting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) guardedCloseAdjust(); }}
        >
          <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Điều chỉnh quỹ phép — {adjusting.user_name}</h2>
              <button onClick={guardedCloseAdjust} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4" onChange={markAdjDirty}>
              <p className="text-xs text-muted-foreground">
                Số dư hiện tại năm {year}: <span className="font-700 text-teal-400">{fmtDays(adjusting.balance)} ngày</span>.
                Nhập số dương để cộng, số âm để trừ. Mọi điều chỉnh được lưu vào lịch sử.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Số ngày (+/−)</label>
                <input
                  type="number"
                  step="0.5"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="vd: 2 hoặc -1.5"
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-600 text-muted-foreground uppercase tracking-wider">Lý do (bắt buộc)</label>
                <textarea
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  rows={2}
                  placeholder="vd: Thưởng phép do hoàn thành dự án..."
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-foreground resize-none"
                />
              </div>
              {adjError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{adjError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
              <button onClick={guardedCloseAdjust} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button
                onClick={saveAdjust}
                disabled={adjSaving}
                className="btn-indigo inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-600 disabled:opacity-50"
              >
                {adjSaving && <Loader2 className="h-4 w-4 animate-spin" />} Lưu điều chỉnh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal lịch sử */}
      {historyFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setHistoryFor(null); }}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-line overflow-hidden max-h-[85vh] flex flex-col"
            style={{ background: 'var(--card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 flex-shrink-0">
              <h2 className="text-base font-700 text-foreground">
                Lịch sử quỹ phép {year} — {historyFor.user_name}
              </h2>
              <button onClick={() => setHistoryFor(null)} className="btn-ghost rounded-lg p-1.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {txLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : txRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Chưa có giao dịch nào</p>
              ) : (
                <div className="space-y-2.5">
                  {txRows.map((tx) => (
                    <div key={tx.id} className="flex items-start justify-between gap-3 rounded-xl border border-line-subtle p-3" style={{ background: 'var(--secondary)' }}>
                      <div className="min-w-0">
                        <p className="text-xs font-600 text-foreground">{SOURCE_LABEL[tx.source] ?? tx.source}</p>
                        {tx.note && <p className="mt-0.5 text-xs text-muted-foreground">{tx.note}</p>}
                        <p className="mt-0.5 text-xs text-muted-foreground/60">
                          {new Date(tx.created_at).toLocaleString('vi-VN')}
                          {tx.created_by_name && ` · ${tx.created_by_name}`}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 text-sm font-700 ${Number(tx.amount) >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                        {Number(tx.amount) >= 0 ? '+' : ''}{Number(tx.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
