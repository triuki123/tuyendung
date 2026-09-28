import { NextRequest, NextResponse } from 'next/server';
import { queryOne, buildUpdateById } from '@/lib/db';

// PUT /api/org-tags/[id] - Update org tag (Super Admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { name, description, color, updated_by } = body;

    // Require updated_by for authorization
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
        { error: 'Forbidden: Only Super Admin can update org tags' },
        { status: 403 }
      );
    }

    // Build partial update — only include fields that were supplied
    const updateData: Record<string, any> = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (color) updateData.color = color;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { text, params: qParams } = buildUpdateById('org_tags', id, updateData);
    const tag = await queryOne(text, qParams);

    return NextResponse.json(tag);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/org-tags/[id] - Soft-delete org tag (Super Admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { deleted_by } = body;

    // Require deleted_by for authorization
    if (!deleted_by) {
      return NextResponse.json(
        { error: 'Unauthorized: deleted_by is required' },
        { status: 401 }
      );
    }

    const user = await queryOne<{ role: string }>(
      'SELECT role FROM users WHERE id = $1',
      [deleted_by]
    );

    if (!user || user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admin can delete org tags' },
        { status: 403 }
      );
    }

    // Soft delete — mark inactive so existing references stay intact
    const { text, params: qParams } = buildUpdateById('org_tags', id, { is_active: false });
    const tag = await queryOne(text, qParams);

    return NextResponse.json(tag);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
