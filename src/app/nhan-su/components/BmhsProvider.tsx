'use client';

/**
 * BMHS client — Bảo Mật Hồ Sơ.
 * Chặn ở tầng fetch: khi API trả 403 { requireBmhs:true, employeeId }, tự hiện modal
 * nhập mật khẩu → lấy vé mở khóa (60s) → thử lại request kèm header x-bmhs-token.
 * Nhờ vậy MỌI fetch xem hồ sơ tự được gate mà không phải sửa từng nơi gọi.
 * Vé được cache ~55s theo employeeId để 1 lần mở hồ sơ (nhiều request) chỉ nhập 1 lần.
 */
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Lock, X } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface BmhsCtx {
  /** Tải file (tự gate qua fetch đã vá). */
  download: (url: string, filename?: string) => Promise<void>;
  /** Mở blob (PDF/ảnh) trong tab/URL tạm — trả objectURL hoặc null nếu bị hủy. */
  openBlobUrl: (url: string) => Promise<string | null>;
}
const Ctx = createContext<BmhsCtx | null>(null);
export const useBmhs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useBmhs phải nằm trong <BmhsProvider>');
  return c;
};

function filenameFromDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function BmhsProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState<{ employeeId: string } | null>(null);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Cache vé + promise đang chờ theo employeeId.
  const tokenCache = useRef<Map<string, { token: string; exp: number }>>(new Map());
  const pending = useRef<Map<string, { promise: Promise<string | null>; resolve: (t: string | null) => void }>>(new Map());
  const resolverRef = useRef<((t: string | null) => void) | null>(null);

  /** Lấy vé cho employeeId: dùng cache còn hạn, hoặc mở modal (dedupe). */
  const ensureToken = useCallback((employeeId: string): Promise<string | null> => {
    const cached = tokenCache.current.get(employeeId);
    if (cached && Date.now() < cached.exp) return Promise.resolve(cached.token);
    const inflight = pending.current.get(employeeId);
    if (inflight) return inflight.promise;
    let resolve!: (t: string | null) => void;
    const promise = new Promise<string | null>((r) => { resolve = r; });
    pending.current.set(employeeId, { promise, resolve });
    // Mở modal cho employeeId này (nếu chưa có modal nào đang mở).
    setPrompt((cur) => cur ?? { employeeId });
    return promise;
  }, []);

  const settle = useCallback((employeeId: string, token: string | null) => {
    const p = pending.current.get(employeeId);
    if (p) { p.resolve(token); pending.current.delete(employeeId); }
    if (token) tokenCache.current.set(employeeId, { token, exp: Date.now() + 55_000 });
  }, []);

  // Vá window.fetch khi provider mounted.
  useEffect(() => {
    const orig = window.fetch.bind(window);
    const patched: typeof window.fetch = async (input, init) => {
      // Bỏ qua request đã là lần thử lại (tránh lặp vô hạn).
      const hdrs = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (hdrs.get('x-bmhs-retry')) return orig(input, init);

      const res = await orig(input, init);
      if (res.status !== 403) return res;
      let body: any = null;
      try { body = await res.clone().json(); } catch { return res; }
      if (!body?.requireBmhs || !body?.employeeId) return res;

      const token = await ensureToken(String(body.employeeId));
      if (!token) return res; // user hủy → giữ nguyên 403

      // Thử lại kèm vé.
      const retryHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      retryHeaders.set('x-bmhs-token', token);
      retryHeaders.set('x-bmhs-retry', '1');
      if (input instanceof Request) {
        return orig(new Request(input, { headers: retryHeaders }));
      }
      return orig(input, { ...(init || {}), headers: retryHeaders });
    };
    window.fetch = patched;
    return () => { window.fetch = orig; };
  }, [ensureToken]);

  const submit = useCallback(async () => {
    if (!prompt || !pwd) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/users/${prompt.employeeId}/bmhs/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bmhs-retry': '1' },
        body: JSON.stringify({ password: pwd }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) { setErr(j.error || 'Mật khẩu không đúng'); setBusy(false); return; }
      settle(prompt.employeeId, j.token);
      setPrompt(null); setPwd(''); setBusy(false);
    } catch {
      setErr('Lỗi kết nối'); setBusy(false);
    }
  }, [prompt, pwd, settle]);

  const cancel = useCallback(() => {
    if (prompt) settle(prompt.employeeId, null);
    setPrompt(null); setPwd(''); setErr(''); setBusy(false);
  }, [prompt, settle]);

  const download = useCallback(async (url: string, filename?: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) { toast.error('Không tải được tệp'); return; }
      const blob = await res.blob();
      const name = filename || filenameFromDisposition(res.headers.get('content-disposition')) || 'tai-lieu';
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch { toast.error('Lỗi tải tệp'); }
  }, [toast]);

  const openBlobUrl = useCallback(async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) { toast.error('Không mở được tệp'); return null; }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch { toast.error('Lỗi mở tệp'); return null; }
  }, [toast]);

  return (
    <Ctx.Provider value={{ download, openBlobUrl }}>
      {children}
      {prompt && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden"
            style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="flex items-center gap-2 text-base font-700 text-foreground"><Lock className="h-4 w-4 text-indigo-400" /> Hồ sơ được bảo mật</h2>
              <button onClick={cancel} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">Hồ sơ này được bảo mật. Nhập mật khẩu để xem/tải.</p>
              <div>
                <label className="mb-1.5 block text-2xs font-600 text-muted-foreground uppercase tracking-wider">Mật khẩu</label>
                <input type="password" autoFocus value={pwd}
                  onChange={(e) => { setPwd(e.target.value); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                  className="w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground outline-none focus:border-indigo-500"
                  placeholder="Nhập mật khẩu bảo mật hồ sơ" />
                {err && <p className="mt-1.5 text-xs text-red-400">{err}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button onClick={cancel} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={() => void submit()} disabled={!pwd || busy}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Mở khóa
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
