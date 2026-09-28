'use client';

/**
 * Form phiếu chi — 6 khối (roadmap 11.2), progressive disclosure.
 * Tiền BIGINT đồng (MoneyInput). VAT bật/tắt + % sửa được. Line items tự tính.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Loader2, Save, Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import MoneyInput from '@/components/ui/MoneyInput';
import { formatVND, formatMoney, formatNumber } from '@/lib/format';
import { VN_BANKS } from '@/lib/banksVN';
import { useToast } from '@/context/ToastContext';
import { getCurrentUser } from '@/lib/authStore';

interface Category { id: string; name: string; flow_type: string; color: string }
interface Line { noi_dung: string; mo_ta: string; sl: number; dvt: string; don_gia: number; thanh_tien: number }

/** Tiền tệ hỗ trợ (đa quốc gia) — VND mặc định, còn lại nhập tỷ giá quy đổi VND. */
const CURRENCIES = ['VND', 'USD', 'AUD', 'EUR', 'CNY', 'SGD', 'JPY', 'KRW', 'THB', 'MYR'] as const;

interface Props {
  expenseId: string | null; // null = tạo mới
  companies: Array<{ id: string; name: string }>;
  prefill?: {
    related_type?: string; related_id?: string;
    /** Tạo phiếu QUYẾT TOÁN cho phiếu tạm ứng này (khóa công ty theo tạm ứng). */
    advance?: { id: string; code: string | null; title: string; amount: number; company_id: string; currency?: string };
  } | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}

const INPUT = 'w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500';
const LABEL = 'block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1';

const EMPTY_LINE: Line = { noi_dung: '', mo_ta: '', sl: 1, dvt: '', don_gia: 0, thanh_tien: 0 };

export default function ExpenseFormModal({ expenseId, companies, prefill, onClose, onSaved }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(!!expenseId);
  const [saving, setSaving] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [dupWarn, setDupWarn] = useState<{ code: string | null; title: string } | null>(null);

  // ① Chung
  const [title, setTitle] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [projectCode, setProjectCode] = useState('');
  // ② Tiền
  const [useLines, setUseLines] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [quickAmount, setQuickAmount] = useState(0);
  // ③ Thuế / HĐ
  const [currency, setCurrency] = useState(prefill?.advance?.currency || 'VND');
  const [exchangeRate, setExchangeRate] = useState(1);

  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(10);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierTaxCode, setSupplierTaxCode] = useState('');
  // ④ Thanh toán
  const [payeeName, setPayeeName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  // ⑥ Liên kết
  const [relatedType, setRelatedType] = useState(prefill?.related_type || '');
  const [relatedId, setRelatedId] = useState(prefill?.related_id || '');

  // Quyết toán tạm ứng: id phiếu tạm ứng liên kết + thông tin hiển thị (khóa công ty theo tạm ứng)
  const [advanceId, setAdvanceId] = useState(prefill?.advance?.id || '');
  const [advanceInfo, setAdvanceInfo] = useState<{ code: string | null; title: string; amount: number } | null>(
    prefill?.advance ? { code: prefill.advance.code, title: prefill.advance.title, amount: prefill.advance.amount } : null
  );

  const [showTax, setShowTax] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  // Tự tính
  const amountBeforeTax = useMemo(() => useLines
    ? lines.reduce((s, l) => s + (Number(l.thanh_tien) || 0), 0)
    : quickAmount, [useLines, lines, quickAmount]);
  const moneyRound = useCallback((x: number) => currency === 'VND' ? Math.round(x) : Math.round(x * 100) / 100, [currency]);
  const vatAmount = useMemo(() => vatEnabled ? moneyRound(amountBeforeTax * (Number(vatRate) || 0) / 100) : 0, [vatEnabled, amountBeforeTax, vatRate, moneyRound]);
  const total = moneyRound(amountBeforeTax + vatAmount);
  const totalVND = currency === 'VND' ? total : Math.round(total * (Number(exchangeRate) || 0));

  useEffect(() => {
    fetch('/api/expense-categories').then((r) => r.json()).then((j) => { if (Array.isArray(j?.data)) setCats(j.data); }).catch(() => {});
  }, []);

  // Tạo mới dạng quyết toán: khóa công ty theo phiếu tạm ứng + gợi ý tiêu đề.
  useEffect(() => {
    if (expenseId || !prefill?.advance) return;
    setCompanyId(prefill.advance.company_id);
    setTitle((cur) => cur || `Quyết toán tạm ứng ${prefill.advance!.code || prefill.advance!.title}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  // Tự điền từ employee graph (tạo mới): công ty = công ty đang đứng ở switcher / công ty chính.
  useEffect(() => {
    if (expenseId) return;
    try {
      const active = localStorage.getItem('active_company_id');
      const u = getCurrentUser() as any;
      const def = active || u?.company_id || '';
      if (def) setCompanyId((cur) => cur || def);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  // Nạp phiếu khi sửa
  useEffect(() => {
    if (!expenseId) return;
    (async () => {
      try {
        const r = await fetch(`/api/expenses/${expenseId}`);
        const j = await r.json();
        if (!r.ok) { toast.error(j?.error || 'Không tải được phiếu'); onClose(); return; }
        const e = j.data;
        setTitle(e.title || '');
        setExpenseDate(e.expense_date ? String(e.expense_date).slice(0, 10) : '');
        setCategoryId(e.category_id || '');
        setCompanyId(e.company_id || '');
        setCostCenter(e.cost_center || '');
        setProjectCode(e.project_code || '');
        setCurrency((e.currency || 'VND').toUpperCase());
        setExchangeRate(Number(e.exchange_rate) || 1);
        setVatEnabled(!!e.vat_enabled);
        setVatRate(e.vat_rate != null ? Number(e.vat_rate) : 10);
        setInvoiceNumber(e.invoice_number || '');
        setInvoiceDate(e.invoice_date ? String(e.invoice_date).slice(0, 10) : '');
        setSupplierName(e.supplier_name || '');
        setSupplierTaxCode(e.supplier_tax_code || '');
        setPayeeName(e.payee_name || '');
        setPaymentMethod(e.payment_method || 'bank_transfer');
        setBankAccountName(e.bank_account_name || '');
        setBankAccountNumber(e.bank_account_number || '');
        setBankName(e.bank_name || '');
        setRelatedType(e.related_type || '');
        setRelatedId(e.related_id || '');
        setAdvanceId(e.advance_id || '');
        if (e.advance_id && j.settlement?.advance) {
          const a = j.settlement.advance;
          setAdvanceInfo({ code: a.code, title: a.title, amount: Number(a.amount) });
        }
        const ls: Line[] = Array.isArray(j.lines) ? j.lines.map((l: any) => ({
          noi_dung: l.noi_dung || '',
          mo_ta: l.mo_ta || '',
          sl: Number(l.sl) || 1,
          dvt: l.dvt || '',
          don_gia: Number(l.don_gia) || 0,
          thanh_tien: Number(l.thanh_tien) || 0,
        })) : [];
        if (ls.length) { setUseLines(true); setLines(ls); }
        else setQuickAmount(Number(e.amount_before_tax ?? e.amount) || 0);
        if (e.vat_enabled || e.invoice_number) setShowTax(true);
        if (e.payee_name || e.bank_account_number) setShowPayment(true);
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  const updLine = (i: number, patch: Partial<Line>) => setLines((cur) => cur.map((l, j) => {
    if (j !== i) return l;
    const nl = { ...l, ...patch };
    nl.thanh_tien = moneyRound((Number(nl.sl) || 0) * (Number(nl.don_gia) || 0));
    return nl;
  }));

  const save = async () => {
    if (!title.trim()) { toast.error('Nhập tiêu đề'); return; }
    if (!companyId) { toast.error('Chọn công ty chịu chi phí'); return; }
    if (!categoryId) { toast.error('Chọn loại chi phí'); return; }
    if (currency !== 'VND' && (!Number(exchangeRate) || Number(exchangeRate) <= 0)) { toast.error('Nhập tỷ giá quy đổi VND'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(), expense_date: expenseDate || null, category_id: categoryId,
        company_id: companyId, cost_center: costCenter || null, project_code: projectCode || null,
        amount: total, amount_before_tax: amountBeforeTax,
        currency, exchange_rate: currency === 'VND' ? 1 : (Number(exchangeRate) || 1),
        vat_enabled: vatEnabled, vat_rate: vatEnabled ? vatRate : null, vat_amount: vatEnabled ? vatAmount : null,
        invoice_number: invoiceNumber || null, invoice_date: invoiceDate || null,
        supplier_name: supplierName || null, supplier_tax_code: supplierTaxCode || null,
        payee_name: payeeName || null, payment_method: paymentMethod,
        bank_account_name: bankAccountName || null, bank_account_number: bankAccountNumber || null, bank_name: bankName || null,
        related_type: relatedType || null, related_id: relatedId || null,
        advance_id: advanceId || null,
        lines: useLines ? lines.filter((l) => l.noi_dung || l.mo_ta || l.don_gia) : [],
      };
      const r = await fetch(expenseId ? `/api/expenses/${expenseId}` : '/api/expenses', {
        method: expenseId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j?.error || 'Lưu thất bại'); return; }
      if (j.duplicateWarning) setDupWarn(j.duplicateWarning);
      toast.success(expenseId ? 'Đã lưu phiếu' : 'Đã tạo phiếu nháp');
      onSaved(expenseId || j.data.id);
    } catch { toast.error('Lỗi kết nối'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10" style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 px-6 py-4" style={{ background: 'var(--card)' }}>
          <h2 className="text-base font-700 text-foreground">{advanceId ? (expenseId ? 'Sửa phiếu quyết toán' : 'Quyết toán tạm ứng') : expenseId ? 'Sửa phiếu chi' : 'Tạo phiếu chi'}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
        <div className="p-6 space-y-5">
          {dupWarn && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Nghi trùng: đã có phiếu {dupWarn.code || ''} "{dupWarn.title}" cùng NCC + số hoá đơn.
            </div>
          )}

          {advanceId && advanceInfo && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
              <p className="font-600 text-violet-300">Quyết toán cho phiếu tạm ứng {advanceInfo.code || ''}</p>
              <p className="mt-0.5">"{advanceInfo.title}" — đã tạm ứng <span className="font-700 tabular-nums">{formatVND(advanceInfo.amount)}</span>. Kê số THỰC CHI; hệ thống tự tính chênh lệch hoàn lại / chi thêm.</p>
            </div>
          )}

          {/* ① Thông tin chung */}
          <section className="space-y-3">
            <h3 className="text-sm font-700 text-foreground">① Thông tin chung</h3>
            <div>
              <label className={LABEL}>Tiêu đề / diễn giải *</label>
              <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Mua 2 laptop cho phòng Kinh Doanh" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Ngày phát sinh</label>
                <input type="date" className={INPUT} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Loại chi phí *</label>
                <select className={INPUT} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">— Chọn —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Công ty chịu chi phí *</label>
                {/* Quyết toán: công ty khóa theo phiếu tạm ứng */}
                <select className={INPUT} value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={!!advanceId}>
                  <option value="">— Chọn —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Trung tâm chi phí (tuỳ chọn)</label>
                <input className={INPUT} value={costCenter} onChange={(e) => setCostCenter(e.target.value)} /></div>
              <div><label className={LABEL}>Mã dự án (tuỳ chọn)</label>
                <input className={INPUT} value={projectCode} onChange={(e) => setProjectCode(e.target.value)} /></div>
            </div>
          </section>

          {/* ② Nội dung & số tiền */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-700 text-foreground">② Nội dung & số tiền</h3>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={useLines} onChange={(e) => setUseLines(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-500" />
                Kê chi tiết từng dòng
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Tiền tệ</label>
                <select className={INPUT} value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!!advanceId}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {currency !== 'VND' && (
                <div className="col-span-2">
                  <label className={LABEL}>Tỷ giá (1 {currency} = ? VND)</label>
                  <input type="number" min={0} step="any" className={INPUT} value={exchangeRate || ''}
                    onChange={(e) => setExchangeRate(Number(e.target.value))} placeholder="VD: 25400" />
                </div>
              )}
            </div>
            {useLines ? (
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)_70px_80px_120px_120px_28px] gap-2 text-2xs font-600 text-muted-foreground uppercase">
                  <span>Nội dung</span><span>Mô tả</span><span>SL</span><span>Đvt</span><span>Đơn giá</span><span className="text-right">Thành tiền</span><span />
                </div>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)_70px_80px_120px_120px_28px] gap-2 items-start">
                    <textarea rows={2} className={`${INPUT} col-span-2 sm:col-span-1 min-h-[72px] resize-y`} value={l.noi_dung} onChange={(e) => updLine(i, { noi_dung: e.target.value })} placeholder="Nội dung chi tiết" />
                    <textarea rows={2} className={`${INPUT} col-span-2 sm:col-span-1 min-h-[72px] resize-y`} value={l.mo_ta} onChange={(e) => updLine(i, { mo_ta: e.target.value })} placeholder="Mô tả bổ sung" />
                    <input type="number" min={0} step="0.01" className={INPUT} value={l.sl} onChange={(e) => updLine(i, { sl: Number(e.target.value) })} />
                    <input className={INPUT} value={l.dvt} onChange={(e) => updLine(i, { dvt: e.target.value })} placeholder="Cái" />
                    {currency === 'VND'
                      ? <MoneyInput className={INPUT} value={l.don_gia} onValueChange={(v) => updLine(i, { don_gia: v })} placeholder="0" />
                      : <input type="number" min={0} step="0.01" className={INPUT} value={l.don_gia || ''} onChange={(e) => updLine(i, { don_gia: Number(e.target.value) })} placeholder="0.00" />}
                    <div className="pt-2 text-right text-sm font-600 text-foreground tabular-nums">{formatMoney(l.thanh_tien, currency)}</div>
                    <button type="button" onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))} className="pt-2 text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setLines((cur) => [...cur, { ...EMPTY_LINE }])}
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"><Plus size={14} /> Thêm dòng</button>
              </div>
            ) : (
              <div>
                <label className={LABEL}>Số tiền (trước thuế){currency !== 'VND' ? ` — ${currency}` : ''}</label>
                {currency === 'VND'
                  ? <MoneyInput className={INPUT} value={quickAmount} onValueChange={setQuickAmount} placeholder="0" />
                  : <input type="number" min={0} step="0.01" className={INPUT} value={quickAmount || ''} onChange={(e) => setQuickAmount(Number(e.target.value))} placeholder="0.00" />}
              </div>
            )}
          </section>

          {/* ③ Thuế / Hoá đơn (gập) */}
          <section>
            <button type="button" onClick={() => setShowTax((v) => !v)} className="flex w-full items-center gap-1.5 text-sm font-700 text-foreground">
              {showTax ? <ChevronDown size={15} /> : <ChevronRight size={15} />} ③ Thuế / Hoá đơn / Nhà cung cấp
              {vatEnabled && <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-2xs text-emerald-400">VAT {vatRate}%</span>}
            </button>
            {showTax && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="checkbox" checked={vatEnabled} onChange={(e) => setVatEnabled(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                    Có thuế GTGT
                  </label>
                  {vatEnabled && (
                    <div className="flex items-center gap-1.5 text-sm text-foreground">
                      <input type="number" min={0} max={100} step="0.1" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}
                        className="w-20 rounded-xl border border-white/10 bg-[#162033] px-2 py-1.5 text-sm text-foreground outline-none focus:border-indigo-500" />
                      <span className="text-xs text-muted-foreground">% → {formatMoney(vatAmount, currency)}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>Số hoá đơn</label><input className={INPUT} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></div>
                  <div><label className={LABEL}>Ngày hoá đơn</label><input type="date" className={INPUT} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
                  <div><label className={LABEL}>Nhà cung cấp</label><input className={INPUT} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} /></div>
                  <div><label className={LABEL}>MST nhà cung cấp</label><input className={INPUT} value={supplierTaxCode} onChange={(e) => setSupplierTaxCode(e.target.value)} /></div>
                </div>
              </div>
            )}
          </section>

          {/* ④ Thanh toán (gập) */}
          <section>
            <button type="button" onClick={() => setShowPayment((v) => !v)} className="flex w-full items-center gap-1.5 text-sm font-700 text-foreground">
              {showPayment ? <ChevronDown size={15} /> : <ChevronRight size={15} />} ④ Thanh toán / Người thụ hưởng
            </button>
            {showPayment && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label className={LABEL}>Người thụ hưởng</label><input className={INPUT} value={payeeName} onChange={(e) => setPayeeName(e.target.value)} /></div>
                <div><label className={LABEL}>Phương thức</label>
                  <select className={INPUT} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="bank_transfer">Chuyển khoản</option>
                    <option value="cash">Tiền mặt</option>
                  </select>
                </div>
                <div><label className={LABEL}>Chủ tài khoản</label><input className={INPUT} value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} /></div>
                <div><label className={LABEL}>Số tài khoản</label><input className={INPUT} value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} /></div>
                <div className="col-span-2"><label className={LABEL}>Ngân hàng / Chi nhánh</label>
                  <input className={INPUT} list="vn-banks" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Gõ để tìm: VCB, Techcombank… (NH nước ngoài gõ tự do)" />
                  <datalist id="vn-banks">
                    {VN_BANKS.map((b) => <option key={b.bin} value={b.shortName}>{b.name}</option>)}
                  </datalist>
                </div>
              </div>
            )}
          </section>

          {/* ⑥ Liên kết (chỉ hiện khi có) */}
          {relatedType && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
              <Link2 className="h-3.5 w-3.5" /> Gắn với {relatedType === 'ticket' ? 'Ticket' : relatedType} <span className="font-mono">{relatedId}</span>
              <button type="button" onClick={() => { setRelatedType(''); setRelatedId(''); }} className="ml-auto text-sky-400 hover:text-sky-300"><X size={12} /></button>
            </div>
          )}

          {/* Tổng cộng */}
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Trước thuế</span><span className="tabular-nums">{formatMoney(amountBeforeTax, currency)}</span>
            </div>
            {vatEnabled && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>VAT {vatRate}%</span><span className="tabular-nums">{formatMoney(vatAmount, currency)}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-sm font-700 text-foreground">TỔNG CỘNG</span>
              <span className="text-lg font-800 text-amber-400 tabular-nums">{formatMoney(total, currency)}</span>
            </div>
            {currency !== 'VND' && (
              <p className="mt-1 text-right text-xs text-muted-foreground">≈ {formatVND(totalVND)} (tỷ giá {formatNumber(exchangeRate)})</p>
            )}
          </div>
        </div>
        )}

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-white/5 px-6 py-4" style={{ background: 'var(--card)' }}>
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={() => void save()} disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu nháp
          </button>
        </div>
      </div>
    </div>
  );
}
