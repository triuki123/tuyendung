import { getAuditLogs } from '@/lib/services/usersService';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['super_admin', 'admin']);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || undefined;

    const logs = await getAuditLogs(userId);
    return NextResponse.json(logs);
  } catch (error) {
    console.error('Audit logs fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
