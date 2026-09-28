import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const token = request.headers.get('x-setup-token');
    if (!process.env.SETUP_TOKEN || token !== process.env.SETUP_TOKEN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    // Migration needs to be run through Supabase SQL Editor or CLI
    // This endpoint provides migration status and instructions

    const migrationSql = `
-- Add manager_id to users table
-- This links users to their manager for reporting line tracking
-- Independent from organizational unit assignment

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS manager_id TEXT REFERENCES public.users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON public.users(manager_id);

-- Add comment for clarity
COMMENT ON COLUMN public.users.manager_id IS 'Reference to the user who directly manages this user. Independent from organizational unit (company/department/sub_department).';
    `;

    return NextResponse.json({
      success: true,
      message: 'Migration SQL generated. Please run this in Supabase SQL Editor.',
      migration: {
        name: '019_add_manager_to_users',
        description: 'Add manager_id column to users table for tracking reporting lines',
        sql: migrationSql,
        instructions: [
          '1. Go to Supabase Dashboard > SQL Editor',
          '2. Create a new query',
          '3. Copy and paste the SQL above',
          '4. Execute the query',
          '5. Refresh the page or restart the dev server'
        ]
      }
    });

  } catch (error) {
    console.error('Error preparing migration:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare migration'
      },
      { status: 500 }
    );
  }
}
