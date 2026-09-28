import { useEffect, useState, useCallback, useRef } from 'react';
import { realtimeClient } from '@/lib/realtime-client';
import { RealtimeEvent } from '@/lib/realtime-server';

interface UseRealtimeDataOptions {
  enabled?: boolean;
  onUpdate?: (event: RealtimeEvent) => void;
  onError?: (error: Error) => void;
}

export function useRealtimeData(
  entities: string[],
  options: UseRealtimeDataOptions = {}
) {
  const {
    enabled = true,
    onUpdate,
    onError,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const subscriberIdRef = useRef<string | null>(null);
  const entitiesRef = useRef<string[]>(entities);

  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  useEffect(() => {
    if (!enabled || entities.length === 0) return;

    // Ensure client is connected
    if (!realtimeClient.isConnected()) {
      realtimeClient.connect(entities);
    }

    // Subscribe to entity updates
    const subscriberId = realtimeClient.subscribe(
      entities,
      (event: RealtimeEvent) => {
        setIsConnected(true);

        if (onUpdate) {
          try {
            onUpdate(event);
          } catch (error) {
            console.error('[useRealtimeData] Error in onUpdate callback:', error);
            if (onError && error instanceof Error) {
              onError(error);
            }
          }
        }
      }
    );

    subscriberIdRef.current = subscriberId;

    // Connection state is informational. A low-frequency check avoids a timer
    // per second for every screen using realtime data.
    const connectionCheckInterval = setInterval(() => {
      const next = realtimeClient.isConnected();
      setIsConnected((current) => current === next ? current : next);
    }, 15_000);

    return () => {
      clearInterval(connectionCheckInterval);
      if (subscriberIdRef.current) {
        realtimeClient.unsubscribe(subscriberIdRef.current);
      }
    };
  }, [enabled, entities, onUpdate, onError]);

  return {
    isConnected,
    getCachedEvent: useCallback(
      (entity: string, entityId: string) => {
        return realtimeClient.getCachedEvent(entity, entityId);
      },
      []
    ),
  };
}

export function useRealtimeUpdate<T>(
  entity: string,
  entityId: string,
  initialData: T,
  options: UseRealtimeDataOptions = {}
): [T, boolean] {
  const [data, setData] = useState<T>(initialData);

  const handleUpdate = useCallback((event: RealtimeEvent) => {
    if (event.entity === entity && event.entityId === entityId) {
      if (event.data) {
        setData(prev => ({ ...prev, ...event.data }));
      } else if (event.type === 'delete') {
        setData(initialData);
      }
    }
  }, [entity, entityId, initialData]);

  const { isConnected } = useRealtimeData(
    [entity],
    {
      ...options,
      onUpdate: handleUpdate,
    }
  );

  return [data, isConnected];
}
