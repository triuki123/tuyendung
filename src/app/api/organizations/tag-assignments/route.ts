import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, withTransaction } from '@/lib/db';
import { checkUnitAccess } from '@/lib/api-permissions';

type EntityType = 'company' | 'department' | 'sub_department';

const ENTITY_COLUMN: Record<EntityType, string> = {
  company: 'company_id',
  department: 'department_id',
  sub_department: 'sub_department_id',
};

// GET /api/organizations/tag-assignments
// Returns every assignment joined with its org tag, so the org tree can render
// tag chips per unit without N requests.
export async function GET(_req: NextRequest) {
  try {
    if (!checkUnitAccess(_req, 'organization', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const rows = await query(
      `SELECT a.id, a.tag_id, a.company_id, a.department_id, a.sub_department_id,
              t.name, t.color
         FROM org_tag_assignments a
         JOIN org_tags t ON t.id = a.tag_id
        WHERE t.is_active = true
        ORDER BY t.name ASC`
    );
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/organizations/tag-assignments
// Replaces the full tag set for a single org unit (Super Admin only).
// Body: { entity_type, entity_id, tag_ids: string[], updated_by }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { entity_type, entity_id, tag_ids, updated_by } = body as {
      entity_type: EntityType;
      entity_id: string;
      tag_ids: string[];
      updated_by: string;
    };

    if (!updated_by) {
      return NextResponse.json(
        { error: 'Unauthorized: updated_by is required' },
        { status: 401 }
      );
    }

    const user = await queryOne<{ role: string }>(
      'SELECT role FROM users WHERE id = $1',
      [updated_by]
    );
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admin can manage org tag assignments' },
        { status: 403 }
      );
    }

    const column = ENTITY_COLUMN[entity_type];
    if (!column || !entity_id) {
      return NextResponse.json(
        { error: 'entity_type (company|department|sub_department) and entity_id are required' },
        { status: 400 }
      );
    }

    const ids = Array.isArray(tag_ids) ? [...new Set(tag_ids)] : [];

    await withTransaction(async (client) => {
      await client.query(
        `DELETE FROM org_tag_assignments WHERE ${column} = $1`,
        [entity_id]
      );
      for (const tagId of ids) {
        await client.query(
          `INSERT INTO org_tag_assignments (tag_id, ${column}) VALUES ($1, $2)`,
          [tagId, entity_id]
        );
      }
    });

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
