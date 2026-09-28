import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Send welcome message
        const welcome = JSON.stringify({
          type: 'system',
          message: 'SSE Connected',
          timestamp: Date.now(),
        });

        controller.enqueue(encoder.encode(`data: ${welcome}\n\n`));

        // Close after 5 seconds for testing
        setTimeout(() => {
          controller.close();
        }, 5000);
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[SSE] Error:', error);
    return NextResponse.json(
      { error: 'SSE Error' },
      { status: 500 }
    );
  }
}
