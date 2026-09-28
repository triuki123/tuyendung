import https from 'https';
import { getZimbraConfig } from './config';
import { ZimbraError } from './types';

interface TokenEntry {
  token: string;
  expiresAt: number;
}

// Two-variable single-flight: inflight coalesces concurrent AuthRequests;
// cached holds the last valid token separate from the inflight promise so
// expiry-race (N callers see expired cached, each sets inflight to null) cannot spawn N auths.
let inflight: Promise<TokenEntry> | null = null;
let cached: TokenEntry | null = null;

function buildAgent() {
  const cfg = getZimbraConfig();
  return new https.Agent({
    rejectUnauthorized: cfg.rejectUnauthorized,
    ...(cfg.caCert ? { ca: cfg.caCert } : {}),
  });
}

function post(url: string, body: unknown, agent: https.Agent): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 7071,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            reject(new Error('Zimbra: invalid JSON response'));
          }
        });
      }
    );

    // 6-second timeout per request
    const timer = setTimeout(() => {
      req.destroy(new Error('Zimbra: request timeout'));
    }, 6000);

    req.on('response', () => clearTimeout(timer));
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
    req.write(payload);
    req.end();
  });
}

async function authenticate(): Promise<TokenEntry> {
  const cfg = getZimbraConfig();
  const agent = buildAgent();

  const envelope = {
    Header: { context: { _jsns: 'urn:zimbra' } },
    Body: {
      AuthRequest: {
        _jsns: 'urn:zimbraAdmin',
        name: { _content: cfg.adminUser },
        password: { _content: cfg.adminPassword },
      },
    },
  };

  const resp = (await post(cfg.adminUrl, envelope, agent)) as Record<string, any>;
  const fault = resp?.Body?.Fault;
  if (fault) {
    throw new ZimbraError(
      fault?.Detail?.Error?.Code ?? 'UNKNOWN',
      fault?.Reason?.Text ?? 'Auth failed'
    );
  }

  const authResp = resp?.Body?.AuthResponse;
  const token: string = authResp?.authToken?.[0]?._content;
  if (!token) throw new ZimbraError('NO_TOKEN', 'AuthResponse missing authToken');

  // Default 12 h if lifetime absent; cache at 90% of lifetime
  const lifetimeMs: number = authResp?.lifetime ?? 43_200_000;
  const expiresAt = Date.now() + lifetimeMs * 0.9;

  return { token, expiresAt };
}

async function getToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  if (!inflight) {
    inflight = authenticate()
      .then((entry) => { cached = entry; inflight = null; return entry; })
      .catch((err) => { inflight = null; throw err; });
  }
  return (await inflight).token;
}

export async function callAdmin<TRes = any>(
  op: string,
  payload: Record<string, unknown>
): Promise<TRes> {
  const cfg = getZimbraConfig();
  const agent = buildAgent();

  const doCall = async (token: string): Promise<TRes> => {
    const envelope = {
      Header: { context: { _jsns: 'urn:zimbra', authToken: token } },
      Body: { [`${op}Request`]: { _jsns: 'urn:zimbraAdmin', ...payload } },
    };

    const resp = (await post(cfg.adminUrl, envelope, agent)) as Record<string, any>;
    const fault = resp?.Body?.Fault;
    if (fault) {
      const code: string = fault?.Detail?.Error?.Code ?? 'UNKNOWN';
      const reason: string = fault?.Reason?.Text ?? 'SOAP fault';
      throw new ZimbraError(code, reason);
    }

    return resp?.Body as TRes;
  };

  const token = await getToken();
  try {
    return await doCall(token);
  } catch (err) {
    // Retry once on stale auth token
    if (
      err instanceof ZimbraError &&
      (err.code === 'service.AUTH_EXPIRED' || err.code === 'service.AUTH_REQUIRED')
    ) {
      cached = null;
      const freshToken = await getToken();
      return doCall(freshToken);
    }
    throw err;
  }
}
