'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Gift, Copy, Check, PartyPopper } from 'lucide-react';
import { formatVND } from '@/lib/format';

interface RewardItem { id: string; name: string; price: number }
interface ClaimData {
  code: string; expiresAt: string; validMinutes: number;
  checkinTime: string; workStart: string; items: RewardItem[];
}

export default function MinigameClaim() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ClaimData | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const claim = async () => {
    setLoading(true); setErr(''); setData(null);
    try {
      const r = await fetch('/api/solace/minigame/claim', { method: 'POST', credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Không nhận được quà');
      setData(j.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { claim(); }, []);

  const copy = () => { if (data) { navigator.clipboard?.writeText(data.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } };
  const expireHHMM = data ? new Date(data.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="space-y-5 sm:space-y-6 max-w-lg mx-auto">
      <Link href="/solace" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Quán Solace
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2"><Gift className="h-6 w-6 text-indigo-400" /> Minigame Đến Sớm</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Quét mã mỗi sáng để nhận quà chào ngày mới ☕</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm mt-3">Đang kiểm tra điều kiện…</p>
        </div>
      ) : data ? (
        <div className="relative overflow-hidden rounded-3xl border border-indigo-500/30 p-6 text-center" style={{ background: 'var(--card)' }}>
          {/* Pháo hoa / confetti */}
          <Confetti />
          <div className="relative">
            <div className="text-5xl mb-2 animate-bounce">🎉🎁🎊</div>
            <h2 className="text-lg font-700 text-foreground flex items-center justify-center gap-1.5">
              <PartyPopper className="h-5 w-5 text-amber-400" /> Chúc mừng!
            </h2>
            <p className="text-sm text-foreground mt-1">Bạn đã nhận được một <b>món quà chào ngày mới</b> từ Solace Coffee 🐾</p>
            <p className="text-2xs text-muted-foreground mt-1">Điểm danh {data.checkinTime} · vào làm {data.workStart}</p>

            {/* Mã thưởng */}
            <div className="mt-5 rounded-2xl border border-dashed border-indigo-400/50 bg-indigo-500/5 p-4">
              <p className="text-2xs text-muted-foreground uppercase tracking-wider">Mã quà tặng</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-2xl font-700 tracking-widest text-indigo-300">{data.code}</span>
                <button onClick={copy} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-2xs text-amber-400 mt-1">⏱ Dùng trước {expireHHMM} (trong {data.validMinutes} phút)</p>
            </div>

            {/* Pool món được chọn */}
            <div className="mt-4 text-left">
              <p className="text-xs font-600 text-muted-foreground mb-1.5">Chọn 1 món miễn phí:</p>
              <div className="flex flex-wrap gap-1.5">
                {data.items.map(it => (
                  <span key={it.id} className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-xs text-foreground">
                    {it.name} <span className="text-2xs text-muted-foreground">{formatVND(it.price)}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-2 text-left text-xs text-muted-foreground">
              <p>① Đưa mã này cho <b>nhân viên Solace</b> khi gọi món, hoặc</p>
              <p>② Tự <b>đặt món</b> rồi nhập mã ở ô “Mã giảm giá”.</p>
            </div>
            <Link href="/solace/dat-mon" className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 w-full">
              ☕ Đặt món ngay
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/5 p-6 text-center" style={{ background: 'var(--card)' }}>
          <div className="text-4xl mb-3 opacity-60">🥲</div>
          <p className="text-sm text-foreground">{err}</p>
          <button onClick={claim} className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-600 border border-white/10 text-foreground hover:bg-white/5">
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
}

/** Confetti CSS nhẹ — vài mảnh giấy rơi. */
function Confetti() {
  const pieces = Array.from({ length: 24 });
  const colors = ['#f59e0b', '#6366f1', '#ec4899', '#10b981', '#ef4444', '#3b82f6'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((_, i) => (
        <span key={i} style={{
          position: 'absolute', top: '-10px', left: `${(i * 4.1) % 100}%`,
          width: 7, height: 7, background: colors[i % colors.length], borderRadius: 1,
          animation: `solConfetti ${1.8 + (i % 5) * 0.35}s linear ${(i % 7) * 0.18}s infinite`,
        }} />
      ))}
      <style>{`@keyframes solConfetti{0%{transform:translateY(-10px) rotate(0);opacity:1}100%{transform:translateY(360px) rotate(540deg);opacity:0}}`}</style>
    </div>
  );
}
