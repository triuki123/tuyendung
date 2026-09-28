'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Save, X, Plus, Check, QrCode } from 'lucide-react';
import { formatVND, parseVND } from '@/lib/format';
import { api } from '../lib/solaceApi';
import { INP, Field } from './InventoryTab';
import MemberPicker, { type Member } from '../../pos/components/MemberPicker';
import { WEEKDAY_LABELS } from '@/lib/config/solaceConfig';

const QRCodeCanvas = dynamic(() => import('qrcode.react').then(m => m.QRCodeCanvas), { ssr: false });

interface Settings {
  bank: { bankBin: string; accountNo: string; accountName: string };
  operating: { openTime: string; closeTime: string; forceOpen: boolean; useWeeklySchedule: boolean; weekly: { closed: boolean; openTime: string; closeTime: string }[]; shiftRemindHour: number; autoCloseShift: boolean; shiftAutoCloseHour: number };
  debt: { enabled: boolean; limit: number };
  inventory: { allowNegativeStock: boolean };
  wallet: { lowBalanceThreshold: number };
  delivery: { enabled: boolean; fee: number };
  recipients: { order: string[]; shiftClose: string[]; operators: string[] };
  receipt: { shopName: string; subtitle: string; address: string; taxId: string; footer: string; printWidth: number };
}

export default function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: Settings }>('/api/solace/settings');
      setS(r.data);
      const ids = [...new Set([...r.data.recipients.order, ...r.data.recipients.shiftClose, ...(r.data.recipients.operators ?? [])])];
      if (ids.length) {
        const m = await api.get<{ data: Member[] }>(`/api/solace/members?ids=${ids.join(',')}`);
        setNames(Object.fromEntries(m.data.map(u => [u.id, u.name])));
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading || !s) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BankSection bank={s.bank} />
      <OperatingSection op={s.operating} />
      <DebtSection debt={s.debt} />
      <InventorySection inv={s.inventory} />
      <WalletSection wallet={s.wallet} />
      <DeliverySection delivery={s.delivery} />
      <ReceiptSection receipt={s.receipt} />
      <RecipientsSection kind="order" title="Người nhận thông báo Đơn mới" all={s.recipients} names={names} onReload={load} />
      <RecipientsSection kind="shiftClose" title="Người nhận thông báo Kết ca" all={s.recipients} names={names} onReload={load} />
      <RecipientsSection kind="operators" title="Nhân viên vận hành (điều khiển đơn qua Telegram)"
        note="Người được chọn sẽ nhận ĐƠN MỚI kèm nút Pha chế / Sẵn sàng / Đang giao / Hoàn thành / Huỷ ngay trong bot Solace. Yêu cầu: đã liên kết bot Solace + có quyền POS Solace."
        all={s.recipients} names={names} onReload={load} />
      <ShopQrCard />
      <GuestOrderQrCard />
    </div>
  );
}

function GuestOrderQrCard() {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    setUrl(`${base}/solace-guest`);
  }, []);
  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
      <h3 className="text-base font-600 text-foreground flex items-center gap-2"><QrCode className="h-4 w-4 text-indigo-400" /> Mã QR đặt món khách vãng lai</h3>
      <p className="text-xs text-muted-foreground">Dán tại quầy/bàn. Khách quét → đặt món không cần đăng nhập (chỉ tiền mặt / VietQR). Thêm <code className="text-2xs">?loc=Bàn 5</code> vào URL để gắn bàn.</p>
      <div className="flex justify-center py-2">
        {url && <div className="rounded-2xl bg-white p-3"><QRCodeCanvas value={url} size={160} level="M" /></div>}
      </div>
      <p className="text-2xs text-muted-foreground text-center break-all">{url}</p>
    </div>
  );
}

function ShopQrCard() {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    setUrl(`${base}/q/solace-pay/QUAY`);
  }, []);
  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
      <h3 className="text-base font-600 text-foreground flex items-center gap-2"><QrCode className="h-4 w-4 text-indigo-400" /> Mã QR thanh toán quầy</h3>
      <p className="text-xs text-muted-foreground">Dán mã này tại quầy. Khách quét → mở màn trả bằng ví cho đơn đang chờ.</p>
      <div className="flex justify-center py-2">
        {url && <div className="rounded-2xl bg-white p-3"><QRCodeCanvas value={url} size={160} level="M" /></div>}
      </div>
      <p className="text-2xs text-muted-foreground text-center break-all">{url}</p>
    </div>
  );
}

function Card({ title, children, onSave, busy }: { title: string; children: React.ReactNode; onSave: () => void; busy: boolean }) {
  return (
    <div className="rounded-2xl border border-white/5 p-4 space-y-3" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-600 text-foreground">{title}</h3>
        <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50">
          <Save className="h-3.5 w-3.5" /> {busy ? 'Đang lưu' : 'Lưu'}
        </button>
      </div>
      {children}
    </div>
  );
}

function useSaver(section: string) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const save = async (value: unknown) => {
    setBusy(true); setOk(false);
    try { await api.put('/api/solace/settings', { section, value }); setOk(true); setTimeout(() => setOk(false), 2000); }
    finally { setBusy(false); }
  };
  return { busy, ok, save };
}

function BankSection({ bank }: { bank: Settings['bank'] }) {
  const [v, setV] = useState(bank);
  const { busy, ok, save } = useSaver('bank');
  return (
    <Card title="Tài khoản ngân hàng (VietQR)" busy={busy} onSave={() => save(v)}>
      <Field label="Mã BIN ngân hàng (napas)"><input value={v.bankBin} onChange={e => setV({ ...v, bankBin: e.target.value })} placeholder="VD: 970436 (Vietcombank)" className={INP} style={{ background: '#162033' }} /></Field>
      <Field label="Số tài khoản"><input value={v.accountNo} onChange={e => setV({ ...v, accountNo: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
      <Field label="Tên chủ tài khoản"><input value={v.accountName} onChange={e => setV({ ...v, accountName: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
      {ok && <p className="text-xs text-emerald-400">Đã lưu</p>}
    </Card>
  );
}

function OperatingSection({ op }: { op: Settings['operating'] }) {
  const [v, setV] = useState(op);
  const { busy, ok, save } = useSaver('operating');
  const clampHour = (x: string, d: number) => { const n = parseInt(x, 10); return Number.isInteger(n) && n >= 0 && n <= 23 ? n : d; };
  return (
    <Card title="Giờ hoạt động & kết ca" busy={busy} onSave={() => save(v)}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mở cửa"><input type="time" value={v.openTime} onChange={e => setV({ ...v, openTime: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
        <Field label="Đóng cửa"><input type="time" value={v.closeTime} onChange={e => setV({ ...v, closeTime: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={v.forceOpen} onChange={e => setV({ ...v, forceOpen: e.target.checked })} className="accent-indigo-500" /> Mở quán (bán cả ngoài giờ)
      </label>

      <div className="border-t border-white/5 pt-3 space-y-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={v.useWeeklySchedule} onChange={e => setV({ ...v, useWeeklySchedule: e.target.checked })} className="accent-indigo-500" /> Đặt lịch theo từng ngày trong tuần
        </label>
        {v.useWeeklySchedule ? (
          <div className="space-y-1.5">
            {WEEKDAY_LABELS.map((label, i) => {
              const d = v.weekly[i] ?? { closed: false, openTime: '07:00', closeTime: '16:00' };
              const setDay = (patch: Partial<typeof d>) => {
                const next = v.weekly.map((x, j) => j === i ? { ...d, ...patch } : x);
                setV({ ...v, weekly: next });
              };
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={!d.closed} onChange={e => setDay({ closed: !e.target.checked })} className="accent-indigo-500" /> Mở
                  </label>
                  {!d.closed ? (
                    <>
                      <input type="time" value={d.openTime} onChange={e => setDay({ openTime: e.target.value })} className={`${INP} flex-1`} style={{ background: '#162033' }} />
                      <span className="text-muted-foreground">–</span>
                      <input type="time" value={d.closeTime} onChange={e => setDay({ closeTime: e.target.value })} className={`${INP} flex-1`} style={{ background: '#162033' }} />
                    </>
                  ) : <span className="flex-1 text-xs text-muted-foreground italic">Nghỉ</span>}
                </div>
              );
            })}
            <p className="text-2xs text-muted-foreground">Khoá đặt món ngoài giờ/ngày nghỉ theo lịch này. Mặc định quán: T2–T6 cả ngày, T7 sáng, Chủ Nhật nghỉ.</p>
          </div>
        ) : (
          <p className="text-2xs text-muted-foreground">Đang dùng khung giờ chung mỗi ngày ({v.openTime}–{v.closeTime}). Bật ô trên để đặt giờ riêng theo thứ.</p>
        )}
      </div>

      <div className="border-t border-white/5 pt-3 space-y-3">
        <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Kết ca</p>
        <Field label="Giờ nhắc kết ca (nếu quên)">
          <input type="number" min={0} max={23} value={v.shiftRemindHour}
            onChange={e => setV({ ...v, shiftRemindHour: clampHour(e.target.value, 21) })} className={INP} style={{ background: '#162033' }} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={v.autoCloseShift} onChange={e => setV({ ...v, autoCloseShift: e.target.checked })} className="accent-indigo-500" /> Tự kết ca nếu quên (chưa đối soát két)
        </label>
        {v.autoCloseShift && (
          <Field label="Giờ tự kết ca (rạng sáng hôm sau)">
            <input type="number" min={0} max={23} value={v.shiftAutoCloseHour}
              onChange={e => setV({ ...v, shiftAutoCloseHour: clampHour(e.target.value, 3) })} className={INP} style={{ background: '#162033' }} />
          </Field>
        )}
        <p className="text-2xs text-muted-foreground">Nhắc lúc {v.shiftRemindHour}h nếu hôm nay có đơn mà chưa kết ca{v.autoCloseShift ? `; tự kết ca lúc ${v.shiftAutoCloseHour}h hôm sau cho ngày chưa chốt` : ''}.</p>
      </div>
      {ok && <p className="text-xs text-emerald-400">Đã lưu</p>}
    </Card>
  );
}

function DebtSection({ debt }: { debt: Settings['debt'] }) {
  const [v, setV] = useState({ ...debt, limit: String(debt.limit) });
  const { busy, ok, save } = useSaver('debt');
  return (
    <Card title="Công nợ" busy={busy} onSave={() => save({ enabled: v.enabled, limit: parseVND(v.limit) })}>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} className="accent-indigo-500" /> Cho phép mua ghi nợ
      </label>
      <Field label="Hạn mức nợ tối đa / người"><input value={v.limit} onChange={e => setV({ ...v, limit: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
      {ok && <p className="text-xs text-emerald-400">Đã lưu</p>}
    </Card>
  );
}

function InventorySection({ inv }: { inv: Settings['inventory'] }) {
  const [v, setV] = useState(inv);
  const { busy, ok, save } = useSaver('inventory');
  return (
    <Card title="Kho" busy={busy} onSave={() => save(v)}>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={v.allowNegativeStock} onChange={e => setV({ ...v, allowNegativeStock: e.target.checked })} className="accent-indigo-500" /> Cho bán khi hết nguyên liệu (chỉ cảnh báo)
      </label>
      {ok && <p className="text-xs text-emerald-400">Đã lưu</p>}
    </Card>
  );
}

function WalletSection({ wallet }: { wallet: Settings['wallet'] }) {
  const [v, setV] = useState(String(wallet.lowBalanceThreshold));
  const { busy, ok, save } = useSaver('wallet');
  return (
    <Card title="Ví tín dụng" busy={busy} onSave={() => save({ lowBalanceThreshold: parseVND(v) })}>
      <Field label="Ngưỡng cảnh báo số dư thấp (0 = tắt)"><input value={v} onChange={e => setV(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      <p className="text-2xs text-muted-foreground">Báo cho khách khi ví vừa tụt xuống dưới mức này.</p>
      {ok && <p className="text-xs text-emerald-400">Đã lưu</p>}
    </Card>
  );
}

function DeliverySection({ delivery }: { delivery: Settings['delivery'] }) {
  const [enabled, setEnabled] = useState(delivery.enabled);
  const [fee, setFee] = useState(String(delivery.fee));
  const { busy, ok, save } = useSaver('delivery');
  return (
    <Card title="Giao hàng (trong toà nhà)" busy={busy} onSave={() => save({ enabled, fee: parseVND(fee) })}>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-indigo-500" /> Cho phép giao tận nơi (tầng/phòng)
      </label>
      <Field label="Phí giao cố định (đ)"><input value={fee} onChange={e => setFee(e.target.value)} className={INP} style={{ background: '#162033' }} /></Field>
      {ok && <p className="text-xs text-emerald-400">Đã lưu</p>}
    </Card>
  );
}

function ReceiptSection({ receipt }: { receipt: Settings['receipt'] }) {
  const [v, setV] = useState({ ...receipt, printWidth: String(receipt.printWidth) });
  const { busy, ok, save } = useSaver('receipt');
  const clampWidth = (x: string) => { const n = parseInt(x, 10); return Number.isInteger(n) && n >= 24 && n <= 64 ? n : 32; };
  return (
    <Card title="Hoá đơn (in bill)" busy={busy} onSave={() => save({
      shopName: v.shopName.trim() || 'SOLACE', subtitle: v.subtitle, address: v.address,
      taxId: v.taxId, footer: v.footer, printWidth: clampWidth(v.printWidth),
    })}>
      <Field label="Tên quán (đầu bill)"><input value={v.shopName} onChange={e => setV({ ...v, shopName: e.target.value })} placeholder="SOLACE" className={INP} style={{ background: '#162033' }} /></Field>
      <Field label="Dòng phụ (dưới tên quán)"><input value={v.subtitle} onChange={e => setV({ ...v, subtitle: e.target.value })} placeholder="Quán cà phê nội bộ FADO Group" className={INP} style={{ background: '#162033' }} /></Field>
      <Field label="Địa chỉ (để trống = ẩn)"><input value={v.address} onChange={e => setV({ ...v, address: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
      <Field label="Mã số thuế (để trống = ẩn)"><input value={v.taxId} onChange={e => setV({ ...v, taxId: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
      <Field label="Dòng cảm ơn cuối bill"><input value={v.footer} onChange={e => setV({ ...v, footer: e.target.value })} placeholder="Cảm ơn & hẹn gặp lại!" className={INP} style={{ background: '#162033' }} /></Field>
      <Field label="Số cột khi in (32 = khổ 58mm · 48 = khổ 80mm)"><input type="number" min={24} max={64} value={v.printWidth} onChange={e => setV({ ...v, printWidth: e.target.value })} className={INP} style={{ background: '#162033' }} /></Field>
      <p className="text-2xs text-muted-foreground">Áp dụng cho cả hoá đơn khách và vé bếp khi in qua đầu in tích hợp (mPOS).</p>
      {ok && <p className="text-xs text-emerald-400">Đã lưu</p>}
    </Card>
  );
}

type RecipKind = 'order' | 'shiftClose' | 'operators';
function RecipientsSection({ kind, title, all, names, onReload, note }: {
  kind: RecipKind; title: string; all: Settings['recipients']; names: Record<string, string>; onReload: () => void; note?: string;
}) {
  const [list, setList] = useState<string[]>(all[kind] ?? []);
  const [localNames, setLocalNames] = useState<Record<string, string>>(names);
  const [pick, setPick] = useState(false);
  const { busy, ok, save } = useSaver('recipients');

  const add = (m: Member) => { setPick(false); if (!list.includes(m.id)) { setList([...list, m.id]); setLocalNames(n => ({ ...n, [m.id]: m.name })); } };
  const remove = (id: string) => setList(list.filter(x => x !== id));
  const doSave = async () => {
    // Gửi cả 3 nhóm để không ghi đè nhóm khác.
    const value = { order: all.order, shiftClose: all.shiftClose, operators: all.operators ?? [], [kind]: list };
    await save(value); onReload();
  };

  return (
    <Card title={title} busy={busy} onSave={doSave}>
      {note && <p className="text-2xs text-muted-foreground">{note}</p>}
      <div className="flex flex-wrap gap-1.5">
        {list.length === 0 && <p className="text-xs text-muted-foreground">Chưa chọn ai → không gửi.</p>}
        {list.map(id => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-foreground">
            {localNames[id] ?? names[id] ?? id.slice(0, 8)}
            <button onClick={() => remove(id)} className="text-muted-foreground hover:text-red-400"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <button onClick={() => setPick(true)} className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"><Plus className="h-3.5 w-3.5" /> Thêm người</button>
      {ok && <p className="text-xs text-emerald-400 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Đã lưu</p>}
      {pick && <MemberPicker title="Thêm người nhận thông báo" onPick={add} onClose={() => setPick(false)} />}
    </Card>
  );
}
