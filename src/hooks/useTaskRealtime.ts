/**
 * useTaskRealtime hook
 * Subscribe to SSE updates cho task comments, followers, và attachments.
 * Tự động reload dữ liệu khi nhận event từ server.
 */

import { useEffect, useCallback } from 'react';

interface RealtimeEvent {
  id: string;
  type: 'insert' | 'update' | 'delete';
  entity: string;
  entityId: string;
  data?: Record<string, any>;
  timestamp: number;
  userId?: string;
}

/**
 * Subscribe đến SSE stream cho task realtime updates
 * @param taskId Task ID để monitor
 * @param onCommentAdded Callback khi có comment mới
 * @param onFollowerAdded Callback khi có follower mới
 * @param onAttachmentAdded Callback khi có attachment mới
 * @returns cleanup function
 */
export function useTaskRealtime(
  taskId: string,
  {
    onCommentAdded,
    onFollowerAdded,
    onAttachmentAdded,
  }: {
    onCommentAdded?: (event: RealtimeEvent) => void;
    onFollowerAdded?: (event: RealtimeEvent) => void;
    onAttachmentAdded?: (event: RealtimeEvent) => void;
  } = {}
) {
  useEffect(() => {
    if (!taskId) return;

    // Subscribe tới SSE stream
    const entities = JSON.stringify(['task_comment', 'task_follower', 'task_attachment']);
    const eventSource = new EventSource(
      `/api/realtime-subscribe?entities=${encodeURIComponent(entities)}`
    );

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as RealtimeEvent;

        // Chỉ xử lý event của task này
        if (
          !data.entityId ||
          (!data.entityId.includes(taskId) && data.entity !== 'system')
        ) {
          return;
        }

        switch (data.entity) {
          case 'task_comment':
            onCommentAdded?.(data);
            break;
          case 'task_follower':
            onFollowerAdded?.(data);
            break;
          case 'task_attachment':
            onAttachmentAdded?.(data);
            break;
        }
      } catch (error) {
        console.error('[Realtime] Error parsing event:', error);
      }
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.addEventListener('error', () => {
      console.error('[Realtime] SSE connection error');
      eventSource.close();
    });

    // Cleanup
    return () => {
      eventSource.removeEventListener('message', handleMessage);
      eventSource.close();
    };
  }, [taskId, onCommentAdded, onFollowerAdded, onAttachmentAdded]);
}
