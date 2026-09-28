/**
 * Ticket Action Service - Approve/Reject quick actions
 */

interface ActionResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Quick approve ticket
 */
export async function approveTicket(
  ticketId: string,
  userId: string,
  userRole: string,
  notes?: string
): Promise<ActionResponse> {
  try {
    const response = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'resolved',
        userId,
        userRole,
        changed_by_name: userId,
        reason: notes,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Không thể duyệt ticket' };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Lỗi server',
    };
  }
}

/**
 * Quick reject ticket
 */
export async function rejectTicket(
  ticketId: string,
  userId: string,
  userRole: string,
  reason?: string
): Promise<ActionResponse> {
  try {
    const response = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'closed',
        userId,
        userRole,
        changed_by_name: userId,
        reason: reason || 'Từ chối',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Không thể từ chối ticket' };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Lỗi server',
    };
  }
}
