'use client';

/**
 * "Cần tôi xử lý" — inbox hợp nhất XUYÊN CÔNG TY + XUYÊN MODULE (chi phí, nghỉ phép…).
 * Thiết kế: docs/technical/expense-module-roadmap.md §12 (mô hình best-in-world kiểu Linear).
 *
 * Chống-miss: thanh tổng quan đếm theo công ty (liếc là biết công ty nào cũng có việc).
 * Chống-nhầm-công-ty: mỗi dòng luôn có TÊN + MÀU công ty; xác nhận duyệt đọc rõ công ty;
 * hành động gọi đúng endpoint của bản ghi (record-driven), server tự kiểm quyền lại.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, Palmtree, Loader2, Inbox, CheckCircle2, ExternalLink, Layers, Building2, UserCheck, Users2, ListChecks, Ticket, UserSearch, ArrowRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { companyAccent } from '@/lib/companyColor';
import ListPagination, { usePagedList } from '@/components/ui/ListPagination';

interface ActionItem {
  type: 'expense' | 'leave';
  id: string;
  company_id: string | null;
  company_name: string | null;
  title: string;
  subtitle: string;
  amountFmt: string | null;
  requesterName: string | null;
  waitingSince: string;
  detailUrl: string;
  actionKind?: 'approve' | 'do' | 'reply' | 'review' | 'sign' | 'input';
}
interface CompanyCount { company_id: string | null; company_name: string | null; count: number }
interface Bucket { items: ActionItem[]; byCompany: CompanyCount[]; byType: Record<string, number>; total: number }
const EMPTY_BUCKET: Bucket = { items: [], byCompany: [], byType: {}, total: 0 };
type BucketKey = 'mine' | 'team';

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  expense: { label: 'Chi phí', icon: <Receipt size={15} /> },
  leave: { label: 'Nghỉ phép', icon: <Palmtree size={15} /> },
  task: { label: 'Công việc', icon: <ListChecks size={15} /> },
  ticket: { label: 'Ticket', icon: <Ticket size={15} /> },
  candidate: { label: 'Ứng viên', icon: <UserSearch size={15} /> },
};

/** Nhãn nút hành động chính theo actionKind (approve xử lý riêng bằng nút Duyệt). */
const ACTION_LABEL: Record<string, string> = {
  do: 'Làm', reply: 'Phản hồi', review: 'Đánh giá', sign: 'Ký', input: 'Cho ý kiến',
};

/** "chờ 2 ngày" / "chờ 5 giờ" / "vừa xong". */
function waitingLabel(iso: string): { text: string; urgent: boolean } {
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3_600_000;
  if (h < 1) return { text: 'vừa xong', urgent: false };
  if (h < 24) return { text: `chờ ${Math.floor(h)} giờ`, urgent: false };
  const d = Math.floor(h / 24);
  return { text: `chờ ${d} ngày`, urgent: d >= 3 };
}

export default function ActionCenterClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const user = useMemo(() => getCurrentUser() as any, []);

  const [mineBucket, setMineBucket] = useState<Bucket>(EMPTY_BUCKET);
  const [teamBucket, setTeamBucket] = useState<Bucket>(EMPTY_BUCKET);
  const [tab, setTab] = useState<BucketKey>('mine'); // mặc định: đích danh chờ tôi
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [companyFilter, setCompanyFilter] = useState<string | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [grouped, setGrouped] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/action-center');
      const j = await r.json();
      if (r.ok && j?.success) {
        setMineBucket(j.mine || EMPTY_BUCKET);
        setTeamBucket(j.team || EMPTY_BUCKET);
      } else if (!r.ok) toast.error(j?.error || 'Không tải được danh sách');
    } catch { toast.error('Lỗi kết nối'); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Bucket đang xem theo tab; đổi tab thì reset bộ lọc để không "kẹt" lựa chọn cũ.
  const active = tab === 'mine' ? mineBucket : teamBucket;
  const items = active.items;
  const byCompany = active.byCompany;
  const byType = active.byType;
  useEffect(() => { setCompanyFilter('all'); setTypeFilter('all'); }, [tab]);

  const filtered = useMemo(() => items.filter((it) =>
    (companyFilter === 'all' || (it.company_id || '∅') === companyFilter) &&
    (typeFilter === 'all' || it.type === typeFilter)
  ), [items, companyFilter, typeFilter]);

  const { paged, resetPage, paginationProps } = usePagedList(filtered, 20);
  useEffect(() => { resetPage(); }, [companyFilter, typeFilter, resetPage]);

  // Duyệt inline — record-driven: gọi đúng endpoint của bản ghi, xác nhận ĐỌC RÕ công ty.
  const approve = async (it: ActionItem) => {
    const cty = it.company_name || 'không xác định công ty';
    const money = it.amountFmt ? ` — ${it.amountFmt}` : '';
    const ok = await confirm({
      title: 'Xác nhận duyệt',
      message: `Duyệt ${TYPE_META[it.type].label.toLowerCase()} "${it.title}"${money}\n🏢 Công ty: ${cty}${it.requesterName ? `\n👤 ${it.requesterName}` : ''}`,
      confirmLabel: 'Duyệt', danger: false,
    });
    if (!ok) return;
    setBusy(it.id);
    try {
      const r = it.type === 'expense'
        ? await fetch(`/api/expenses/${it.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        : await fetch(`/api/leave/requests/${it.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-current-user-id': user?.id || '', 'x-current-user-role': user?.role || '' },
            body: JSON.stringify({ action: 'approved' }),
          });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j?.error || 'Duyệt thất bại'); return; }
      toast.success('Đã duyệt');
      await load();
    } catch { toast.error('Lỗi kết nối'); } finally { setBusy(null); }
  };

  const TYPE_TABS = [
    { key: 'all', label: 'Tất cả', n: items.length },
    ...Object.keys(TYPE_META).map((k) => ({ key: k, label: TYPE_META[k].label, n: byType[k] || 0 })),
  ].filter((t) => t.key === 'all' || t.n > 0);

  const renderRow = (it: ActionItem) => {
    const accent = companyAccent(it.company_id);
    const wait = waitingLabel(it.waitingSince);
    return (
      <div key={`${it.type}-${it.id}`}
        className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-white/5 p-4 pl-3 transition-colors hover:bg-white/5"
        style={{ background: 'var(--card)', borderLeft: `3px solid ${accent.color}` }}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Badge công ty: MÀU + TÊN (màu chỉ phụ trợ, tên là chính) */}
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-700"
              style={{ color: accent.color, background: accent.bg }}>
              <Building2 size={11} /> {it.company_name || '—'}
            </span>
            <span className="inline-flex items-center gap-1 text-2xs font-600 text-muted-foreground">
              {TYPE_META[it.type].icon} {TYPE_META[it.type].label}
            </span>
            <span className={`text-2xs font-600 ${wait.urgent ? 'text-red-400' : 'text-muted-foreground'}`}>· {wait.text}</span>
          </div>
          <p className="mt-1 text-sm font-600 text-foreground truncate">{it.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {it.requesterName ? `${it.requesterName} · ` : ''}{it.subtitle}
          </p>
        </div>
        {it.amountFmt && <div className="shrink-0 text-sm font-800 text-amber-400 tabular-nums">{it.amountFmt}</div>}
        <div className="flex shrink-0 items-center gap-2">
          {it.actionKind === 'approve' ? (
            <>
              <button onClick={() => approve(it)} disabled={!!busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-600 text-white disabled:opacity-50">
                {busy === it.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Duyệt
              </button>
              <button onClick={() => router.push(it.detailUrl)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-600 text-muted-foreground hover:bg-hover hover:text-foreground">
                <ExternalLink size={14} /> Xem
              </button>
            </>
          ) : (
            // Task/Ticket/Ứng viên: không duyệt inline — mở đúng luồng domain để xử lý.
            <button onClick={() => router.push(it.detailUrl)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-xs font-600 text-white">
              {ACTION_LABEL[it.actionKind || ''] || 'Mở'} <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };

  // Gom nhóm theo công ty (tuỳ chọn)
  const groups = useMemo(() => {
    if (!grouped) return null;
    const m = new Map<string, { name: string | null; items: ActionItem[] }>();
    for (const it of paged) {
      const k = it.company_id || '∅';
      if (!m.has(k)) m.set(k, { name: it.company_name, items: [] });
      m.get(k)!.items.push(it);
    }
    return [...m.entries()];
  }, [grouped, paged]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2">
          <Inbox className="h-6 w-6 text-indigo-400" /> Cần Xử Lý
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Việc đang chờ bạn — gom từ tất cả công ty & mọi mảng, không sót việc nào.
        </p>
      </div>

      {/* Hai lăng kính: đích danh tôi vs phạm vi tôi quản */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          { key: 'mine' as const, icon: <UserCheck size={18} />, title: 'Cần Tôi Xử Lý', desc: 'Việc đích danh chờ chính tôi xử lý.', n: mineBucket.total },
          { key: 'team' as const, icon: <Users2 size={18} />, title: 'Đội Ngũ Của Tôi', desc: 'Việc trong phạm vi tôi quản/có quyền.', n: teamBucket.total },
        ]).map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                on ? 'border-indigo-500/60 bg-indigo-500/10' : 'border-line hover:bg-white/5'}`}
              style={{ background: on ? undefined : 'var(--card)' }}>
              <span className={`mt-0.5 shrink-0 ${on ? 'text-indigo-400' : 'text-muted-foreground'}`}>{t.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-700 ${on ? 'text-indigo-300' : 'text-foreground'}`}>{t.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-2xs font-700 ${on ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-muted-foreground'}`}>{t.n}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Thanh tổng quan: chip đếm theo công ty (chống-miss) */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setCompanyFilter('all')}
            className={`rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors ${
              companyFilter === 'all' ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
            Tất cả {items.length}
          </button>
          {byCompany.map((c) => {
            const key = c.company_id || '∅';
            const accent = companyAccent(c.company_id);
            const active = companyFilter === key;
            return (
              <button key={key} onClick={() => setCompanyFilter(active ? 'all' : key)}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-600 transition-colors"
                style={active
                  ? { borderColor: accent.color, background: accent.bg, color: accent.color }
                  : { borderColor: 'rgba(255,255,255,0.1)', color: 'var(--muted-foreground)' }}>
                <span className="h-2 w-2 rounded-full" style={{ background: accent.color }} />
                {c.company_name || '—'} · {c.count}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabs theo LOẠI VIỆC + nút gom nhóm */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
          <div className="flex gap-2 overflow-x-auto">
            {TYPE_TABS.map((t) => (
              <button key={t.key} onClick={() => setTypeFilter(t.key)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-600 transition-colors ${
                  typeFilter === t.key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t.label} {t.n > 0 && <span className="opacity-70">({t.n})</span>}
              </button>
            ))}
          </div>
          <button onClick={() => setGrouped((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-600 transition-colors ${
              grouped ? 'text-indigo-400' : 'text-muted-foreground hover:text-foreground'}`}>
            <Layers size={14} /> Nhóm theo công ty
          </button>
        </div>
      )}

      {/* Nội dung */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Inbox className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">
            {tab === 'mine' ? 'Tuyệt vời — không có việc nào đích danh chờ bạn.' : 'Đội ngũ của bạn không có việc nào đang chờ.'}
          </p>
          <p className="text-xs mt-1 opacity-60">
            {tab === 'mine'
              ? 'Khi có việc đến lượt chính bạn xử lý, chúng sẽ hiện ở đây.'
              : 'Việc trong phạm vi bạn quản (cấp dưới, công ty) sẽ hiện ở đây.'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <p className="text-sm">Không có việc khớp bộ lọc hiện tại.</p>
        </div>
      ) : grouped && groups ? (
        <div className="space-y-5">
          {groups.map(([key, g]) => {
            const accent = companyAccent(key === '∅' ? null : key);
            return (
              <div key={key} className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-700" style={{ color: accent.color }}>
                  <Building2 size={15} /> {g.name || '—'} <span className="text-muted-foreground font-500">· {g.items.length} việc</span>
                </div>
                <div className="space-y-2.5">{g.items.map(renderRow)}</div>
              </div>
            );
          })}
          <ListPagination {...paginationProps} />
        </div>
      ) : (
        <div className="space-y-2.5">
          {paged.map(renderRow)}
          <ListPagination {...paginationProps} />
        </div>
      )}
    </div>
  );
}
