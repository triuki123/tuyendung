import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';
import { getCompanyMemberUserIds } from '@/lib/services/userCompanyService';

export interface AssetScopeContext {
  userId: string;
  role: string;
  companyId: string | null;
}

export interface ScopedAsset {
  company_id?: string | null;
  assigned_to?: string | null;
}

export interface ScopedManagedAsset {
  companyId?: string | null;
  userId?: string | null;
}

export async function getAssetVisibleUserIds(context: AssetScopeContext): Promise<string[]> {
  if (context.role === 'admin') {
    return context.companyId ? getCompanyMemberUserIds(context.companyId) : [];
  }
  if (context.role === 'manager') {
    const subordinateIds = await getOrgSubtreeUserIds(context.userId, context.companyId);
    return [context.userId, ...subordinateIds];
  }
  return [context.userId];
}

export async function canAccessAssetData(
  context: AssetScopeContext,
  asset: ScopedAsset
): Promise<boolean> {
  if (context.role === 'super_admin') return true;
  if (context.role === 'admin') {
    return !!context.companyId && asset.company_id === context.companyId;
  }
  const visibleUserIds = await getAssetVisibleUserIds(context);
  return !!asset.assigned_to && visibleUserIds.includes(asset.assigned_to);
}

export async function canAccessManagedAssetData(
  context: AssetScopeContext,
  asset: ScopedManagedAsset
): Promise<boolean> {
  if (context.role === 'super_admin') return true;
  if (context.role === 'admin') {
    return !!context.companyId && asset.companyId === context.companyId;
  }
  const visibleUserIds = await getAssetVisibleUserIds(context);
  return !!asset.userId && visibleUserIds.includes(asset.userId);
}
