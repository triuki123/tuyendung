import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { getActorWithPerms, forbidden, unauthorized } from '@/lib/apiAuth';
import { canAccess } from '@/lib/permissions';

async function canManageUserTags(req: NextRequest, targetUserId: string) {
  const actor = await getActorWithPerms(req);
  if (!actor) return { response: unauthorized() };
  const allowed =
    actor.id === targetUserId ||
    actor.role === 'super_admin' ||
    actor.role === 'admin' ||
    canAccess(actor.perms, 'users', 'edit');
  if (!allowed) return { response: forbidden() };
  return { actor };
}

// GET /api/users/[id]/tags - Get tags for a user
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const auth = await canManageUserTags(req, id);
    if ('response' in auth) return auth.response;

    // Join user_tags with tags to reconstruct the nested shape
    const rows = await query<{
      id: string;
      name: string;
      color: string;
      description: string | null;
      is_active: boolean;
    }>(
      `SELECT t.id, t.name, t.color, t.description, t.is_active
       FROM user_tags ut
       JOIN tags t ON t.id = ut.tag_id
       WHERE ut.user_id = $1`,
      [id]
    );

    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/users/[id]/tags - Replace all tags for a user
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const auth = await canManageUserTags(req, id);
    if ('response' in auth) return auth.response;
    const body = await req.json();
    const { tag_ids } = body; // Array of tag IDs

    if (!Array.isArray(tag_ids)) {
      return NextResponse.json(
        { error: 'tag_ids must be an array' },
        { status: 400 }
      );
    }

    // Remove existing tag associations for this user
    await execute('DELETE FROM user_tags WHERE user_id = $1', [id]);

    // Insert new tag associations
    if (tag_ids.length > 0) {
      const placeholders = tag_ids
        .map((_, i) => `($1, $${i + 2})`)
        .join(', ');
      await execute(
        `INSERT INTO user_tags (user_id, tag_id) VALUES ${placeholders}`,
        [id, ...tag_ids]
      );
    }

    // Return updated tags with full tag objects
    const rows = await query<{
      id: string;
      name: string;
      color: string;
      description: string | null;
      is_active: boolean;
    }>(
      `SELECT t.id, t.name, t.color, t.description, t.is_active
       FROM user_tags ut
       JOIN tags t ON t.id = ut.tag_id
       WHERE ut.user_id = $1`,
      [id]
    );

    return NextResponse.json(rows, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
