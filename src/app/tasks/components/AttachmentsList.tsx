'use client';

import React, { useRef, useState } from 'react';
import { Paperclip, Upload, Download, Trash2, Loader2, FileText } from 'lucide-react';

export interface Attachment {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

interface AttachmentsListProps {
  taskId: string;
  attachments: Attachment[];
  currentUserId?: string;
  currentUserName?: string;
  isManager?: boolean;
  canUpload?: boolean;
  loading?: boolean;
  onChanged?: () => void; // gọi sau khi upload/xóa để reload
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function AttachmentsList({
  taskId,
  attachments,
  currentUserId,
  currentUserName,
  isManager = false,
  canUpload = true,
  loading = false,
  onChanged,
}: AttachmentsListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = {};
    if (currentUserId) h['x-current-user-id'] = currentUserId;
    if (currentUserName) h['x-current-user-name'] = encodeURIComponent(currentUserName);
    return h;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: headers(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tải tệp thất bại');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải tệp thất bại');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (att: Attachment) => {
    setDeleting(att.id);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments/${att.id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Xóa tệp thất bại');
      }
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa tệp thất bại');
    } finally {
      setDeleting(null);
    }
  };

  const canDelete = (att: Attachment) =>
    att.uploaded_by === currentUserId || isManager;

  if (loading) {
    return (
      <div className="space-y-3 px-3 md:px-0">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-14 bg-hover rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Header + count */}
      <div className="flex items-center gap-2 px-3 md:px-0">
        <Paperclip size={16} className="text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-600 text-foreground">
          {attachments.length} tệp đính kèm
        </span>
      </div>

      {error && (
        <div className="mx-3 md:mx-0 p-2.5 rounded text-sm bg-red-500/20 text-red-400">
          {error}
        </div>
      )}

      {/* Upload */}
      {canUpload && (
        <div className="px-3 md:px-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 md:py-2 rounded-lg border border-line hover:border-indigo-500 hover:bg-indigo-500/10 transition-colors text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Tải tệp lên"
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            <span>{uploading ? 'Đang tải lên...' : 'Tải tệp lên (tối đa 10MB)'}</span>
          </button>
        </div>
      )}

      {/* List */}
      {attachments.length === 0 ? (
        <div className="flex items-center justify-center py-6 md:py-8 text-muted-foreground">
          <span className="text-sm">Chưa có tệp nào</span>
        </div>
      ) : (
        <div className="space-y-2 px-3 md:px-0">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-line bg-hover"
            >
              <FileText size={20} className="text-indigo-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-500 text-foreground truncate" title={att.file_name}>
                  {att.file_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(att.size_bytes)}
                  {att.uploaded_by_name ? ` · ${att.uploaded_by_name}` : ''}
                  {' · '}
                  {new Date(att.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
              <a
                href={`/api/tasks/${taskId}/attachments/${att.id}/download`}
                className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors flex-shrink-0"
                title="Tải xuống"
                aria-label="Tải xuống"
              >
                <Download size={16} />
              </a>
              {canDelete(att) && (
                <button
                  onClick={() => handleDelete(att)}
                  disabled={deleting === att.id}
                  className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                  title="Xóa tệp"
                  aria-label="Xóa"
                >
                  {deleting === att.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
