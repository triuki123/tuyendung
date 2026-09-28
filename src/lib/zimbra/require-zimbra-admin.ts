import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

// TODO: Replace header-based identity with JWT/session cookie after auth migration (JWT+bcrypt).
// Currently reads x-current-user-id from header (spoofable) then verifies role from DB.
// After migration: extract userId from verified JWT/session, remove header dependency.
export async function requireZimbraAdmin(
  req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const userId = req.headers.get('x-current-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await queryOne<{ role: string }>(
    'SELECT role FROM users WHERE id = $1 AND status = $2',
    [userId, 'active']
  );
  if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { userId };
}
