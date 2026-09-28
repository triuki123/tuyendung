'use client';

/**
 * Khóa BMHS phía client cho module Pháp Chế — copy khuôn BmhsProvider (nhan-su).
 * Vá window.fetch: API trả 403 { requireLegalLock, entityType, entityId } → tự bật
 * modal nhập mật khẩu → POST /api/legal/lock/verify lấy vé 60s → retry kèm header
 * x-bmhs-token. Vé cache ~55s theo (entityType:entityId) — 1 lần mở nhiều request
 * chỉ nhập 1 lần.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Lock, X } from 'lucide-react';

interface PromptState { entityType: string; entityId: string }

const keyOf = (p: PromptState) => `${p.entityType}:${p.entityId}`;

export default function LegalLockProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const tokenCache = useRef<Map<string, { token: string; exp: number }>>(new Map());
  const pending = useRef<Map<string, { promise: Promise<string | null>; resolve: (t: string | null) => void }>>(new Map());

  const ensureToken = useCallback((p: PromptState): Promise<string | null> => {
    const k = keyOf(p);
    const cached = tokenCache.current.get(k);
    if (cached && Date.now() < cached.exp) return Promise.resolve(cached.token);
    const inflight = pending.current.get(k);
    if (inflight) return inflight.promise;
    let resolve!: (t: string | null) => void;
    const promise = new Promise<string | null>((r) => { resolve = r; });
    pending.current.set(k, { promise, resolve });
    setPrompt((cur) => cur ?? p);
    return promise;
  }, []);

  const settle = useCallback((p: PromptState, token: string | null) => {
    const k = keyOf(p);
    const pd = pending.current.get(k);
    if (pd) { pd.resolve(token); pending.current.delete(k); }
    if (token) tokenCache.current.set(k, { token, exp: Date.now() + 55_000 });
  }, []);

  useEffect(() => {
    const orig = window.fetch.bind(window);
    const patched: typeof window.fetch = async (input, init) => {
      const hdrs = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (hdrs.get('x-bmhs-retry')) return orig(input, init);

      const res = await orig(input, init);
      if (res.status !== 403) return res;
      let body: any = null;
      try { body = await res.clone().json(); } catch { return res; }
      if (!body?.requireLegalLock || !body?.entityType || !body?.entityId) return res;

      const token = await ensureToken({ entityType: String(body.entityType), entityId: String(body.entityId) });
      if (!token) return res;   // user hủy → giữ nguyên 403

      const retryHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      retryHeaders.set('x-bmhs-token', token);
      retryHeaders.set('x-bmhs-retry', '1');
      if (input instanceof Request) return orig(new Request(input, { headers: retryHeaders }));
      return orig(input, { ...(init || {}), headers: retryHeaders });
    };
    window.fetch = patched;
    return () => { window.fetch = orig; };
  }, [ensureToken]);

  const submit = useCallback(async () => {
    if (!prompt || !pwd) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/legal/lock/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bmhs-retry': '1' },
        body: JSON.stringify({ entityType: prompt.entityType, entityId: prompt.entityId, password: pwd }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) { setErr(j.error || 'Mật khẩu không đúng'); setBusy(false); return; }
      settle(prompt, j.token);
      setPrompt(null); setPwd(''); setBusy(false);
    } catch {
      setErr('Lỗi kết nối'); setBusy(false);
    }
  }, [prompt, pwd, settle]);

  const cancel = useCallback(() => {
    if (prompt) settle(prompt, null);
    setPrompt(null); setPwd(''); setErr(''); setBusy(false);
  }, [prompt, settle]);

  return (
    <>
      {children}
      {prompt && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden"
            style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="flex items-center gap-2 text-base font-700 text-foreground">
                <Lock className="h-4 w-4 text-amber-400" /> Hồ sơ pháp chế được bảo mật
              </h2>
              <button onClick={cancel} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Bản ghi này được khóa BMHS. Nhập mật khẩu để xem/tải file hoặc chỉnh sửa.
              </p>
              <div>
                <label className="mb-1.5 block text-2xs font-600 text-muted-foreground uppercase tracking-wider">Mật khẩu</label>
                <input type="password" autoFocus value={pwd}
                  onChange={(e) => { setPwd(e.target.value); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                  className="w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground outline-none focus:border-indigo-500"
                  placeholder="Nhập mật khẩu bảo mật" />
                {err && <p className="mt-1.5 text-xs text-red-400">{err}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button onClick={cancel} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Hủy</button>
              <button onClick={() => void submit()} disabled={!pwd || busy}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Mở khóa
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
