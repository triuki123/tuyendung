import { EventEmitter } from 'events';
import type { Pool } from 'pg';

// Simple ID generator
const generateId = () => Math.random().toString(36).substr(2, 9);

export interface RealtimeEvent {
  id: string;
  type: 'insert' | 'update' | 'delete';
  entity: string;
  entityId: string;
  data?: Record<string, any>;
  timestamp: number;
  userId?: string;
}

interface ClientSubscription {
  clientId: string;
  entities: Set<string>; // entity types to subscribe to
  sendEvent: (event: RealtimeEvent) => void;
}

class RealtimeServer extends EventEmitter {
  private clients: Map<string, ClientSubscription> = new Map();
  private pgPool: Pool | null = null;
  private listenConnection: any = null;
  private eventCache: Map<string, RealtimeEvent> = new Map();
  private cacheSizeLimit = 1000;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  async initialize(pool: Pool) {
    if (this.pgPool) return;
    this.pgPool = pool;

    try {
      this.listenConnection = await pool.connect();

      await this.listenConnection.query('LISTEN entity_changed');

      this.listenConnection.on('notification', (message: any) => {
        this.handleNotification(message);
      });

      console.log('[Realtime] Server initialized, listening to PostgreSQL NOTIFY');
    } catch (error) {
      console.error('[Realtime] Failed to initialize:', error);
    }
  }

  private handleNotification(message: any) {
    try {
      const payload = JSON.parse(message.payload);

      const event: RealtimeEvent = {
        id: generateId(),
        type: payload.type,
        entity: payload.entity,
        entityId: payload.entityId,
        data: payload.data,
        timestamp: Date.now(),
        userId: payload.userId,
      };

      this.cacheEvent(event);
      this.broadcastEvent(event);
    } catch (error) {
      console.error('[Realtime] Error parsing notification:', error);
    }
  }

  private cacheEvent(event: RealtimeEvent) {
    const key = `${event.entity}:${event.entityId}`;
    this.eventCache.set(key, event);

    if (this.eventCache.size > this.cacheSizeLimit) {
      const firstKey = this.eventCache.keys().next().value;
      if (firstKey !== undefined) this.eventCache.delete(firstKey);
    }
  }

  private broadcastEvent(event: RealtimeEvent) {
    for (const client of this.clients.values()) {
      if (client.entities.has(event.entity)) {
        client.sendEvent(event);
      }
    }
  }

  registerClient(clientId: string, sendEvent: (event: RealtimeEvent) => void): string {
    const subscription: ClientSubscription = {
      clientId,
      entities: new Set(),
      sendEvent,
    };
    this.clients.set(clientId, subscription);
    return clientId;
  }

  unregisterClient(clientId: string) {
    this.clients.delete(clientId);
  }

  subscribe(clientId: string, entities: string[]) {
    const client = this.clients.get(clientId);
    if (!client) return;

    entities.forEach(entity => client.entities.add(entity));
  }

  unsubscribe(clientId: string, entities: string[]) {
    const client = this.clients.get(clientId);
    if (!client) return;

    entities.forEach(entity => client.entities.delete(entity));
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getCachedEvent(entity: string, entityId: string): RealtimeEvent | undefined {
    return this.eventCache.get(`${entity}:${entityId}`);
  }

  async shutdown() {
    if (this.listenConnection) {
      try {
        await this.listenConnection.query('UNLISTEN entity_changed');
        this.listenConnection.release();
      } catch (error) {
        console.error('[Realtime] Error during shutdown:', error);
      }
    }
  }
}

export const realtimeServer = new RealtimeServer();
