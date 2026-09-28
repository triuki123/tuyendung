'use client';

/**
 * Dòng chảy Ticket → Chi Phí: panel trên chi tiết ticket — xem nhanh các phiếu chi
 * gắn với ticket này (đang ở bước nào) + nút "Tạo chi phí từ ticket".
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Receipt, Plus, Loader2 } from 'lucide-react';
import { formatVND } from '@/lib/format';

const STATUS_LABEL: Record<string, { l: string; cls: string }> = {
  draft:              { l: 'Nháp',           cls: 'text-muted-foreground bg-hover border-line' },
  pending_approval:   { l: 'Chờ duyệt',      cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  approved:           { l: 'Đã duyệt',       cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  rejected:           { l: 'Từ chối',        cls: 'text-red-400 bg-red-500/10 border-red-500/30' },
  cancelled:          { l: 'Đã hủy',         cls: 'text-muted-foreground bg-hover border-line' },
  sent_to_accounting: { l: 'Đã gửi Kế toán', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  posted:             { l: 'Đã hạch toán',   cls: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  paid:               { l: 'Đã chi',         cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
};

export default function TicketExpensePanel({ ticketId }: { ticketId: string }) {
  const [items, setItems] = useState<Array<{ id: string; code: string | null; title: string; amount: number; status: string; requester_name?: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/expenses?scope=related&related_type=ticket&related_id=${encodeURIComponent(ticketId)}`)
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j?.data)) setItems(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-600 text-foreground flex items-center gap-2">
          <Receipt size={14} className="text-amber-400" /> Chi Phí Liên Quan
        </h3>
        <Link href={`/chi-phi?new=1&ticketId=${encodeURIComponent(ticketId)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-2xs font-600 text-amber-400 hover:bg-amber-500/20">
          <Plus size={12} /> Tạo chi phí
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="px-3 py-2 rounded-lg bg-hover border border-dashed border-line text-sm text-muted-foreground">Chưa có chi phí nào gắn với ticket này.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((e) => {
            const st = STATUS_LABEL[e.status] || STATUS_LABEL.draft;
            return (
              <Link key={e.id} href={`/chi-phi?open=${e.id}`}
                className="flex items-center gap-2 rounded-lg border border-line bg-hover px-3 py-2 hover:bg-hover-strong transition-colors">
                {e.code && <span className="font-mono text-2xs text-indigo-300 shrink-0">{e.code}</span>}
                <span className="text-sm text-foreground truncate">{e.title}</span>
                <span className={`ml-auto shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-600 ${st.cls}`}>{st.l}</span>
                <span className="shrink-0 text-xs font-600 text-foreground tabular-nums">{formatVND(Number(e.amount))}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
