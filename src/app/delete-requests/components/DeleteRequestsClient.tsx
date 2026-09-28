'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchDeleteRequests, updateDeleteRequest } from '@/lib/api-client';
import { canAccess } from '@/lib/permissions';
import { CheckCircle, XCircle, Clock, Package, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import ErrorState from '@/components/ui/ErrorState';

interface DeleteRequest {
  id: string;
  asset_id: string;
  asset_code: string;
  asset_name: string;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
}

export default function DeleteRequestsClient() {
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [reviewModal, setReviewModal] = useState<{ req: DeleteRequest; action: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState<{ type: 'approve' | 'reject'; assetName: string } | null>(null);

  const closeReview = () => { setReviewModal(null); setReviewNote(''); };
  useEscapeKey(closeReview, reviewModal !== null);

  useEffect(() => {
    const userData = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (userData) {
      setCurrentUser(JSON.parse(userData));
    }
    loadRequests();
  }, []);

  // Ai được duyệt: super_admin VÀ có quyền Xóa ở module Quản Lý Tài Sản.
  const isSuperAdmin =
    currentUser?.role === 'super_admin' &&
    canAccess(currentUser?.module_permissions, 'asset-management', 'delete');

  const loadRequests = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await fetchDeleteRequests();
      setRequests(data);
    } catch (error) {
      console.error('Error loading delete requests:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async () => {
    if (!reviewModal || !currentUser) return;
    try {
      const updated = await updateDeleteRequest(reviewModal.req.id, {
        status: reviewModal.action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      });
      setRequests(prev => prev.map(r => r.id === reviewModal.req.id ? updated : r));
      setReviewModal(null);
      setReviewNote('');

      // Show success message
      setReviewSuccess({ type: reviewModal.action, assetName: reviewModal.req.asset_name });
      setTimeout(() => setReviewSuccess(null), 4000);
    } catch (error) {
      console.error('Error reviewing delete request:', error);
      toast.error('Không thể xử lý yêu cầu. Vui lòng thử lại.');
    }
  };

  if (!currentUser) return null;

  // Only super_admin can access this page
  if (!isSuperAdmin) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Duyệt Xóa Tài Sản</h1>
        </div>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertTriangle size={40} className="mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-foreground font-600">Quyền truy cập bị từ chối</p>
          <p className="text-sm text-muted-foreground mt-2">
            Chỉ Admin Master mới có thể phê duyệt yêu cầu xóa tài sản
          </p>
        </div>
      </div>
    );
  }

  const STATUS_CONFIG = {
    pending: { label: 'Chờ duyệt', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30', icon: <Clock size={12} /> },
    approved: { label: 'Đã duyệt', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', icon: <CheckCircle size={12} /> },
    rejected: { label: 'Từ chối', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30', icon: <XCircle size={12} /> },
  };

  const pending = requests.filter(r => r.status === 'pending');
  const reviewed = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-5">
      <Link href="/duyet-yeu-cau" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Duyệt Yêu Cầu
      </Link>
      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Duyệt Xóa Tài Sản</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Các yêu cầu xóa tài sản từ Admin cần Super Admin phê duyệt
        </p>
      </div>

      {/* Success notification */}
      {reviewSuccess && (
        <div className="flex items-center gap-3 p-4 rounded-2xl fade-in" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <CheckCircle size={18} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">
            {reviewSuccess.type === 'approve'
              ? `✅ Đã phê duyệt xóa "${reviewSuccess.assetName}". Tài sản đã được xóa khỏi hệ thống.`
              : `❌ Đã từ chối yêu cầu xóa "${reviewSuccess.assetName}". Tài sản vẫn được giữ lại.`
            }
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { label: 'Chờ duyệt', value: requests.filter(r => r.status === 'pending').length, color: 'text-amber-400' },
          { label: 'Đã duyệt', value: requests.filter(r => r.status === 'approved').length, color: 'text-emerald-400' },
          { label: 'Từ chối', value: requests.filter(r => r.status === 'rejected').length, color: 'text-red-400' },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-3 sm:p-4 border border-white/05" style={{ background: 'var(--card)' }}>
            <p className={`text-xl sm:text-2xl font-700 ${s.color}`}>{s.value}</p>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <ErrorState onRetry={loadRequests} />
      ) : (
        <>
          {/* Pending requests */}
          {pending.length > 0 && (
            <div>
              <h2 className="text-base font-600 text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                Yêu cầu chờ duyệt ({pending.length})
              </h2>
              <div className="space-y-3">
                {pending.map(req => (
                  <div key={req.id} className="rounded-2xl border border-amber-500/20 p-4 sm:p-5" style={{ background: 'rgba(245,158,11,0.05)' }}>
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/15 shrink-0">
                          <Package size={18} className="text-red-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-mono text-indigo-300">{req.asset_code}</span>
                            <span className={`inline-flex items-center gap-1 text-2xs font-600 px-2 py-0.5 rounded-full border ${STATUS_CONFIG.pending.bg} ${STATUS_CONFIG.pending.color}`}>
                              {STATUS_CONFIG.pending.icon}
                              {STATUS_CONFIG.pending.label}
                            </span>
                          </div>
                          <p className="text-sm font-600 text-foreground">{req.asset_name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Yêu cầu bởi: <span className="text-foreground">{req.requested_by_name}</span> · {req.requested_at.split('T')[0]}
                          </p>
                          <div className="text-sm text-muted-foreground mt-2 p-3 rounded-xl bg-white/04 border border-white/05">
                            <span className="text-xs font-600 text-foreground block mb-1">Lý do:</span>
                            {req.reason}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-col xs:flex-row">
                        <button
                          onClick={() => setReviewModal({ req, action: 'reject' })}
                          className="flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-500 text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors xs:flex-1 sm:flex-initial"
                        >
                          <XCircle size={14} />
                          Từ chối
                        </button>
                        <button
                          onClick={() => setReviewModal({ req, action: 'approve' })}
                          className="flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-600 btn-accent xs:flex-1 sm:flex-initial"
                        >
                          <CheckCircle size={14} />
                          Phê duyệt
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && (
            <div className="rounded-2xl border border-white/05 p-12 text-center" style={{ background: 'var(--card)' }}>
              <CheckCircle size={40} className="mx-auto mb-3 text-emerald-400 opacity-60" />
              <p className="text-foreground font-500">Không có yêu cầu nào đang chờ duyệt</p>
              <p className="text-sm text-muted-foreground mt-1">Tất cả yêu cầu xóa tài sản đã được xử lý</p>
            </div>
          )}

          {/* Reviewed requests */}
          {reviewed.length > 0 && (
            <div>
              <h2 className="text-base font-600 text-foreground mb-3">Lịch sử duyệt ({reviewed.length})</h2>

              {/* Mobile card list */}
              <div className="md:hidden space-y-3">
                {reviewed.map(req => {
                  const sc = STATUS_CONFIG[req.status];
                  return (
                    <div key={`mr-${req.id}`} className="rounded-2xl border border-white/05 p-4" style={{ background: 'var(--card)' }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-xs font-mono text-indigo-300">{req.asset_code}</p>
                        <span className={`inline-flex items-center gap-1 text-2xs font-600 px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color}`}>
                          {sc.icon}
                          {sc.label}
                        </span>
                      </div>
                      <p className="text-sm font-500 text-foreground line-clamp-1">{req.asset_name}</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-xs">
                        <div>
                          <p className="text-muted-foreground/60 text-2xs">Người yêu cầu</p>
                          <p className="text-muted-foreground truncate">{req.requested_by_name}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground/60 text-2xs">Người duyệt</p>
                          <p className="text-muted-foreground truncate">{req.reviewed_by_name ?? '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground/60 text-2xs">Ngày duyệt</p>
                          <p className="text-muted-foreground">{req.reviewed_at?.split('T')[0] ?? '—'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block rounded-2xl border border-white/05 overflow-hidden" style={{ background: 'var(--card)' }}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/05">
                      <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Tài sản</th>
                      <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Người yêu cầu</th>
                      <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Trạng thái</th>
                      <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Người duyệt</th>
                      <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Ngày duyệt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewed.map(req => {
                      const sc = STATUS_CONFIG[req.status];
                      return (
                        <tr key={req.id} className="border-b border-white/04 last:border-0 hover:bg-white/02 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-xs font-mono text-indigo-300">{req.asset_code}</p>
                            <p className="text-sm text-foreground">{req.asset_name}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{req.requested_by_name}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs font-600 px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color}`}>
                              {sc.icon}
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{req.reviewed_by_name ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{req.reviewed_at?.split('T')[0] ?? '—'}</td>
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

      {/* Review modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={closeReview}>
          <div className="w-full max-w-md rounded-3xl border border-line p-6" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-700 text-foreground mb-1">
              {reviewModal.action === 'approve' ? 'Phê duyệt xóa tài sản' : 'Từ chối yêu cầu xóa'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tài sản: <span className="text-foreground font-500">{reviewModal.req.asset_name}</span>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-500 text-foreground mb-1.5">Ghi chú (tùy chọn)</label>
              <textarea
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 resize-none"
                placeholder="Ghi chú về quyết định của bạn..."
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setReviewModal(null); setReviewNote(''); }} className="flex-1 h-9 rounded-xl btn-ghost text-sm">Hủy</button>
              <button
                onClick={handleReview}
                className={`flex-1 h-9 rounded-xl text-sm font-600 ${reviewModal.action === 'approve' ? 'btn-accent' : 'bg-red-600 hover:bg-red-700 text-white'}`}
              >
                {reviewModal.action === 'approve' ? 'Xác nhận phê duyệt' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
