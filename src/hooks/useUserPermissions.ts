'use client';

import { useContext } from 'react';
import { PermissionAction, UserModulePermissions } from '@/lib/modules';
import {
  canAccess,
  canAccessInherited,
  hasModuleAccess,
  getModulePermissions,
  hasAllActions,
  hasAnyAction,
  getAccessibleModules,
  countPermissions,
} from '@/lib/permissions';

// We'll need to create a context for user permissions
// For now, this is a standalone hook that accepts permissions as a parameter

interface UseUserPermissionsReturn {
  canAccess: (moduleId: string, action: PermissionAction) => boolean;
  /** Kiểm tra quyền có kế thừa module mẹ — dùng cho module con (vd 'hr-offboarding'). */
  canAccessInherited: (unitId: string, action: PermissionAction) => boolean;
  hasModuleAccess: (moduleId: string) => boolean;
  getModulePermissions: (moduleId: string) => PermissionAction[];
  hasAllActions: (moduleId: string, actions: PermissionAction[]) => boolean;
  hasAnyAction: (moduleId: string, actions: PermissionAction[]) => boolean;
  getAccessibleModules: () => string[];
  countPermissions: () => number;
}

/**
 * Hook to check user permissions
 * Usage: const perms = useUserPermissions(userPermissions);
 *        if (perms.canAccess('users', 'edit')) { ... }
 */
export function useUserPermissions(userPermissions?: UserModulePermissions): UseUserPermissionsReturn {
  return {
    canAccess: (moduleId: string, action: PermissionAction) =>
      canAccess(userPermissions, moduleId, action),

    canAccessInherited: (unitId: string, action: PermissionAction) =>
      canAccessInherited(userPermissions, unitId, action),

    hasModuleAccess: (moduleId: string) =>
      hasModuleAccess(userPermissions, moduleId),

    getModulePermissions: (moduleId: string) =>
      getModulePermissions(userPermissions, moduleId),

    hasAllActions: (moduleId: string, actions: PermissionAction[]) =>
      hasAllActions(userPermissions, moduleId, actions),

    hasAnyAction: (moduleId: string, actions: PermissionAction[]) =>
      hasAnyAction(userPermissions, moduleId, actions),

    getAccessibleModules: () =>
      getAccessibleModules(userPermissions),

    countPermissions: () =>
      countPermissions(userPermissions),
  };
}
