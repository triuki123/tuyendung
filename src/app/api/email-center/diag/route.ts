import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns/promises';
import net from 'net';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function tcpTest(ip: string, port: number, timeoutMs = 5000): Promise<{ ok: boolean; ms: number; err?: string }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (ok: boolean, err?: string) => {
      if (done) return; done = true;
      try { s.destroy(); } catch {}
      resolve({ ok, ms: Date.now() - start, err });
    };
    s.setTimeout(timeoutMs);
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false, 'timeout'));
    s.once('error', (e: any) => fin(false, e?.code || e?.message));
    try { s.connect(port, ip); } catch (e: any) { fin(false, e?.message); }
  });
}

/**
 * GET /api/email-center/diag — chẩn đoán network toàn diện từ container.
 * Test:
 *  - Egress IP (whatismyip)
 *  - DNS resolve mail.miczone.vn
 *  - TCP tới nhiều port của Miczone (25/465/587/993/143) — chứng minh IP có block toàn bộ hay chỉ 465
 *  - TCP tới đích khác (google, cloudflare) — chứng minh container ra được internet
 */
export async function GET(request: NextRequest) {
  const role = request.headers.get('x-current-user-role');
  if (role !== 'super_admin') return NextResponse.json({ error: 'Chỉ Super Admin' }, { status: 403 });

  const host = request.nextUrl.searchParams.get('host') || 'mail.miczone.vn';
  const out: any = { host, tests: [] };

  // Egress IP
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
    out.egressIp = (await r.json()).ip;
  } catch (e: any) { out.egressIpErr = e?.message; }

  // DNS
  try {
    const v4 = await dns.lookup(host, { family: 4, all: true });
    out.dnsV4 = v4;
  } catch (e: any) { out.dnsErr = e?.message; }

  const ip = Array.isArray(out.dnsV4) && out.dnsV4[0]?.address;
  if (ip) {
    out.testedIp = ip;
    // Test nhiều port của Miczone
    for (const p of [25, 465, 587, 993, 143, 80, 443]) {
      const r = await tcpTest(ip, p, 4000);
      out.tests.push({ target: `miczone:${p}`, ip, port: p, ...r });
    }
  }

  // Test đích khác — chứng minh container ra internet được
  const alt = [
    { name: 'google', ip: '142.250.198.14', port: 443 },
    { name: 'cloudflare', ip: '1.1.1.1', port: 443 },
    { name: 'aws-ses-ap-southeast-2', host: 'email-smtp.ap-southeast-2.amazonaws.com', port: 465 },
    { name: 'gmail-smtp', host: 'smtp.gmail.com', port: 465 },
  ];
  for (const t of alt) {
    let targetIp = (t as any).ip;
    if (!targetIp && (t as any).host) {
      try { targetIp = (await dns.lookup((t as any).host, { family: 4 })).address; } catch {}
    }
    if (!targetIp) { out.tests.push({ target: t.name, err: 'dns fail' }); continue; }
    const r = await tcpTest(targetIp, t.port, 4000);
    out.tests.push({ target: t.name, ip: targetIp, port: t.port, ...r });
  }

  return NextResponse.json({ success: true, data: out });
}
