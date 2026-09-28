'use client';

import React, { useEffect, useState } from 'react';
import { X, Gift, Cake, Send, Loader2, CheckCircle2, PartyPopper } from 'lucide-react';
import type { MockUser } from '@/lib/mockData';

interface BirthdayPerson {
  id: string;
  name: string;
  avatar: string | null;
  department_name: string | null;
  company_name: string | null;
  is_vip: boolean;
}

const CONFETTI_COLORS = ['#f59e0b', '#6366f1', '#ec4899', '#10b981', '#ef4444', '#0ea5e9'];

/** Pháo giấy CSS nhẹ (không cần thư viện). */
function Confetti() {
  const pieces = Array.from({ length: 60 });
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      <style>{`@keyframes bd-fall { 0%{transform:translateY(-10vh) rotate(0);opacity:1} 100%{transform:translateY(110vh) rotate(720deg);opacity:.9} }`}</style>
      {pieces.map((_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 10) * 0.25;
        const dur = 3 + (i % 5);
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const size = 6 + (i % 4) * 2;
        return (
          <span key={i} style={{
            position: 'absolute', top: 0, left: `${left}%`, width: size, height: size * 1.6,
            background: color, borderRadius: 2, animation: `bd-fall ${dur}s linear ${delay}s infinite`,
          }} />
        );
      })}
    </div>
  );
}

/**
 * Popup chúc mừng sinh nhật toàn cục — hiện 1 lần/phiên/ngày khi đăng nhập:
 *  - Nếu chính người dùng sinh nhật → popup ăn mừng + pháo giấy.
 *  - Nếu đồng nghiệp sinh nhật → popup gửi lời chúc (Telegram tới người đó).
 */
export default function BirthdayPopup({ currentUser }: { currentUser: MockUser | null }) {
  const [list, setList] = useState<BirthdayPerson[]>([]);
  const [open, setOpen] = useState(false);
  const [wishes, setWishes] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!currentUser?.id) return;
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const seenKey = `birthday_popup_${currentUser.id}_${todayStr}`;
    // localStorage: chỉ hiện 1 lần/ngày, bền qua F5 · mở tab mới · khởi động lại trình duyệt.
    if (localStorage.getItem(seenKey)) return;

    fetch('/api/birthdays/today', { headers: { 'x-current-user-id': currentUser.id } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const data: BirthdayPerson[] = j?.data || [];
        // Đánh dấu đã xem ngay khi mở — dù không chúc cũng không hiện lại trong ngày.
        if (data.length > 0) { setList(data); setOpen(true); localStorage.setItem(seenKey, '1'); }
      })
      .catch(() => {});
  }, [currentUser?.id]);

  if (!open || !currentUser) return null;

  const selfBirthday = list.find((p) => p.id === currentUser.id);
  const others = list.filter((p) => p.id !== currentUser.id);

  const close = () => setOpen(false);

  const sendWish = async (toUserId: string) => {
    const message = (wishes[toUserId] || '').trim();
    if (!message) return;
    setSending(toUserId);
    try {
      const res = await fetch('/api/birthdays/wish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-current-user-id': currentUser.id },
        body: JSON.stringify({ toUserId, message }),
      });
      if (res.ok) setSent((s) => ({ ...s, [toUserId]: true }));
    } finally {
      setSending(null);
    }
  };

  const Avatar = ({ p, size = 44 }: { p: BirthdayPerson; size?: number }) => (
    <div className="rounded-full flex items-center justify-center text-white font-700 overflow-hidden shrink-0"
      style={{ width: size, height: size, background: 'linear-gradient(135deg,#f59e0b,#ec4899)' }}>
      {p.avatar && p.avatar.startsWith('/')
        ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
        : (p.name?.charAt(0).toUpperCase() ?? '?')}
    </div>
  );

  return (
    <>
      {selfBirthday && <Confetti />}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={close}>
        <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden modal-entrance"
          style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="relative px-6 py-5 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(236,72,153,0.18))' }}>
            <button onClick={close} className="absolute right-3 top-3 btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 flex items-center justify-center mb-2">
              {selfBirthday ? <PartyPopper className="h-7 w-7 text-amber-400" /> : <Cake className="h-7 w-7 text-amber-400" />}
            </div>
            {selfBirthday ? (
              <>
                <h2 className="text-lg font-700 text-foreground">🎉 Chúc Mừng Sinh Nhật, {currentUser.name}! 🎂</h2>
                <p className="text-xs text-muted-foreground mt-1">Chúc bạn một ngày thật vui và một năm mới rực rỡ. Cả nhà FADO luôn bên bạn! 🎈</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-700 text-foreground">🎂 Hôm nay là sinh nhật!</h2>
                <p className="text-xs text-muted-foreground mt-1">Gửi một lời chúc tới đồng nghiệp nhé — họ sẽ nhận ngay qua Telegram.</p>
              </>
            )}
          </div>

          {/* Body */}
          {others.length > 0 && (
            <div className="p-5 space-y-3 max-h-[55vh] overflow-y-auto">
              {others.map((p) => (
                <div key={p.id} className="rounded-2xl border border-white/5 p-3" style={{ background: 'var(--secondary)' }}>
                  <div className="flex items-center gap-3 mb-2">
                    <Avatar p={p} />
                    <div className="min-w-0">
                      <p className="text-sm font-600 text-foreground truncate flex items-center gap-1.5">
                        {p.name}{p.is_vip && <span className="text-2xs text-amber-400">⭐ BOD & Leader</span>}
                      </p>
                      <p className="text-2xs text-muted-foreground truncate">{[p.department_name, p.company_name].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  {sent[p.id] ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5 py-1.5"><CheckCircle2 className="h-4 w-4" /> Đã gửi lời chúc tới {p.name} 🎉</p>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        value={wishes[p.id] || ''}
                        onChange={(e) => setWishes((w) => ({ ...w, [p.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendWish(p.id); }}
                        placeholder="Gửi lời chúc..."
                        className="flex-1 h-9 px-3 rounded-xl text-sm bg-surface-2 border border-line text-foreground placeholder:text-ink-faint focus:outline-none focus:border-amber-500/60"
                      />
                      <button onClick={() => sendWish(p.id)} disabled={sending === p.id || !(wishes[p.id] || '').trim()}
                        className="h-9 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-600 flex items-center gap-1.5 disabled:opacity-50">
                        {sending === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/5 flex justify-end">
            <button onClick={close} className="btn-ghost rounded-xl px-4 py-2 text-sm font-600 inline-flex items-center gap-1.5">
              <Gift className="h-4 w-4" /> {selfBirthday ? 'Cảm ơn!' : 'Đóng'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
