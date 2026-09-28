'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarPlus,
  Settings,
  CalendarDays,
  Loader2,
  X,
  Clock,
} from 'lucide-react';
import { useConfirm } from '@/context/ConfirmContext';
import { fmtDays } from '@/lib/format';

interface LeaveStats {
  year: number;
  balance: number;
  granted: number;
  used: number;
  byType: Array<{
    leave_type_id: string;
    type_name: string;
    type_color: string;
    total_days: number;
    request_count: number;
  }>;
}

interface LeaveRequestRow {
  id: string;
  mode: 'day' | 'hour';
  day_part: 'morning' | 'afternoon' | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  total_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  review_note: string | null;
  reviewer_name: string | null;
  type_name: string | null;
  type_color: string | null;
}

function readCurrentUser(): { id: string; name: string; role: string } | null {
  try {
    const raw = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (!raw) return null;
    const u = JSON.parse(raw);
    return { id: u.id ?? '', name: u.name ?? 'Nhân sự', role: u.role ?? 'user' };
  } catch {
    return null;
  }
}

const STATUS_META: Record<
  LeaveRequestRow['status'],
  { label: string; cls: string }
> = {
  pending: { label: 'Chờ duyệt', cls: 'border-amber-500/30 bg-amber-500/15 text-amber-400' },
  approved: { label: 'Đã duyệt', cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400' },
  rejected: { label: 'Từ chối', cls: 'border-red-500/30 bg-red-500/15 text-red-400' },
  cancelled: { label: 'Đã hủy', cls: 'border-slate-500/30 bg-slate-500/15 text-ink-muted' },
};

function fmtDate(d: string): string {
  return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function NghiPhepClient() {
  const confirm = useConfirm();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('user');
  const [year, setYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState<LeaveStats | null>(null);
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    const u = readCurrentUser();
    if (u) {
      setUserId(u.id);
      setRole(u.role);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, year]);

  async function loadData() {
    setLoading(true);
    try {
      const headers = { 'x-current-user-id': userId, 'x-current-user-role': role };
      const [balRes, reqRes] = await Promise.all([
        fetch(`/api/leave/balance?year=${year}`, { headers }),
        fetch(`/api/leave/requests?scope=self&year=${year}`, { headers }),
      ]);
      if (balRes.ok) {
        const json = await balRes.json();
        if (json.success) setStats(json.data);
      }
      if (reqRes.ok) {
        const json = await reqRes.json();
        if (json.success) setRequests(json.data);
      }
    } catch {
      /* giữ dữ liệu cũ */
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
    if (!(await confirm({ title: 'Hủy đơn nghỉ phép?', message: 'Hủy đơn nghỉ phép này?', confirmLabel: 'Hủy đơn', danger: true }))) return;
    setCancelling(id);
    try {
      const res = await fetch(`/api/leave/requests/${id}`, {
        method: 'DELETE',
        headers: { 'x-current-user-id': userId, 'x-current-user-role': role },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setToast({ msg: 'Đã hủy đơn nghỉ phép', ok: true });
        void loadData();
      } else {
        setToast({ msg: json.error ?? 'Không hủy được đơn', ok: false });
      }
    } catch {
      setToast({ msg: 'Lỗi kết nối', ok: false });
    } finally {
      setCancelling(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const isAdmin = role === 'super_admin' || role === 'admin';
  const yearOptions = [year + 1, year, year - 1, year - 2].filter(
    (v, i, a) => a.indexOf(v) === i
  ).sort((a, b) => b - a);

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      <Link
        href="/tra-cuu/du-lieu-cong"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dữ Liệu Chấm Công
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Nghỉ Phép</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Xin nghỉ phép và theo dõi quỹ phép năm của bạn
          </p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-foreground"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>Năm {y}</option>
          ))}
        </select>
      </div>

      {/* Thẻ thống kê quỹ phép năm */}
      <div
        className="rounded-2xl border border-line-subtle overflow-hidden"
        style={{ background: 'var(--card)' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line-subtle">
          <div className="p-5 text-center">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Phép năm còn lại
            </p>
            <p className="mt-1 text-3xl font-700 text-teal-400">
              {stats ? fmtDays(stats.balance) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">ngày</p>
          </div>
          <div className="p-5 text-center">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Đã được cộng
            </p>
            <p className="mt-1 text-3xl font-700 text-indigo-400">
              {stats ? fmtDays(stats.granted) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">ngày trong năm {year}</p>
          </div>
          <div className="p-5 text-center">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Đã nghỉ phép năm
            </p>
            <p className="mt-1 text-3xl font-700 text-amber-400">
              {stats ? fmtDays(stats.used) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">ngày trong năm {year}</p>
          </div>
        </div>

        {/* Đã nghỉ theo từng loại */}
        {stats && stats.byType.length > 0 && (
          <div className="border-t border-line-subtle px-5 py-4">
            <p className="mb-2.5 text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Đã nghỉ trong năm theo loại
            </p>
            <div className="flex flex-wrap gap-2">
              {stats.byType.map((t) => (
                <span
                  key={t.leave_type_id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-hover px-3 py-1 text-xs text-foreground"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: t.type_color }}
                  />
                  {t.type_name}: <span className="font-600">{t.total_days} ngày</span>
                  <span className="text-muted-foreground">({t.request_count} đơn)</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2 thẻ điều hướng */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/tra-cuu/du-lieu-cong/nghi-phep/tao"
          className="glass-card glass-card-hover group flex flex-col rounded-2xl border border-line-subtle p-5 transition-all duration-200 hover:border-teal-500/40"
        >
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/15">
            <CalendarPlus className="h-5 w-5 text-teal-400" />
          </div>
          <h2 className="mb-1.5 text-sm font-600 text-foreground group-hover:text-white">
            Tạo Nghỉ Phép
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Gửi đơn xin nghỉ đến Quản Lý — theo ngày hoặc theo giờ, đủ các loại phép theo luật lao động
          </p>
        </Link>

        {isAdmin && (
          <Link
            href="/tra-cuu/du-lieu-cong/nghi-phep/cau-hinh"
            className="glass-card glass-card-hover group relative flex flex-col rounded-2xl border border-line-subtle p-5 transition-all duration-200 hover:border-slate-500/40"
          >
            <span className="absolute right-4 top-4 rounded-full border border-slate-500/30 bg-slate-500/15 px-2 py-0.5 text-xs font-500 text-ink-muted">
              Admin
            </span>
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-500/15">
              <Settings className="h-5 w-5 text-ink-muted" />
            </div>
            <h2 className="mb-1.5 text-sm font-600 text-foreground group-hover:text-white">
              Cấu Hình Loại Phép
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Quản lý các loại phép và quỹ phép của toàn nhân sự
            </p>
          </Link>
        )}
      </div>

      {/* Đơn của tôi */}
      <div>
        <h2 className="mb-3 text-lg font-700 text-foreground">Đơn nghỉ phép của tôi</h2>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Chưa có đơn nghỉ phép nào trong năm {year}</p>
            <p className="text-xs mt-1 opacity-60">Bấm &quot;Tạo Nghỉ Phép&quot; để gửi đơn đầu tiên</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => {
              const meta = STATUS_META[r.status];
              const canCancel =
                r.status === 'pending' ||
                (r.status === 'approved' && String(r.start_date).slice(0, 10) > todayISO);
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-line-subtle p-4 sm:p-5"
                  style={{ background: 'var(--card)' }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ background: r.type_color ?? '#6366f1' }}
                        />
                        <span className="text-sm font-600 text-foreground">{r.type_name}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-500 ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <Clock className="h-3.5 w-3.5" />
                        {r.mode === 'hour'
                          ? r.day_part
                            ? `${fmtDate(r.start_date)} · ${r.day_part === 'morning' ? 'Buổi sáng' : 'Buổi chiều'}`
                            : `${fmtDate(r.start_date)} · ${r.start_time}–${r.end_time}`
                          : r.start_date === r.end_date
                            ? fmtDate(r.start_date)
                            : `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`}
                        <span className="font-600 text-foreground">({r.total_days} ngày công)</span>
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">Lý do: {r.reason}</p>
                      {r.review_note && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Phản hồi{r.reviewer_name ? ` (${r.reviewer_name})` : ''}: {r.review_note}
                        </p>
                      )}
                    </div>
                    {canCancel && (
                      <button
                        onClick={() => handleCancel(r.id)}
                        disabled={cancelling === r.id}
                        className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 flex-shrink-0 disabled:opacity-50"
                      >
                        {cancelling === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        Hủy đơn
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
            toast.ok
              ? 'border-emerald-500/30 bg-emerald-950 text-emerald-300'
              : 'border-red-500/30 bg-red-950 text-red-300'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
