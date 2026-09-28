import { NextRequest, NextResponse } from 'next/server';
import {
  logTime,
  getTimeEntries,
  getTimeAggregate,
} from '@/lib/services/taskTimeService';
import { canEditTask } from '@/lib/services/taskPermissionService';
import { getUserById } from '@/lib/services/usersService';

/**
 * GET /api/tasks/[id]/time-entries
 * Get all time entries for a task
 *
 * Query parameters:
 * - user_id?: string (filter by user)
 * - date_from?: string (ISO date)
 * - date_to?: string (ISO date)
 * - billable_only?: boolean (default: false)
 * - include_deleted?: boolean (default: false)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id') || undefined;
    const dateFrom = searchParams.get('date_from') || undefined;
    const dateTo = searchParams.get('date_to') || undefined;
    const billableOnly = searchParams.get('billable_only') === 'true';
    const includeDeleted = searchParams.get('include_deleted') === 'true';

    const entries = await getTimeEntries(params.id, {
      userId: userId,
      dateFrom: dateFrom,
      dateTo: dateTo,
      includeBillableOnly: billableOnly,
      includeDeleted: includeDeleted,
    });

    const aggregate = await getTimeAggregate(params.id, billableOnly);

    return NextResponse.json({
      success: true,
      data: entries,
      aggregate,
    });
  } catch (error) {
    console.error(`GET /api/tasks/[id]/time-entries error:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch time entries',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/time-entries
 * Log time on a task
 *
 * Request body:
 * {
 *   duration_minutes: number (required, > 0)
 *   date_worked: string (required, ISO date: YYYY-MM-DD)
 *   description?: string
 *   is_billable?: boolean (default: true)
 *   subtask_id?: string (optional, if logging time on subtask)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.duration_minutes || body.duration_minutes <= 0) {
      return NextResponse.json(
        { error: 'Thời gian làm việc phải > 0' },
        { status: 400 }
      );
    }

    if (!body.date_worked) {
      return NextResponse.json(
        { error: 'Ngày làm việc là bắt buộc' },
        { status: 400 }
      );
    }

    // Get current user name
    const user = await getUserById(currentUserId);
    if (!user) {
      return NextResponse.json(
        { error: 'User không tìm thấy' },
        { status: 404 }
      );
    }

    // Log time
    const timeEntry = await logTime(params.id, currentUserId, user.name, {
      duration_minutes: body.duration_minutes,
      date_worked: body.date_worked,
      description: body.description,
      is_billable: body.is_billable ?? true,
      subtask_id: body.subtask_id,
    });

    console.log(
      `Time logged by ${user.name} on task ${params.id}: ${body.duration_minutes} minutes`
    );

    return NextResponse.json({
      success: true,
      data: timeEntry,
    });
  } catch (error) {
    console.error(`POST /api/tasks/[id]/time-entries error:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to log time',
      },
      { status: 500 }
    );
  }
}
