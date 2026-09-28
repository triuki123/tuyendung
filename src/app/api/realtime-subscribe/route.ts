import { NextRequest, NextResponse } from 'next/server';
import { realtimeServer, RealtimeEvent } from '@/lib/realtime-server';
import { pool } from '@/lib/db';

// Simple ID generator
const generateId = () => Math.random().toString(36).substr(2, 9);

export async function GET(request: NextRequest) {
  const clientId = generateId();

  try {
    // Initialize realtime server
    await realtimeServer.initialize(pool);

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
      start(controller) {
        // Send welcome
        const welcome = JSON.stringify({
          id: generateId(),
          type: 'insert',
          entity: 'system',
          entityId: 'connected',
          data: { clientId },
          timestamp: Date.now(),
        });

        try {
          controller.enqueue(encoder.encode(`data: ${welcome}\n\n`));
        } catch (error) {
          console.error('[SSE] Enqueue error:', error);
        }

        // Register send function
        const sendEvent = (event: RealtimeEvent) => {
          if (!closed) {
            try {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));
            } catch (error) {
              console.error('[SSE] Send error:', error);
              closed = true;
              controller.close();
            }
          }
        };

        realtimeServer.registerClient(clientId, sendEvent);

        // Get entities
        const entitiesParam = request.nextUrl.searchParams.get('entities');
        const entities = entitiesParam ? JSON.parse(entitiesParam) : [];
        if (entities.length > 0) {
          realtimeServer.subscribe(clientId, entities);
        }

        // Timeout 30 min
        const timeoutId = setTimeout(() => {
          closed = true;
          realtimeServer.unregisterClient(clientId);
          controller.close();
        }, 30 * 60 * 1000);

        // Handle disconnect
        request.signal.addEventListener('abort', () => {
          closed = true;
          clearTimeout(timeoutId);
          realtimeServer.unregisterClient(clientId);
          try {
            controller.close();
          } catch (e) {
            // Already closed
          }
        });
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[SSE] Error:', error);
    return NextResponse.json(
      { error: 'SSE initialization failed' },
      { status: 500 }
    );
  }
}
