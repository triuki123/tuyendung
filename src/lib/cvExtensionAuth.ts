import { createHash, randomBytes } from 'crypto';
import { queryOne, execute } from '@/lib/db';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { getEffectiveRolePermissions } from '@/lib/modules';
import { normalizeRole } from '@/lib/rolePolicy';
import { canAccessInherited } from '@/lib/permissions';

export const hashExtensionSecret = (value: string) => createHash('sha256').update(value).digest('hex');
export const newExtensionToken = () => `afcv_${randomBytes(32).toString('base64url')}`;
export const newPairingCode = () => randomBytes(5).toString('hex').toUpperCase();

export async function authenticateCvExtension(request: Request) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer?.startsWith('afcv_')) return null;
  const row = await queryOne<{ id: string; user_id: string; company_id: string | null }>(
    `SELECT id, user_id, company_id FROM cv_extension_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL`, [hashExtensionSecret(bearer)]);
  if (!row) return null;
  const context = await getEffectiveContext(row.user_id, row.company_id);
  if (!context) return null;
  const permissions = getEffectiveRolePermissions(normalizeRole(context.role), context.module_permissions);
  if (context.role !== 'super_admin' && !canAccessInherited(permissions, 'hr-cv', 'create')) return null;
  await execute(`UPDATE cv_extension_tokens SET last_used_at = NOW() WHERE id = $1`, [row.id]);
  return { tokenId: row.id, userId: row.user_id, context };
}

export const extensionCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
