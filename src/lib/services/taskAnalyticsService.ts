/**
 * Task Analytics Service Layer
 * Tính toán thống kê, metrics, xu hướng tasks cho dashboard.
 */

import { query, queryOne } from '@/lib/db';

export interface TaskStats {
  total: number;
  completed: number;
  overdue: number;
  inProgress: number;
  completionRate: number; // phần trăm 0-100
}

export interface TimeStats {
  totalHours: number;
  averageHoursPerTask: number;
  taskCount: number;
}

export interface StatusDistribution {
  status: string;
  count: number;
  percentage: number;
}

export interface UserDistribution {
  user_id: string;
  user_name: string;
  task_count: number;
  completed_count: number;
  completion_rate: number;
}

export interface DepartmentDistribution {
  "organizationId": string;
  task_count: number;
  completed_count: number;
  completion_rate: number;
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  created: number;
  completed: number;
  overdue: number;
}

export interface AnalyticsDashboard {
  stats: TaskStats;
  timeStats: TimeStats;
  statusDistribution: StatusDistribution[];
  userDistribution: UserDistribution[];
  departmentDistribution: DepartmentDistribution[];
  trend: TrendPoint[]; // Last 30 days
  lastUpdated: string;
}

/**
 * Lấy tổng thể thống kê tasks (total, completed, overdue, in-progress)
 */
export async function getTaskStats(): Promise<TaskStats> {
  const result = await queryOne<{
    total: string;
    completed: string;
    overdue: string;
    in_progress: string;
  }>(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
       COUNT(CASE WHEN due_date IS NOT NULL AND due_date::TIMESTAMPTZ < NOW() AND status != 'completed' THEN 1 END) as overdue,
       COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress
     FROM tasks
     WHERE deleted_at IS NULL`,
    []
  );

  const stats = {
    total: parseInt(result?.total || '0', 10),
    completed: parseInt(result?.completed || '0', 10),
    overdue: parseInt(result?.overdue || '0', 10),
    inProgress: parseInt(result?.in_progress || '0', 10),
  };

  return {
    ...stats,
    completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
  };
}

/**
 * Lấy thống kê thời gian làm việc (tổng giờ, trung bình)
 */
export async function getTimeStats(): Promise<TimeStats> {
  const result = await queryOne<{
    total_hours: string;
    task_count: string;
  }>(
    // Bảng lưu THỜI LƯỢNG THEO PHÚT (duration_minutes INT) — KHÔNG có cột "hours".
    // Query cũ dùng SUM(CAST(hours AS DECIMAL)) → lỗi 42703 "column hours does not exist"
    // → cả API 500 → trang Phân Tích Công Việc trắng hoàn toàn.
    `SELECT
       COALESCE(SUM(duration_minutes), 0) / 60.0 as total_hours,
       COUNT(DISTINCT task_id) as task_count
     FROM task_time_entries
     WHERE deleted_at IS NULL`,
    []
  );

  const totalHours = parseFloat(result?.total_hours || '0');
  const taskCount = parseInt(result?.task_count || '0', 10);

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    taskCount,
    averageHoursPerTask: taskCount > 0 ? Math.round((totalHours / taskCount) * 100) / 100 : 0,
  };
}

/**
 * Phân bố tasks theo status
 */
export async function getStatusDistribution(): Promise<StatusDistribution[]> {
  const rows = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count
     FROM tasks
     WHERE deleted_at IS NULL
     GROUP BY status
     ORDER BY count DESC`,
    []
  );

  if (!rows) return [];

  const total = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

  return rows.map((row) => {
    const count = parseInt(row.count, 10);
    return {
      status: row.status,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

/**
 * Phân bố tasks theo user (assignee)
 */
export async function getUserDistribution(): Promise<UserDistribution[]> {
  const rows = await query<{
    user_id: string;
    user_name: string;
    task_count: string;
    completed_count: string;
  }>(
    `SELECT
       assigned_to as user_id,
       COALESCE(assigned_to_name, assigned_to) as user_name,
       COUNT(*) as task_count,
       COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
     FROM tasks
     WHERE assigned_to IS NOT NULL AND deleted_at IS NULL
     GROUP BY assigned_to, assigned_to_name
     ORDER BY task_count DESC`,
    []
  );

  if (!rows) return [];

  return rows.map((row) => {
    const taskCount = parseInt(row.task_count, 10);
    const completedCount = parseInt(row.completed_count, 10);
    return {
      user_id: row.user_id,
      user_name: row.user_name,
      task_count: taskCount,
      completed_count: completedCount,
      completion_rate: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
    };
  });
}

/**
 * Phân bố tasks theo organization (department)
 */
export async function getDepartmentDistribution(): Promise<DepartmentDistribution[]> {
  const rows = await query<{
    organizationId: string;
    task_count: string;
    completed_count: string;
  }>(
    `SELECT
       "organizationId",
       COUNT(*) as task_count,
       COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
     FROM tasks
     WHERE "organizationId" IS NOT NULL AND deleted_at IS NULL
     GROUP BY "organizationId"
     ORDER BY task_count DESC`,
    []
  );

  if (!rows) return [];

  return rows.map((row) => {
    const taskCount = parseInt(row.task_count, 10);
    const completedCount = parseInt(row.completed_count, 10);
    return {
      organizationId: row.organizationId,
      task_count: taskCount,
      completed_count: completedCount,
      completion_rate: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
    };
  });
}

/**
 * Xu hướng tasks trong 30 ngày gần đây (tạo mới, hoàn thành, quá hạn)
 */
export async function getTaskTrend(days: number = 30): Promise<TrendPoint[]> {
  const rows = await query<{
    date: string;
    created: string;
    completed: string;
    overdue: string;
  }>(
    `SELECT
       (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE::TEXT as date,
       COUNT(*) as created,
       COUNT(CASE WHEN t.status = 'completed'
                   AND (t.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
                     = (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE THEN 1 END) as completed,
       COUNT(CASE WHEN t.due_date IS NOT NULL AND t.due_date::TIMESTAMPTZ < NOW() AND t.status != 'completed' THEN 1 END) as overdue
     FROM tasks t
     WHERE t.deleted_at IS NULL
       AND t.created_at >= NOW() - INTERVAL '${days} days'
     GROUP BY (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE
     ORDER BY date ASC`,
    []
  );

  if (!rows) return [];

  return rows.map((row) => ({
    date: row.date,
    created: parseInt(row.created, 10),
    completed: parseInt(row.completed, 10),
    overdue: parseInt(row.overdue, 10),
  }));
}

/**
 * Lấy dashboard analytics đầy đủ
 */
export async function getAnalyticsDashboard(): Promise<AnalyticsDashboard> {
  const [stats, timeStats, statusDist, userDist, deptDist, trend] = await Promise.all([
    getTaskStats(),
    getTimeStats(),
    getStatusDistribution(),
    getUserDistribution(),
    getDepartmentDistribution(),
    getTaskTrend(30),
  ]);

  return {
    stats,
    timeStats,
    statusDistribution: statusDist,
    userDistribution: userDist,
    departmentDistribution: deptDist,
    trend,
    lastUpdated: new Date().toISOString(),
  };
}
