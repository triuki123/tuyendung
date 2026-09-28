'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import {
  Loader2, QrCode, Link2, Copy, Check, Download, Trash2, Power, ExternalLink, Clock, Infinity as InfinityIcon,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';

const QRCodeCanvas = dynamicImport(() => import('qrcode.react').then((m) => m.QRCodeCanvas), { ssr: false });

export const dynamic = 'force-dynamic';

type ExpiryKey = 'never' | '1h' | '1d' | '7d' | '30d' | 'custom';

const EXPIRY_OPTIONS: { key: ExpiryKey; label: string }[] = [
  { key: 'never', label: 'Vĩnh viễn' },
  { key: '1h', label: '1 giờ' },
  { key: '1d', label: '1 ngày' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: 'custom', label: 'Tùy chọn…' },
];

function computeExpiry(key: ExpiryKey, customLocal: string): string | null {
  const now = Date.now();
  if (key === 'never') return null;
  if (key === '1h') return new Date(now + 3600e3).toISOString();
  if (key === '1d') return new Date(now + 86400e3).toISOString();
  if (key === '7d') return new Date(now + 7 * 86400e3).toISOString();
  if (key === '30d') return new Date(now + 30 * 86400e3).toISOString();
  if (key === 'custom' && customLocal) return new Date(customLocal).toISOString();
  return null;
}

export default function TaoMaQrPage() {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [expiryKey, setExpiryKey] = useState<ExpiryKey>('never');
  const [customExpiry, setCustomExpiry] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrFor, setQrFor] = useState<any | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/short-links');
      const json = await res.json();
      setLinks(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const res = await fetch('/api/short-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, expiresAt: computeExpiry(expiryKey, customExpiry) }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Tạo thất bại'); return; }
      setUrl(''); setTitle(''); setExpiryKey('never'); setCustomExpiry('');
      setQrFor(json.data);
      load();
    } catch {
      setError('Lỗi kết nối, thử lại');
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (l: any) => {
    await fetch(`/api/short-links/${l.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !l.active }),
    });
    load();
  };
  const remove = async (id: string) => {
    await fetch(`/api/short-links/${id}`, { method: 'DELETE' });
    if (qrFor?.id === id) setQrFor(null);
    load();
  };

  return (
    <AppLayout activePath="/tao-ma-qr">
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 flex items-center gap-2"><QrCode className="h-6 w-6 text-indigo-400" /> Chuyển Link Thành Mã QR</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Rút gọn đường dẫn + tạo mã QR, đặt hạn dùng hoặc vĩnh viễn. Không quảng cáo.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* Form tạo */}
          <div className="rounded-2xl border border-white/5 p-5 space-y-4" style={{ background: 'var(--card)' }}>
            <form onSubmit={create} className="space-y-4">
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Đường dẫn cần tạo QR *</label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/10 bg-[#162033] px-3">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="dán link vào đây (vd fado.vn/tin-tuc)"
                    className="w-full bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Tên gợi nhớ (tùy chọn)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="vd: Menu quán, Wifi phòng họp…"
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/50" />
              </div>
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Hạn dùng</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {EXPIRY_OPTIONS.map((o) => (
                    <button type="button" key={o.key} onClick={() => setExpiryKey(o.key)}
                      className={`rounded-xl px-3 py-2 text-xs font-600 border ${expiryKey === o.key ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300' : 'border-white/10 text-muted-foreground'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {expiryKey === 'custom' && (
                  <input type="datetime-local" value={customExpiry} onChange={(e) => setCustomExpiry(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground" />
                )}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={creating || !url.trim() || (expiryKey === 'custom' && !customExpiry)}
                className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-600 text-white disabled:opacity-50 flex items-center justify-center gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Tạo mã QR
              </button>
            </form>
          </div>

          {/* Kết quả QR */}
          <div className="rounded-2xl border border-white/5 p-5 flex flex-col items-center justify-center text-center" style={{ background: 'var(--card)' }}>
            {qrFor ? (
              <QrResult link={qrFor} origin={origin} />
            ) : (
              <div className="text-muted-foreground py-8">
                <QrCode className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Mã QR sẽ hiện ở đây</p>
                <p className="text-xs mt-1 opacity-60">Tạo xong bấm tải hoặc in ra dùng</p>
              </div>
            )}
          </div>
        </div>

        {/* Danh sách link của tôi */}
        <div>
          <h2 className="text-lg font-700 text-foreground mb-3">Link của tôi</h2>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Link2 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Chưa có link nào</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5" style={{ background: 'var(--card)' }}>
              {links.map((l) => <LinkRow key={l.id} link={l} origin={origin} onQr={() => setQrFor(l)} onToggle={() => toggle(l)} onDelete={() => remove(l.id)} />)}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function expiryLabel(l: any): { text: string; expired: boolean } {
  if (!l.expires_at) return { text: 'Vĩnh viễn', expired: false };
  const d = new Date(l.expires_at);
  const expired = d.getTime() < Date.now();
  return { text: (expired ? 'Hết hạn ' : 'Đến ') + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }), expired };
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="btn-ghost rounded-lg p-2" title="Sao chép link">
      {done ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

function QrResult({ link, origin }: { link: any; origin: string }) {
  const shortUrl = `${origin}/s/${link.code}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const exp = expiryLabel(link);

  const download = () => {
    const canvas = wrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = (canvas as HTMLCanvasElement).toDataURL('image/png');
    a.download = `qr-${link.code}.png`;
    a.click();
  };

  return (
    <div className="w-full">
      <div ref={wrapRef} className="rounded-2xl bg-white p-4 inline-block">
        <QRCodeCanvas value={shortUrl} size={200} level="M" fgColor="#0B1F3B" bgColor="#FFFFFF" includeMargin />
      </div>
      {link.title && <p className="text-sm font-600 text-foreground mt-3">{link.title}</p>}
      <div className="mt-2 flex items-center justify-center gap-1.5">
        <a href={shortUrl} target="_blank" className="text-xs text-indigo-400 font-600 break-all">{shortUrl}</a>
        <CopyBtn text={shortUrl} />
      </div>
      <p className={`text-[11px] mt-1 flex items-center justify-center gap-1 ${exp.expired ? 'text-red-400' : 'text-muted-foreground'}`}>
        {link.expires_at ? <Clock className="h-3 w-3" /> : <InfinityIcon className="h-3 w-3" />} {exp.text}
      </p>
      <button onClick={download} className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-600 text-white flex items-center justify-center gap-2">
        <Download className="h-4 w-4" /> Tải mã QR (PNG)
      </button>
    </div>
  );
}

function LinkRow({ link, origin, onQr, onToggle, onDelete }: { link: any; origin: string; onQr: () => void; onToggle: () => void; onDelete: () => void }) {
  const shortUrl = `${origin}/s/${link.code}`;
  const exp = expiryLabel(link);
  const dead = exp.expired || !link.active;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-600 truncate ${dead ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
          {link.title || link.target_url}
        </p>
        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
          <span className="text-indigo-400">/s/{link.code}</span> · {link.target_url}
        </p>
        <p className={`text-[11px] flex items-center gap-1 ${exp.expired ? 'text-red-400' : 'text-muted-foreground/70'}`}>
          {link.expires_at ? <Clock className="h-3 w-3" /> : <InfinityIcon className="h-3 w-3" />} {exp.text} · {link.click_count} lượt quét
          {!link.active && <span className="text-orange-400"> · đã tắt</span>}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={onQr} className="btn-ghost rounded-lg p-2" title="Xem/tải mã QR"><QrCode className="h-4 w-4 text-muted-foreground" /></button>
        <CopyBtn text={shortUrl} />
        <a href={link.target_url} target="_blank" className="btn-ghost rounded-lg p-2" title="Mở link đích"><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>
        <button onClick={onToggle} className="btn-ghost rounded-lg p-2" title={link.active ? 'Tắt link' : 'Bật lại'}>
          <Power className={`h-4 w-4 ${link.active ? 'text-emerald-400' : 'text-muted-foreground'}`} />
        </button>
        <button onClick={onDelete} className="btn-ghost rounded-lg p-2" title="Xóa"><Trash2 className="h-4 w-4 text-red-400" /></button>
      </div>
    </div>
  );
}
