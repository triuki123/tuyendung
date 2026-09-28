import { migrateToSupabase } from '@/lib/migrate-to-supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('🚀 Migration API called');
    const result = await migrateToSupabase();

    if (result.success) {
      return NextResponse.json(
        {
          success: true,
          message: '✅ Migration completed successfully!',
          timestamp: new Date().toISOString()
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          message: '❌ Migration failed',
          error: result.error
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        message: '❌ Migration failed',
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
