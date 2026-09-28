import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifySessionValidationProof } from '@/lib/authCookie';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    const requestedCompanyId =
      typeof body?.requestedCompanyId === 'string' && body.requestedCompanyId
        ? body.requestedCompanyId
        : null;
    const timestamp = Number(body?.timestamp);

    const validProof = await verifySessionValidationProof(
      request.headers.get('x-session-validation-proof'),
      userId,
      sessionId,
      timestamp
    );
    if (!userId || !sessionId || !validProof) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    const session = await queryOne<{ id: string }>(
      `SELECT s.id::text AS id
         FROM user_sessions s
         JOIN users u ON u.id::text = s.user_id::text
        WHERE s.id::text = $1
          AND s.user_id::text = $2
          AND (s.expires_at IS NULL OR s.expires_at > NOW())
          AND u.status = 'active'
        LIMIT 1`,
      [sessionId, userId]
    );

    if (!session) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    // Resolve role, permissions and company from the database. If a client asks
    // for a company it does not belong to, safely fall back to its primary company.
    const requestedContext = await getEffectiveContext(userId, requestedCompanyId);
    const context = requestedContext ?? await getEffectiveContext(userId, null);
    if (!context) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    return NextResponse.json({
      valid: true,
      requestedCompanyAccepted: !requestedCompanyId || !!requestedContext,
      context: {
        companyId: context.company_id,
        role: context.role,
        departmentId: context.department_id,
        permissions: context.module_permissions,
      },
    });
  } catch (error) {
    console.error('Session validation error:', error);
    return NextResponse.json({ valid: false }, { status: 503 });
  }
}
