import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, buildInsert } from '@/lib/db';

// GET /api/tags - Get list of active tags
export async function GET(req: NextRequest) {
  try {
    const tags = await query(
      `SELECT * FROM tags WHERE is_active = true ORDER BY name ASC`
    );

    return NextResponse.json(tags);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/tags - Create tag (Super Admin only)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, color, created_by } = body;

    // Require created_by for authorization
    if (!created_by) {
      return NextResponse.json(
        { error: 'Unauthorized: created_by is required' },
        { status: 401 }
      );
    }

    const user = await queryOne<{ role: string }>(
      'SELECT role FROM users WHERE id = $1',
      [created_by]
    );

    if (!user || user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admin can create tags' },
        { status: 403 }
      );
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      );
    }

    const { text, params } = buildInsert('tags', {
      name: name.trim(),
      description: description || null,
      color: color || '#6366f1',
      is_active: true,
    });

    const tag = await queryOne(text, params);

    return NextResponse.json(tag, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
