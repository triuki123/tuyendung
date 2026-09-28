/**
 * instrumentation.ts — Next.js server startup hook
 *
 * File này được Next.js gọi MỘT LẦN khi server Node.js khởi động.
 * Đây là cơ chế chính thức để khởi động background services (ZKTeco poller...).
 *
 * Yêu cầu: next.config.mjs phải có experimental.instrumentationHook = true
 * Tài liệu: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // FDV and notification delivery are required even in recruitment-only mode.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startFdvReminders } = await import('@/lib/services/fdvService');
    startFdvReminders();
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const { startNotificationOutboxScheduler } = await import('@/lib/notifications/outboxScheduler');
      startNotificationOutboxScheduler();
    }
  }
  // A recruitment-only workspace does not use attendance or other operations schedulers.
  if (process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true') return;

  // A local recruitment workspace does not need the application's fleet of
  // background schedulers. Keeping them off avoids competing with CV parsing
  // and PostgreSQL connections while preserving all request-driven workflows.
  const isLightweightLocal = process.env.LOCAL_DEV_BYPASS_AUTH === 'true'
    && process.env.LOCAL_DEV_BACKGROUND_SERVICES !== 'true';
  if (isLightweightLocal) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import server.ts — module tự chạy startAttendanceServices() fire-and-forget
    // Không gọi lại ở đây để tránh khởi động 2 poller ZKTeco song song
    await import('@/server');
  }
}
