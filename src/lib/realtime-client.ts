import { RealtimeEvent } from './realtime-server';

interface RealtimeSubscriber {
  callback: (event: RealtimeEvent) => void;
  entities: Set<string>;
}

class RealtimeClient {
  private eventSource: EventSource | null = null;
  private subscribers: Map<string, RealtimeSubscriber> = new Map();
  private subscribedEntities: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private eventCache: Map<string, RealtimeEvent> = new Map();

  async connect(entities: string[] = []) {
    if (this.isConnecting || this.eventSource) return;

    this.isConnecting = true;
    try {
      const entitiesQuery = encodeURIComponent(JSON.stringify(entities));
      const url = `/api/realtime-subscribe?entities=${entitiesQuery}`;

      this.eventSource = new EventSource(url);

      this.eventSource.addEventListener('message', (event) => {
        this.handleMessage(event);
      });

      this.eventSource.addEventListener('error', () => {
        this.handleDisconnect();
      });

      this.subscribedEntities = new Set(entities);
      this.reconnectAttempts = 0;
      console.log('[RealtimeClient] Connected to real-time server');
    } catch (error) {
      console.error('[RealtimeClient] Connection error:', error);
      this.handleDisconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private handleMessage(event: MessageEvent) {
    try {
      const realtimeEvent: RealtimeEvent = JSON.parse(event.data);

      this.cacheEvent(realtimeEvent);
      this.notifySubscribers(realtimeEvent);
    } catch (error) {
      console.error('[RealtimeClient] Error parsing message:', error);
    }
  }

  private cacheEvent(event: RealtimeEvent) {
    const key = `${event.entity}:${event.entityId}`;
    this.eventCache.set(key, event);
  }

  private notifySubscribers(event: RealtimeEvent) {
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.entities.has(event.entity)) {
        try {
          subscriber.callback(event);
        } catch (error) {
          console.error('[RealtimeClient] Error in subscriber callback:', error);
        }
      }
    }
  }

  private handleDisconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        30000
      );

      console.log(
        `[RealtimeClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
      );

      setTimeout(() => {
        this.connect(Array.from(this.subscribedEntities));
      }, delay);
    } else {
      console.error('[RealtimeClient] Max reconnection attempts reached');
    }
  }

  subscribe(
    entities: string[],
    callback: (event: RealtimeEvent) => void
  ): string {
    const subscriberId = `subscriber_${Date.now()}_${Math.random()}`;

    this.subscribers.set(subscriberId, {
      callback,
      entities: new Set(entities),
    });

    // Add new entities to subscription
    const newEntities = entities.filter(e => !this.subscribedEntities.has(e));
    if (newEntities.length > 0) {
      this.subscribedEntities = new Set([...this.subscribedEntities, ...newEntities]);
      // Reconnect with new entities
      if (this.eventSource) {
        this.disconnect();
        this.connect(Array.from(this.subscribedEntities));
      }
    }

    return subscriberId;
  }

  unsubscribe(subscriberId: string) {
    this.subscribers.delete(subscriberId);

    // If no subscribers left for certain entities, remove them
    const usedEntities = new Set<string>();
    for (const subscriber of this.subscribers.values()) {
      subscriber.entities.forEach(e => usedEntities.add(e));
    }

    const unusedEntities = Array.from(this.subscribedEntities).filter(
      e => !usedEntities.has(e)
    );

    if (unusedEntities.length > 0) {
      this.subscribedEntities = usedEntities;
      // Reconnect with updated entities
      if (this.eventSource) {
        this.disconnect();
        this.connect(Array.from(this.subscribedEntities));
      }
    }
  }

  getCachedEvent(entity: string, entityId: string): RealtimeEvent | undefined {
    return this.eventCache.get(`${entity}:${entityId}`);
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.subscribers.clear();
    this.subscribedEntities.clear();
    this.reconnectAttempts = 0;
    console.log('[RealtimeClient] Disconnected from real-time server');
  }

  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }
}

export const realtimeClient = new RealtimeClient();
