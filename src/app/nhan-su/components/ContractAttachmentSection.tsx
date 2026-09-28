'use client';

import { useState, useRef } from 'react';
import { Paperclip, Trash2, Download, Eye, Loader2 } from 'lucide-react';
import {
  AttachmentMeta, listContractAttachments, uploadContractAttachments,
  deleteContractAttachment, fmtBytes,
} from './hrApi';
import { canPreviewInline } from '../utils/hrHelpers';
import { useBmhs } from './BmhsProvider';

interface Props {
  contractId: string;
  canEdit: boolean;
  onAttachmentsChange?: (attachments: AttachmentMeta[]) => void;
}

export default function ContractAttachmentSection({ contractId, canEdit, onAttachmentsChange }: Props) {
  const { download, openBlobUrl } = useBmhs();
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load attachments
  async function loadAttachments() {
    try {
      const data = await listContractAttachments(contractId);
      setAttachments(data);
      onAttachmentsChange?.(data);
    } catch { /* noop */ } finally { setLoading(false); }
  }

  // Handle file upload
  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      await uploadContractAttachments(contractId, files);
      await loadAttachments();
    } catch { /* noop */ } finally { setBusy(false); }
  }

  // Delete attachment
  async function handleDelete(attachmentId: string) {
    if (!canEdit) return;
    await deleteContractAttachment(attachmentId);
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
  }

  // Preview inline (qua BMHS: tải blob, tự gate mật khẩu nếu hồ sơ khóa)
  async function handlePreview(attachmentId: string, mimeType: string | null) {
    const kind = canPreviewInline(mimeType);
    if (!kind) return;
    const objUrl = await openBlobUrl(`/api/contracts/attachments/${attachmentId}`);
    if (!objUrl) return;
    if (kind === 'pdf') window.open(objUrl, '_blank');
    else setLightbox(objUrl);
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-3">
      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <Paperclip className="h-4 w-4" /> Thêm tệp
          </button>
        </>
      )}

      {attachments.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Chưa có tệp đính kèm</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-line p-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{a.file_name}</p>
                  <p className="text-2xs text-muted-foreground">{fmtBytes(a.size_bytes)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {canPreviewInline(a.mime_type) && (
                  <button onClick={() => handlePreview(a.id, a.mime_type)} className="btn-ghost rounded p-1">
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={() => void download(`/api/contracts/attachments/${a.id}?download=1`, a.file_name)}
                  className="btn-ghost rounded p-1" title="Tải xuống">
                  <Download className="h-4 w-4" />
                </button>
                {canEdit && (
                  <button onClick={() => handleDelete(a.id)} className="btn-ghost rounded p-1 text-red-400 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Preview" className="max-w-full max-h-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
