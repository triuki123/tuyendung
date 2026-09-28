'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft, Inbox, Eye, UserPlus, Settings2, Search, RefreshCw, X, FileDown } from 'lucide-react';
import {
  listOnbSubmissions, loadOrgData, OnbSubmission, ONB_STATUS_LABELS, fmtDateTime,
} from '@/lib/api/onboardingApi';
import SubmissionDetailModal from '../../components/SubmissionDetailModal';
import FieldConfigPanel from './FieldConfigPanel';
import DateInputVN from '@/components/ui/DateInputVN';
import { normalizeVN } from '@/lib/utils/searchVN';
import { useToast } from '@/context/ToastContext';
import ErrorState from '@/components/ui/ErrorState';

type Tab = 'list' | 'config';
type SortBy = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

/** Thứ tự trạng thái cho dropdown lọc. */
const STATUS_OPTIONS = ['pending', 'submitted', 'confirmed', 'sent_to_admin', 'approved', 'rejected'];

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (an toàn nếu rỗng). */
function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : String(d);
}

/** Sub-page Onboarding: danh sách nhân sự mới + cấu hình biểu mẫu. */
export default function OnboardingClient() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('list');
  const [submissions, setSubmissions] = useState<OnbSubmission[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [detailId, setDetailId] = useState('');
  // Bộ lọc báo cáo KPI tuyển dụng
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [hireFrom, setHireFrom] = useState('');
  const [hireTo, setHireTo] = useState('');

  const companyMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of companies) m[c.id] = c.name;
    return m;
  }, [companies]);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else { setLoading(true); setError(false); }
    try {
      const res = await listOnbSubmissions();
      setSubmissions(res.data);
      setCounts(res.counts);
    } catch (e) {
      console.error(e);
      if (isRefresh) toast.error('Không tải được danh sách nhân sự, vui lòng thử lại');
      else setError(true);
    } finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { loadOrgData().then(o => setCompanies(o.companies)).catch(() => toast.error('Không tải được danh sách công ty, vui lòng thử lại')); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleChanged = (updated: OnbSubmission) => {
    setSubmissions(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
    listOnbSubmissions().then(r => setCounts(r.counts)).catch(() => {});
  };

  const filtered = useMemo(() => {
    let list = filter ? submissions.filter(s => s.status === filter) : submissions;
    if (filterCompany) list = list.filter(s => s.data?.company_id === filterCompany);
    if (hireFrom) list = list.filter(s => (s.data?.hire_date || '') >= hireFrom);
    if (hireTo) list = list.filter(s => (s.data?.hire_date || '') && (s.data?.hire_date || '') <= hireTo);
    const q = normalizeVN(search).trim();
    if (q) {
      list = list.filter(s => {
        const hay = normalizeVN([
          s.candidate_name, s.candidate_email,
          s.data?.phone, s.data?.job_title, s.data?.personal_email,
        ].filter(Boolean).join(' '));
        return hay.includes(q);
      });
    }
    const ts = (s: OnbSubmission) => new Date(s.submitted_at || s.created_at).getTime();
    return [...list].sort((a, b) => {
      if (sortBy === 'name_asc') return a.candidate_name.localeCompare(b.candidate_name, 'vi');
      if (sortBy === 'name_desc') return b.candidate_name.localeCompare(a.candidate_name, 'vi');
      return sortBy === 'oldest' ? ts(a) - ts(b) : ts(b) - ts(a);
    });
  }, [submissions, filter, search, sortBy, filterCompany, hireFrom, hireTo]);

  /** Xuất báo cáo PDF (qua cửa sổ in của trình duyệt — render tiếng Việt chuẩn). */
  const exportPdf = () => {
    const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { toast.error('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up rồi thử lại.'); return; }

    const byCompany: Record<string, number> = {};
    for (const s of filtered) {
      const cname = companyMap[s.data?.company_id] || 'Chưa phân bổ';
      byCompany[cname] = (byCompany[cname] || 0) + 1;
    }
    const companySummary = Object.entries(byCompany).sort((a, b) => b[1] - a[1]);

    const now = new Date();
    const genTime = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    const filterDesc: string[] = [];
    filterDesc.push(`Công ty: <b>${filterCompany ? esc(companyMap[filterCompany] || '') : 'Tất cả'}</b>`);
    if (hireFrom || hireTo) filterDesc.push(`Ngày vào làm: <b>${hireFrom ? fmtDate(hireFrom) : '…'} → ${hireTo ? fmtDate(hireTo) : '…'}</b>`);
    if (filter) filterDesc.push(`Trạng thái: <b>${esc(ONB_STATUS_LABELS[filter]?.label || filter)}</b>`);
    if (search) filterDesc.push(`Từ khóa: <b>${esc(search)}</b>`);

    const rowsHtml = filtered.map((s, i) => `<tr>
      <td class="c">${i + 1}</td><td>${esc(s.candidate_name)}</td>
      <td>${esc(companyMap[s.data?.company_id] || '—')}</td>
      <td class="c">${fmtDate(s.data?.hire_date)}</td>
      <td>${esc(s.data?.job_title || '—')}</td>
      <td>${esc(ONB_STATUS_LABELS[s.status]?.label || s.status)}</td></tr>`).join('');
    const summaryHtml = companySummary.map(([name, n]) => `<tr><td>${esc(name)}</td><td class="c">${n}</td></tr>`).join('');

    win.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo tuyển dụng</title>
    <style>
      *{font-family:'Segoe UI',Arial,sans-serif}@page{size:A4;margin:1.5cm}
      body{color:#111;font-size:12px}h1{font-size:18px;margin:0 0 2px}
      .muted{color:#555;font-size:11px}.meta{margin:10px 0 14px;font-size:11px;line-height:1.7}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}
      th{background:#f0f2f5;font-size:11px;text-transform:uppercase}td.c,th.c{text-align:center}
      .total{margin:12px 0;font-size:14px;font-weight:700}.sumtable{width:auto;min-width:240px}
      .foot{margin-top:18px;text-align:right;color:#888;font-size:10px}
    </style></head><body onload="window.print()">
    <h1>BÁO CÁO TIẾP NHẬN NHÂN SỰ</h1>
    <div class="muted">FADO Group — Bộ phận Tuyển dụng · Xuất lúc ${esc(genTime)}</div>
    <div class="meta">${filterDesc.join(' &nbsp;·&nbsp; ')}</div>
    <div class="total">Tổng số: ${filtered.length} người</div>
    <div class="muted" style="margin-bottom:4px">Thống kê theo công ty</div>
    <table class="sumtable"><thead><tr><th>Công ty</th><th class="c">Số người</th></tr></thead>
    <tbody>${summaryHtml || '<tr><td colspan="2">—</td></tr>'}</tbody></table>
    <table><thead><tr><th class="c">STT</th><th>Họ tên</th><th>Công ty</th><th class="c">Ngày vào làm</th><th>Chức danh</th><th>Trạng thái</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="6" class="c">Không có dữ liệu</td></tr>'}</tbody></table>
    <div class="foot">© ${now.getFullYear()} FADO Group — AssetFlow Pro</div>
    </body></html>`);
    win.document.close();
  };

  const STAT_CARDS = [
    { key: 'submitted', label: 'Chờ chuẩn hóa' },
    { key: 'confirmed', label: 'Đã xác nhận' },
    { key: 'sent_to_admin', label: 'Chờ QTV duyệt' },
    { key: 'approved', label: 'Đã vào hệ thống' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Nguồn Nhân Lực
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2.5">
          <UserPlus className="h-6 w-6 text-emerald-400" /> Onboarding
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Tiếp nhận và xử lý thông tin nhân sự mới</p>
      </div>

      <div className="flex gap-2 border-b border-line">
        <button onClick={() => setTab('list')} className={`px-3 py-2.5 text-sm font-500 border-b-2 flex items-center gap-1.5 ${tab === 'list' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>
          <Inbox className="h-4 w-4" /> Nhân Sự Mới ({submissions.length})
        </button>
        <button onClick={() => setTab('config')} className={`px-3 py-2.5 text-sm font-500 border-b-2 flex items-center gap-1.5 ${tab === 'config' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground'}`}>
          <Settings2 className="h-4 w-4" /> Cấu Hình Biểu Mẫu
        </button>
      </div>

      {tab === 'config' ? <FieldConfigPanel /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {STAT_CARDS.map(c => {
              const st = ONB_STATUS_LABELS[c.key];
              const active = filter === c.key;
              return (
                <button key={c.key} onClick={() => setFilter(active ? '' : c.key)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${active ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-line-subtle hover:bg-hover'}`}
                  style={!active ? { background: 'var(--card)' } : undefined}>
                  <p className="text-2xl font-700 text-foreground">{counts[c.key] || 0}</p>
                  <p className={`text-2xs font-600 mt-0.5 ${st.color.split(' ')[0]}`}>{c.label}</p>
                </button>
              );
            })}
          </div>

          {/* Toolbar: tìm kiếm + lọc trạng thái + sắp xếp + làm mới */}
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, email, SĐT, chức danh..."
                  className="w-full h-10 pl-9 pr-9 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Xóa tìm kiếm">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-2.5">
                <select value={filter} onChange={e => setFilter(e.target.value)}
                  className="h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60">
                  <option value="">Tất cả trạng thái</option>
                  {STATUS_OPTIONS.map(k => <option key={k} value={k}>{ONB_STATUS_LABELS[k].label}</option>)}
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
                  className="h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60">
                  <option value="newest">Mới nhất</option>
                  <option value="oldest">Cũ nhất</option>
                  <option value="name_asc">Tên A→Z</option>
                  <option value="name_desc">Tên Z→A</option>
                </select>
                <button onClick={() => load(true)} disabled={refreshing} title="Làm mới"
                  className="h-10 px-3 rounded-xl border border-line btn-ghost flex items-center disabled:opacity-50" aria-label="Làm mới">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Hàng 2: báo cáo KPI tuyển dụng — lọc Công ty + khoảng Ngày vào làm + Xuất PDF */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                className="h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 sm:w-56">
                <option value="">Tất cả công ty</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Vào làm:</span>
                <DateInputVN value={hireFrom} onChange={e => setHireFrom(e.target.value)} aria-label="Từ ngày vào làm"
                  className="h-10 px-2.5 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 flex-1 min-w-0" />
                <span className="text-xs text-muted-foreground">→</span>
                <DateInputVN value={hireTo} onChange={e => setHireTo(e.target.value)} aria-label="Đến ngày vào làm"
                  className="h-10 px-2.5 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 flex-1 min-w-0" />
              </div>
              {(filterCompany || hireFrom || hireTo) && (
                <button onClick={() => { setFilterCompany(''); setHireFrom(''); setHireTo(''); }}
                  className="h-10 px-3 rounded-xl btn-ghost border border-line text-xs shrink-0">Xóa lọc</button>
              )}
              <button onClick={exportPdf} disabled={filtered.length === 0}
                className="h-10 px-4 rounded-xl btn-accent text-sm font-600 flex items-center justify-center gap-2 disabled:opacity-50 shrink-0 sm:ml-auto">
                <FileDown className="h-4 w-4" /> Xuất PDF
              </button>
            </div>

            {!loading && (
              <p className="text-xs text-muted-foreground">
                Hiển thị <b className="text-foreground">{filtered.length}</b>/{submissions.length} nhân sự
                {(search || filter) && <span className="text-indigo-400"> · đã lọc</span>}
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <ErrorState message="Không tải được danh sách nhân sự mới. Vui lòng thử lại." onRetry={() => load()} />
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-muted-foreground">
              <Inbox className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">{submissions.length === 0 ? 'Chưa có nhân sự mới nào' : 'Không tìm thấy nhân sự phù hợp'}</p>
              <p className="text-xs mt-1 opacity-60">
                {submissions.length === 0
                  ? 'Chia sẻ link biểu mẫu ở tab "Cấu Hình Biểu Mẫu" để bắt đầu'
                  : 'Thử đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-subtle text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-4 py-3 font-600">Nhân sự mới</th>
                      <th className="px-4 py-3 font-600 hidden lg:table-cell">Công ty</th>
                      <th className="px-4 py-3 font-600 hidden md:table-cell">Ngày vào làm</th>
                      <th className="px-4 py-3 font-600 hidden xl:table-cell">Email cá nhân</th>
                      <th className="px-4 py-3 font-600">Trạng thái</th>
                      <th className="px-4 py-3 font-600 hidden 2xl:table-cell">Nộp lúc</th>
                      <th className="px-4 py-3 font-600 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => {
                      const st = ONB_STATUS_LABELS[s.status];
                      return (
                        <tr key={s.id} className="border-b border-line-subtle hover:bg-hover cursor-pointer" onClick={() => setDetailId(s.id)}>
                          <td className="px-4 py-3">
                            <p className="font-500 text-foreground">{s.candidate_name}</p>
                            {s.data?.job_title && <p className="text-2xs text-muted-foreground">{s.data.job_title}</p>}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{companyMap[s.data?.company_id] || '—'}</td>
                          <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{fmtDate(s.data?.hire_date)}</td>
                          <td className="px-4 py-3 hidden xl:table-cell text-muted-foreground">{s.candidate_email || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-2xs font-600 ${st.color}`}>{st.label}</span>
                          </td>
                          <td className="px-4 py-3 hidden 2xl:table-cell text-xs text-muted-foreground">{fmtDateTime(s.submitted_at)}</td>
                          <td className="px-4 py-3"><div className="flex justify-end"><span className="btn-ghost rounded-lg p-1.5"><Eye className="h-4 w-4" /></span></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {detailId && (
        <SubmissionDetailModal submissionId={detailId} onClose={() => setDetailId('')} onChanged={handleChanged} />
      )}
    </div>
  );
}
