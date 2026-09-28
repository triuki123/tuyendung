import { query, queryOne, buildInsert } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/tasks/[id]/activities
 * Fetch activity logs for a specific task
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const taskId = params.id;

    const data = await query(
      'SELECT * FROM task_activities WHERE task_id = $1 ORDER BY created_at DESC',
      [taskId]
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching task activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task activities' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/activities
 * Record a new activity for a task
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const taskId = params.id;
    const body = await req.json();

    const { text, params: qParams } = buildInsert('task_activities', {
      task_id: taskId,
      action: body.action,
      old_value: body.old_value || null,
      new_value: body.new_value || null,
      description: body.description || null,
      created_by_user_id: body.created_by_user_id,
      created_by_user_name: body.created_by_user_name,
    });

    const row = await queryOne(text, qParams);

    return NextResponse.json(row);
  } catch (error) {
    console.error('Error recording task activity:', error);
    return NextResponse.json(
      { error: 'Failed to record task activity' },
      { status: 500 }
    );
  }
}
