import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/tags/[id]/users - Get list of users assigned to a tag
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Join user_tags → users in one query; filter to active users only
    const users = await query<{
      id: string;
      email: string;
      name: string;
      role: string;
      department_id: string | null;
      company_id: string | null;
      status: string;
      avatar: string | null;
      created_at: string;
    }>(
      `SELECT u.id, u.email, u.name, u.role, u.department_id, u.company_id,
              u.status, u.avatar, u.created_at
       FROM user_tags ut
       JOIN users u ON u.id = ut.user_id
       WHERE ut.tag_id = $1
         AND u.status = 'active'
       ORDER BY u.name ASC`,
      [id]
    );

    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
