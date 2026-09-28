/**
 * Archive Utilities
 * Handles auto-archiving of completed tasks and archive-related operations
 */

interface Task {
  id: string;
  status: string;
  updated_at: string;
  archived_at: string | null;
}

/**
 * Check if a task should be auto-archived
 * Archive if: status is 'done' AND 3+ days have passed since completion AND not already archived
 */
export function shouldAutoArchive(task: Task): boolean {
  if (task.archived_at) return false; // Already archived
  if (task.status !== 'done') return false; // Not completed

  const updatedDate = new Date(task.updated_at);
  const today = new Date();
  const daysDiff = Math.floor((today.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));

  return daysDiff >= 3; // Archive if 3+ days have passed
}

/**
 * Get days since completion
 */
export function getDaysSinceCompletion(task: Task): number {
  if (task.status !== 'done') return 0;

  const completedDate = new Date(task.updated_at);
  const today = new Date();
  return Math.floor((today.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get formatted date string
 */
export function formatArchiveDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Check if task is recently archived (within 24 hours)
 */
export function isRecentlyArchived(task: Task): boolean {
  if (!task.archived_at) return false;

  const archivedDate = new Date(task.archived_at);
  const now = new Date();
  const hoursDiff = (now.getTime() - archivedDate.getTime()) / (1000 * 60 * 60);

  return hoursDiff < 24;
}
