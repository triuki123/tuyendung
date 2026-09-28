import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const positionId = params.id;

    if (!positionId) {
      return NextResponse.json(
        { error: 'Position ID is required' },
        { status: 400 }
      );
    }

    // Không phải super_admin → vị trí phải thuộc công ty MÌNH THUỘC VỀ.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    if (allowed !== null) {
      const position = await queryOne<{ company_id: string }>(
        'SELECT company_id::text AS company_id FROM positions WHERE id = $1',
        [positionId]
      );
      if (!position || !allowed.includes(position.company_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const users = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      avatar: string;
      position_id: string;
      job_title_id: string;
      company_id: string;
    }>(
      `SELECT id, name, email, role, avatar, position_id, job_title_id, company_id
       FROM users
       WHERE position_id = $1
       ORDER BY name ASC`,
      [positionId]
    );

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching position users:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
