/**
 * ============================================================================
 * Task Permission Service
 * ============================================================================
 * Odoo-style permission system for Tasks module
 *
 * Permission model:
 * 1. Direct Manager Relationship (manager_id)
 *    - Manager can assign/edit/delete subordinate's tasks
 *
 * 2. Organizational Hierarchy (rank từ org_assignments → positions."rank",
 *    fallback users.position_id → positions."rank"; job_titles là LEGACY)
 *    - Higher rank can assign to lower rank (within scope)
 *    - Rank 1 = Director (company scope)
 *    - Rank 2 = Manager (department scope)
 *    - Rank 3 = Team Lead (sub_department scope)
 *    - Rank 4 = Employee (self + peer scope)
 *
 * 3. Organizational Scope (company/department/sub_department)
 *    - Can only manage tasks within their organizational unit
 *
 * ============================================================================
 */

import { query, queryOne } from '@/lib/db';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface UserContext {
  id: string;
  name: string;
  email: string;
  role: string;
  manager_id?: string | null;
  job_title_id?: string | null;
  rank?: number | null;
  company_id?: string | null;
  department_id?: string | null;
  sub_department_id?: string | null;
}

interface TaskContext {
  id: string;
  title: string;
  created_by: string;
  assigned_to?: string | null;
  company_id?: string | null;
  department_id?: string | null;
  sub_department_id?: string | null;
  status: string;
  archived_at?: string | null;
}

interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// HELPER: Get User Context with Full Permission Data
// ============================================================================

/**
 * Fetch user data with position rank and org context
 * Used internally for permission calculations
 *
 * Phase 4 cải tổ cơ cấu (BUG FIX có chủ đích): trước đây rank đọc từ
 * users.job_title_id → job_titles."rank", nhưng chỉ 3/66 user có job_title_id
 * nên hầu hết mọi người (kể cả Giám đốc) bị coi là rank 4 = nhân viên.
 * Nguồn mới: rank = MIN(positions."rank") của các phân công active trong
 * org_assignments (hợp nhất đa vai trò/kiêm nhiệm — lấy cấp CAO NHẤT, số nhỏ nhất).
 * FALLBACK: user chưa có assignment nào → users.position_id → positions."rank".
 * Không có nữa → 4 (nhân viên) như hành vi cũ.
 */
export async function getUserContext(userId: string): Promise<UserContext | null> {
  const user = await queryOne<any>(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.role,
       u.manager_id,
       u.job_title_id,
       COALESCE(
         (SELECT MIN(pos."rank")::int
            FROM public.org_assignments oa
            JOIN public.positions pos ON pos.id = oa.position_id
           WHERE oa.user_id = u.id AND oa.is_active),
         posu."rank"::int
       ) AS "rank",
       u.company_id,
       u.department_id,
       u.sub_department_id
     FROM public.users u
     LEFT JOIN public.positions posu ON u.position_id = posu.id
     WHERE u.id = $1 AND u.status = 'active'`,
    [userId]
  );

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    manager_id: user.manager_id,
    job_title_id: user.job_title_id,
    rank: user.rank ?? 4, // Default to Employee if no rank
    company_id: user.company_id,
    department_id: user.department_id,
    sub_department_id: user.sub_department_id,
  };
}

/**
 * Fetch task with organizational context
 */
export async function getTaskContext(taskId: string): Promise<TaskContext | null> {
  const task = await queryOne<any>(
    `SELECT
       id, title, created_by, assigned_to, status, archived_at,
       company_id, department_id, sub_department_id
     FROM public.tasks
     WHERE id = $1`,
    [taskId]
  );

  return task || null;
}

// ============================================================================
// CORE PERMISSION RULES
// ============================================================================

/**
 * ✅ RULE 1: Direct Manager Can Manage Subordinate's Tasks
 *
 * Manager can assign/edit/delete tasks of their subordinates (toàn cây đệ quy)
 * This is independent of rank or org unit
 */
function isDirectManager(manager: UserContext, subordinate: UserContext): boolean {
  return manager.id === subordinate.manager_id;
}

/**
 * Kiểm tra manager có phải là cấp trên (trực tiếp hoặc gián tiếp) của userId không.
 * Đi ngược cây từ userId lên, dừng khi gặp managerId → O(depth) thay vì O(subtree size).
 */
async function isManagerInTree(managerId: string, userId: string): Promise<boolean> {
  if (managerId === userId) return false;
  // Phase 4 cải tổ cơ cấu: duyệt cây theo org_assignments.manager_id (nguồn sự thật mới,
  // hỗ trợ kiêm nhiệm — đi lên theo MỌI phân công active của user). Dual-write đảm bảo
  // org_assignments phản chiếu users.manager_id nên kết quả tương đương dữ liệu cũ.
  // Giới hạn độ sâu 20 chống vòng lặp dữ liệu bẩn (giống getOrgSubtreeUserIds).
  const row = await queryOne<{ found: boolean }>(
    `WITH RECURSIVE up_tree AS (
       SELECT oa.manager_id, 1 AS depth
         FROM org_assignments oa
        WHERE oa.user_id::text = $2 AND oa.is_active AND oa.manager_id IS NOT NULL
       UNION
       SELECT oa.manager_id, ut.depth + 1
         FROM org_assignments oa
         JOIN up_tree ut ON oa.user_id = ut.manager_id
        WHERE oa.is_active AND oa.manager_id IS NOT NULL AND ut.depth < 20
     )
     SELECT EXISTS(SELECT 1 FROM up_tree WHERE manager_id::text = $1) AS found`,
    [managerId.toLowerCase(), userId.toLowerCase()]
  );
  return row?.found ?? false;
}

/**
 * ✅ RULE 2: Higher Rank Can Manage Lower Rank (Within Org Scope)
 *
 * Rank hierarchy:
 * 1 = Director    → Can manage anyone in same company
 * 2 = Manager     → Can manage anyone in same department
 * 3 = Team Lead   → Can manage anyone in same sub_department
 * 4 = Employee    → Cannot manage others (except self)
 */
function canManageByRank(manager: UserContext, subordinate: UserContext): boolean {
  const managerRank = manager.rank ?? 4;
  const subordinateRank = subordinate.rank ?? 4;

  // Manager must have higher rank (lower number = higher)
  if (managerRank >= subordinateRank) {
    return false;
  }

  // Check organizational scope based on manager's rank
  switch (managerRank) {
    case 1: // Director
      // Can manage anyone in same company
      return manager.company_id === subordinate.company_id;

    case 2: // Manager
      // Can manage anyone in same department
      return (
        manager.company_id === subordinate.company_id &&
        manager.department_id === subordinate.department_id
      );

    case 3: // Team Lead
      // Can manage anyone in same sub_department
      return (
        manager.company_id === subordinate.company_id &&
        manager.department_id === subordinate.department_id &&
        manager.sub_department_id === subordinate.sub_department_id
      );

    default:
      return false;
  }
}

/**
 * ✅ RULE 3: Peers (Same Rank) Can Assign To Each Other
 *
 * Users with same rank in same org unit can assign tasks to each other
 * This enables horizontal task delegation among team members
 */
function canManageAsPeer(assigner: UserContext, assignee: UserContext): boolean {
  const assignerRank = assigner.rank ?? 4;
  const assigneeRank = assignee.rank ?? 4;

  // Must be same rank
  if (assignerRank !== assigneeRank) {
    return false;
  }

  // Employees: same department
  if (assignerRank === 4) {
    return (
      assigner.company_id === assignee.company_id &&
      assigner.department_id === assignee.department_id
    );
  }

  // Managers and higher: same company
  if (assignerRank <= 2) {
    return assigner.company_id === assignee.company_id;
  }

  // Team leads: same department
  if (assignerRank === 3) {
    return (
      assigner.company_id === assignee.company_id &&
      assigner.department_id === assignee.department_id
    );
  }

  return false;
}

/**
 * ✅ RULE 4: Super Admin Can Do Everything
 *
 * Super admin/super_admin role bypasses all checks
 */
function isSuperAdmin(user: UserContext): boolean {
  return user.role === 'super_admin';
}

/**
 * ✅ RULE 5: Self (Employee) Can Self-Create and Self-Archive
 *
 * Users can always:
 * - Create task for themselves
 * - Mark their own tasks as done
 * - Archive their own tasks
 */
function isSelfTask(user: UserContext, task: TaskContext): boolean {
  return user.id === task.created_by || user.id === task.assigned_to;
}

/**
 * ✅ RULE 6: Org Unit Scope
 *
 * User can only view/manage tasks within their organizational unit
 */
function isInOrgScope(user: UserContext, task: TaskContext): boolean {
  // For director level, check company scope
  if (user.rank === 1) {
    return user.company_id === task.company_id;
  }

  // For manager level, check department scope
  if (user.rank === 2) {
    return (
      user.company_id === task.company_id &&
      user.department_id === task.department_id
    );
  }

  // For team lead and below, check sub_department scope
  return (
    user.company_id === task.company_id &&
    user.department_id === task.department_id &&
    user.sub_department_id === task.sub_department_id
  );
}

// ============================================================================
// PUBLIC PERMISSION CHECK FUNCTIONS
// ============================================================================

/**
 * 🔐 CAN USER CREATE TASK FOR ANOTHER USER?
 *
 * Used when:
 * - Manager assigns new task to subordinate
 * - Team lead assigns new task to team member
 * - User creates task for themselves
 */
export async function canCreateTaskFor(
  creatorId: string,
  assigneeId: string
): Promise<PermissionCheck> {
  const creator = await getUserContext(creatorId);
  const assignee = await getUserContext(assigneeId);

  if (!creator) {
    return { allowed: false, reason: 'Creator not found' };
  }
  if (!assignee) {
    return { allowed: false, reason: 'Assignee not found' };
  }

  // 🔓 Super admin can do anything
  if (isSuperAdmin(creator)) {
    return { allowed: true };
  }

  // ✅ Self-creation always allowed
  if (creator.id === assignee.id) {
    return { allowed: true };
  }

  // ✅ Manager (toàn cây đệ quy) có thể giao task cho cấp dưới
  if (await isManagerInTree(creator.id, assignee.id)) {
    return { allowed: true };
  }

  // ✅ Higher rank can assign to lower rank (within scope)
  if (canManageByRank(creator, assignee)) {
    return { allowed: true };
  }

  // ✅ Peers (same rank, same org unit) can assign to each other
  if (canManageAsPeer(creator, assignee)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `${creator.name} (${creator.rank ?? 'Employee'}) không có quyền giao task cho ${assignee.name}`,
  };
}

/**
 * 🔐 CAN USER VIEW TASK?
 *
 * Used when:
 * - Fetching task list
 * - Opening task detail modal
 */
export async function canViewTask(userId: string, taskId: string): Promise<PermissionCheck> {
  const user = await getUserContext(userId);
  const task = await getTaskContext(taskId);

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }
  if (!task) {
    return { allowed: false, reason: 'Task not found' };
  }

  // 🔓 Super admin can view everything
  if (isSuperAdmin(user)) {
    return { allowed: true };
  }

  // ✅ Self task: creator or assigned_to
  if (isSelfTask(user, task)) {
    return { allowed: true };
  }

  // ✅ Manager (toàn cây đệ quy) có thể xem task của cấp dưới
  const taskCreator = await getUserContext(task.created_by);
  if (taskCreator && await isManagerInTree(user.id, taskCreator.id)) {
    return { allowed: true };
  }
  // Cũng cho xem nếu assignee là cấp dưới của manager
  if (task.assigned_to && await isManagerInTree(user.id, task.assigned_to)) {
    return { allowed: true };
  }

  // ✅ Must be in same org unit (scope)
  if (isInOrgScope(user, task)) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Task không nằm trong phạm vi của bạn' };
}

/**
 * 🔐 CAN USER EDIT TASK?
 *
 * Used when:
 * - Clicking "Sửa" button
 * - Updating task details (title, description, etc.)
 */
export async function canEditTask(userId: string, taskId: string): Promise<PermissionCheck> {
  const user = await getUserContext(userId);
  const task = await getTaskContext(taskId);

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }
  if (!task) {
    return { allowed: false, reason: 'Task not found' };
  }

  // 🔓 Super admin can edit anything
  if (isSuperAdmin(user)) {
    return { allowed: true };
  }

  // ✅ Task creator can edit their own tasks
  if (user.id === task.created_by) {
    return { allowed: true };
  }

  // ✅ Manager of task creator can edit
  const taskCreator = await getUserContext(task.created_by);
  if (taskCreator && await isManagerInTree(user.id, taskCreator.id)) {
    return { allowed: true };
  }

  // ✅ Higher rank can edit lower rank's tasks
  if (taskCreator && canManageByRank(user, taskCreator)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Bạn không có quyền chỉnh sửa task này',
  };
}

/**
 * 🔐 CAN USER DELETE TASK?
 *
 * Used when:
 * - Clicking "Xóa" button
 * - Permanent deletion of task
 */
export async function canDeleteTask(userId: string, taskId: string): Promise<PermissionCheck> {
  const user = await getUserContext(userId);
  const task = await getTaskContext(taskId);

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }
  if (!task) {
    return { allowed: false, reason: 'Task not found' };
  }

  // 🔓 Super admin can delete anything
  if (isSuperAdmin(user)) {
    return { allowed: true };
  }

  // ✅ Task creator can delete their own tasks ONLY
  // (Employee protection: once assigned, only manager can delete)
  if (user.id === task.created_by && !task.assigned_to) {
    return { allowed: true };
  }

  // ✅ Manager of task creator can delete
  const taskCreator = await getUserContext(task.created_by);
  if (taskCreator && await isManagerInTree(user.id, taskCreator.id)) {
    return { allowed: true };
  }

  // ✅ Higher rank can delete lower rank's tasks
  if (taskCreator && canManageByRank(user, taskCreator)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Bạn không có quyền xóa task này',
  };
}

/**
 * 🔐 CAN USER UPDATE TASK STATUS?
 *
 * Used when:
 * - Clicking "Làm" or "Xong" buttons
 * - Changing task status (todo → in_progress → done)
 */
export async function canUpdateTaskStatus(
  userId: string,
  taskId: string,
  newStatus: string
): Promise<PermissionCheck> {
  const user = await getUserContext(userId);
  const task = await getTaskContext(taskId);

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }
  if (!task) {
    return { allowed: false, reason: 'Task not found' };
  }

  // 🔓 Super admin can update anything
  if (isSuperAdmin(user)) {
    return { allowed: true };
  }

  // ✅ Assigned user can update status (mark as in_progress, done)
  if (user.id === task.assigned_to) {
    return { allowed: true };
  }

  // ✅ Task creator can update status of their own task
  if (user.id === task.created_by) {
    return { allowed: true };
  }

  // ✅ Manager can update status for subordinate's tasks
  const taskCreator = await getUserContext(task.created_by);
  if (taskCreator && await isManagerInTree(user.id, taskCreator.id)) {
    return { allowed: true };
  }

  // ✅ Higher rank can update status
  if (taskCreator && canManageByRank(user, taskCreator)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Bạn không có quyền cập nhật trạng thái task này',
  };
}

/**
 * 🔐 CAN USER REASSIGN TASK TO ANOTHER USER?
 *
 * Used when:
 * - Changing assigned_to field
 * - Manager reassigns task to different team member
 */
export async function canReassignTask(
  userId: string,
  taskId: string,
  newAssigneeId: string
): Promise<PermissionCheck> {
  const user = await getUserContext(userId);
  const task = await getTaskContext(taskId);
  const newAssignee = await getUserContext(newAssigneeId);

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }
  if (!task) {
    return { allowed: false, reason: 'Task not found' };
  }
  if (!newAssignee) {
    return { allowed: false, reason: 'Assignee not found' };
  }

  // 🔓 Super admin can reassign anything
  if (isSuperAdmin(user)) {
    return { allowed: true };
  }

  // First, check if user can edit this task
  const canEdit = await canEditTask(userId, taskId);
  if (!canEdit.allowed) {
    return canEdit;
  }

  // Then, check if user can create task for new assignee
  const canCreate = await canCreateTaskFor(userId, newAssigneeId);
  if (!canCreate.allowed) {
    return canCreate;
  }

  return { allowed: true };
}

/**
 * 🔐 CAN USER ARCHIVE TASK?
 *
 * Used when:
 * - Clicking "Lưu trữ" button
 * - Archiving completed/cancelled tasks
 */
export async function canArchiveTask(userId: string, taskId: string): Promise<PermissionCheck> {
  const user = await getUserContext(userId);
  const task = await getTaskContext(taskId);

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }
  if (!task) {
    return { allowed: false, reason: 'Task not found' };
  }

  // 🔓 Super admin can archive anything
  if (isSuperAdmin(user)) {
    return { allowed: true };
  }

  // ✅ Self can archive (both creator and assigned_to)
  if (isSelfTask(user, task)) {
    return { allowed: true };
  }

  // ✅ Manager can archive subordinate's tasks
  const taskCreator = await getUserContext(task.created_by);
  if (taskCreator && await isManagerInTree(user.id, taskCreator.id)) {
    return { allowed: true };
  }

  // ✅ Higher rank can archive lower rank's tasks
  if (taskCreator && canManageByRank(user, taskCreator)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Bạn không có quyền lưu trữ task này',
  };
}

/**
 * 🔐 GET ALL VISIBLE TASKS FOR USER
 *
 * Used for:
 * - Building WHERE clause for task list queries
 * - Filtering tasks in GET /api/tasks
 */
export function buildTaskVisibilityFilter(user: UserContext): {
  where: string;
  params: any[];
} {
  const params: any[] = [];

  // 🔓 Super admin sees everything
  if (isSuperAdmin(user)) {
    return { where: '', params: [] };
  }

  const conditions: string[] = [];

  // ✅ Own tasks (created or assigned)
  params.push(user.id, user.id);
  conditions.push(`(tasks.created_by = $${params.length - 1} OR tasks.assigned_to = $${params.length})`);

  // ✅ Tasks of direct subordinates
  // Phase 4 cải tổ cơ cấu: cấp dưới trực tiếp đọc từ org_assignments.manager_id
  // (nguồn sự thật mới, hỗ trợ kiêm nhiệm) thay vì users.manager_id.
  params.push(user.id);
  conditions.push(
    `(tasks.created_by IN (
       SELECT user_id FROM org_assignments WHERE manager_id::text = $${params.length} AND is_active
     ) OR tasks.assigned_to IN (
       SELECT user_id FROM org_assignments WHERE manager_id::text = $${params.length} AND is_active
     ))`
  );

  // ✅ Tasks in same org unit
  if (user.rank === 1) {
    // Director: all tasks in company
    params.push(user.company_id);
    conditions.push(`tasks.company_id = $${params.length}`);
  } else if (user.rank === 2) {
    // Manager: all tasks in department
    params.push(user.company_id, user.department_id);
    conditions.push(
      `(tasks.company_id = $${params.length - 1} AND tasks.department_id = $${params.length})`
    );
  } else if (user.rank === 3) {
    // Team Lead: all tasks in sub_department
    params.push(user.company_id, user.department_id, user.sub_department_id);
    conditions.push(
      `(tasks.company_id = $${params.length - 2} AND tasks.department_id = $${params.length - 1} AND tasks.sub_department_id = $${params.length})`
    );
  }

  const where = conditions.length > 0 ? `WHERE (${conditions.join(' OR ')})` : '';
  return { where, params };
}

// ============================================================================
// 🔐 NEW PERMISSION FUNCTIONS FOR WORLD-STANDARD FORM
// ============================================================================

/**
 * Check if user can assign to multiple users
 * Validates permission for each user in the array
 * @param userId - User ID performing the assignment
 * @param assigneeIds - Array of user IDs to assign to
 * @returns Promise<boolean> - true if all assignments are allowed
 */
export async function canAssignToMultiple(
  userId: string,
  assigneeIds: string[]
): Promise<boolean> {
  if (assigneeIds.length === 0) {
    return true;
  }

  // Check permission for each assignee
  for (const assigneeId of assigneeIds) {
    const canAssign = await canCreateTaskFor(userId, assigneeId);
    if (!canAssign) {
      return false;
    }
  }

  return true;
}

/**
 * Check if user can create a project
 * Required: Rank >= 2 (Manager or above)
 * @param userId - User ID
 * @param companyId - Company ID
 * @returns Promise<boolean>
 */
export async function canCreateProject(userId: string, companyId: string): Promise<boolean> {
  const user = await getUserContext(userId);
  if (!user) {
    return false;
  }

  // Super admin can always create
  if (isSuperAdmin(user)) {
    return true;
  }

  // Must be Manager rank or above (rank <= 2)
  if (!user.rank || user.rank > 2) {
    return false;
  }

  // Must be in the same company
  if (user.company_id && user.company_id !== companyId) {
    return false;
  }

  return true;
}

/**
 * Check if user can create a milestone
 * Required: Rank >= 2 (Manager or above)
 * @param userId - User ID
 * @returns Promise<boolean>
 */
export async function canCreateMilestone(userId: string): Promise<boolean> {
  const user = await getUserContext(userId);
  if (!user) {
    return false;
  }

  // Super admin can always create
  if (isSuperAdmin(user)) {
    return true;
  }

  // Must be Manager rank or above (rank <= 2)
  if (!user.rank || user.rank > 2) {
    return false;
  }

  return true;
}

/**
 * Check if user can set a complexity level
 * Critical complexity: Rank <= 1 (Director only)
 * @param userId - User ID
 * @param complexity - Complexity level
 * @returns Promise<boolean>
 */
export async function canSetComplexity(userId: string, complexity: string): Promise<boolean> {
  const user = await getUserContext(userId);
  if (!user) {
    return false;
  }

  // Super admin can always set any complexity
  if (isSuperAdmin(user)) {
    return true;
  }

  // Critical complexity requires rank <= 1 (Director)
  if (complexity === 'Critical') {
    return user.rank != null && user.rank <= 1;
  }

  // Other complexity levels can be set by anyone
  return true;
}

/**
 * Check if user can set task type to Milestone
 * Required: Rank >= 2 (Manager or above)
 * @param userId - User ID
 * @returns Promise<boolean>
 */
export async function canCreateMilestoneTask(userId: string): Promise<boolean> {
  const user = await getUserContext(userId);
  if (!user) {
    return false;
  }

  // Super admin can always create
  if (isSuperAdmin(user)) {
    return true;
  }

  // Must be Manager rank or above (rank <= 2)
  if (!user.rank || user.rank > 2) {
    return false;
  }

  return true;
}
