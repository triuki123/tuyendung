import { NextResponse } from 'next/server';
import { clearWorkerCookie } from '@/lib/warehouse/workerAuth';

export const dynamic = 'force-dynamic';

export async function POST() {
  return clearWorkerCookie(NextResponse.json({ success: true }));
}
