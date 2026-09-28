'use client';

import { useState } from 'react';
import { Loader2, Download, Mail, CalendarRange, CalendarDays, User, Trophy } from 'lucide-react';

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
}
function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

/**
 * Tab Báo cáo — gom mọi kiểu xuất báo cáo toàn xưởng:
 * 1. Báo cáo tháng (tải Excel / gửi email)
 * 2. Báo cáo theo khoảng ngày tùy chọn (kỳ công 26→25...)
 * File 3 sheet: Tổng Hợp + Bảng Công Chi Tiết + Sản Lượng Chi Tiết.
 */
export default function ReportTab({ warehouseId }: { warehouseId: string }) {
  const [month, setMonth] = useState(currentMonth());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const sendEmail = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/warehouse/admin/test-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, month }),
      });
      const json = await res.json();
      flash(res.ok ? `✅ Đã gửi tới ${(json.sent_to || []).join(', ')}` : `❌ ${json.error}`);
    } finally {
      setSending(false);
    }
  };

  const rangeValid = from && to && from <= to;
  const card = 'rounded-2xl border border-white/5 p-5 space-y-4';
  const label = 'text-xs font-600 text-muted-foreground uppercase tracking-wider';
  const input = 'rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-700 text-foreground">Báo cáo</h2>
        <p className="text-xs text-muted-foreground">
          File Excel 3 sheet: Tổng hợp · Bảng công chi tiết theo ngày · Sản lượng chi tiết theo ngày
        </p>
        {msg && <p className="text-xs mt-1">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Báo cáo tháng */}
        <div className={card} style={{ background: 'var(--card)' }}>
          <p className="text-sm font-700 text-foreground flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-400" /> Báo cáo tháng
          </p>
          <div>
            <label className={label}>Chọn tháng</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={input + ' mt-1.5 w-full'} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={`/api/warehouse/admin/report?warehouseId=${warehouseId}&month=${month}`}
              className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-600 text-white flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" /> Tải Excel
            </a>
            <button
              onClick={sendEmail}
              disabled={sending}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-600 text-foreground flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Gửi email
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Email gửi tới danh sách cấu hình trong ⚙ Cấu hình kho.</p>
        </div>

        {/* Báo cáo theo khoảng ngày */}
        <div className={card} style={{ background: 'var(--card)' }}>
          <p className="text-sm font-700 text-foreground flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-indigo-400" /> Báo cáo theo khoảng ngày
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Từ ngày</label>
              <input type="date" value={from} max={to || todayStr()} onChange={(e) => setFrom(e.target.value)} className={input + ' mt-1.5 w-full'} />
            </div>
            <div>
              <label className={label}>Đến ngày</label>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input + ' mt-1.5 w-full'} />
            </div>
          </div>
          {from && to && !rangeValid && <p className="text-xs text-red-400">Từ ngày phải trước Đến ngày.</p>}
          <a
            href={rangeValid ? `/api/warehouse/admin/report?warehouseId=${warehouseId}&from=${from}&to=${to}` : undefined}
            aria-disabled={!rangeValid}
            className={`block rounded-xl py-2.5 text-sm font-600 text-center flex items-center justify-center gap-2 ${
              rangeValid ? 'bg-indigo-600 text-white' : 'bg-white/5 text-muted-foreground pointer-events-none'
            }`}
          >
            <Download className="h-4 w-4" /> Tải Excel khoảng ngày
          </a>
          <p className="text-[11px] text-muted-foreground">Dùng cho kỳ công không theo lịch tháng, vd 26 tháng này → 25 tháng sau.</p>
        </div>
      </div>

      {/* Báo cáo khác */}
      <div className={card} style={{ background: 'var(--card)' }}>
        <p className="text-sm font-700 text-foreground">Báo cáo khác</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
          <p className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-indigo-400" /> Hồ sơ từng công nhân (12 tháng): tab <b className="text-foreground">Công nhân</b> → nút tải ⬇ ở mỗi người.</p>
          <p className="flex items-center gap-2"><Trophy className="h-3.5 w-3.5 text-indigo-400" /> Xếp hạng khen thưởng: tab <b className="text-foreground">Xếp hạng</b> → nút Excel.</p>
        </div>
      </div>
    </div>
  );
}
