'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Fingerprint, AlertTriangle, Pencil, X, Camera, Trash2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { canAccess } from '@/lib/permissions';

function vnToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

/** Chấm công kho theo ngày + cảnh báo quên check-out + sửa tay + xem ảnh */
export default function AttendanceTab({ warehouseId }: { warehouseId: string }) {
  const [date, setDate] = useState(vnToday());
  const [rows, setRows] = useState<any[]>([]);
  const [missing, setMissing] = useState<any[]>([]);
  const [declared, setDeclared] = useState<any[]>([]);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Xóa ngày công: quyền RBAC Xóa module Kho/Xưởng (đã bỏ rào super_admin)
  const [canDelete, setCanDelete] = useState(false);
  useEffect(() => {
    const u = getCurrentUser();
    setCanDelete(canAccess((u as any)?.module_permissions, 'warehouse', 'delete'));
  }, []);

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/warehouse/admin/attendance?warehouseId=${warehouseId}&attendanceId=${deleteRow.id}`, { method: 'DELETE' });
      if (res.ok) { setDeleteRow(null); load(); }
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/admin/attendance?warehouseId=${warehouseId}&date=${date}`);
      const json = await res.json();
      setRows(json.data?.rows || []);
      setMissing(json.data?.missing || []);
      setDeclared(json.data?.declared || []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, date]);

  // Duyệt giờ ra TỰ KHAI (chế độ nhiều đợt: quên check-out → công nhân khai, quản lý duyệt)
  const reviewDeclared = async (r: any, action: 'approved' | 'rejected', checkOutAt?: string) => {
    setReviewBusy(r.id);
    try {
      await fetch('/api/warehouse/admin/attendance', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, attendanceId: r.id, reviewDeclared: action, checkOutAt }),
      });
      load();
    } finally {
      setReviewBusy(null);
    }
  };

  useEffect(() => { load(); }, [load]);

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

  const methodBadge = (m: string | null) => {
    if (m === 'qr') return <span className="text-[10px] rounded-full bg-purple-500/10 text-purple-400 px-1.5 py-0.5">QR</span>;
    if (m === 'manual') return <span className="text-[10px] rounded-full bg-orange-500/10 text-orange-400 px-1.5 py-0.5">Sửa tay</span>;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-700 text-foreground">Chấm công</h2>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground" />
      </div>

      {/* Giờ ra TỰ KHAI chờ duyệt (chế độ nhiều đợt) */}
      {declared.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-sm font-600 text-amber-300 flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4" /> {declared.length} giờ ra tự khai chờ duyệt
          </p>
          <div className="space-y-2">
            {declared.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between rounded-xl bg-white/5 px-3 py-2">
                <span className="text-xs text-foreground">
                  <b>{r.full_name}</b> · {String(r.work_date).slice(0, 10)} · đợt {r.session_no} ·
                  vào {fmtTime(r.check_in_at)} → <b className="text-amber-300">khai ra {fmtTime(r.check_out_at)}</b>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => reviewDeclared(r, 'approved')}
                    disabled={reviewBusy === r.id}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-600 text-white disabled:opacity-50"
                  >Duyệt</button>
                  <button
                    onClick={() => setEditRow({ ...r, __reviewDeclared: true })}
                    disabled={reviewBusy === r.id}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-600 text-foreground disabled:opacity-50"
                  >Sửa giờ</button>
                  <button
                    onClick={() => reviewDeclared(r, 'rejected')}
                    disabled={reviewBusy === r.id}
                    className="rounded-lg bg-red-600/80 px-2.5 py-1 text-[11px] font-600 text-white disabled:opacity-50"
                  >Từ chối</button>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-amber-300/70 mt-2">Giờ tự khai CHƯA duyệt không được tính vào tổng công. Từ chối = đợt đó không tính giờ.</p>
        </div>
      )}

      {/* Cảnh báo quên check-out hôm trước */}
      {missing.length > 0 && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
          <p className="text-sm font-600 text-orange-300 flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4" /> {missing.length} người quên check-out hôm trước
          </p>
          <div className="space-y-1.5">
            {missing.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{r.full_name} · vào {fmtTime(r.check_in_at)}</span>
                <button onClick={() => setEditRow(r)} className="text-indigo-400 font-600">Điền giờ ra</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Fingerprint className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có ai chấm công ngày này</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-600">Công nhân</th>
                  <th className="px-3 py-3 font-600">Ca</th>
                  <th className="px-3 py-3 font-600">Vào</th>
                  <th className="px-3 py-3 font-600">Ra</th>
                  <th className="px-3 py-3 font-600">Ảnh</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-foreground font-600">{r.full_name}</td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">
                      {r.session_no > 1 || rows.some((x) => x.worker_id === r.worker_id && x.id !== r.id)
                        ? `Đợt ${r.session_no}`
                        : (r.shift_name || '—')}
                      {r.declared_status === 'pending' && <span className="ml-1 text-amber-400">· chờ duyệt</span>}
                      {r.declared_status === 'rejected' && <span className="ml-1 text-red-400">· từ chối</span>}
                    </td>
                    <td className="px-3 py-3 text-foreground">{fmtTime(r.check_in_at)} {methodBadge(r.check_in_method)}</td>
                    <td className="px-3 py-3">
                      {r.check_out_at
                        ? <span className="text-foreground">{fmtTime(r.check_out_at)} {methodBadge(r.check_out_method)}</span>
                        : <span className="text-orange-400 text-xs">Chưa ra</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {r.check_in_photo_id && (
                          <button onClick={() => setPhotoId(r.check_in_photo_id)} className="btn-ghost rounded p-1" title="Ảnh check-in">
                            <Camera className="h-3.5 w-3.5 text-emerald-400" />
                          </button>
                        )}
                        {r.check_out_photo_id && (
                          <button onClick={() => setPhotoId(r.check_out_photo_id)} className="btn-ghost rounded p-1" title="Ảnh check-out">
                            <Camera className="h-3.5 w-3.5 text-orange-400" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setEditRow(r)} className="btn-ghost rounded-lg p-1.5" title="Sửa giờ">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        {canDelete && (
                          <button onClick={() => setDeleteRow(r)} className="btn-ghost rounded-lg p-1.5" title="Xóa ngày công (dọn dữ liệu test)">
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 p-6" style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="h-5 w-5 text-red-400" />
              <h3 className="text-base font-700 text-foreground">Xóa ngày công?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Xóa chấm công ngày <b className="text-foreground">{date}</b> của <b className="text-foreground">{deleteRow.full_name}</b> (kèm ảnh).
              Không khôi phục được — chỉ dùng để dọn dữ liệu test.
            </p>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setDeleteRow(null)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={confirmDelete} disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <AdjustModal warehouseId={warehouseId} row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load(); }} />
      )}

      {photoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setPhotoId(null)}>
          <div className="relative max-w-sm w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/warehouse/photo/${photoId}`} alt="Ảnh chấm công" className="w-full rounded-2xl" />
            <button className="absolute top-3 right-3 rounded-full bg-black/60 p-2"><X className="h-4 w-4 text-white" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdjustModal({ warehouseId, row, onClose, onSaved }: { warehouseId: string; row: any; onClose: () => void; onSaved: () => void }) {
  const toLocal = (ts: string | null) => {
    if (!ts) return '';
    const d = new Date(ts);
    // datetime-local theo giờ VN
    const vn = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}-${String(vn.getDate()).padStart(2, '0')}T${String(vn.getHours()).padStart(2, '0')}:${String(vn.getMinutes()).padStart(2, '0')}`;
  };
  const [checkIn, setCheckIn] = useState(toLocal(row.check_in_at));
  const [checkOut, setCheckOut] = useState(toLocal(row.check_out_at));
  const [note, setNote] = useState(row.note || '');
  const [busy, setBusy] = useState(false);

  const toIso = (local: string) => (local ? new Date(`${local}:00+07:00`).toISOString() : null);

  const submit = async () => {
    setBusy(true);
    try {
      // Mở từ khối "giờ ra tự khai chờ duyệt": sửa giờ = duyệt kèm giờ đúng.
      const body = row.__reviewDeclared
        ? { warehouseId, attendanceId: row.id, reviewDeclared: 'approved', checkOutAt: toIso(checkOut) }
        : { warehouseId, attendanceId: row.id, checkInAt: toIso(checkIn), checkOutAt: toIso(checkOut), note };
      await fetch('/api/warehouse/admin/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Sửa giờ công — {row.full_name}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Giờ vào</label>
            <input type="datetime-local" className={input} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Giờ ra</label>
            <input type="datetime-local" className={input} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú</label>
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: quên check-out, xác nhận về 17h" />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={submit} disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
