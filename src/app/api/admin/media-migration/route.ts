import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import {
  migrationStatus,
  migrateTableBatch,
  verifyTableSample,
  clearByteaForTable,
} from '@/lib/services/mediaMigrationService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/media-migration — vận hành di trú BYTEA → MinIO từ BÊN TRONG app
 * (DB prod chỉ với tới được từ mạng nội bộ container, không chạy script từ ngoài được).
 *
 * Gate: header x-migration-secret PHẢI khớp env MEDIA_MIGRATION_SECRET (không set env → 503,
 * route coi như tắt). Không đi qua RBAC user vì đây là thao tác hạ tầng một lần.
 *
 * Body: { op: 'status' | 'migrate' | 'verify' | 'issues' | 'clear-bytea', table?, maxRows? }
 * - migrate: xử lý tối đa maxRows (mặc định 100) record/lượt — caller lặp tới remaining=0.
 * - clear-bytea: chỉ chạy được khi bảng đã di trú 100% (service tự chặn).
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.MEDIA_MIGRATION_SECRET;
    if (!secret) return NextResponse.json({ error: 'Route chưa được bật (thiếu MEDIA_MIGRATION_SECRET)' }, { status: 503 });
    if (request.headers.get('x-migration-secret') !== secret) {
      return NextResponse.json({ error: 'Sai secret' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const op = String(body?.op || 'status');
    const table = body?.table ? String(body.table) : null;

    if (op === 'status') {
      return NextResponse.json({ success: true, data: await migrationStatus() });
    }
    if (op === 'issues') {
      const rows = await query(
        `SELECT source_table, reason, COUNT(*)::int AS n FROM media_migration_issues
          WHERE resolved_at IS NULL GROUP BY source_table, reason ORDER BY source_table`
      );
      return NextResponse.json({ success: true, data: rows });
    }
    if (op === 'db-size') {
      // Dung lượng DB + top bảng theo kích thước vật lý (kèm toast/main size để thấy phần BYTEA đã giải phóng).
      const db = await queryOne<{ size: string }>(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`);
      const tables = await query(
        `SELECT relname AS table,
                pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
                pg_size_pretty(pg_relation_size(c.oid)) AS heap,
                pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid), 0)) AS toast
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
          ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 15`
      );
      return NextResponse.json({ success: true, data: { database: db?.size, tables } });
    }
    if (!table) return NextResponse.json({ error: 'Thiếu table' }, { status: 400 });

    if (op === 'migrate') {
      const maxRows = Math.min(Number(body?.maxRows) || 100, 500);
      return NextResponse.json({ success: true, data: await migrateTableBatch(table, maxRows) });
    }
    if (op === 'verify') {
      return NextResponse.json({ success: true, data: await verifyTableSample(table, Number(body?.sampleSize) || 5) });
    }
    if (op === 'clear-bytea') {
      return NextResponse.json({ success: true, data: await clearByteaForTable(table) });
    }
    return NextResponse.json({ error: `op không hợp lệ: ${op}` }, { status: 400 });
  } catch (err) {
    console.error('POST /api/admin/media-migration error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 500 });
  }
}
