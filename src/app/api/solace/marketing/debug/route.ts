import { NextRequest, NextResponse } from 'next/server';
import { guardSolaceSuperAdmin } from '@/lib/solaceApiGuard';
import { getBotInfo, getWebhookInfo } from '@/lib/solace/solaceBot';
import { countActiveSubscribers, listActiveSubscriberChatIds } from '@/lib/solace/solaceBotService';
import { query } from '@/lib/db';

/** GET /api/solace/marketing/debug — chẩn đoán bot Solace (super_admin hoặc CRON_SECRET). */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('x-cron-secret');
    const hasCronAuth = cronSecret && authHeader === cronSecret;

    if (!hasCronAuth) {
      const g = await guardSolaceSuperAdmin(request);
      if (g instanceof NextResponse) return g;
    }

    const [botInfo, webhookInfo, subscriberCount, sampleIds, recentBroadcasts] = await Promise.all([
      getBotInfo(),
      getWebhookInfo(),
      countActiveSubscribers(),
      listActiveSubscriberChatIds().then(ids => ids.slice(0, 5)),
      query<{ id: string; status: string; total_count: number; sent_count: number; failed_count: number; sent_at: string | null }>(
        `SELECT id, status, total_count, sent_count, failed_count, sent_at
           FROM marketing_broadcasts ORDER BY created_at DESC LIMIT 5`
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        token_set: !!process.env.SOLACE_BOT_TOKEN,
        token_prefix: process.env.SOLACE_BOT_TOKEN ? `${process.env.SOLACE_BOT_TOKEN.slice(0, 8)}...` : null,
        bot: botInfo,
        webhook: webhookInfo,
        subscribers: { count: subscriberCount, sample_chat_ids: sampleIds },
        recent_broadcasts: recentBroadcasts,
      },
    });
  } catch (err) {
    console.error('GET /api/solace/marketing/debug error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
