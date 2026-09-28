'use client';
import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { listRequisitions, listRequisitionCandidates, type Requisition, type RequisitionCandidate } from '@/lib/api/requisitionApi';
import { InterviewForm } from '@/app/yeu-cau-tuyen-dung/components/InterviewSection';
import { useEscapeKey } from '@/hooks/useEscapeKey';

export default function CalendarCreateModal({ day, onClose, onSaved }: { day: string; onClose: () => void; onSaved: () => void }) {
  const [requests, setRequests] = useState<Requisition[]>([]);
  const [candidates, setCandidates] = useState<RequisitionCandidate[]>([]);
  const [reqId, setReqId] = useState(''), [appId, setAppId] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEscapeKey(onClose);
  useEffect(() => { let active = true; listRequisitions().then(data => { if (active) setRequests(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  useEffect(() => {
    setAppId(''); setCandidates([]); if (!reqId) return;
    let active = true; setLoading(true); setError('');
    listRequisitionCandidates(reqId).then(data => { if (active) setCandidates(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reqId]);
  const field = 'mt-2 w-full rounded-xl border border-line p-2 text-sm';
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label="Tạo lịch phỏng vấn" className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-line p-5"><div><h2 className="text-lg font-700">Tạo lịch phỏng vấn</h2><p className="mt-1 text-sm text-muted-foreground">Ngày {day.split('-').reverse().join('/')}</p></div><button onClick={onClose} aria-label="Đóng tạo lịch" className="rounded-lg p-2"><X className="h-5 w-5" /></button></header>
      <div className="space-y-4 p-5">
        <label className="block text-sm font-600">Vị trí / Yêu cầu tuyển dụng<select className={field} value={reqId} onChange={e => setReqId(e.target.value)}><option value="">Chọn yêu cầu tuyển dụng</option>{requests.map(req => <option key={req.id} value={req.id}>{req.title}</option>)}</select></label>
        <label className="block text-sm font-600">Ứng viên<select className={field} value={appId} disabled={!reqId || loading} onChange={e => setAppId(e.target.value)}><option value="">Chọn ứng viên đã liên kết</option>{candidates.map(cv => <option key={cv.application_id} value={cv.application_id}>{cv.candidate_name}</option>)}</select></label>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        {!loading && reqId && !candidates.length && <p className="text-sm text-muted-foreground">Yêu cầu này chưa có ứng viên. Hãy liên kết hồ sơ trong Yêu cầu tuyển dụng trước khi đặt lịch.</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {appId && <InterviewForm key={appId} reqId={reqId} appId={appId} initialWhen={`${day}T09:00`} onSaved={onSaved} onError={setError} />}
      </div>
    </div>
  </div>;
}
