'use client';

import { X, Download } from 'lucide-react';
import { TicketAttachment } from '@/hooks/useTicketAttachments';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface AttachmentPreviewProps {
  attachment: TicketAttachment;
  onClose: () => void;
}

export default function AttachmentPreview({
  attachment,
  onClose,
}: AttachmentPreviewProps) {
  const isImage = attachment.mime_type?.startsWith('image/');
  const isPdf = attachment.mime_type === 'application/pdf';

  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{attachment.file_name}</h2>
            <p className="text-xs text-gray-500 mt-1">{attachment.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:text-blue-600">
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {isImage ? (
            <img
              src={`/api/tickets/attachments/${attachment.id}`}
              alt={attachment.file_name}
              className="max-w-full h-auto mx-auto"
            />
          ) : isPdf ? (
            <iframe
              src={`/api/tickets/attachments/${attachment.id}`}
              className="w-full h-[600px] border border-gray-200 rounded"
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p className="text-sm">Không thể xem trước tệp này</p>
              <p className="text-xs mt-2">Loại tệp: {attachment.file_type}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
