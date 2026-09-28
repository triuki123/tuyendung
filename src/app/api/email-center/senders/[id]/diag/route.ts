import { NextRequest, NextResponse } from 'next/server';
import { getSender } from '@/lib/services/emailCenterService';
import { requireAction } from '../../../_perm';
import dns from 'dns/promises';
import net from 'net';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/email-center/senders/[id]/diag
 * Diagnostic:
 *  1) DNS lookup của smtp_host → liệt kê IPs
 *  2) TCP connect tới từng IP:port với timeout 5s
 * Không gửi email; chỉ chẩn đoán ECONNREFUSED.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireAction(request, 'manage');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const s = await getSender(params.id);
  if (!s) return NextResponse.json({ error: 'Không tìm thấy sender' }, { status: 404 });
  if (s.engine !== 'smtp' || !s.smtp_host) return NextResponse.json({ error: 'Sender không phải SMTP' }, { status: 400 });
  const host = s.smtp_host;
  const port = s.smtp_port || (s.smtp_secure ? 465 : 587);

  const out: any = { host, port, dns: {}, connects: [] };

  // 1) DNS
  try {
    const [v4, v6] = await Promise.allSettled([
      dns.lookup(host, { family: 4, all: true }),
      dns.lookup(host, { family: 6, all: true }),
    ]);
    out.dns.v4 = v4.status === 'fulfilled' ? v4.value : { error: (v4 as any).reason?.message };
    out.dns.v6 = v6.status === 'fulfilled' ? v6.value : { error: (v6 as any).reason?.message };
  } catch (e: any) {
    out.dns.error = e?.message;
  }

  // 2) TCP connect test mỗi IP (v4 + v6)
  const ips: Array<{ address: string; family: number }> = [];
  if (Array.isArray(out.dns.v4)) ips.push(...(out.dns.v4 as any[]));
  if (Array.isArray(out.dns.v6)) ips.push(...(out.dns.v6 as any[]));

  for (const ip of ips) {
    const start = Date.now();
    const r = await new Promise<{ ip: string; family: number; ok: boolean; ms: number; err?: string }>((resolve) => {
      const sock = new net.Socket();
      let done = false;
      const finish = (ok: boolean, err?: string) => {
        if (done) return; done = true;
        try { sock.destroy(); } catch {}
        resolve({ ip: ip.address, family: ip.family, ok, ms: Date.now() - start, err });
      };
      sock.setTimeout(5000);
      sock.once('connect', () => finish(true));
      sock.once('timeout', () => finish(false, 'timeout'));
      sock.once('error', (e: any) => finish(false, e?.code || e?.message));
      try { sock.connect(port, ip.address); } catch (e: any) { finish(false, e?.message); }
    });
    out.connects.push(r);
  }

  return NextResponse.json({ success: true, data: out });
}
