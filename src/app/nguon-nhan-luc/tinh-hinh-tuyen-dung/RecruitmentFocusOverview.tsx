'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BriefcaseBusiness, FolderKanban, RefreshCw, UsersRound } from 'lucide-react';
import type { RecruitmentFocusData } from '@/lib/services/recruitmentFocusService';
import { STAGES } from '../kho-ung-vien/components/candidateShared';

export default function RecruitmentFocusOverview() {
  const [data, setData] = useState<RecruitmentFocusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/hr/recruitment-dashboard', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Không thể tải số liệu tuyển dụng.');
        return result.data as RecruitmentFocusData;
      })
      .then(result => { if (active) setData(result); })
      .catch(err => {
        if (active) setError(err.name === 'AbortError' ? 'Kết nối mất quá lâu. Vui lòng thử lại.' : err.message);
      })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  const stageCount = (stage: string) => data?.cvs.byStage.find(item => item.label === stage)?.value || 0;
  const metrics = [
    { label: 'Ứng viên trong kho', value: data?.cvs.total || 0 },
    { label: 'CV mới', value: stageCount('new') },
    { label: 'Đang sàng lọc', value: stageCount('screening') },
    { label: 'Đang phỏng vấn', value: stageCount('interviewed') },
    { label: 'Đã offer', value: stageCount('offered') },
    { label: 'Đã Onboard', value: stageCount('hired') },
  ];

  return (
    <div className="space-y-6">
      <Link href="/nguon-nhan-luc" className="inline-flex items-center gap-2 text-sm font-600 text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-5 w-5" /> Tuyển Dụng
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-700 text-foreground">Tổng quan tuyển dụng</h1>
          <p className="mt-1 text-sm text-muted-foreground">Theo dõi ứng viên, tiến độ tuyển và nhu cầu nhân sự.</p>
        </div>
        <button type="button" disabled={loading} onClick={() => setAttempt(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-600 text-foreground disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Làm mới
        </button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" onClick={() => setAttempt(value => value + 1)} className="ml-3 underline">Thử lại</button></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map(metric => <div key={metric.label} className="rounded-2xl border border-line-subtle bg-white p-4">
          <p className="text-sm text-muted-foreground">{metric.label}</p>
          <p className="mt-3 text-3xl font-700 text-foreground">{loading && !data ? '—' : metric.value}</p>
        </div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line-subtle bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-700"><FolderKanban className="h-4 w-4 text-blue-500" />Tiến độ kho CV</h2>
            <Link href="/nguon-nhan-luc/kho-ung-vien" className="text-sm font-600 text-blue-600">Mở kho CV</Link>
          </div>
          <div className="space-y-3">
            {STAGES.map(stage => <div key={stage.key} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground">{stage.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${data?.cvs.total ? stageCount(stage.key) / data.cvs.total * 100 : 0}%` }} /></div>
              <span className="w-8 text-right font-600">{stageCount(stage.key)}</span>
            </div>)}
          </div>
        </section>
        <section className="rounded-2xl border border-line-subtle bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-700"><BriefcaseBusiness className="h-4 w-4 text-blue-500" />Yêu cầu tuyển dụng</h2>
            <Link href="/nguon-nhan-luc/yeu-cau-tuyen-dung" className="text-sm font-600 text-blue-600">Xem yêu cầu</Link>
          </div>
          <dl className="space-y-4 text-sm">
            {[
              ['Đang mở tuyển', data?.requisitions.open || 0],
              ['Tạm dừng', data?.requisitions.onHold || 0],
              ['Hoàn thành trong tháng', data?.requisitions.filledThisMonth || 0],
              ['Nhân sự còn cần tuyển', Math.max((data?.requisitions.totalTarget || 0) - (data?.requisitions.totalFilled || 0), 0)],
              ['Lượt ứng tuyển theo vị trí', data?.applications.total || 0],
            ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-700">{value}</dd></div>)}
          </dl>
        </section>
      </div>
      <section className="rounded-2xl border border-line-subtle bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-700"><UsersRound className="h-4 w-4 text-blue-500" />Nguồn ứng viên</h2>
        {!loading && !data?.cvs.bySource.length ? <p className="text-sm text-muted-foreground">Chưa có ứng viên trong kho.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data?.cvs.bySource.map(source => <div key={source.label} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-3 text-sm"><span className="truncate text-muted-foreground">{source.label}</span><span className="font-700">{source.value}</span></div>)}
        </div>}
      </section>
    </div>
  );
}
