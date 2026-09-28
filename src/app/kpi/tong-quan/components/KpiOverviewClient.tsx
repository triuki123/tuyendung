'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, BarChart3 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { STATUS_LABEL } from '../../components/kpiTypes';

interface CompanyRow {
  company_id: string;
  company_name: string;
  concluded_count: string | number;
  total_count: string | number;
  avg_score: string | number | null;
}

/** Tổng quan KPI xuyên toàn hệ thống — CHỈ Super Admin. Không chọn công ty = xem tất cả. */
export default function KpiOverviewClient() {
  const toast = useToast();
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<{ status: string; count: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/organizations/companies').then((r) => r.json()).then((j) => setCompanies(j.data || j || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = companyId ? `?company_id=${companyId}` : '';
    fetch(`/api/kpi/overview${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { toast.error(j.error); return; }
        setRows(j.data.byCompany || []);
        setStatusBreakdown(j.data.statusBreakdown || []);
      })
      .catch(() => toast.error('Lỗi tải tổng quan KPI'))
      .finally(() => setLoading(false));
  }, [companyId, toast]);

  const maxAvg = Math.max(1, ...rows.map((r) => Number(r.avg_score) || 0));

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link href="/kpi" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> KPI & Đánh Giá
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Tổng Quan KPI Toàn Hệ Thống</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Chỉ Super Admin — không chọn công ty để xem tổng quan tất cả</p>
        </div>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm">
          <option value="">Tất cả công ty</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {!statusBreakdown.length ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground rounded-2xl border border-white/5" style={{ background: 'var(--card)' }}>
              <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Chưa có phiếu KPI nào trong hệ thống.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {statusBreakdown.map((s) => (
                <div key={s.status} className="rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
                  <p className="text-2xs text-muted-foreground uppercase tracking-wider truncate">{STATUS_LABEL[s.status as keyof typeof STATUS_LABEL] || s.status}</p>
                  <p className="text-xl font-800 text-foreground tabular-nums mt-1">{s.count}</p>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              <p className="text-sm font-700 text-foreground">Điểm trung bình theo công ty (phiếu đã chốt)</p>
            </div>
            {!rows.length ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">Chưa có dữ liệu KPI.</p>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                {rows.map((r) => {
                  const avg = Number(r.avg_score) || 0;
                  return (
                    <div key={r.company_id} className="flex items-center gap-3">
                      <span className="text-sm text-foreground w-40 shrink-0 truncate">{r.company_name}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${avg ? Math.max(4, (avg / maxAvg) * 100) : 0}%` }} />
                      </div>
                      <span className="text-sm font-700 text-foreground tabular-nums w-14 shrink-0 text-right">{avg ? avg.toFixed(1) : '—'}</span>
                      <span className="text-2xs text-muted-foreground w-24 shrink-0 text-right">{r.concluded_count}/{r.total_count} phiếu</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
