'use client';

import { useEffect, useState } from 'react';
import { Loader2, FileText, AlertTriangle, Clock, Infinity as InfinityIcon } from 'lucide-react';
import { Contract, listContracts, daysLeft } from './hrApi';
import { ExpiryBadge } from './ContractsTab';

export default function OverviewTab() {
  const [data, setData] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setData(await listContracts());
      } catch (error) {
        // A missing optional HR schema must not take down the entire overview.
        console.error('Không thể tải hợp đồng trên trang tổng quan:', error);
        setData([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const active = data.filter((c) => c.status === 'active');
  const total = data.length;
  const indefinite = active.filter((c) => !c.end_date).length;
  const expiring30 = active.filter((c) => { const d = daysLeft(c.end_date); return d !== null && d >= 0 && d <= 30; });
  const overdue = active.filter((c) => { const d = daysLeft(c.end_date); return d !== null && d < 0; });

  const attention = [...overdue, ...expiring30]
    .sort((a, b) => (daysLeft(a.end_date) ?? 0) - (daysLeft(b.end_date) ?? 0));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard icon={<FileText className="h-5 w-5" />} label="Tổng hợp đồng" value={total} color="text-foreground" />
        <StatCard icon={<Clock className="h-5 w-5" />} label="Sắp hết hạn (≤30 ngày)" value={expiring30.length} color="text-amber-400" />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Đã quá hạn" value={overdue.length} color="text-red-400" />
        <StatCard icon={<InfinityIcon className="h-5 w-5" />} label="Vô thời hạn" value={indefinite} color="text-emerald-400" />
      </div>

      <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="px-4 py-3 border-b border-line-subtle flex items-center justify-between">
          <div>
            <h3 className="text-base font-600 text-foreground">Cần chú ý gia hạn</h3>
            <p className="text-2xs text-muted-foreground">Hợp đồng quá hạn hoặc sắp hết hạn trong 30 ngày</p>
          </div>
          {attention.length > 0 && (
            <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-500 text-white text-2xs font-700 flex items-center justify-center">
              {attention.length > 99 ? '99+' : attention.length}
            </span>
          )}
        </div>
        {attention.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Không có hợp đồng nào cần chú ý 🎉</p>
        ) : (
          <ul>
            {attention.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3 border-b border-line-subtle last:border-0">
                <div>
                  <p className="text-sm text-foreground font-600">{c.contract_number} · {c.employee_name}</p>
                  <p className="text-2xs text-muted-foreground">Hết hạn {c.end_date} · {c.contract_type_name || '—'}</p>
                </div>
                <ExpiryBadge endDate={c.end_date} status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-line-subtle p-4" style={{ background: 'var(--card)' }}>
      <div className={`flex items-center gap-2 ${color}`}>{icon}</div>
      <p className={`mt-2 text-2xl font-700 ${color}`}>{value}</p>
      <p className="text-2xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
