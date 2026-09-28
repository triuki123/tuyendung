'use client';

import QRCode from 'qrcode';
import { formatVND } from '@/lib/format';
import type { SolaceOrder } from '@/lib/services/solaceOrderService';
import { DEFAULT_RECEIPT, type ReceiptConfig } from '@/lib/config/solaceConfig';

const PAYMENT_LABEL: Record<string, string> = { cash: 'Tiền mặt', wallet: 'Ví tín dụng', bankqr: 'Chuyển khoản', mixed: 'Hỗn hợp' };

/** Cache cấu hình hoá đơn (nạp 1 lần / phiên). Lỗi/ngoại tuyến → dùng mặc định. */
let _receiptCache: ReceiptConfig | null = null;
async function loadReceipt(): Promise<ReceiptConfig> {
  if (_receiptCache) return _receiptCache;
  try {
    const res = await fetch('/api/solace/settings/receipt', { credentials: 'include' });
    if (res.ok) { _receiptCache = (await res.json()).data as ReceiptConfig; return _receiptCache; }
  } catch { /* dùng mặc định */ }
  return DEFAULT_RECEIPT;
}

interface VietQrInfo { payload: string; amount: number; accountNo: string; accountName: string; addInfo: string | null }

/**
 * Cầu in NATIVE — app vỏ bọc (WebView trên mPOS P8) tiêm vào window để in thẳng đầu in tích hợp.
 * printText(text): in văn bản hoá đơn. cut(): cắt giấy (tuỳ chọn).
 */
interface NativePrinter { printText?: (text: string) => void; cut?: () => void; isAvailable?: () => boolean }
declare global { interface Window { NativePrinter?: NativePrinter } }

function nativePrinter(): NativePrinter | null {
  if (typeof window === 'undefined') return null;
  const p = window.NativePrinter;
  if (p && typeof p.printText === 'function' && (!p.isAvailable || p.isAvailable())) return p;
  return null;
}

/** Canh 1 dòng: trái + phải, độ rộng w cột (mặc định 32 cho khổ 58mm). */
function padLine(left: string, right: string, w = 32): string {
  const l = left.length + right.length >= w ? left.slice(0, Math.max(0, w - right.length - 1)) : left;
  return l + ' '.repeat(Math.max(1, w - l.length - right.length)) + right;
}

/** Căn giữa 1 chuỗi trong khổ w cột. */
function center(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  return ' '.repeat(Math.floor((w - s.length) / 2)) + s;
}

/** Nội dung hoá đơn KHÁCH dạng văn bản (cho cầu in native). */
function buildReceiptText(order: SolaceOrder, cfg: ReceiptConfig): string {
  const w = cfg.printWidth;
  const sep = '-'.repeat(w);
  const L: string[] = [];
  L.push(center(cfg.shopName, w));
  if (cfg.subtitle) L.push(center(cfg.subtitle, w));
  if (cfg.address) L.push(center(cfg.address, w));
  if (cfg.taxId) L.push(center('MST: ' + cfg.taxId, w));
  L.push(sep);
  L.push('Mã đơn: ' + (order.code ?? ''));
  L.push('TG: ' + new Date(order.created_at).toLocaleString('vi-VN'));
  L.push('Nhận: ' + (order.fulfillment_type === 'dine_in' ? 'Tại chỗ' + (order.floor_note ? ' · ' + order.floor_note : '') : 'Tại quầy'));
  if (order.customer_name) L.push('Khách: ' + order.customer_name);
  L.push(sep);
  for (const it of order.items ?? []) {
    L.push(it.name_snapshot);
    if (Array.isArray(it.options_json) && it.options_json.length) L.push('  (' + (it.options_json as Array<{ name: string }>).map(o => o.name).join(', ') + ')');
    L.push(padLine(`  ${it.qty} x ${formatVND(it.unit_price)}`, formatVND(it.line_total), w));
  }
  L.push(sep);
  if (Number(order.discount) > 0) L.push(padLine('Giảm giá', '-' + formatVND(order.discount), w));
  L.push(padLine('TỔNG CỘNG', formatVND(order.total), w));
  const payLabel = PAYMENT_LABEL[order.payment_method ?? ''] ?? '—';
  const payStatus = order.payment_status === 'paid' ? 'Đã thu' : order.payment_status === 'partial' ? 'Thu một phần' : order.payment_status === 'debt' ? 'Ghi nợ' : 'Chưa thu';
  L.push('Thanh toán: ' + payLabel + ' · ' + payStatus);
  const due = Number(order.total) - Number(order.paid_amount);
  if (due > 0) L.push(padLine('Còn phải trả', formatVND(due), w));
  L.push(sep);
  if (cfg.footer) L.push(center(cfg.footer, w));
  return L.join('\n') + '\n\n\n';
}

/**
 * Mở cửa sổ in hoá đơn khổ nhỏ (~80mm) cho 1 đơn SOLACE.
 * Nếu đơn còn phải trả → nhúng kèm mã VietQR để khách quét chuyển khoản (như app POS hiện nay).
 */
export async function printInvoice(order: SolaceOrder): Promise<void> {
  // mPOS P8 (app vỏ bọc): in THẲNG ra đầu in tích hợp qua cầu in native.
  const np = nativePrinter();
  if (np) {
    const cfg = await loadReceipt();
    try { np.printText!(buildReceiptText(order, cfg)); np.cut?.(); return; }  // khổ 58mm; Kozen P8 dùng 32 cột vẫn ổn (SDK tự wrap)
    catch { /* lỗi cầu in → fallback in trình duyệt */ }
  }
  // Mở cửa sổ NGAY trong cử chỉ người dùng để tránh bị chặn popup (không await trước bước này).
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return;
  w.document.write('<p style="font-family:sans-serif;padding:16px">Đang tạo hoá đơn…</p>');

  const cfg = await loadReceipt();
  const due = Number(order.total) - Number(order.paid_amount);

  // Sinh VietQR nếu còn phải trả + quán đã cấu hình ngân hàng.
  let qrDataUrl: string | null = null;
  let bank: VietQrInfo | null = null;
  if (due > 0) {
    try {
      const res = await fetch(`/api/solace/orders/${order.id}/vietqr`, { credentials: 'include' });
      if (res.ok) {
        bank = (await res.json()).data as VietQrInfo;
        qrDataUrl = await QRCode.toDataURL(bank.payload, { width: 240, margin: 1 });
      }
    } catch { /* không có cấu hình ngân hàng → in bill thường */ }
  }

  const items = (order.items ?? []).map(it => {
    const opts = Array.isArray(it.options_json) && it.options_json.length
      ? `<div class="opt">${(it.options_json as Array<{ name: string }>).map(o => escapeHtml(o.name)).join(', ')}</div>` : '';
    return `<tr><td>${escapeHtml(it.name_snapshot)}${opts}<div class="opt">SL: ${it.qty} × ${formatVND(it.unit_price)}</div></td>
      <td class="right">${formatVND(it.line_total)}</td></tr>`;
  }).join('');

  const fulfillment = order.fulfillment_type === 'dine_in'
    ? `Tại chỗ${order.floor_note ? ' · ' + escapeHtml(order.floor_note) : ''}` : 'Tại quầy';

  const qrBlock = qrDataUrl ? `
    <div class="line"></div>
    <div class="center">
      <div class="muted" style="font-weight:700;color:#000">QUÉT VIETQR ĐỂ CHUYỂN KHOẢN</div>
      <img src="${qrDataUrl}" width="200" height="200" style="margin:6px 0" />
      <div class="muted">${bank?.accountName ? escapeHtml(bank.accountName) : ''}${bank?.accountNo ? ' · ' + escapeHtml(bank.accountNo) : ''}</div>
      <div class="muted">Nội dung: <b>${escapeHtml(order.code ?? '')}</b></div>
      <div style="font-weight:700;font-size:14px;margin-top:2px">Cần trả: ${formatVND(due)}</div>
    </div>` : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${order.code ?? ''}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { font-family: 'Segoe UI', system-ui, sans-serif; }
    body { width: 72mm; margin: 0 auto; color: #000; font-size: 12px; }
    h1 { font-size: 16px; text-align: center; margin: 0; }
    .muted { color: #444; font-size: 11px; }
    .center { text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    td { padding: 3px 0; vertical-align: top; }
    .right { text-align: right; white-space: nowrap; }
    .opt { color: #555; font-size: 10px; }
    .total { border-top: 1px dashed #000; margin-top: 6px; padding-top: 6px; font-weight: 700; font-size: 14px; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    img { image-rendering: pixelated; }
  </style></head><body>
    <h1>${escapeHtml(cfg.shopName)}</h1>
    ${cfg.subtitle ? `<div class="center muted">${escapeHtml(cfg.subtitle)}</div>` : ''}
    ${cfg.address ? `<div class="center muted">${escapeHtml(cfg.address)}</div>` : ''}
    ${cfg.taxId ? `<div class="center muted">MST: ${escapeHtml(cfg.taxId)}</div>` : ''}
    <div class="line"></div>
    <div class="muted">Mã đơn: <b>${escapeHtml(order.code ?? '')}</b></div>
    <div class="muted">Thời gian: ${new Date(order.created_at).toLocaleString('vi-VN')}</div>
    <div class="muted">Nhận: ${fulfillment}</div>
    ${order.customer_name ? `<div class="muted">Khách: ${escapeHtml(order.customer_name)}</div>` : ''}
    <table>${items}</table>
    <div class="total"><table><tr><td>TỔNG CỘNG</td><td class="right">${formatVND(order.total)}</td></tr></table></div>
    <div class="muted">Thanh toán: ${PAYMENT_LABEL[order.payment_method ?? ''] ?? '—'} · ${order.payment_status === 'paid' ? 'Đã thanh toán' : order.payment_status === 'partial' ? 'Thanh toán một phần' : order.payment_status === 'debt' ? 'Ghi nợ' : 'Chưa thanh toán'}</div>
    ${qrBlock}
    <div class="line"></div>
    ${cfg.footer ? `<div class="center muted">${escapeHtml(cfg.footer)}</div>` : ''}
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},400)}</script>
  </body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}

/**
 * In VÉ BẾP (pha chế) khổ 80mm: chỉ món + tuỳ chọn + ghi chú, CHỮ TO, KHÔNG có giá.
 * Dùng cho bar/bếp pha theo đơn — tách khỏi hoá đơn khách.
 */
export async function printKitchenTicket(order: SolaceOrder): Promise<void> {
  // mPOS P8: in thẳng vé bếp qua cầu in native nếu có.
  const np = nativePrinter();
  if (np) {
    const cfg = await loadReceipt();
    try { np.printText!(buildKitchenText(order, cfg.printWidth)); np.cut?.(); return; }
    catch { /* fallback in trình duyệt */ }
  }
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return;

  const items = (order.items ?? []).map(it => {
    const opts = Array.isArray(it.options_json) && it.options_json.length
      ? `<div class="opt">${(it.options_json as Array<{ name: string }>).map(o => escapeHtml(o.name)).join(' · ')}</div>` : '';
    const note = it.note ? `<div class="note">⚠ ${escapeHtml(it.note)}</div>` : '';
    return `<div class="it"><span class="qty">${it.qty}×</span><span class="nm">${escapeHtml(it.name_snapshot)}${opts}${note}</span></div>`;
  }).join('');

  const fulfillment = order.fulfillment_type === 'dine_in'
    ? `TẠI CHỖ${order.floor_note ? ' · ' + escapeHtml(order.floor_note) : ''}`
    : order.fulfillment_type === 'delivery'
      ? `GIAO${order.floor_note ? ' · ' + escapeHtml(order.floor_note) : ''}` : 'TẠI QUẦY';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>BẾP ${order.code ?? ''}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { font-family: 'Segoe UI', system-ui, sans-serif; }
    body { width: 72mm; margin: 0 auto; color: #000; }
    h1 { font-size: 18px; text-align: center; margin: 0 0 2px; letter-spacing: 1px; }
    .code { text-align: center; font-size: 22px; font-weight: 800; margin: 2px 0; }
    .meta { text-align: center; font-size: 13px; font-weight: 700; }
    .time { text-align: center; font-size: 11px; color: #333; margin-bottom: 4px; }
    .line { border-top: 2px dashed #000; margin: 6px 0; }
    .it { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px dotted #999; }
    .qty { font-size: 20px; font-weight: 800; min-width: 36px; }
    .nm { font-size: 16px; font-weight: 700; }
    .opt { font-size: 13px; font-weight: 600; color: #222; margin-top: 2px; }
    .note { font-size: 13px; font-weight: 700; color: #000; margin-top: 2px; }
  </style></head><body>
    <h1>VÉ BẾP</h1>
    <div class="code">${escapeHtml(order.code ?? '')}</div>
    <div class="meta">${fulfillment}</div>
    ${order.customer_name ? `<div class="meta">Khách: ${escapeHtml(order.customer_name)}</div>` : ''}
    <div class="time">${new Date(order.created_at).toLocaleString('vi-VN')}</div>
    <div class="line"></div>
    ${items}
    ${order.note ? `<div class="line"></div><div class="note">Ghi chú đơn: ${escapeHtml(order.note)}</div>` : ''}
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},400)}</script>
  </body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Nội dung VÉ BẾP dạng văn bản (cho cầu in native) — chữ to, không giá. */
function buildKitchenText(order: SolaceOrder, w = 32): string {
  const sep = '='.repeat(w);
  const L: string[] = [];
  L.push('VÉ BẾP'.padStart(Math.floor((w + 6) / 2)));
  L.push((order.code ?? '').padStart(Math.floor((w + (order.code ?? '').length) / 2)));
  const ful = order.fulfillment_type === 'dine_in' ? 'TẠI CHỖ' + (order.floor_note ? ' · ' + order.floor_note : '')
    : order.fulfillment_type === 'delivery' ? 'GIAO' + (order.floor_note ? ' · ' + order.floor_note : '') : 'TẠI QUẦY';
  L.push(ful);
  if (order.customer_name) L.push('Khách: ' + order.customer_name);
  L.push(new Date(order.created_at).toLocaleString('vi-VN'));
  L.push(sep);
  for (const it of order.items ?? []) {
    L.push(`${it.qty}x  ${it.name_snapshot}`);
    if (Array.isArray(it.options_json) && it.options_json.length) L.push('     (' + (it.options_json as Array<{ name: string }>).map(o => o.name).join(' · ') + ')');
    if (it.note) L.push('     ⚠ ' + it.note);
  }
  if (order.note) { L.push(sep); L.push('Ghi chú: ' + order.note); }
  return L.join('\n') + '\n\n\n';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
