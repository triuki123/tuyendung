/**
 * Database Migration API
 *
 * Creates all required tables if they don't exist.
 *
 * Access: GET /api/setup/phase2-migration
 *
 * For security, you should:
 * 1. Add authentication/authorization
 * 2. Only run once during setup
 * 3. Delete this endpoint after initial setup
 */

import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';

function checkSetupToken(request: NextRequest): NextResponse | null {
  const expected = process.env.SETUP_TOKEN;
  const token = request.headers.get('x-setup-token');
  if (!expected) {
    return NextResponse.json({ error: 'Setup endpoint chưa được cấu hình' }, { status: 503 });
  }
  if (token !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

async function runMigration() {
  const results: Array<{ table: string; success: boolean; error?: string }> = [];

  // Table 1: check_in_history
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS check_in_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id VARCHAR NOT NULL,
        room_id VARCHAR NOT NULL,
        room_name VARCHAR NOT NULL,
        checked_in_by VARCHAR NOT NULL,
        checked_in_by_name VARCHAR NOT NULL,
        check_in_time VARCHAR NOT NULL,
        check_in_date VARCHAR NOT NULL,
        check_out_time VARCHAR,
        check_out_date VARCHAR,
        status VARCHAR DEFAULT 'checked-in' CHECK (status IN ('checked-in', 'checked-out', 'cancelled')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    results.push({ table: 'check_in_history', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ table: 'check_in_history', success: false, error: msg });
  }

  // Table 2: admin_audit_logs
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id VARCHAR NOT NULL,
        action VARCHAR NOT NULL,
        admin_id VARCHAR NOT NULL,
        admin_name VARCHAR NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    results.push({ table: 'admin_audit_logs', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ table: 'admin_audit_logs', success: false, error: msg });
  }

  // Table 3: attendee_check_ins
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS attendee_check_ins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id VARCHAR NOT NULL,
        attendee_id VARCHAR NOT NULL,
        attendee_name VARCHAR NOT NULL,
        check_in_date VARCHAR NOT NULL,
        check_in_time VARCHAR NOT NULL,
        check_out_date VARCHAR,
        check_out_time VARCHAR,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(booking_id, attendee_id, check_in_date)
      )
    `);
    results.push({ table: 'attendee_check_ins', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ table: 'attendee_check_ins', success: false, error: msg });
  }

  // Table 4: attendee_check_in_logs
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS attendee_check_in_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id VARCHAR NOT NULL,
        attendee_id VARCHAR NOT NULL,
        attendee_name VARCHAR NOT NULL,
        check_in_date VARCHAR NOT NULL,
        check_in_time VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    results.push({ table: 'attendee_check_in_logs', success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ table: 'attendee_check_in_logs', success: false, error: msg });
  }

  // Create indexes
  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_check_in_history_booking_id ON check_in_history(booking_id)',
    'CREATE INDEX IF NOT EXISTS idx_check_in_history_room_id ON check_in_history(room_id)',
    'CREATE INDEX IF NOT EXISTS idx_check_in_history_checked_in_by ON check_in_history(checked_in_by)',
    'CREATE INDEX IF NOT EXISTS idx_check_in_history_check_in_date ON check_in_history(check_in_date)',
    'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_booking_id ON admin_audit_logs(booking_id)',
    'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id)',
    'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action)',
    'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_booking_id ON attendee_check_ins(booking_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_attendee_id ON attendee_check_ins(attendee_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_check_in_date ON attendee_check_ins(check_in_date)',
    'CREATE INDEX IF NOT EXISTS idx_attendee_check_in_logs_booking_id ON attendee_check_in_logs(booking_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendee_check_in_logs_created_at ON attendee_check_in_logs(created_at)',
  ];

  const indexResults: Array<{ sql: string; success: boolean; error?: string }> = [];
  for (const sql of indexStatements) {
    try {
      await execute(sql);
      indexResults.push({ sql: sql.substring(0, 50) + '...', success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      indexResults.push({ sql: sql.substring(0, 50) + '...', success: false, error: msg });
    }
  }

  return { results, indexResults };
}

export async function GET(request: NextRequest) {
  const guard = checkSetupToken(request);
  if (guard) return guard;

  try {
    console.log('Starting Database Migration...');

    const { results, indexResults } = await runMigration();

    const allSuccess = results.every((r) => r.success) && indexResults.every((r) => r.success);

    return NextResponse.json({
      success: allSuccess,
      message: allSuccess
        ? 'Database Migration completed successfully!'
        : 'Migration completed with some warnings',
      tables: results,
      indexes: indexResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Migration failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for manual trigger
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
