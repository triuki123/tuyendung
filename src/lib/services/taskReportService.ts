import { query as dbQuery } from '@/lib/db';
import { writeFileSync, mkdirSync } from 'fs';
import { basename, resolve, sep } from 'path';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function getSafeReportPath(fileName: string): { fileName: string; filePath: string; reportDir: string } {
  const safeName = basename(fileName);
  if (safeName !== fileName || !safeName.endsWith('.html')) {
    throw new Error('Tên tệp báo cáo không hợp lệ');
  }
  const reportDir = resolve(process.cwd(), 'public', 'reports');
  const filePath = resolve(reportDir, safeName);
  if (!filePath.startsWith(`${reportDir}${sep}`)) {
    throw new Error('Đường dẫn báo cáo không hợp lệ');
  }
  return { fileName: safeName, filePath, reportDir };
}

function assertDateRange(fromDate: string, toDate: string): void {
  if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
    throw new Error('Ngày báo cáo không hợp lệ');
  }
}

interface Task {
  id: string;
  code?: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  assigned_to_name: string;
  due_date: string;
  estimated_hours?: number;
  actual_hours?: number;
}

interface ReportOptions {
  userId: string;
  userName: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD
  teamId?: string; // For team reports
}

/** dd/mm/yyyy từ chuỗi ISO YYYY-MM-DD (tránh timezone shift). */
function formatVN(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function calculateDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'todo': 'Chưa bắt đầu',
    'in_progress': 'Đang làm',
    'done': 'Hoàn thành',
    'cancelled': 'Hủy'
  };
  return labels[status] || status;
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    'high': 'Cao',
    'medium': 'Trung bình',
    'low': 'Thấp'
  };
  return labels[priority] || priority;
}

function getPriorityEmoji(priority: string): string {
  const emojis: Record<string, string> = {
    'high': '🔴',
    'medium': '🟡',
    'low': '🟢'
  };
  return emojis[priority] || '⚪';
}

function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    'todo': '⏳',
    'in_progress': '⚙️',
    'done': '✓',
    'cancelled': '✕'
  };
  return emojis[status] || '?';
}

export async function generatePersonalTaskReport(options: ReportOptions): Promise<string> {
  const { userId, userName, fromDate, toDate } = options;
  assertDateRange(fromDate, toDate);

  // Fetch user tasks within the date range (theo due_date)
  const tasks = await dbQuery<Task>(`
    SELECT
      id, code, title, priority, status,
      assigned_to_name, due_date, estimated_hours, actual_hours
    FROM tasks
    WHERE assigned_to = $1
      AND NULLIF(due_date, '') IS NOT NULL
      AND NULLIF(due_date, '')::date BETWEEN $2::date AND $3::date
      AND archived_at IS NULL
    ORDER BY due_date ASC
  `, [userId, fromDate, toDate]);

  // Calculate metrics
  const metrics = {
    total: tasks.length || 1,
    completed: tasks.filter(t => t.status === 'done').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'todo').length,
    overdue: tasks.filter(t => {
      const days = calculateDaysUntilDue(t.due_date);
      return days < 0 && t.status !== 'done';
    }).length,
    completionRate: tasks.length ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0
  };

  const statusCounts = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length
  };

  const priorityCounts = {
    high: tasks.filter(t => t.priority === 'high').length,
    medium: tasks.filter(t => t.priority === 'medium').length,
    low: tasks.filter(t => t.priority === 'low').length
  };

  const today = new Date();
  const dateStr = today.getDate() + '/' + (today.getMonth() + 1) + '/' + today.getFullYear();

  // Build recent tasks table rows
  let taskRows = '';
  for (let i = 0; i < Math.min(25, tasks.length); i++) {
    const task = tasks[i];
    const dueDate = new Date(task.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    taskRows += '<tr><td>' + (i + 1) + '</td><td>' + (task.code || 'N/A') + '</td><td>' + task.title.substring(0, 40) + '</td><td>' + getStatusLabel(task.status) + '</td><td>' + getPriorityLabel(task.priority) + '</td><td>' + dueDate + '</td></tr>';
  }

  // Build summary section
  let summaryHtml = '<h3>Tóm Tắt</h3>';
  if (metrics.completionRate >= 70) {
    summaryHtml += '<div class="summary-text">✓ <strong>Tiến độ theo kế hoạch</strong> với tỷ lệ hoàn thành cao</div>';
  } else {
    summaryHtml += '<div class="summary-text">⚠ <strong>Tỷ lệ hoàn thành dưới mục tiêu</strong> 70%</div>';
  }
  if (metrics.overdue > 0) {
    summaryHtml += '<div class="summary-text">⚠ <strong>' + metrics.overdue + ' công việc quá hạn</strong> cần xử lý ngay</div>';
  }
  if (priorityCounts.high > 0) {
    summaryHtml += '<div class="summary-text">⚠ <strong>' + priorityCounts.high + ' công việc ưu tiên cao</strong> đang chờ xử lý</div>';
  }

  // Generate HTML report
  const htmlContent = '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<title>Báo Cáo Công Việc Cá Nhân - ' + userName + '</title>' +
    '<style>' +
    '* { margin: 0; padding: 0; }' +
    'body { font-family: Arial, sans-serif; padding: 20px; color: #333; }' +
    '.container { max-width: 900px; margin: 0 auto; }' +
    'h1 { font-size: 24px; margin-bottom: 5px; }' +
    'h2 { font-size: 18px; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #007bff; padding-bottom: 5px; }' +
    'h3 { font-size: 14px; margin-top: 15px; margin-bottom: 8px; }' +
    '.header { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 12px; color: #666; }' +
    '.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 15px 0; }' +
    '.metric-card { background: #f8f9fa; padding: 12px; border-radius: 4px; }' +
    '.metric-value { font-size: 24px; font-weight: bold; color: #007bff; }' +
    '.metric-label { font-size: 12px; color: #666; margin-top: 5px; }' +
    'table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 12px; }' +
    'th { background: #007bff; color: white; padding: 8px; text-align: left; }' +
    'td { padding: 8px; border-bottom: 1px solid #ddd; }' +
    'tr:nth-child(even) { background: #f8f9fa; }' +
    '.summary-text { margin: 8px 0; font-size: 12px; }' +
    '.summary-text strong { color: #007bff; }' +
    '.footer { text-align: center; font-size: 10px; color: #999; margin-top: 30px; }' +
    '@media print { body { padding: 0; } }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h1>FADO AssetFlow Pro</h1>' +
    '<h2>Báo Cáo Công Việc Cá Nhân</h2>' +
    '<div class="header">' +
    '<div>Nhân viên: <strong>' + userName + '</strong></div>' +
    '<div>Kỳ: ' + formatVN(fromDate) + ' – ' + formatVN(toDate) + '</div>' +
    '<div>Ngày in: ' + dateStr + '</div>' +
    '</div>' +
    '<h3>Chỉ Số Hiệu Suất Chính</h3>' +
    '<div class="metrics">' +
    '<div class="metric-card">' +
    '<div class="metric-value">' + metrics.total + '</div>' +
    '<div class="metric-label">Tổng Công Việc</div>' +
    '</div>' +
    '<div class="metric-card">' +
    '<div class="metric-value">' + metrics.completed + '</div>' +
    '<div class="metric-label">Hoàn Thành (' + metrics.completionRate + '%)</div>' +
    '</div>' +
    '<div class="metric-card">' +
    '<div class="metric-value">' + metrics.inProgress + '</div>' +
    '<div class="metric-label">Đang Làm</div>' +
    '</div>' +
    '</div>' +
    '<h3>Phân Phối Trạng Thái</h3>' +
    '<table>' +
    '<tr><th>Trạng Thái</th><th>Số Lượng</th><th>Tỷ Lệ</th></tr>' +
    '<tr><td>Chưa Bắt Đầu</td><td>' + statusCounts.todo + '</td><td>' + Math.round((statusCounts.todo / metrics.total) * 100) + '%</td></tr>' +
    '<tr><td>Đang Làm</td><td>' + statusCounts.in_progress + '</td><td>' + Math.round((statusCounts.in_progress / metrics.total) * 100) + '%</td></tr>' +
    '<tr><td>Hoàn Thành</td><td>' + statusCounts.done + '</td><td>' + Math.round((statusCounts.done / metrics.total) * 100) + '%</td></tr>' +
    '<tr><td>Hủy</td><td>' + statusCounts.cancelled + '</td><td>' + Math.round((statusCounts.cancelled / metrics.total) * 100) + '%</td></tr>' +
    '</table>' +
    '<h3>Phân Tích Ưu Tiên</h3>' +
    '<table>' +
    '<tr><th>Ưu Tiên</th><th>Số Lượng</th><th>Tỷ Lệ</th></tr>' +
    '<tr><td>Cao</td><td>' + priorityCounts.high + '</td><td>' + Math.round((priorityCounts.high / metrics.total) * 100) + '%</td></tr>' +
    '<tr><td>Trung Bình</td><td>' + priorityCounts.medium + '</td><td>' + Math.round((priorityCounts.medium / metrics.total) * 100) + '%</td></tr>' +
    '<tr><td>Thấp</td><td>' + priorityCounts.low + '</td><td>' + Math.round((priorityCounts.low / metrics.total) * 100) + '%</td></tr>' +
    '</table>' +
    '<h3>Công Việc Gần Đây</h3>' +
    '<table>' +
    '<tr><th>#</th><th>Mã</th><th>Tiêu Đề</th><th>Trạng Thái</th><th>Ưu Tiên</th><th>Hạn Chót</th></tr>' +
    taskRows +
    '</table>' +
    summaryHtml +
    '<div class="footer">' +
    '<p>Báo cáo này được tạo tự động bởi FADO AssetFlow Pro</p>' +
    '<p>Sử dụng tính năng In (Ctrl+P hoặc Cmd+P) để lưu dưới dạng PDF</p>' +
    '</div>' +
    '</div>' +
    '</body>' +
    '</html>';

  // Save HTML file (tên file gồm dải ngày để dễ phân biệt)
  const fileName = `task_report_${userId}_${fromDate}_${toDate}.html`;
  const safePath = getSafeReportPath(fileName);

  mkdirSync(safePath.reportDir, { recursive: true });
  writeFileSync(safePath.filePath, htmlContent, 'utf-8');

  return `/reports/${safePath.fileName}`;
}

/**
 * Sinh báo cáo đội nhóm cho 1 tập user IDs đã được phân giải sẵn (từ scope service).
 */
async function generateMultiUserReport(args: {
  requestedById: string;
  requestedByName: string;
  memberIds: string[];
  targetLabel: string;
  fromDate: string;
  toDate: string;
}): Promise<string> {
  const { requestedById, requestedByName: managerName, memberIds, targetLabel, fromDate, toDate } = args;
  assertDateRange(fromDate, toDate);
  const scopeLabel = targetLabel;

  // Lấy tên các thành viên trong target
  const teamMembers = memberIds.length === 0
    ? []
    : await dbQuery<{ id: string; name: string }>(
        `SELECT id, name FROM users WHERE id::text = ANY($1::text[]) ORDER BY name`,
        [memberIds]
      );

  // Fetch all team tasks within the date range (theo due_date)
  const teamTasks = teamMembers.length > 0 ? await dbQuery<Task>(`
    SELECT
      id, code, title, priority, status,
      assigned_to_name, due_date, estimated_hours, actual_hours
    FROM tasks
    WHERE assigned_to IN (${teamMembers.map((_, i) => `$${i + 1}`).join(',')})
      AND NULLIF(due_date, '') IS NOT NULL
      AND NULLIF(due_date, '')::date BETWEEN $${teamMembers.length + 1}::date AND $${teamMembers.length + 2}::date
      AND archived_at IS NULL
    ORDER BY due_date ASC
  `, [...teamMembers.map(m => m.id), fromDate, toDate]) : [];

  // Calculate team metrics
  const totalTasks = teamTasks.length || 1;
  const completedTasks = teamTasks.filter(t => t.status === 'done').length;
  const overdueTasks = teamTasks.filter(t => {
    const days = calculateDaysUntilDue(t.due_date);
    return days < 0 && t.status !== 'done';
  }).length;

  // Build member breakdown table
  const memberTableBody: any[] = [['Name', 'High', 'Med', 'Low', 'Done %', 'Load %', 'Status']];

  for (const member of teamMembers) {
    const memberTasks = teamTasks.filter(t => t.assigned_to_name === member.name);
    const highCount = memberTasks.filter(t => t.priority === 'high').length;
    const mediumCount = memberTasks.filter(t => t.priority === 'medium').length;
    const lowCount = memberTasks.filter(t => t.priority === 'low').length;
    const completionRate = memberTasks.length ? Math.round((memberTasks.filter(t => t.status === 'done').length / memberTasks.length) * 100) : 0;
    const load = teamMembers.length ? Math.round((memberTasks.length / (totalTasks / teamMembers.length)) * 100) : 0;
    const status = load > 90 ? 'AT RISK' : 'OK';

    memberTableBody.push([
      member.name.substring(0, 15),
      highCount.toString(),
      mediumCount.toString(),
      lowCount.toString(),
      `${completionRate}%`,
      `${load}%`,
      status
    ]);
  }

  // Build overdue tasks list
  const overdueLists = teamTasks.filter(t => {
    const days = calculateDaysUntilDue(t.due_date);
    return days < 0 && t.status !== 'done';
  }).slice(0, 5);

  const overdueContent = overdueLists.length > 0
    ? [
        { text: '', margin: [0, 10] },
        { text: 'OVERDUE TASKS', style: 'subheading' },
        ...overdueLists.map(task => ({
          text: `[${task.assigned_to_name.substring(0, 15)}] ${task.code} - ${task.title.substring(0, 40)}`,
          style: 'normal'
        }))
      ]
    : [];

  // Generate HTML report for team
  let memberRows = '';
  for (const member of teamMembers) {
    const memberTasks = teamTasks.filter(t => t.assigned_to_name === member.name);
    const highCount = memberTasks.filter(t => t.priority === 'high').length;
    const mediumCount = memberTasks.filter(t => t.priority === 'medium').length;
    const lowCount = memberTasks.filter(t => t.priority === 'low').length;
    const completionRate = memberTasks.length ? Math.round((memberTasks.filter(t => t.status === 'done').length / memberTasks.length) * 100) : 0;
    const load = teamMembers.length ? Math.round((memberTasks.length / (totalTasks / teamMembers.length)) * 100) : 0;
    const status = load > 90 ? 'AT RISK' : 'OK';
    const rowClass = status === 'AT RISK' ? 'class="at-risk"' : '';
    memberRows += '<tr ' + rowClass + '><td>' + member.name.substring(0, 15) + '</td><td style="text-align: center;">' + highCount + '</td><td style="text-align: center;">' + mediumCount + '</td><td style="text-align: center;">' + lowCount + '</td><td style="text-align: center;">' + completionRate + '%</td><td style="text-align: center;">' + load + '%</td><td>' + status + '</td></tr>';
  }

  let overdueRows = '';
  if (overdueLists.length > 0) {
    overdueRows = '<h3>Overdue Tasks</h3><table><tr><th>Assignee</th><th>Code</th><th>Title</th></tr>';
    for (const task of overdueLists) {
      overdueRows += '<tr><td>' + task.assigned_to_name.substring(0, 15) + '</td><td>' + (task.code || 'N/A') + '</td><td>' + task.title.substring(0, 50) + '</td></tr>';
    }
    overdueRows += '</table>';
  }

  const htmlContent = '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<title>Báo Cáo Công Việc Team - ' + managerName + '</title>' +
    '<style>' +
    '* { margin: 0; padding: 0; }' +
    'body { font-family: Arial, sans-serif; padding: 20px; color: #333; }' +
    '.container { max-width: 900px; margin: 0 auto; }' +
    'h1 { font-size: 24px; margin-bottom: 5px; }' +
    'h2 { font-size: 18px; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #28a745; padding-bottom: 5px; }' +
    'h3 { font-size: 14px; margin-top: 15px; margin-bottom: 8px; }' +
    '.header { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 12px; color: #666; }' +
    '.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 15px 0; }' +
    '.metric-card { background: #f8f9fa; padding: 12px; border-radius: 4px; }' +
    '.metric-value { font-size: 24px; font-weight: bold; color: #28a745; }' +
    '.metric-label { font-size: 12px; color: #666; margin-top: 5px; }' +
    'table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 12px; }' +
    'th { background: #28a745; color: white; padding: 8px; text-align: left; }' +
    'td { padding: 8px; border-bottom: 1px solid #ddd; }' +
    'tr:nth-child(even) { background: #f8f9fa; }' +
    '.at-risk { background-color: #fff3cd !important; }' +
    '.summary-text { margin: 8px 0; font-size: 12px; }' +
    '.summary-text strong { color: #28a745; }' +
    '.footer { text-align: center; font-size: 10px; color: #999; margin-top: 30px; }' +
    '@media print { body { padding: 0; } }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    '<h1>FADO AssetFlow Pro</h1>' +
    '<h2>Báo Cáo Công Việc Team</h2>' +
    '<div class="header">' +
    '<div>Quản Lý: <strong>' + managerName + '</strong></div>' +
    '<div>Phạm vi: ' + scopeLabel + '</div>' +
    '<div>Kỳ: ' + formatVN(fromDate) + ' – ' + formatVN(toDate) + '</div>' +
    '<div>Số Thành Viên: ' + teamMembers.length + '</div>' +
    '</div>' +
    '<h3>Tổng Quan Team</h3>' +
    '<div class="metrics">' +
    '<div class="metric-card">' +
    '<div class="metric-value">' + totalTasks + '</div>' +
    '<div class="metric-label">Tổng Công Việc</div>' +
    '</div>' +
    '<div class="metric-card">' +
    '<div class="metric-value">' + completedTasks + '</div>' +
    '<div class="metric-label">Hoàn Thành (' + Math.round((completedTasks / totalTasks) * 100) + '%)</div>' +
    '</div>' +
    '<div class="metric-card">' +
    '<div class="metric-value">' + overdueTasks + '</div>' +
    '<div class="metric-label">Quá Hạn</div>' +
    '</div>' +
    '</div>' +
    '<h3>Chi Tiết Thành Viên</h3>' +
    '<table>' +
    '<tr><th>Tên</th><th style="text-align: center;">Cao</th><th style="text-align: center;">Trung Bình</th><th style="text-align: center;">Thấp</th><th style="text-align: center;">Hoàn Thành %</th><th style="text-align: center;">Tải %</th><th>Trạng Thái</th></tr>' +
    memberRows +
    '</table>' +
    overdueRows +
    '<div class="footer">' +
    '<p>Báo cáo này được tạo tự động bởi FADO AssetFlow Pro</p>' +
    '<p>Sử dụng tính năng In (Ctrl+P hoặc Cmd+P) để lưu dưới dạng PDF</p>' +
    '</div>' +
    '</div>' +
    '</body>' +
    '</html>';

  const safeLabel = scopeLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
  const fileName = `team_report_${requestedById}_${safeLabel}_${fromDate}_${toDate}.html`;
  const safePath = getSafeReportPath(fileName);

  mkdirSync(safePath.reportDir, { recursive: true });
  writeFileSync(safePath.filePath, htmlContent, 'utf-8');

  return `/reports/${safePath.fileName}`;
}

/**
 * Entry point thống nhất cho /api/tasks/report/export.
 * Tự chọn layout cá nhân (1 member, target là self/user) hoặc đội nhóm (>1).
 */
export async function generateScopedTaskReport(args: {
  requestedById: string;
  requestedByName: string;
  memberIds: string[];
  targetType: 'self' | 'user' | 'sub_department' | 'department' | 'company' | 'all';
  targetLabel: string;
  fromDate: string;
  toDate: string;
}): Promise<string> {
  const { requestedById, requestedByName, memberIds, targetType, targetLabel, fromDate, toDate } = args;

  if (memberIds.length === 1 && (targetType === 'self' || targetType === 'user')) {
    const targetUserId = memberIds[0];
    const u = await dbQuery<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [targetUserId]);
    const userName = u[0]?.name || requestedByName;
    return generatePersonalTaskReport({ userId: targetUserId, userName, fromDate, toDate });
  }
  return generateMultiUserReport({
    requestedById,
    requestedByName,
    memberIds,
    targetLabel,
    fromDate,
    toDate,
  });
}
