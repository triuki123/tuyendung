/**
 * Audit Log Service
 * Helper functions to log activities to audit logs
 */
import { execute } from '@/lib/db';

export interface AuditLogEntry {
  action: string;
  details: string;
  assetId?: string;
  assetCode?: string;
  assetName?: string;
  assetType?: string;
  adminId?: string;
  performedBy?: string;
}

export async function logActivity(
  entry: AuditLogEntry,
  _includeInResponse: boolean = false
): Promise<boolean> {
  try {
    const adminId = entry.adminId || entry.performedBy || 'System';
    await execute(
      `INSERT INTO audit_logs (action, details, admin_id) VALUES ($1, $2, $3)`,
      [entry.action, entry.details, adminId]
    );
    return true;
  } catch (error) {
    console.error('Error logging activity:', error);
    return false;
  }
}

/**
 * Log asset creation
 */
export function createAssetLog(
  assetId: string,
  assetCode: string,
  assetName: string,
  performedBy: string = 'System'
): AuditLogEntry {
  return {
    action: 'asset_created',
    details: `Created asset: ${assetName} (${assetCode})`,
    assetId,
    assetCode,
    assetName,
    assetType: 'hardware',
    performedBy,
  };
}

/**
 * Log asset update
 */
export function updateAssetLog(
  assetId: string,
  assetCode: string,
  assetName: string,
  changes: string[],
  performedBy: string = 'System'
): AuditLogEntry {
  const changeDetails = changes.length > 0 ? changes.join(', ') : 'Updated';
  return {
    action: 'asset_updated',
    details: `Updated asset ${assetCode}: ${changeDetails}`,
    assetId,
    assetCode,
    assetName,
    assetType: 'hardware',
    performedBy,
  };
}

/**
 * Log asset deletion
 */
export function deleteAssetLog(
  assetId: string,
  assetCode: string,
  assetName: string,
  performedBy: string = 'System'
): AuditLogEntry {
  return {
    action: 'asset_deleted',
    details: `Deleted asset: ${assetName} (${assetCode})`,
    assetId,
    assetCode,
    assetName,
    assetType: 'hardware',
    performedBy,
  };
}

/**
 * Log asset deletion approval (from delete request workflow)
 */
export function deleteAssetApprovedLog(
  assetId: string,
  assetCode: string,
  assetName: string,
  reason: string,
  approvedBy: string,
  reviewNote?: string
): AuditLogEntry {
  return {
    action: 'asset_deleted_approved',
    details: `Deleted asset approved: ${assetName} (${assetCode}). Reason: ${reason}. Review note: ${reviewNote || 'N/A'}`,
    assetId,
    assetCode,
    assetName,
    assetType: 'hardware',
    performedBy: approvedBy,
  };
}

/**
 * Get action color for UI display
 */
export function getActionColor(action: string): string {
  const colorMap: Record<string, string> = {
    'asset_created': 'bg-emerald-500/15 border-emerald-500/30',
    'asset_updated': 'bg-blue-500/15 border-blue-500/30',
    'asset_deleted': 'bg-red-500/15 border-red-500/30',
    'asset_deleted_approved': 'bg-red-500/15 border-red-500/30',
    'CREATE': 'bg-purple-500/15 border-purple-500/30',
    'UPDATE': 'bg-violet-500/15 border-violet-500/30',
    'DEACTIVATE': 'bg-red-500/15 border-red-500/30',
  };

  return colorMap[action] || 'bg-slate-500/15 border-slate-500/30';
}

/**
 * Get action display name (Vietnamese)
 */
export function getActionDisplayName(action: string): string {
  const nameMap: Record<string, string> = {
    'asset_created': 'Nhập kho',
    'asset_updated': 'Cập nhật tài sản',
    'asset_deleted': 'Xóa tài sản',
    'asset_deleted_approved': 'Xóa tài sản (Phê duyệt)',
    'CREATE': 'Tạo người dùng',
    'UPDATE': 'Cập nhật người dùng',
    'DEACTIVATE': 'Vô hiệu hóa người dùng',
  };

  return nameMap[action] || action;
}
