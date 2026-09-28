import { query, buildInsert, queryOne, execute } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET: Fetch all active asset categories
export async function GET() {
  try {
    const data = await query(
      'SELECT * FROM asset_categories WHERE is_active = true ORDER BY name ASC'
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching asset categories:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST: Create new asset category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, color } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Category name is required' },
        { status: 400 }
      );
    }

    const { text, params } = buildInsert('asset_categories', {
      name: name.trim(),
      description: description || null,
      color: color || '#6366f1',
      is_active: true,
    });

    let data: Record<string, unknown> | null;
    try {
      data = await queryOne(text, params);
    } catch (err: any) {
      if (err?.message?.includes('duplicate') || err?.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'Category name already exists' },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error creating asset category:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE: Soft delete (mark as inactive) asset category
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('id');

    if (!categoryId) {
      return NextResponse.json(
        { success: false, error: 'Category ID is required' },
        { status: 400 }
      );
    }

    // Soft delete: mark as inactive
    await execute(
      'UPDATE asset_categories SET is_active = false WHERE id = $1',
      [categoryId]
    );

    return NextResponse.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting asset category:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
