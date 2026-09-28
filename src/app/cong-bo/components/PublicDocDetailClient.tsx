'use client';

import { useEffect, useState } from 'react';
import {
  FileText, Loader2, AlertTriangle, Paperclip, Calendar, Building2, Tag,
  Download, Eye,
} from 'lucide-react';
import {
  PublicShell, PublicStatus, DOC_TYPES, DOC_TYPE_COLORS, formatDateVN, formatFileSize,
} from './PublicShell';

interface Attachment {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
}

interface PublicDoc {
  title: string;
  doc_number: string | null;
  doc_type: string;
  issued_by: string | null;
  issued_date: string | null;
  description: string | null;
  public_token: string;
  attachments: Attachment[];
}

/** File có xem trực tiếp trong trình duyệt được không (PDF + ảnh). */
function isViewable(a: Attachment): boolean {
  const mime = a.mime_type ?? '';
  if (mime === 'application/pdf' || mime.startsWith('image/')) return true;
  const ext = a.file_name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'pdf' || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
}

/** Trang xem văn bản công khai theo token — không cần đăng nhập. */
export default function PublicDocDetailClient({ token }: { token: string }) {
  const [doc, setDoc] = useState<PublicDoc | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/documents/${token}`);
        if (res.status === 404) { setState('notfound'); return; }
        const json = await res.json();
        if (!res.ok || !json.success) { setState('error'); return; }
        setDoc(json.data);
        // Mở sẵn file xem-được đầu tiên để người đọc thấy nội dung ngay.
        setActiveId(json.data.attachments?.find(isViewable)?.id ?? null);
        setState('ok');
      } catch {
        setState('error');
      }
    })();
  }, [token]);

  if (state === 'loading') {
    return (
      <PublicShell wide>
        <div className="flex flex-col items-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
          <p className="mt-3 text-sm text-muted-foreground">Đang tải văn bản...</p>
        </div>
      </PublicShell>
    );
  }

  if (state !== 'ok' || !doc) {
    return (
      <PublicShell wide>
        <PublicStatus
          icon={<AlertTriangle className="h-10 w-10 text-amber-400" />}
          title={state === 'notfound' ? 'Văn bản không tồn tại' : 'Không tải được văn bản'}
          desc={
            state === 'notfound'
              ? 'Link không đúng, hoặc văn bản đã ngừng công khai.'
              : 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.'
          }
        />
      </PublicShell>
    );
  }

  const active = doc.attachments.find((a) => a.id === activeId) ?? null;
  const fileUrl = (a: Attachment, inline: boolean) =>
    `/api/public/documents/${token}/attachments/${a.id}${inline ? '?inline=1' : ''}`;

  return (
    <PublicShell wide>
      <div className="rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="border-b border-line-subtle px-5 py-5 sm:px-6">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-500 ${DOC_TYPE_COLORS[doc.doc_type] ?? DOC_TYPE_COLORS.other}`}>
            {DOC_TYPES[doc.doc_type] ?? doc.doc_type}
          </span>
          <h1 className="mt-2.5 text-lg sm:text-xl font-700 text-foreground">{doc.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            {doc.doc_number && (
              <span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Số hiệu: <span className="text-foreground">{doc.doc_number}</span></span>
            )}
            {doc.issued_by && (
              <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {doc.issued_by}</span>
            )}
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Ban hành: {formatDateVN(doc.issued_date)}</span>
          </div>
        </div>

        {doc.description && (
          <div className="border-b border-line-subtle px-5 py-4 sm:px-6">
            <p className="mb-1.5 text-xs font-600 uppercase tracking-wider text-muted-foreground">Nội dung</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{doc.description}</p>
          </div>
        )}

        <div className="px-5 py-5 sm:px-6">
          <p className="mb-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">
            File đính kèm ({doc.attachments.length})
          </p>

          {doc.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Văn bản này không có file đính kèm.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {doc.attachments.map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${a.id === activeId ? 'border-indigo-500/50' : 'border-line-subtle'}`}
                    style={{ background: 'var(--secondary)' }}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Paperclip className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{a.file_name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(a.file_size)}</p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {isViewable(a) && (
                        <button
                          onClick={() => setActiveId(a.id === activeId ? null : a.id)}
                          title="Xem trực tiếp"
                          className="btn-ghost rounded-lg p-1.5"
                        >
                          <Eye className={`h-4 w-4 ${a.id === activeId ? 'text-indigo-400' : ''}`} />
                        </button>
                      )}
                      <a href={fileUrl(a, false)} download={a.file_name} title="Tải về" className="btn-ghost rounded-lg p-1.5">
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>

              {active && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-line-subtle bg-white">
                  {/* iframe dùng trình xem sẵn có của trình duyệt (PDF/ảnh) — không cần thư viện ngoài. */}
                  <iframe
                    key={active.id}
                    src={fileUrl(active, true)}
                    title={active.file_name}
                    className="h-[70vh] w-full border-0"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-2xs text-muted-foreground/70">
        <FileText className="h-3 w-3" /> Văn bản được FADO Group công bố công khai.
      </p>
    </PublicShell>
  );
}
