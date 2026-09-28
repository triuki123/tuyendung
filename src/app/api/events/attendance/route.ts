import { NextRequest, NextResponse } from 'next/server';
import { attendanceBroadcaster } from '@/lib/attendanceBroadcaster';

export const dynamic = 'force-dynamic';

const enc = new TextEncoder();
const generateClientId = () => Math.random().toString(36).substr(2, 9);

/**
 * SSE Endpoint — Clients subscribe để nhận attendance events realtime
 * GET /api/events/attendance
 */
export async function GET(request: NextRequest) {
  const clientId = generateClientId();

  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  const stream = new ReadableStream({
    start(controller) {
      console.log(`[SSE] Client ${clientId} connected`);

      // Gửi initial ping để browser kích hoạt EventSource 'open'
      controller.enqueue(enc.encode(': ping\n\n'));

      // Register subscriber
      const unsubscribe = attendanceBroadcaster.subscribe(clientId, (data: string) => {
        try {
          controller.enqueue(enc.encode(data));
        } catch {
          cleanup();
        }
      });

      // Keepalive mỗi 15s — giữ kết nối, tránh timeout proxy/browser
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(enc.encode(': keepalive\n\n'));
        } catch {
          cleanup();
        }
      }, 15000);

      function cleanup() {
        clearInterval(keepalive);
        unsubscribe();
        try { controller.close(); } catch { /* đã đóng */ }
        console.log(`[SSE] Client ${clientId} disconnected`);
      }

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new NextResponse(stream, { headers });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('X-Debug') !== 'true') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    subscribers: attendanceBroadcaster.getSubscriberCount(),
    recentEvents: attendanceBroadcaster.getHistory(60000),
  });
}
