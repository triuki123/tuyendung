import { query, queryOne, buildInsert } from '@/lib/db';
import { notifyTaskCreated } from '@/lib/services/taskNotifications';
import { getUserById } from '@/lib/services/usersService';
import {
  getUserContext,
  buildTaskVisibilityFilter,
  canCreateTaskFor,
  canAssignToMultiple,
  canSetComplexity,
  canCreateMilestoneTask,
} from '@/lib/services/taskPermissionService';
import { addDependency, validateNoCycles } from '@/lib/services/taskDependencyService';
import { addAssignee } from '@/lib/services/taskAssigneeService';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

/**
 * GET /api/tasks
 * Fetch tasks with permission-based filtering
 *
 * Query parameters:
 * - status: Filter by task status (todo, in_progress, done, cancelled)
 * - assigned_to: Filter by assigned user
 * - include_archived: Include archived tasks (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assigned_to = searchParams.get('assigned_to');
    const ticket_id = searchParams.get('ticket_id');
    const includeArchived = searchParams.get('include_archived') === 'true';

    // Get current user from header (server-side resolved)
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user context with permission data
    const userContext = await getUserContext(currentUserId);
    if (!userContext) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const effectiveContext = await getEffectiveContext(currentUserId, currentUserCompany || null);
    if (!effectiveContext) {
      return NextResponse.json(
        { error: 'User context not found' },
        { status: 404 }
      );
    }

    // Build visibility filter based on permissions
    const { where: visibilityFilter, params: visibilityParams } =
      buildTaskVisibilityFilter(userContext);

    const conditions: string[] = [];
    const params: any[] = [...visibilityParams];

    // Apply additional filters
    if (status) {
      params.push(status);
      conditions.push(`tasks.status = $${params.length}`);
    }
    if (assigned_to) {
      params.push(assigned_to);
      conditions.push(`tasks.assigned_to = $${params.length}`);
    }
    if (ticket_id) {
      params.push(ticket_id);
      conditions.push(`tasks.ticket_id = $${params.length}`);
    }
    if (effectiveContext.role === 'admin' && effectiveContext.company_id) {
      params.push(effectiveContext.company_id);
      conditions.push(`tasks.company_id = $${params.length}`);
    }

    // Combine visibility filter with additional conditions
    let where = visibilityFilter;
    if (conditions.length > 0) {
      const additionalWhere = conditions.join(' AND ');
      where = visibilityFilter
        ? `${visibilityFilter} AND ${additionalWhere}`
        : `WHERE ${additionalWhere}`;
    }

    // 🔐 Archive filter:
    // Default: return ALL tasks (both active and archived) so frontend can filter
    // If include_archived=true: only return archived tasks
    // If include_archived=false: only return active tasks
    let archiveCondition = '';
    if (includeArchived === true) {
      archiveCondition = 'tasks.archived_at IS NOT NULL'; // Only archived
    } else if (includeArchived === false) {
      archiveCondition = 'tasks.archived_at IS NULL'; // Only active
    }
    // else: no filter, return both active and archived

    const finalWhere = where
      ? archiveCondition
        ? `${where} AND ${archiveCondition}`
        : where
      : archiveCondition
        ? `WHERE ${archiveCondition}`
        : '';

    const data = await query(
      `SELECT tasks.*, u.name AS created_by_name,
              tk.code AS ticket_code, tk.title AS ticket_title, tk.status AS ticket_status,
              COALESCE(co.list, '[]'::json) AS co_assignees
       FROM tasks
       LEFT JOIN users u ON u.id::text = tasks.created_by::text
       LEFT JOIN tickets tk ON tk.id = tasks.ticket_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'user_id', ta.user_id,
           'user_name', cu.name,
           'role', ta.role
         ) ORDER BY ta.created_at ASC) AS list
         FROM task_assignees ta
         LEFT JOIN users cu ON cu.id = ta.user_id
         WHERE ta.task_id = tasks.id
       ) co ON TRUE
       ${finalWhere}
       ORDER BY tasks.created_at DESC LIMIT 1000`,
      params
    );

    return NextResponse.json({
      success: true,
      data,
      user: {
        id: userContext.id,
        rank: userContext.rank,
        role: userContext.role,
      },
    });
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks
 * Create new task with permission validation and world-standard form fields
 *
 * Request body:
 * {
 *   // Tab 1 — Thông Tin
 *   title: string (required)
 *   description?: string
 *   task_type?: 'Task' | 'Subtask' | 'Milestone' | 'Issue' (default: 'Task')
 *   complexity?: 'Low' | 'Medium' | 'High' | 'Critical' (default: 'Medium')
 *   related_asset?: string
 *
 *   // Tab 2 — Tài Nguyên
 *   assigned_to: string (required) - User ID who task is assigned to
 *   assigned_to_name?: string
 *   start_date?: string (ISO date)
 *   due_date?: string (ISO date)
 *   priority?: 'low' | 'medium' | 'high' (default: 'medium')
 *   status?: 'todo' | 'in_progress' | 'done' | 'cancelled' (default: 'todo')
 *   parent_task_id?: string - ID of parent task
 *   task_dependencies?: string[] - Array of task IDs this depends on
 *
 *   // Tab 3 — Liên Kết
 *   project_id?: string
 *   milestone_id?: string
 *   estimated_hours?: number
 *   budget_amount?: number
 *   additional_assignees?: string[] - Array of additional user IDs
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.title || !body.assigned_to) {
      return NextResponse.json(
        { error: 'title and assigned_to are required' },
        { status: 400 }
      );
    }

    // Get current user from header
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const creatorContext = await getUserContext(currentUserId);
    if (!creatorContext) {
      return NextResponse.json(
        { error: 'Creator user not found' },
        { status: 404 }
      );
    }

    const effectiveContext = await getEffectiveContext(currentUserId, currentUserCompany || null);
    if (!effectiveContext) {
      return NextResponse.json(
        { error: 'User context not found' },
        { status: 404 }
      );
    }

    // 🔐 CHECK PERMISSION: Can user create task for assigned_to user?
    const permissionCheck = await canCreateTaskFor(currentUserId, body.assigned_to);
    if (!permissionCheck.allowed) {
      console.warn(`Permission denied: ${permissionCheck.reason}`);
      return NextResponse.json(
        { error: permissionCheck.reason || 'Không có quyền tạo task' },
        { status: 403 }
      );
    }

    // 🔐 PERMISSION: complexity='Critical' requires rank <= 1
    if (body.complexity === 'Critical') {
      const canSetCrit = await canSetComplexity(currentUserId, 'Critical');
      if (!canSetCrit) {
        return NextResponse.json(
          { error: 'Only Directors can set Critical complexity' },
          { status: 403 }
        );
      }
    }

    // 🔐 PERMISSION: task_type='Milestone' requires rank >= 2
    if (body.task_type === 'Milestone') {
      const canCreateMilestone = await canCreateMilestoneTask(currentUserId);
      if (!canCreateMilestone) {
        return NextResponse.json(
          { error: 'Only Managers and above can create Milestone tasks' },
          { status: 403 }
        );
      }
    }

    // Get org context from assigned_to user for backfilling task org fields
    const assigneeContext = await getUserContext(body.assigned_to);
    if (effectiveContext.role === 'admin' && effectiveContext.company_id) {
      if (!assigneeContext || assigneeContext.company_id !== effectiveContext.company_id) {
        return NextResponse.json(
          { error: 'Admin chỉ được tạo công việc trong công ty đang được gán' },
          { status: 403 }
        );
      }
    }

    // Validate parent_task_id depth (no grandparents)
    if (body.parent_task_id) {
      const parentTask = await queryOne<{ parent_task_id: string | null }>(
        'SELECT parent_task_id FROM tasks WHERE id = $1',
        [body.parent_task_id]
      );
      if (!parentTask) {
        return NextResponse.json(
          { error: 'Parent task not found' },
          { status: 400 }
        );
      }
      if (parentTask.parent_task_id) {
        return NextResponse.json(
          { error: 'Cannot create grandchild tasks (max depth is 1)' },
          { status: 400 }
        );
      }
    }

    // Validate date range
    if (body.start_date && body.due_date) {
      if (new Date(body.start_date) > new Date(body.due_date)) {
        return NextResponse.json(
          { error: 'start_date must be before due_date' },
          { status: 400 }
        );
      }
    }

    // Validate task_dependencies for cycles
    if (body.task_dependencies && body.task_dependencies.length > 0) {
      const hasCycle = await validateNoCycles('new_task_id', body.task_dependencies);
      if (hasCycle) {
        return NextResponse.json(
          { error: 'Adding these dependencies would create a circular reference' },
          { status: 400 }
        );
      }
    }

    // 🔐 PERMISSION: Validate additional_assignees
    if (body.additional_assignees && body.additional_assignees.length > 0) {
      const canAssignAll = await canAssignToMultiple(currentUserId, body.additional_assignees);
      if (!canAssignAll) {
        return NextResponse.json(
          { error: 'Cannot assign to one or more of the selected users' },
          { status: 403 }
        );
      }
    }

    // Generate task ID as UUID
    const taskId = crypto.randomUUID();

    // Generate task code if not provided
    const taskCode = body.code || `T-${Date.now().toString(36).toUpperCase()}`;

    // Build insert with org context and new fields
    const insertData: any = {
      id: taskId,
      code: taskCode,
      title: body.title,
      description: body.description,
      priority: body.priority || 'medium',
      status: body.status || 'todo',
      assigned_to: body.assigned_to,
      assigned_to_name: body.assigned_to_name || assigneeContext?.name,
      created_by: currentUserId,
      due_date: body.due_date,
      related_asset: body.related_asset,
      // World-standard form fields
      task_type: body.task_type || 'Task',
      complexity: body.complexity || 'Medium',
      start_date: body.start_date || null,
      budget_amount: body.budget_amount ? parseFloat(body.budget_amount as any) : 0,
      estimated_hours: body.estimated_hours ? parseFloat(body.estimated_hours as any) : null,
      // Set org context from assignee (where task will be executed)
      company_id: assigneeContext?.company_id,
      department_id: assigneeContext?.department_id,
      sub_department_id: assigneeContext?.sub_department_id,
    };

    // Only include optional UUID fields if provided
    if (body.parent_task_id) insertData.parent_task_id = body.parent_task_id;
    if (body.project_id) insertData.project_id = body.project_id;
    if (body.milestone_id) insertData.milestone_id = body.milestone_id;
    if (body.ticket_id) insertData.ticket_id = body.ticket_id;

    const { text, params } = buildInsert('tasks', insertData);

    const createdTask = await queryOne<any>(text, params);
    if (!createdTask) {
      throw new Error('Insert returned no row');
    }

    // Create task_dependencies entries
    if (body.task_dependencies && body.task_dependencies.length > 0) {
      for (const depId of body.task_dependencies) {
        try {
          await addDependency(createdTask.id, depId, 'blocks');
        } catch (err) {
          console.error(`Failed to add dependency: ${err}`);
          // Continue even if dependency fails
        }
      }
    }

    // Create task_assignees entries for additional assignees
    if (body.additional_assignees && body.additional_assignees.length > 0) {
      for (const userId of body.additional_assignees) {
        try {
          await addAssignee(createdTask.id, currentUserId, { user_id: userId, role: 'assignee' });
        } catch (err) {
          console.error(`Failed to add assignee: ${err}`);
          // Continue even if assignee fails
        }
      }
    }

    // Thông báo cho TẤT CẢ assignees (primary + co-assignees), trừ người tạo
    // (in-app + Telegram). Helper tự đọc task_assignees nên đã bao gồm co-assignees.
    await notifyTaskCreated(
      { ...createdTask, created_by_name: creatorContext?.name },
      currentUserId
    ).catch((err) => console.error('Error sending task notification:', err));

    console.log(
      `Task created by ${creatorContext?.name} for ${assigneeContext?.name}: ${createdTask.id}`
    );

    return NextResponse.json({
      success: true,
      data: createdTask,
    });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create task' },
      { status: 500 }
    );
  }
}
