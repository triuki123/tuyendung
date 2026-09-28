/**
 * ============================================================================
 * useTaskPermissions Hook
 * ============================================================================
 * Custom hook for checking task permissions in React components
 *
 * This is a CLIENT-SIDE ONLY hook that provides permission check methods.
 * Actual permission validation happens on the server side in API endpoints.
 *
 * Usage:
 * const { loading, getRankDisplay } = useTaskPermissions();
 *
 * All permission checks are validated by the API when making requests.
 * For buttons, use the taskPermissions state from TasksClient instead.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  checkCanCreateTask,
  checkCanEditTask,
  checkCanDeleteTask,
  checkCanViewTask,
  checkCanUpdateTaskStatus,
  checkCanReassignTask,
  getUserRankInfo,
} from '@/lib/api/taskPermissionApi';

interface RankInfo {
  rank: number;
  rankDisplay: string;
  isSuperAdmin: boolean;
}

interface PermissionChecks {
  rankInfo: RankInfo | null;
  loading: boolean;

  // Check if can create task for specific user
  canCreate: (assigneeId: string) => Promise<boolean>;

  // Check if can view task
  canView: (taskId: string) => Promise<boolean>;

  // Check if can edit task
  canEdit: (taskId: string) => Promise<boolean>;

  // Check if can delete task
  canDelete: (taskId: string) => Promise<boolean>;

  // Check if can update task status
  canChangeStatus: (taskId: string, newStatus: string) => Promise<boolean>;

  // Check if can reassign task
  canReassign: (taskId: string, newAssigneeId: string) => Promise<boolean>;

  // Check if is super admin
  isSuperAdmin: () => boolean;

  // Get rank display name
  getRankDisplay: () => string;
}

export function useTaskPermissions(): PermissionChecks {
  const [rankInfo, setRankInfo] = useState<RankInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user rank info on mount
  useEffect(() => {
    const loadRankInfo = async () => {
      try {
        const info = await getUserRankInfo();
        setRankInfo(info);
      } catch (error) {
        console.error('Error loading rank info:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRankInfo();
  }, []);

  // Permission check functions - these call the API wrapper
  const canCreate = useCallback(
    async (assigneeId: string): Promise<boolean> => {
      return await checkCanCreateTask(assigneeId);
    },
    []
  );

  const canView = useCallback(
    async (taskId: string): Promise<boolean> => {
      return await checkCanViewTask(taskId);
    },
    []
  );

  const canEdit = useCallback(
    async (taskId: string): Promise<boolean> => {
      return await checkCanEditTask(taskId);
    },
    []
  );

  const canDelete = useCallback(
    async (taskId: string): Promise<boolean> => {
      return await checkCanDeleteTask(taskId);
    },
    []
  );

  const canChangeStatus = useCallback(
    async (taskId: string, newStatus: string): Promise<boolean> => {
      return await checkCanUpdateTaskStatus(taskId, newStatus);
    },
    []
  );

  const canReassign = useCallback(
    async (taskId: string, newAssigneeId: string): Promise<boolean> => {
      return await checkCanReassignTask(taskId, newAssigneeId);
    },
    []
  );

  const isSuperAdmin = useCallback((): boolean => {
    return rankInfo?.isSuperAdmin ?? false;
  }, [rankInfo]);

  const getRankDisplay = useCallback((): string => {
    return rankInfo?.rankDisplay ?? 'Nhân Viên';
  }, [rankInfo]);

  return {
    rankInfo,
    loading,
    canCreate,
    canView,
    canEdit,
    canDelete,
    canChangeStatus,
    canReassign,
    isSuperAdmin,
    getRankDisplay,
  };
}
