/**
 * Date Utilities for Tickets
 */

/**
 * Check if date is today
 */
export function isCreatedToday(dateString: string): boolean {
  const created = new Date(dateString);
  const today = new Date();

  return (
    created.getFullYear() === today.getFullYear() &&
    created.getMonth() === today.getMonth() &&
    created.getDate() === today.getDate()
  );
}

/**
 * Check if date is in the past (older than today)
 */
export function isInPast(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/**
 * Get days ago
 */
export function getDaysAgo(dateString: string): number {
  const created = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  created.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - created.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Format days ago as string (e.g., "2 ngày trước")
 */
export function formatDaysAgo(dateString: string): string {
  const days = getDaysAgo(dateString);

  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Tuần trước' : `${weeks} tuần trước`;
  }

  const months = Math.floor(days / 30);
  return months === 1 ? 'Tháng trước' : `${months} tháng trước`;
}
