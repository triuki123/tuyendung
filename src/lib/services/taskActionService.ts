import { updateTask } from '@/lib/api-client';

/**
 * Service để quản lý các hành động trên task
 * Tương tự ticketActionService nhưng cho Task module
 */

interface Task {
  id: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  title: string;
  [key: string]: any;
}

/**
 * Đánh dấu task là đang làm
 * @param taskId - ID của task
 * @param task - Task object hiện tại
 * @returns Updated task
 */
export async function markTaskInProgress(taskId: string, task: Task): Promise<Task> {
  try {
    const updatedData = {
      ...task,
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    };

    const result = await updateTask(taskId, updatedData);

    if (result?.error) {
      throw new Error(result.error);
    }

    return result || updatedData;
  } catch (error) {
    console.error(`Error marking task ${taskId} as in progress:`, error);
    throw error;
  }
}

/**
 * Đánh dấu task là hoàn thành
 * @param taskId - ID của task
 * @param task - Task object hiện tại
 * @returns Updated task
 */
export async function markTaskDone(taskId: string, task: Task): Promise<Task> {
  try {
    const updatedData = {
      ...task,
      status: 'done',
      updated_at: new Date().toISOString(),
    };

    const result = await updateTask(taskId, updatedData);

    if (result?.error) {
      throw new Error(result.error);
    }

    return result || updatedData;
  } catch (error) {
    console.error(`Error marking task ${taskId} as done:`, error);
    throw error;
  }
}

/**
 * Hủy bỏ task
 * @param taskId - ID của task
 * @param task - Task object hiện tại
 * @param reason - Lý do hủy (tùy chọn)
 * @returns Updated task
 */
export async function cancelTask(taskId: string, task: Task, reason?: string): Promise<Task> {
  try {
    const updatedData = {
      ...task,
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    };

    const result = await updateTask(taskId, updatedData);

    if (result?.error) {
      throw new Error(result.error);
    }

    return result || updatedData;
  } catch (error) {
    console.error(`Error cancelling task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Chuyển task trở lại trạng thái chờ làm
 * @param taskId - ID của task
 * @param task - Task object hiện tại
 * @returns Updated task
 */
export async function resetTaskToTodo(taskId: string, task: Task): Promise<Task> {
  try {
    const updatedData = {
      ...task,
      status: 'todo',
      updated_at: new Date().toISOString(),
    };

    const result = await updateTask(taskId, updatedData);

    if (result?.error) {
      throw new Error(result.error);
    }

    return result || updatedData;
  } catch (error) {
    console.error(`Error resetting task ${taskId} to todo:`, error);
    throw error;
  }
}

/**
 * Cập nhật trạng thái task một cách tổng quát
 * @param taskId - ID của task
 * @param task - Task object hiện tại
 * @param newStatus - Trạng thái mới
 * @returns Updated task
 */
export async function updateTaskStatus(
  taskId: string,
  task: Task,
  newStatus: 'todo' | 'in_progress' | 'done' | 'cancelled'
): Promise<Task> {
  try {
    const updatedData = {
      ...task,
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    const result = await updateTask(taskId, updatedData);

    if (result?.error) {
      throw new Error(result.error);
    }

    return result || updatedData;
  } catch (error) {
    console.error(`Error updating task ${taskId} status to ${newStatus}:`, error);
    throw error;
  }
}

/**
 * Bulk update status cho nhiều tasks
 * @param taskIds - Mảng task IDs
 * @param tasks - Mảng task objects
 * @param newStatus - Trạng thái mới
 * @returns Mảng updated tasks
 */
export async function bulkUpdateTaskStatus(
  taskIds: string[],
  tasks: Task[],
  newStatus: 'todo' | 'in_progress' | 'done' | 'cancelled'
): Promise<Task[]> {
  try {
    const updatePromises = taskIds.map(taskId => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return Promise.reject(new Error(`Task ${taskId} not found`));

      return updateTaskStatus(taskId, task, newStatus);
    });

    const results = await Promise.all(updatePromises);
    return results;
  } catch (error) {
    console.error('Error bulk updating task statuses:', error);
    throw error;
  }
}

/**
 * Lưu trữ task (đánh dấu là hoàn thành)
 * Thiết lập archived_at timestamp
 * @param taskId - ID của task
 * @param task - Task object hiện tại
 * @returns Updated task
 */
export async function archiveTask(taskId: string, task: Task): Promise<Task> {
  try {
    const updatedData = {
      ...task,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await updateTask(taskId, updatedData);

    if (result?.error) {
      throw new Error(result.error);
    }

    return result || updatedData;
  } catch (error) {
    console.error(`Error archiving task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Khôi phục task từ lưu trữ
 * Xóa archived_at timestamp
 * @param taskId - ID của task
 * @param task - Task object hiện tại
 * @returns Updated task
 */
export async function unarchiveTask(taskId: string, task: Task): Promise<Task> {
  try {
    const updatedData = {
      ...task,
      archived_at: null,
      updated_at: new Date().toISOString(),
    };

    const result = await updateTask(taskId, updatedData);

    if (result?.error) {
      throw new Error(result.error);
    }

    return result || updatedData;
  } catch (error) {
    console.error(`Error unarchiving task ${taskId}:`, error);
    throw error;
  }
}

/**
 * Bulk archive nhiều tasks
 * @param taskIds - Mảng task IDs
 * @param tasks - Mảng task objects
 * @returns Mảng archived tasks
 */
export async function bulkArchiveTasks(taskIds: string[], tasks: Task[]): Promise<Task[]> {
  try {
    const archivePromises = taskIds.map(taskId => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return Promise.reject(new Error(`Task ${taskId} not found`));

      return archiveTask(taskId, task);
    });

    const results = await Promise.all(archivePromises);
    return results;
  } catch (error) {
    console.error('Error bulk archiving tasks:', error);
    throw error;
  }
}
