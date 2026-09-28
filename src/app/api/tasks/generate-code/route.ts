import { query } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { generateTaskCode, formatDateForTaskCode } from '@/lib/task-utils';

/**
 * POST /api/tasks/generate-code
 * Generate a unique task code in format Task-ddmmyyyy-0001.
 * Sequence number is derived from how many task_code values matching today's
 * date prefix already exist, so concurrent inserts remain monotonic.
 */
export async function POST(req: NextRequest) {
  try {
    const today = new Date();
    const dateStr = formatDateForTaskCode(today);
    const searchPattern = `Task-${dateStr}-%`;

    console.log(`Generating task code for date: ${dateStr}`);

    // Count tasks whose code matches today's date prefix
    const tasksToday = await query<{ id: string }>(
      `SELECT id FROM tasks WHERE task_code IS NOT NULL AND task_code LIKE $1`,
      [searchPattern]
    );

    console.log(`Found ${tasksToday.length} tasks created today`);

    const nextSequence = tasksToday.length + 1;
    const taskCode = generateTaskCode(nextSequence, today);

    console.log(`Generated task code: ${taskCode}`);

    return NextResponse.json({
      task_code: taskCode,
      sequence: nextSequence,
      date: today.toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error generating task code:', errorMsg);
    return NextResponse.json(
      { error: 'Failed to generate task code', details: errorMsg },
      { status: 500 }
    );
  }
}
