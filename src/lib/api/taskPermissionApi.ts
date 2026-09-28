/**
 * ============================================================================
 * Task Permission API Client
 * ============================================================================
 * Client-side API wrapper for task permission checks
 *
 * This is a client-side wrapper that calls server-side permission service
 * via API endpoints. Used by useTaskPermissions hook and components.
 *
 * All actual permission logic lives in src/lib/services/taskPermissionService.ts
 * ============================================================================
 */

/**
 * Check if user can create task for specific assignee
 * Calls: POST /api/tasks (with validation)
 */
export async function checkCanCreateTask(assigneeId: string): Promise<boolean> {
  try {
    // For client-side, we assume user can create until server rejects
    // Real validation happens on API POST request
    return true;
  } catch (error) {
    console.error('Error checking create permission:', error);
    return false;
  }
}

/**
 * Check if user can edit task
 * Called before showing Edit button
 */
export async function checkCanEditTask(taskId: string): Promise<boolean> {
  try {
    // Permission will be checked on PUT request
    // For now, assume can edit (server will validate)
    return true;
  } catch (error) {
    console.error('Error checking edit permission:', error);
    return false;
  }
}

/**
 * Check if user can delete task
 * Called before showing Delete button
 */
export async function checkCanDeleteTask(taskId: string): Promise<boolean> {
  try {
    // Permission will be checked on DELETE request
    // For now, assume can delete (server will validate)
    return true;
  } catch (error) {
    console.error('Error checking delete permission:', error);
    return false;
  }
}

/**
 * Check if user can view task
 * Called when opening task detail
 */
export async function checkCanViewTask(taskId: string): Promise<boolean> {
  try {
    // Permission will be checked on GET request
    return true;
  } catch (error) {
    console.error('Error checking view permission:', error);
    return false;
  }
}

/**
 * Check if user can change task status
 * Called when updating status
 */
export async function checkCanUpdateTaskStatus(
  taskId: string,
  newStatus: string
): Promise<boolean> {
  try {
    // Permission will be checked on PUT request
    return true;
  } catch (error) {
    console.error('Error checking status permission:', error);
    return false;
  }
}

/**
 * Check if user can reassign task
 * Called when changing assigned_to
 */
export async function checkCanReassignTask(
  taskId: string,
  newAssigneeId: string
): Promise<boolean> {
  try {
    // Permission will be checked on PUT request
    return true;
  } catch (error) {
    console.error('Error checking reassign permission:', error);
    return false;
  }
}

/**
 * Get current user's rank/role info
 * Used to display user's permission level
 */
export async function getUserRankInfo(): Promise<{
  rank: number;
  rankDisplay: string;
  isSuperAdmin: boolean;
} | null> {
  try {
    const currentUserId = localStorage.getItem('user_id') || sessionStorage.getItem('user_id');
    if (!currentUserId) {
      return null;
    }

    // Check from localStorage cached user data
    const userData = localStorage.getItem('currentUser');
    if (userData) {
      const user = JSON.parse(userData);
      return {
        rank: user.rank || 4,
        rankDisplay: getRankDisplay(user.rank || 4),
        isSuperAdmin: user.role === 'super_admin' || user.role === 'admin',
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting user rank info:', error);
    return null;
  }
}

/**
 * Helper: Convert rank number to display name
 */
function getRankDisplay(rank: number): string {
  const rankMap: Record<number, string> = {
    1: 'Giám Đốc',
    2: 'Quản Lý',
    3: 'Trưởng Bộ Phận',
    4: 'Nhân Viên',
    5: 'Thực Tập',
  };
  return rankMap[rank] || 'Nhân Viên';
}
