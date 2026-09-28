import { NextRequest, NextResponse } from 'next/server';
import { claimMinigame } from '@/lib/services/solaceMinigameService';
import { requireLogin } from '@/lib/solaceApiGuard';

// POST /api/solace/minigame/claim — khách quét QR minigame, nhận mã thưởng nếu đến sớm hợp lệ.
export async function POST(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const data = await claimMinigame(auth.userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
