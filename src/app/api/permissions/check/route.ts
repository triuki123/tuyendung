import { NextRequest, NextResponse } from 'next/server';
import { PermissionAction } from '@/lib/modules';
import { canAccess } from '@/lib/permissions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { moduleId, action, permissions } = body;

    if (!moduleId || !action || !permissions) {
      return NextResponse.json(
        { error: 'Missing required parameters: moduleId, action, permissions' },
        { status: 400 }
      );
    }

    const hasPermission = canAccess(permissions, moduleId, action as PermissionAction);

    return NextResponse.json({
      moduleId,
      action,
      hasPermission,
    });
  } catch (error) {
    console.error('Permission check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check permission' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check permission
 * Query params: moduleId, action, permissions (JSON string)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('moduleId');
    const action = searchParams.get('action');
    const permissionsStr = searchParams.get('permissions');

    if (!moduleId || !action || !permissionsStr) {
      return NextResponse.json(
        { error: 'Missing required query parameters: moduleId, action, permissions' },
        { status: 400 }
      );
    }

    const permissions = JSON.parse(decodeURIComponent(permissionsStr));
    const hasPermission = canAccess(permissions, moduleId, action as PermissionAction);

    return NextResponse.json({
      moduleId,
      action,
      hasPermission,
    });
  } catch (error) {
    console.error('Permission check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check permission' },
      { status: 500 }
    );
  }
}
