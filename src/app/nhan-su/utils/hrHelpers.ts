/**
 * Shared utilities for HR/Contracts module
 */

export function fmtDate(val: string | null | undefined): string {
  if (!val) return '—';
  const s = val.slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return val;
  return `${d}/${m}/${y}`;
}

export function fileIcon(mimeType: string | null): 'pdf' | 'image' | 'file' {
  if (!mimeType) return 'file';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return 'file';
}

export const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'bg-hover-strong text-muted-foreground' },
  pending_signing: { label: 'Chờ ký', cls: 'bg-amber-500/15 text-amber-400' },
  active: { label: 'Hiệu lực', cls: 'bg-emerald-500/15 text-emerald-400' },
  renewed: { label: 'Đã gia hạn', cls: 'bg-indigo-500/15 text-indigo-400' },
  terminated: { label: 'Chấm dứt', cls: 'bg-red-500/15 text-red-400' },
};

/**
 * Check if MIME type can be previewed inline in browser
 */
export function canPreviewInline(mime: string | null): 'pdf' | 'image' | null {
  if (!mime) return null;
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return null;
}

/**
 * Format file size in human-readable format
 */
export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get relative time string (e.g., "5 days left")
 */
export function daysLeft(endDate: string | null | undefined): string {
  if (!endDate) return '—';
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return 'Hôm nay';
  if (days === 1) return '1 ngày';
  return `${days} ngày`;
}
