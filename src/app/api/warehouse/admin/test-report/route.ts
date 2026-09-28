import { NextRequest, NextResponse } from 'next/server';
import { requireWarehouseManager } from '@/lib/warehouse/adminGuard';
import { getWarehouse } from '@/lib/services/warehouseService';
import { buildMonthlyReportBuffer } from '@/lib/warehouse/reportData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST: gửi thử báo cáo tháng NGAY (không chờ scheduler đầu tháng, không ghi
 * warehouse_report_log). Body { warehouseId, month?: 'YYYY-MM' } — mặc định tháng hiện tại.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const guard = await requireWarehouseManager(request, body.warehouseId, 'edit');
    if ('response' in guard) return guard.response;
    const wh = await getWarehouse(body.warehouseId);
    if (!wh) return NextResponse.json({ error: 'Không tìm thấy kho' }, { status: 404 });
    if (!wh.report_emails?.length) {
      return NextResponse.json({ error: 'Kho chưa cấu hình email nhận báo cáo — nhập ở mục Email nhận báo cáo tháng trước.' }, { status: 400 });
    }
    const month = body.month ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).slice(0, 7);
    const report = await buildMonthlyReportBuffer(wh.id, month);
    if (!report) return NextResponse.json({ error: 'Không tìm thấy kho' }, { status: 404 });
    const buffer = report.buffer;
    const { sendEmail } = await import('@/lib/services/emailCenterService');
    await sendEmail({
      to: wh.report_emails.join(', '),
      category: 'warehouse-report',
      subject: `[Warehouse][GỬI THỬ] Báo cáo công & sản lượng ${month} — ${wh.name}`,
      html: `<p>Đây là email <b>gửi thử</b> báo cáo tổng hợp bảng công và sản lượng tháng <b>${month}</b> của kho <b>${wh.name}</b>.</p>
             <p>Email tự động từ hệ thống Warehouse — AssetFlow.</p>`,
      attachments: [{
        filename: `bao-cao-kho-${month}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: buffer,
      }],
      sentBy: guard.actor.id,
    });
    return NextResponse.json({ success: true, sent_to: wh.report_emails, month });
  } catch (err: any) {
    console.error('POST /api/warehouse/admin/test-report error:', err);
    return NextResponse.json({ error: `Gửi thất bại: ${err?.message || 'lỗi không rõ'}` }, { status: 500 });
  }
}
