/**
 * ADMS Passthrough — các endpoint phụ của giao thức push ZKTeco/Ronald Jack
 *
 * Máy gọi định kỳ ngoài /iclock/cdata:
 *   GET  /iclock/getrequest?SN=...  — hỏi server có lệnh gì không (trả "OK" = không có lệnh)
 *   POST /iclock/devicecmd?SN=...   — báo kết quả thực thi lệnh
 *   GET  /iclock/ping               — keepalive
 *
 * Tất cả được rewrite về đây (next.config.mjs). Trả "OK" plain-text để máy
 * không báo lỗi kết nối; dữ liệu chấm công thật đi qua /iclock/cdata → adms/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ok = () =>
  new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

export async function GET(request: NextRequest) {
  const sn = new URL(request.url).searchParams.get('SN') ?? 'UNKNOWN';
  console.log(`[ADMS] Passthrough GET từ máy SN=${sn} (${request.nextUrl.pathname})`);
  return ok();
}

export async function POST(request: NextRequest) {
  const sn = new URL(request.url).searchParams.get('SN') ?? 'UNKNOWN';
  console.log(`[ADMS] Passthrough POST từ máy SN=${sn} (${request.nextUrl.pathname})`);
  return ok();
}
