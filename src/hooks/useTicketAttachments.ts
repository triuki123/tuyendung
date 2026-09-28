'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  description?: string;
  is_internal?: boolean;
  file_type?: string;
  download_count?: number;
}

interface UseTicketAttachmentsResult {
  attachments: TicketAttachment[];
  loading: boolean;
  error: string | null;
  uploading: boolean;
  uploadProgress: number;
  upload: (files: File[], description?: string, is_internal?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  downloadCount: (attachmentId: string) => number;
}

export function useTicketAttachments(ticketId: string, userId: string): UseTicketAttachmentsResult {
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchAttachments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/tickets/${ticketId}/attachments`);
      if (!res.ok) throw new Error('Failed to fetch attachments');

      const data = await res.json();
      setAttachments(data.attachments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const upload = useCallback(
    async (files: File[], description?: string, is_internal = false) => {
      try {
        setUploading(true);
        setUploadProgress(0);
        setError(null);

        const form = new FormData();
        files.forEach((file) => {
          form.append('files', file);
        });
        form.append('uploaded_by', userId);
        if (description) {
          form.append('description', description);
        }
        form.append('is_internal', String(is_internal));

        const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
          method: 'POST',
          body: form,
        });

        if (!res.ok) throw new Error('Failed to upload files');
        const data = await res.json();

        setAttachments((prev) => [...(data.attachments || []), ...prev]);
        setUploadProgress(100);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload');
        throw err;
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [ticketId, userId]
  );

  const refresh = useCallback(async () => {
    await fetchAttachments();
  }, [fetchAttachments]);

  const downloadCount = useCallback((attachmentId: string) => {
    const attachment = attachments.find((a) => a.id === attachmentId);
    return attachment?.download_count || 0;
  }, [attachments]);

  return {
    attachments,
    loading,
    error,
    uploading,
    uploadProgress,
    upload,
    refresh,
    downloadCount,
  };
}
