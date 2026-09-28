import { NextRequest, NextResponse } from 'next/server';
import {
  getBalances, listCashTxns, hasOpening, setOpening, recordManual, transferCash, adjustToCounted,
  type CashAccount, type CashCategory,
} from '@/lib/services/solaceCashService';
import { guardSolace } from '@/lib/solaceApiGuard';

/** GET /api/solace/cash?date=&account=&category= → số dư + danh sách giao dịch. */
export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-cash', 'view');
    if (g instanceof NextResponse) return g;
    const sp = new URL(request.url).searchParams;
    const account = (sp.get('account') as CashAccount | null) ?? undefined;
    const category = (sp.get('category') as CashCategory | null) ?? undefined;
    const [balances, txns, openingCash, openingBank] = await Promise.all([
      getBalances(),
      listCashTxns({ businessDate: sp.get('date') ?? undefined, account, category, limit: 200 }),
      hasOpening('cash'), hasOpening('bank'),
    ]);
    return NextResponse.json({ success: true, data: { balances, txns, openingSet: { cash: openingCash, bank: openingBank } } });
  } catch (err) {
    console.error('GET /api/solace/cash error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/solace/cash — ghi sổ thủ công. body.action:
 *  - 'opening'  { account, amount }
 *  - 'manual'   { account, direction:'in'|'out', amount, category:'expense'|'sale'|..., note }
 *  - 'transfer' { from, to, amount, note }
 *  - 'adjust'   { account, counted, note }
 */
export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-cash', 'edit');
    if (g instanceof NextResponse) return g;
    const b = await request.json();
    switch (b.action) {
      case 'opening':
        await setOpening(b.account as CashAccount, Number(b.amount), g.userId);
        break;
      case 'manual':
        await recordManual({
          account: b.account as CashAccount, direction: b.direction === 'in' ? 'in' : 'out',
          amount: Number(b.amount), category: (b.category as CashCategory) ?? 'expense', note: b.note ?? null, actor: g.userId,
        });
        break;
      case 'transfer':
        await transferCash(b.from as CashAccount, b.to as CashAccount, Number(b.amount), b.note ?? null, g.userId);
        break;
      case 'adjust':
        await adjustToCounted(b.account as CashAccount, Number(b.counted), b.note ?? null, g.userId);
        break;
      default:
        return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/solace/cash error:', err);
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
