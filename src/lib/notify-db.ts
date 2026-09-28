import type { PoolClient } from 'pg';

export interface NotifyPayload {
  type: 'insert' | 'update' | 'delete';
  entity: string;
  entityId: string;
  data?: Record<string, any>;
  userId?: string;
}

export async function notifyEntityChange(
  client: PoolClient,
  payload: NotifyPayload
) {
  try {
    const notificationPayload = JSON.stringify(payload);

    await client.query(
      `NOTIFY entity_changed, $1`,
      [notificationPayload]
    );
  } catch (error) {
    console.error('[Notify] Error sending notification:', error);
  }
}

export function buildNotifyPayload(
  type: 'insert' | 'update' | 'delete',
  entity: string,
  entityId: string,
  data?: Record<string, any>,
  userId?: string
): NotifyPayload {
  return {
    type,
    entity,
    entityId,
    data,
    userId,
  };
}

export async function notifyWithTransaction(
  client: PoolClient,
  callback: () => Promise<void>,
  payload: NotifyPayload
) {
  try {
    await client.query('BEGIN');
    await callback();
    await notifyEntityChange(client, payload);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
