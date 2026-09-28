import { NextRequest, NextResponse } from 'next/server';
import { getTimeSummary, calculateUtilization } from '@/lib/services/taskTimeService';

/**
 * GET /api/tasks/[id]/time-summary
 * Get aggregated time data and utilization metrics for a task
 *
 * Returns:
 * {
 *   total_hours: number
 *   billable_hours: number
 *   entry_count: number
 *   utilization: {
 *     estimated_hours: number | null
 *     actual_hours: number
 *     remaining_hours: number
 *     utilization_percentage: number (0-100)
 *     is_overbudget: boolean
 *   }
 *   last_entry: string | null (ISO date)
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const summary = await getTimeSummary(params.id);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error(`GET /api/tasks/[id]/time-summary error:`, error);

    // Handle task not found
    if (
      error instanceof Error &&
      error.message.includes('Task not found')
    ) {
      return NextResponse.json(
        { error: 'Task không tìm thấy' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch time summary',
      },
      { status: 500 }
    );
  }
}
