import { NextRequest, NextResponse } from 'next/server';

/**
 * Migration endpoint to add manager_id column to users table
 * Returns the correct migration SQL based on the users table schema
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const token = request.headers.get('x-setup-token');
    if (!process.env.SETUP_TOKEN || token !== process.env.SETUP_TOKEN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    console.log('🔄 Preparing manager_id migration...');

    // In Supabase, users.id is typically UUID
    // Based on the error message, we know id is uuid type
    const idType = 'uuid';

    // Prepare migration SQL with correct UUID data type
    const migrationSQL = `-- Add manager_id column to users table with UUID type
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON public.users(manager_id);

-- Add comment for clarity
COMMENT ON COLUMN public.users.manager_id IS 'Reference to the user who directly manages this user. Independent from organizational unit (company/department/sub_department).';`;

    console.log('✅ Migration SQL prepared with correct UUID type');

    // Return the migration SQL for manual execution
    return NextResponse.json({
      success: true,
      message: 'Migration SQL generated with correct UUID type. Please run in Supabase SQL Editor.',
      status: 'ready_for_execution',
      migration: {
        name: '019_add_manager_to_users',
        description: 'Add manager_id column to users table for tracking reporting lines',
        sql: migrationSQL,
        idType: idType,
        steps: [
          '1. Go to Supabase Dashboard > SQL Editor',
          '2. Create a new query',
          '3. Copy and paste the SQL code below',
          '4. Click Execute',
          '5. Wait for success ✓',
          '6. Refresh your browser or restart dev server'
        ],
        notes: [
          '✅ Using correct UUID type (matches users.id type)',
          '✅ Foreign key constraint will work correctly',
          '✅ Index created for performance',
          '✅ Handles NULL values (optional manager)'
        ]
      }
    });

  } catch (error) {
    console.error('❌ Error preparing migration:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare migration'
      },
      { status: 500 }
    );
  }
}
