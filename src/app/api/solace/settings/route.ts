import { NextRequest, NextResponse } from 'next/server';
import {
  getSolaceSettings, saveBankConfig, saveOperatingConfig, saveDebtConfig,
  saveInventoryConfig, saveRecipientsConfig, saveWalletConfig, saveDeliveryConfig, saveReceiptConfig,
} from '@/lib/services/solaceSettingsService';
import { guardSolaceSuperAdmin } from '@/lib/solaceApiGuard';

export async function GET(request: NextRequest) {
  try {
    const g = await guardSolaceSuperAdmin(request);
    if (g instanceof NextResponse) return g;
    const data = await getSolaceSettings();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/settings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const g = await guardSolaceSuperAdmin(request);
    if (g instanceof NextResponse) return g;
    const { section, value } = await request.json();
    switch (section) {
      case 'bank': await saveBankConfig(value, g.userId); break;
      case 'operating': await saveOperatingConfig(value, g.userId); break;
      case 'debt': await saveDebtConfig(value, g.userId); break;
      case 'inventory': await saveInventoryConfig(value, g.userId); break;
      case 'wallet': await saveWalletConfig(value, g.userId); break;
      case 'delivery': await saveDeliveryConfig(value, g.userId); break;
      case 'recipients': await saveRecipientsConfig(value, g.userId); break;
      case 'receipt': await saveReceiptConfig(value, g.userId); break;
      default: return NextResponse.json({ error: 'Phần cấu hình không hợp lệ' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/solace/settings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
