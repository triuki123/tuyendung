'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Save, Gift, Check, QrCode } from 'lucide-react';
import { formatVND } from '@/lib/format';
import { api } from '../lib/solaceApi';
import { INP, Field } from './InventoryTab';

const QRCodeCanvas = dynamic(() => import('qrcode.react').then(m => m.QRCodeCanvas), { ssr: false });

function MinigameQrCard() {
  const [url, setUrl] = useState('');
  // Ưu tiên domain public cấu hình sẵn (NEXT_PUBLIC_APP_URL) để QR luôn trỏ đúng
  // domain — tránh in QR theo origin nội bộ (localhost/IP) mà điện thoại không mở được.
  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    setUrl(`${base}/solace/minigame`);
  }, []);
  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
      <h4 className="text-sm font-600 text-foreground flex items-center gap-2"><QrCode className="h-4 w-4 text-indigo-400" /> Mã QR Minigame (in & dán tại quán)</h4>
      <p className="text-xs text-muted-foreground">Nhân viên đến sớm quét mã này (đăng nhập app) → nếu hợp lệ sẽ nhận quà.</p>
      <div className="flex justify-center py-2">
        {url && <div className="rounded-2xl bg-white p-3"><QRCodeCanvas value={url} size={170} level="M" /></div>}
      </div>
      <p className="text-2xs text-muted-foreground text-center break-all">{url}</p>
    </div>
  );
}

interface Cfg {
  enabled: boolean; earlyMinutes: number; dailyLimit: number;
  defaultWorkStart: string; voucherValidMinutes: number; rewardProductIds: string[];
}
interface Product { id: string; name: string; price: number; is_active?: boolean }

export default function MinigameTab() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([
          api.get<{ data: Cfg }>('/api/solace/minigame/config'),
          api.get<{ data: Product[] }>('/api/solace/products'),
        ]);
        setCfg(c.data); setProducts(p.data);
      } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    if (!cfg) return;
    setBusy(true); setOk(false); setErr('');
    try { await api.put('/api/solace/minigame/config', cfg); setOk(true); setTimeout(() => setOk(false), 2000); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (loading || !cfg) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const toggleReward = (id: string) =>
    setCfg({ ...cfg, rewardProductIds: cfg.rewardProductIds.includes(id) ? cfg.rewardProductIds.filter(x => x !== id) : [...cfg.rewardProductIds, id] });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-2xl border border-white/5 p-4 space-y-4" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-600 text-foreground flex items-center gap-2"><Gift className="h-4 w-4 text-indigo-400" /> Minigame "Đến sớm nhận quà"</h3>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> {busy ? 'Đang lưu' : 'Lưu'}
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} className="accent-indigo-500" /> Bật minigame
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Đến sớm tối thiểu (phút)"><input value={cfg.earlyMinutes} onChange={e => setCfg({ ...cfg, earlyMinutes: Number(e.target.value) || 0 })} inputMode="numeric" className={INP} style={{ background: '#162033' }} /></Field>
          <Field label="Số quà tối đa / người / ngày"><input value={cfg.dailyLimit} onChange={e => setCfg({ ...cfg, dailyLimit: Number(e.target.value) || 0 })} inputMode="numeric" className={INP} style={{ background: '#162033' }} /></Field>
          <Field label="Giờ vào làm mặc định"><input type="time" value={cfg.defaultWorkStart} onChange={e => setCfg({ ...cfg, defaultWorkStart: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
          <Field label="Hạn dùng mã thưởng (phút)"><input value={cfg.voucherValidMinutes} onChange={e => setCfg({ ...cfg, voucherValidMinutes: Number(e.target.value) || 0 })} inputMode="numeric" className={INP} style={{ background: '#162033' }} /></Field>
        </div>
        <p className="text-2xs text-muted-foreground">Điều kiện trúng: (Giờ vào làm − Giờ điểm danh sớm nhất) ≥ số phút đến sớm. Giờ vào làm lấy theo từng nhân viên (mục Người dùng), thiếu thì dùng mặc định.</p>
      </div>

      <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
        <h4 className="text-sm font-600 text-foreground">Pool món thưởng <span className="text-2xs text-muted-foreground font-400">(khách trúng được chọn 1 trong các món này, miễn phí)</span></h4>
        {products.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có món nào trong thực đơn.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-80 overflow-y-auto">
            {products.map(p => {
              const on = cfg.rewardProductIds.includes(p.id);
              return (
                <button key={p.id} onClick={() => toggleReward(p.id)}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm text-left ${on ? 'border-indigo-500 bg-indigo-500/10 text-foreground' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                  <span className="truncate">{p.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-2xs">{formatVND(p.price)}</span>
                    {on && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-2xs text-muted-foreground">Đã chọn: {cfg.rewardProductIds.length} món.</p>
      </div>

      <MinigameQrCard />

      {ok && <p className="text-xs text-emerald-400 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Đã lưu</p>}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}
