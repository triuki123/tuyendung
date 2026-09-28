import { NextRequest, NextResponse } from 'next/server';
import { getMinigameConfig, saveMinigameConfig } from '@/lib/services/solaceSettingsService';
import { mergeMinigame } from '@/lib/config/solaceConfig';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-minigame', 'view');
    if (g instanceof NextResponse) return g;
    return NextResponse.json({ success: true, data: await getMinigameConfig() });
  } catch (err) {
    console.error('GET /api/solace/minigame/config error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-minigame', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    await saveMinigameConfig(mergeMinigame(body), g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
