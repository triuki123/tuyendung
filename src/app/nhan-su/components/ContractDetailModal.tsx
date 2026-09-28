'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X, Loader2, Paperclip, Trash2, Download, Eye, Send,
  BellRing, CheckCircle2, XCircle, RefreshCw, Users, FileText, ChevronRight,
} from 'lucide-react';
import {
  Contract, ContractWatcher, LookupItem, AttachmentMeta,
  getContract, updateContract, listContractAttachments,
  uploadContractAttachments, deleteContractAttachment,
  listContractWatchers, addContractWatcher, removeContractWatcher,
  remindContractSign, fmtBytes,
} from './hrApi';
import { daysLeft } from './hrApi';
import MultiUserPicker from './MultiUserPicker';
import ConfirmModal from './ConfirmModal';
import { ExpiryBadge } from './ContractsTab';
import { fmtDate, STATUS_LABELS, canPreviewInline } from '../utils/hrHelpers';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useBmhs } from './BmhsProvider';
import BmhsManageButton from './BmhsManageButton';

interface Props {
  contractId: string;
  canEdit: boolean;
  canCreate: boolean;
  contractTypes: LookupItem[];
  onClose: () => void;
  onEdit: () => void;
  onRenew: () => void;
  onStatusChanged: () => void;
}


export default function ContractDetailModal({
  contractId, canEdit, canCreate, contractTypes, onClose, onEdit, onRenew, onStatusChanged,
}: Props) {
  const toast = useToast();
  const { download, openBlobUrl } = useBmhs();
  const [contract, setContract] = useState<Contract | null>(null);
  const [chain, setChain] = useState<Contract[]>([]);
  const [watchers, setWatchers] = useState<ContractWatcher[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null); // URL ảnh preview
  const [confirm, setConfirm] = useState<{ newStatus: Contract['status'] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ESC đóng modal — tắt khi đang mở dialog xác nhận đổi trạng thái (ConfirmModal tự xử ESC riêng).
  useEscapeKey(onClose, !confirm);

  async function load() {
    try {
      const [detail, w, a] = await Promise.all([
        getContract(contractId),
        listContractWatchers(contractId),
        listContractAttachments(contractId),
      ]);
      setContract(detail.data);
      setChain(detail.chain || []);
      setWatchers(w);
      setAttachments(a);
    } catch { /* noop */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contractId]);

  async function changeStatus(newStatus: Contract['status']) {
    if (!contract) return;
    setConfirm({ newStatus });
  }

  async function confirmChangeStatus(newStatus: Contract['status']) {
    if (!contract) return;
    setStatusBusy(true);
    try {
      await updateContract(contract.id, { status: newStatus });
      onStatusChanged();
      setConfirm(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi đổi trạng thái');
    } finally { setStatusBusy(false); }
  }

  async function sendRemind() {
    setReminding(true);
    try {
      await remindContractSign(contractId);
      await load(); // làm mới số lần nhắc / trạng thái báo cáo
      toast.success('Đã gửi nhắc nhở đến nhân viên!');
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi gửi nhắc');
    } finally { setReminding(false); }
  }

  async function handleAddWatcher(users: { id: string; name: string }[], role: 'watcher' | 'co_handler' = 'watcher') {
    if (!users.length || !contract) return;
    setBusy(true);
    try {
      for (const u of users) {
        await addContractWatcher(contractId, u.id, role);
      }
      setWatchers(await listContractWatchers(contractId));
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function handleRemoveWatcher(userId: string) {
    if (!contract) return;
    await removeContractWatcher(contractId, userId);
    setWatchers((prev) => prev.filter((w) => w.user_id !== userId));
  }

  const coHandlers = watchers.filter((w) => w.role === 'co_handler');
  const pureWatchers = watchers.filter((w) => w.role !== 'co_handler');

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      await uploadContractAttachments(contractId, files);
      setAttachments(await listContractAttachments(contractId));
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleDeleteAttachment(id: string) {
    await deleteContractAttachment(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handlePreview(a: AttachmentMeta) {
    const kind = canPreviewInline(a.mime_type);
    // Qua BMHS: tải blob (tự gate mật khẩu nếu hồ sơ khóa) rồi mở.
    const objUrl = await openBlobUrl(`/api/contracts/attachments/${a.id}`);
    if (!objUrl) return;
    if (kind === 'pdf') {
      window.open(objUrl, '_blank');
    } else if (kind === 'image') {
      setLightbox(objUrl);
    }
  }

  if (loading || !contract) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const st = STATUS_LABELS[contract.status] || STATUS_LABELS.draft;
  const days = daysLeft(contract.end_date);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}>
        <div className="w-full max-w-3xl rounded-3xl border border-line overflow-hidden max-h-[92vh] flex flex-col"
          style={{ background: 'var(--card)' }}
          onClick={(e) => e.stopPropagation()}>

          {/* ── Header ── */}
          <div className="flex items-start justify-between border-b border-line-subtle px-6 py-4 gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-600 ${st.cls}`}>{st.label}</span>
                <h2 className="text-base font-700 text-foreground">{contract.contract_number}</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {contract.employee_name || '—'}
                {contract.employee_company_name && ` · ${contract.employee_company_name}`}
                {contract.employee_department_name && ` · ${contract.employee_department_name}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <BmhsManageButton employeeId={contract.employee_id} employeeName={contract.employee_name} />
              <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-hover text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* ── Status action bar ── */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-6 py-3">
              {contract.status === 'draft' && (
                <button onClick={() => changeStatus('pending_signing')} disabled={statusBusy}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-3 py-1.5 text-xs font-600 text-amber-400 disabled:opacity-50">
                  {statusBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Gửi để Ký
                </button>
              )}
              {contract.status === 'pending_signing' && (
                <>
                  <button onClick={() => changeStatus('active')} disabled={statusBusy}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-3 py-1.5 text-xs font-600 text-emerald-400 disabled:opacity-50">
                    {statusBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Đánh Dấu Hiệu Lực
                  </button>
                  <button onClick={sendRemind} disabled={reminding}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 px-3 py-1.5 text-xs font-600 text-indigo-400 disabled:opacity-50">
                    {reminding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                    Nhắc Hoàn Thành Hợp Đồng
                  </button>
                  {!!contract.reminder_count && (
                    <span className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-2xs font-600 border ${
                      contract.escalated_at
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'bg-white/5 border-line text-muted-foreground'
                    }`}>
                      Đã nhắc {contract.reminder_count} lần
                      {contract.escalated_at && ' · đã báo cáo cấp trên'}
                    </span>
                  )}
                </>
              )}
              {contract.status === 'active' && canCreate && (
                <button onClick={onRenew}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 px-3 py-1.5 text-xs font-600 text-indigo-400">
                  <RefreshCw className="h-3.5 w-3.5" /> Gia Hạn
                </button>
              )}
              {(contract.status === 'pending_signing' || contract.status === 'active') && (
                <button onClick={() => changeStatus('terminated')} disabled={statusBusy}
                  className="flex items-center gap-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 text-xs font-600 text-red-400 disabled:opacity-50">
                  <XCircle className="h-3.5 w-3.5" /> Chấm Dứt
                </button>
              )}
              {canEdit && (
                <button onClick={onEdit}
                  className="ml-auto flex items-center gap-1.5 rounded-xl border border-line hover:bg-hover px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                  Sửa thông tin
                </button>
              )}
            </div>
          )}

          {/* ── Body scroll ── */}
          <div className="overflow-y-auto flex-1">
            <div className="p-6 space-y-6">

              {/* ── Thông tin cơ bản ── */}
              <section>
                <h3 className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3">Thông tin hợp đồng</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <InfoItem label="Loại hợp đồng" value={contract.contract_type_name || '—'} />
                  <InfoItem label="Ngày ký" value={fmtDate(contract.sign_date)} />
                  <InfoItem label="Ngày bắt đầu" value={fmtDate(contract.start_date)} />
                  <InfoItem label="Ngày hết hạn" value={fmtDate(contract.end_date) || 'Vô thời hạn'} />
                  <InfoItem label="Thời hạn còn lại"
                    value={<ExpiryBadge endDate={contract.end_date} status={contract.status} />} />
                  <InfoItem label="Ngày tạo" value={fmtDate(contract.created_at)} />
                </div>
                {contract.notes && (
                  <div className="mt-3 rounded-xl border border-line-subtle p-3">
                    <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-1">Ghi chú</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{contract.notes}</p>
                  </div>
                )}
              </section>

              {/* ── Lịch sử gia hạn ── */}
              {chain.length > 1 && (
                <section>
                  <h3 className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3">Chuỗi hợp đồng</h3>
                  <div className="space-y-1">
                    {chain.map((c, i) => (
                      <div key={c.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${c.id === contractId ? 'bg-indigo-500/10 border border-indigo-500/20' : 'border border-line-subtle'}`}>
                        <span className={`rounded-full px-2 py-0.5 text-2xs ${STATUS_LABELS[c.status]?.cls || ''}`}>
                          {STATUS_LABELS[c.status]?.label || c.status}
                        </span>
                        <span className="text-foreground font-600">{c.contract_number}</span>
                        <span className="text-muted-foreground">{fmtDate(c.start_date)} → {fmtDate(c.end_date) || '∞'}</span>
                        {i < chain.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Người Đồng Phụ Trách ── */}
              <section>
                <h3 className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Người Đồng Phụ Trách ({coHandlers.length})
                </h3>
                <p className="text-2xs text-muted-foreground mb-3">Nếu hồ sơ chưa hoàn thành sau nhiều lần nhắc, hệ thống tự báo cáo lên quản lý của họ.</p>
                {coHandlers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {coHandlers.map((w) => (
                      <div key={w.id} className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 pl-1 pr-2 py-1">
                        <span className="h-5 w-5 rounded-full bg-amber-500/20 text-amber-400 text-2xs flex items-center justify-center font-600">
                          {(w.name || '?')[0].toUpperCase()}
                        </span>
                        <span className="text-xs text-foreground">{w.name || w.user_id}</span>
                        {canEdit && (
                          <button onClick={() => handleRemoveWatcher(w.user_id)} className="text-muted-foreground hover:text-red-400 ml-0.5">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <MultiUserPicker
                    value={[]}
                    onChange={(u) => handleAddWatcher(u, 'co_handler')}
                    excludeIds={watchers.map((w) => w.user_id)}
                    placeholder="Thêm người đồng phụ trách…"
                  />
                )}
              </section>

              {/* ── Người theo dõi ── */}
              <section>
                <h3 className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Người theo dõi ({pureWatchers.length})
                </h3>
                {pureWatchers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {pureWatchers.map((w) => (
                      <div key={w.id}
                        className="flex items-center gap-1.5 rounded-full bg-hover border border-line pl-1 pr-2 py-1">
                        <span className="h-5 w-5 rounded-full bg-indigo-500/20 text-indigo-400 text-2xs flex items-center justify-center font-600">
                          {(w.name || '?')[0].toUpperCase()}
                        </span>
                        <span className="text-xs text-foreground">{w.name || w.user_id}</span>
                        {canEdit && (
                          <button onClick={() => handleRemoveWatcher(w.user_id)}
                            className="text-muted-foreground hover:text-red-400 ml-0.5">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <MultiUserPicker
                    value={[]}
                    onChange={handleAddWatcher}
                    excludeIds={watchers.map((w) => w.user_id)}
                    placeholder="Thêm người theo dõi…"
                  />
                )}
              </section>

              {/* ── Tệp đính kèm ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-600 uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> Tệp đính kèm ({attachments.length})
                  </h3>
                  {canEdit && (
                    <button onClick={() => fileRef.current?.click()} disabled={busy}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 disabled:opacity-50">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                      Tải lên
                    </button>
                  )}
                  <input ref={fileRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
                </div>

                {attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Chưa có tệp đính kèm.</p>
                ) : (
                  <div className="space-y-1.5">
                    {attachments.map((a) => {
                      const previewKind = canPreviewInline(a.mime_type);
                      return (
                        <div key={a.id}
                          className="flex items-center gap-3 rounded-xl border border-line-subtle px-3 py-2.5 hover:bg-hover">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="text-sm text-foreground truncate block">{a.file_name}</span>
                            <span className="text-2xs text-muted-foreground">{fmtBytes(a.size_bytes)}</span>
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {previewKind && (
                              <button onClick={() => handlePreview(a)} title="Xem trước"
                                className="rounded-lg p-1.5 text-muted-foreground hover:text-indigo-400 hover:bg-hover">
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                            <button type="button" onClick={() => void download(`/api/contracts/attachments/${a.id}?download=1`, a.file_name)}
                              title="Tải xuống"
                              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-hover">
                              <Download className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <button onClick={() => handleDeleteAttachment(a.id)} title="Xóa"
                                className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-hover">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

            </div>
          </div>

        </div>
      </div>

      {/* ── Lightbox ảnh ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 rounded-full bg-hover-strong p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}>
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Preview" className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title="Xác nhận thay đổi trạng thái"
          message={`Chuyển trạng thái sang "${STATUS_LABELS[confirm.newStatus]?.label}"?`}
          confirmLabel="Xác nhận"
          cancelLabel="Hủy"
          isLoading={statusBusy}
          onConfirm={() => confirmChangeStatus(confirm.newStatus)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
