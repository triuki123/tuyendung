'use client';

import { useState } from 'react';
import { Upload, File, Download, Trash2, Lock } from 'lucide-react';
import { useTicketAttachments } from '@/hooks/useTicketAttachments';
import AttachmentUploader from '../attachments/AttachmentUploader';

interface AttachmentsTabProps {
  ticketId: string;
  userId: string;
}

export default function AttachmentsTab({ ticketId, userId }: AttachmentsTabProps) {
  const { attachments, loading } = useTicketAttachments(ticketId, userId);
  const [showUploader, setShowUploader] = useState(false);

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="p-6 space-y-4">
      {/* Upload area */}
      <div className="bg-secondary rounded-xl border border-border p-4">
        {showUploader ? (
          <AttachmentUploader ticketId={ticketId} userId={userId} onClose={() => setShowUploader(false)} />
        ) : (
          <button
            onClick={() => setShowUploader(true)}
            className="flex flex-col items-center justify-center gap-2 w-full py-6 border-2 border-dashed border-border rounded-xl hover:border-indigo/50 hover:bg-indigo/5 text-muted-foreground hover:text-indigo transition-all"
          >
            <Upload className="w-6 h-6" />
            <span className="text-sm font-semibold">Tải lên tệp đính kèm</span>
            <span className="text-xs">Kéo thả hoặc nhấn để chọn</span>
          </button>
        )}
      </div>

      {/* List */}
      {loading && (
        <div className="text-center py-6 text-muted-foreground text-sm">Đang tải...</div>
      )}

      {!loading && attachments.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có tệp đính kèm</p>
        </div>
      )}

      <div className="space-y-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center gap-3 p-3 bg-secondary rounded-xl border border-border hover:border-indigo/30 transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo/10 border border-indigo/20 flex items-center justify-center flex-shrink-0">
              <File className="w-4 h-4 text-indigo" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{attachment.file_name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{formatFileSize(attachment.size_bytes)}</span>
                <span>·</span>
                <span>{new Date(attachment.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                {attachment.is_internal && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <Lock className="w-3 h-3" /> Nội bộ
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="p-1.5 text-muted-foreground hover:text-indigo hover:bg-indigo/10 rounded-md transition-colors">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Paperclip({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}
