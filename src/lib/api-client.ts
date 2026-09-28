/**
 * API Client for AssetFlow Pro
 * Provides methods to fetch data from backend APIs
 */

export async function fetchAssets(filters?: { department?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.department) params.append('department', filters.department);
  if (filters?.status) params.append('status', filters.status);

  const response = await fetch(`/api/assets?${params}`);
  if (!response.ok) throw new Error('Failed to fetch assets');
  return response.json();
}

export async function fetchAsset(id: string) {
  const response = await fetch(`/api/assets/${id}`);
  if (!response.ok) throw new Error('Failed to fetch asset');
  return response.json();
}

export async function createAsset(data: any) {
  const response = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create asset');
  return response.json();
}

export async function updateAsset(id: string, data: any) {
  const response = await fetch(`/api/assets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update asset');
  return response.json();
}

export async function deleteAsset(id: string, reason: string) {
  const response = await fetch(`/api/assets/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.error || 'Failed to delete asset') as any;
    err.status = response.status;
    err.code = body.code;
    throw err;
  }
  return response.json();
}

// Hardware
export async function fetchHardware(filters?: {
  search?: string;
  status?: string;
  category?: string;
  department?: string;
  company?: string;
  type?: string;
  page?: number;
  perPage?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.search) params.append('search', filters.search);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.department) params.append('department', filters.department);
  if (filters?.company) params.append('company', filters.company);
  if (filters?.type) params.append('type', filters.type);
  if (filters?.page) params.append('page', String(filters.page));
  if (filters?.perPage) params.append('perPage', String(filters.perPage));

  const response = await fetch(`/api/hardware?${params}`);
  if (!response.ok) throw new Error('Failed to fetch hardware');
  return response.json();
}

export async function fetchHardwareItem(id: string) {
  const response = await fetch(`/api/hardware/${id}`);
  if (!response.ok) throw new Error('Failed to fetch hardware');
  return response.json();
}

export async function createHardware(data: any) {
  const response = await fetch('/api/hardware', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.error || 'Failed to create hardware') as any;
    err.status = response.status;
    err.code = body.code;
    throw err;
  }
  return response.json();
}

export async function updateHardware(id: string, data: any) {
  const response = await fetch(`/api/hardware/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.error || 'Failed to update hardware') as any;
    err.status = response.status;
    err.code = body.code;
    throw err;
  }
  return response.json();
}

export async function inventoryHardware(id: string, data: any) {
  const response = await fetch(`/api/hardware/${id}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.error || 'Failed to inventory hardware') as any;
    err.status = response.status;
    err.code = body.code;
    throw err;
  }
  return response.json();
}

export async function deleteHardware(id: string, reason: string) {
  const response = await fetch(`/api/hardware/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.error || 'Failed to delete hardware') as any;
    err.status = response.status;
    err.code = body.code;
    throw err;
  }
  return response.json();
}

// Tickets
export async function fetchTickets(filters?: { status?: string; assigned_to?: string; userId?: string; userRole?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.assigned_to) params.append('assigned_to', filters.assigned_to);
  if (filters?.userId) params.append('userId', filters.userId);
  if (filters?.userRole) params.append('userRole', filters.userRole);

  // Get current user from localStorage to pass to API for data access filtering
  let currentUserHeaders: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      try {
        const currentUser = JSON.parse(stored);
        if (currentUser.id && currentUser.role) {
          currentUserHeaders['x-current-user-id'] = currentUser.id;
          currentUserHeaders['x-current-user-role'] = currentUser.role;
          // Đa Công Ty: gửi công ty ĐANG LÀM VIỆC (active), không cố định công ty chính.
          const activeCompany =
            (typeof window !== 'undefined' && localStorage.getItem('active_company_id')) ||
            currentUser.company_id;
          if (activeCompany) {
            currentUserHeaders['x-current-user-company'] = activeCompany;
          }
        }
      } catch (e) {
        console.error('Failed to parse current user:', e);
      }
    }
  }

  const response = await fetch(`/api/tickets?${params}`, {
    headers: currentUserHeaders,
  });
  if (!response.ok) throw new Error('Failed to fetch tickets');
  return response.json();
}

export async function createTicket(data: any) {
  const response = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create ticket');
  return response.json();
}

export async function updateTicket(id: string, data: any) {
  const response = await fetch(`/api/tickets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update ticket');
  }
  return response.json();
}

export async function deleteTicket(id: string, data: any) {
  const response = await fetch(`/api/tickets/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete ticket');
  }
  return response.json();
}

// Tasks
export async function fetchTasks(filters?: { status?: string; assigned_to?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.assigned_to) params.append('assigned_to', filters.assigned_to);

  // Get current user from localStorage to pass to API for data access filtering
  let currentUserHeaders: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      try {
        const currentUser = JSON.parse(stored);
        if (currentUser.id && currentUser.role) {
          currentUserHeaders['x-current-user-id'] = currentUser.id;
          currentUserHeaders['x-current-user-role'] = currentUser.role;
          // Đa Công Ty: gửi công ty ĐANG LÀM VIỆC (active), không cố định công ty chính.
          const activeCompany =
            (typeof window !== 'undefined' && localStorage.getItem('active_company_id')) ||
            currentUser.company_id;
          if (activeCompany) {
            currentUserHeaders['x-current-user-company'] = activeCompany;
          }
        }
      } catch (e) {
        console.error('Failed to parse current user:', e);
      }
    }
  }

  const response = await fetch(`/api/tasks?${params}`, {
    headers: currentUserHeaders,
  });
  if (!response.ok) throw new Error('Failed to fetch tasks');
  return response.json();
}

export async function createTask(data: any) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': currentUserId,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create task');
  return response.json();
}

export async function updateTask(id: string, data: any) {
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      try {
        const currentUser = JSON.parse(stored);
        if (currentUser.id) {
          headers['x-current-user-id'] = currentUser.id;
        }
      } catch (e) {
        console.error('Failed to parse current user:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update task');
  }
  return response.json();
}

export async function deleteTask(id: string) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'DELETE',
    headers: {
      'x-current-user-id': currentUserId,
    },
  });
  if (!response.ok) throw new Error('Failed to delete task');
  return response.json();
}

export async function archiveTask(id: string) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': currentUserId,
    },
    body: JSON.stringify({ archived_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error('Failed to archive task');
  return response.json();
}

export async function restoreTask(id: string) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': currentUserId,
    },
    body: JSON.stringify({ archived_at: null }),
  });
  if (!response.ok) throw new Error('Failed to restore task');
  return response.json();
}

// Task Activity Logs
export async function fetchTaskActivities(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}/activities`);
  if (!response.ok) throw new Error('Failed to fetch task activities');
  return response.json();
}

export async function recordTaskActivity(taskId: string, data: any) {
  const response = await fetch(`/api/tasks/${taskId}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to record task activity');
  return response.json();
}

// Task Subtasks
export async function fetchTaskSubtasks(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}/subtasks`);
  if (!response.ok) throw new Error('Failed to fetch subtasks');
  const data = await response.json();
  return data.data || [];
}

export async function createSubtask(taskId: string, data: any) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${taskId}/subtasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': currentUserId,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create subtask');
  const result = await response.json();
  return result.data || result;
}

export async function updateSubtask(taskId: string, subtaskId: string, data: any) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': currentUserId,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update subtask');
  const result = await response.json();
  return result.data || result;
}

export async function deleteSubtask(taskId: string, subtaskId: string) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
    method: 'DELETE',
    headers: {
      'x-current-user-id': currentUserId,
    },
  });
  if (!response.ok) throw new Error('Failed to delete subtask');
  return response.json();
}

export async function reorderSubtasks(taskId: string, subtaskIds: string[]) {
  const response = await fetch(`/api/tasks/${taskId}/subtasks/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subtask_ids: subtaskIds }),
  });
  if (!response.ok) throw new Error('Failed to reorder subtasks');
  return response.json();
}

// Task Time Entries
export async function fetchTaskTimeEntries(taskId: string, filters?: { include_deleted?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.include_deleted) params.append('include_deleted', 'true');
  const response = await fetch(`/api/tasks/${taskId}/time-entries?${params}`);
  if (!response.ok) throw new Error('Failed to fetch time entries');
  const data = await response.json();
  return data.data || [];
}

export async function createTimeEntry(taskId: string, data: any) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${taskId}/time-entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': currentUserId,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create time entry');
  const result = await response.json();
  return result.data || result;
}

export async function updateTimeEntry(taskId: string, entryId: string, data: any) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${taskId}/time-entries/${entryId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': currentUserId,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update time entry');
  const result = await response.json();
  return result.data || result;
}

export async function deleteTimeEntry(taskId: string, entryId: string) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${taskId}/time-entries/${entryId}`, {
    method: 'DELETE',
    headers: {
      'x-current-user-id': currentUserId,
    },
  });
  if (!response.ok) throw new Error('Failed to delete time entry');
  return response.json();
}

export async function fetchTaskTimeSummary(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}/time-summary`);
  if (!response.ok) throw new Error('Failed to fetch time summary');
  const data = await response.json();
  return data.data || {};
}

// Task Code Generation
export async function generateTaskCode() {
  const response = await fetch('/api/tasks/generate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to generate task code');
  return response.json();
}

// Users
export async function fetchUsers(filters?: { role?: string; department?: string; status?: string; company_id?: string }) {
  const params = new URLSearchParams();
  if (filters?.role) params.append('role', filters.role);
  if (filters?.department) params.append('department', filters.department);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.company_id) params.append('company_id', filters.company_id);

  // Get current user from localStorage to pass to API for data access filtering
  let currentUserHeaders: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      try {
        const currentUser = JSON.parse(stored);
        if (currentUser.id && currentUser.role) {
          currentUserHeaders['x-current-user-id'] = currentUser.id;
          currentUserHeaders['x-current-user-role'] = currentUser.role;
          // Đa Công Ty: gửi công ty ĐANG LÀM VIỆC (active), không cố định công ty chính.
          const activeCompany =
            (typeof window !== 'undefined' && localStorage.getItem('active_company_id')) ||
            currentUser.company_id;
          if (activeCompany) {
            currentUserHeaders['x-current-user-company'] = activeCompany;
          }
        }
      } catch (e) {
        console.error('Failed to parse current user:', e);
      }
    }
  }

  const response = await fetch(`/api/users?${params}`, {
    headers: currentUserHeaders,
  });
  if (!response.ok) throw new Error('Failed to fetch users');
  return response.json();
}

/**
 * Fetch all users for participant selection in room bookings
 * Returns all active users in the system without permission restrictions
 */
export async function fetchParticipants() {
  const response = await fetch('/api/room-bookings/participants');
  if (!response.ok) throw new Error('Failed to fetch participants');
  return response.json();
}

/** Headers xác thực từ localStorage — API users POST/PUT yêu cầu x-current-user-id để check quyền */
function getUserAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u.id) headers['x-current-user-id'] = u.id;
        if (u.role) headers['x-current-user-role'] = u.role;
        if (u.company_id) headers['x-current-user-company'] = u.company_id;
        // session_id cấp lúc đăng nhập — dùng để xác thực phiên cho thao tác nhạy cảm
        if (u.session_id) headers['x-session-id'] = u.session_id;
      } catch (e) {
        console.error('Failed to parse current user:', e);
      }
    }
  }
  return headers;
}

export async function createUser(data: any) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: getUserAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Lỗi khi tạo người dùng' }));
    throw new Error(err.error || 'Lỗi khi tạo người dùng');
  }
  return response.json();
}

export async function updateUser(id: string, data: any) {
  const response = await fetch(`/api/users/${id}`, {
    method: 'PUT',
    headers: getUserAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Lỗi khi cập nhật người dùng' }));
    throw new Error(error.error || 'Lỗi khi cập nhật người dùng');
  }
  return response.json();
}

export async function deleteUser(id: string) {
  const response = await fetch(`/api/users/${id}`, {
    method: 'DELETE',
    headers: getUserAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to delete user');
  return response.json();
}

export async function getAuditLogs(userId?: string) {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);

  const response = await fetch(`/api/users/audit-logs?${params}`);
  if (!response.ok) throw new Error('Failed to fetch audit logs');
  return response.json();
}

// Rooms
export async function fetchRooms() {
  const response = await fetch('/api/rooms');
  if (!response.ok) throw new Error('Failed to fetch rooms');
  return response.json();
}

export async function createRoom(data: any) {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create room');
  return response.json();
}

export async function updateRoom(id: string, data: any) {
  const response = await fetch(`/api/rooms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update room');
  return response.json();
}

export async function deleteRoom(id: string) {
  const response = await fetch(`/api/rooms/${id}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Lỗi khi xóa phòng');
  }
  return data;
}

// Room Bookings
// Room Booking Types
export interface RoomBookingParticipant {
  id?: string;
  email?: string;
  name?: string;
}

export interface RoomBookingData {
  room_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';
  num_participants?: number;
  has_online_meeting?: boolean;
  needs_room_setup?: boolean;
  participants?: RoomBookingParticipant[];
  approved_by?: string;
  cancellation_reason?: string;
  confirmed_at?: string;
  requested_by?: string;
  requested_by_name?: string;
}

export async function fetchRoomBookings(filters?: { status?: string; requested_by?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.requested_by) params.append('requested_by', filters.requested_by);

  const response = await fetch(`/api/room-bookings?${params}`);
  if (!response.ok) throw new Error('Failed to fetch room bookings');
  return response.json();
}

export async function createRoomBooking(data: RoomBookingData) {
  const response = await fetch('/api/room-bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create room booking');
  return response.json();
}

export async function updateRoomBooking(id: string, data: Partial<RoomBookingData>) {
  const response = await fetch(`/api/room-bookings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update room booking');
  return response.json();
}

export async function updateRoomBookingParticipants(
  bookingId: string,
  participants: RoomBookingParticipant[]
) {
  const response = await fetch(`/api/room-bookings/${bookingId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participants }),
  });
  if (!response.ok) throw new Error('Failed to update room booking participants');
  return response.json();
}

export async function deleteRoomBooking(id: string) {
  // Get user role from localStorage for authorization header
  const userRole = typeof window !== 'undefined' ? (() => {
    const currentUser = localStorage.getItem('currentUser') || localStorage.getItem('assetflow_auth');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        console.log('[deleteRoomBooking] User role:', user.role);
        return user.role || 'user';
      } catch {
        console.warn('[deleteRoomBooking] Failed to parse currentUser');
        return 'user';
      }
    }
    console.warn('[deleteRoomBooking] No currentUser in localStorage');
    return 'user';
  })() : 'user';

  console.log(`[deleteRoomBooking] Deleting booking ${id} with role: ${userRole}`);

  const response = await fetch(`/api/room-bookings/${id}`, {
    method: 'DELETE',
    headers: {
      'x-user-role': userRole,
    },
  });

  console.log(`[deleteRoomBooking] Response status: ${response.status}`);

  if (!response.ok) {
    const data = await response.json();
    console.error('[deleteRoomBooking] Error response:', data);
    throw new Error(data.error || 'Failed to delete room booking');
  }

  const result = await response.json();
  console.log('[deleteRoomBooking] Success:', result);
  return result;
}

export async function confirmRoomBookingUsage(id: string, confirmedBy: string, confirmationNote?: string) {
  const response = await fetch(`/api/room-bookings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'confirm_usage',
      confirmed_by: confirmedBy,
      confirmation_note: confirmationNote || null,
    }),
  });
  if (!response.ok) throw new Error('Failed to confirm room booking usage');
  return response.json();
}

export async function updateRoomBookingStatus(id: string, status: string, notes?: string) {
  const response = await fetch(`/api/room-bookings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, approval_notes: notes }),
  });
  if (!response.ok) throw new Error('Failed to update room booking status');
  return response.json();
}

export async function confirmRoomBooking(id: string, confirmedBy: string) {
  const response = await fetch(`/api/room-bookings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'confirm',
      confirmed_by: confirmedBy,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to confirm room booking');
  }
  return response.json();
}

export async function cancelRoomBooking(id: string, cancelledBy: string, reason: string) {
  const response = await fetch(`/api/room-bookings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'cancel',
      cancelled_by: cancelledBy,
      cancellation_reason: reason,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cancel room booking');
  }
  return response.json();
}

// Delete Requests
export async function fetchDeleteRequests(filters?: { status?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);

  const response = await fetch(`/api/delete-requests?${params}`);
  if (!response.ok) throw new Error('Failed to fetch delete requests');
  return response.json();
}

export async function createDeleteRequest(data: any) {
  const response = await fetch('/api/delete-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create delete request');
  return response.json();
}

export async function updateDeleteRequest(id: string, data: any) {
  const response = await fetch(`/api/delete-requests/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update delete request');
  return response.json();
}

// Organizations
export async function fetchCompanies() {
  const response = await fetch('/api/organizations/companies');
  if (!response.ok) throw new Error('Failed to fetch companies');
  return response.json();
}

export async function fetchDepartmentsByCompany(companyId: string) {
  const response = await fetch(`/api/organizations/departments?company_id=${companyId}`);
  if (!response.ok) throw new Error('Failed to fetch departments');
  return response.json();
}

export async function fetchSubDepartmentsByDepartment(departmentId: string) {
  const response = await fetch(`/api/organizations/sub-departments?department_id=${departmentId}`);
  if (!response.ok) throw new Error('Failed to fetch sub-departments');
  return response.json();
}

// Notifications
export async function fetchNotifications(userId: string, unreadOnly = false) {
  const params = new URLSearchParams();
  if (unreadOnly) params.append('unreadOnly', 'true');

  const response = await fetch(`/api/notifications?userId=${userId}&${params}`);
  if (!response.ok) throw new Error('Failed to fetch notifications');
  return response.json();
}

export async function markNotificationAsRead(notificationId: string) {
  const response = await fetch(`/api/notifications/${notificationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ read: true }),
  });
  if (!response.ok) throw new Error('Failed to mark notification as read');
  return response.json();
}

export async function markAllNotificationsAsRead(userId: string) {
  const response = await fetch(`/api/notifications/user/${userId}/read-all`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to mark all notifications as read');
  return response.json();
}

export async function deleteNotification(notificationId: string) {
  const response = await fetch(`/api/notifications/${notificationId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete notification');
  return response.json();
}

export async function getUnreadNotificationCount(userId: string) {
  const response = await fetch(`/api/notifications/user/${userId}/unread-count`);
  if (!response.ok) throw new Error('Failed to fetch unread notification count');
  return response.json();
}

// Task Followers
export async function fetchTaskFollowers(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}/followers`);
  if (!response.ok) throw new Error('Failed to fetch followers');
  return response.json();
}

export async function addTaskFollower(taskId: string) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${taskId}/followers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': currentUserId,
    },
  });
  if (!response.ok) throw new Error('Failed to add follower');
  return response.json();
}

export async function removeTaskFollower(taskId: string, userId: string) {
  let currentUserId = '';
  if (typeof window !== 'undefined') {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        currentUserId = user.id || '';
      } catch (e) {
        console.error('Failed to parse currentUser:', e);
      }
    }
  }
  const response = await fetch(`/api/tasks/${taskId}/followers/${userId}`, {
    method: 'DELETE',
    headers: {
      'x-current-user-id': currentUserId,
    },
  });
  if (!response.ok) throw new Error('Failed to remove follower');
  return response.json();
}

// Task Comments
export async function fetchTaskComments(taskId: string, includeDeleted = false) {
  const params = new URLSearchParams();
  if (includeDeleted) params.append('include_deleted', 'true');
  const response = await fetch(`/api/tasks/${taskId}/comments?${params}`);
  if (!response.ok) throw new Error('Failed to fetch comments');
  const data = await response.json();
  return data.data || [];
}

export async function createTaskComment(taskId: string, data: any) {
  const response = await fetch(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create comment');
  return response.json();
}

export async function updateTaskComment(taskId: string, commentId: string, data: any) {
  const response = await fetch(`/api/tasks/${taskId}/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update comment');
  return response.json();
}

export async function deleteTaskComment(taskId: string, commentId: string, permanent = false) {
  const params = new URLSearchParams();
  if (permanent) params.append('permanent', 'true');
  const response = await fetch(`/api/tasks/${taskId}/comments/${commentId}?${params}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete comment');
  return response.json();
}
