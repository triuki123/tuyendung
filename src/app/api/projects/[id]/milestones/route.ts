import { NextRequest, NextResponse } from 'next/server';
import { getMilestones, getMilestonesWithStats } from '@/lib/services/milestoneService';

/**
 * GET /api/projects/{id}/milestones
 * List milestones for a specific project
 * Query: ?with_stats=true (optional - include task counts)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = params.id;
    const { searchParams } = new URL(request.url);
    const withStats = searchParams.get('with_stats') === 'true';

    let milestones;
    if (withStats) {
      milestones = await getMilestonesWithStats(projectId);
    } else {
      milestones = await getMilestones(projectId);
    }

    return NextResponse.json({ success: true, data: milestones });
  } catch (error) {
    console.error('GET /api/projects/{id}/milestones error:', error);
    return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 });
  }
}
