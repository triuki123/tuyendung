/**
 * Server startup hook
 * Khởi động services khi app start
 */

import { AttendanceProxyServer } from '@/services/attendanceProxyService';
import { startFdvReminders } from '@/lib/services/fdvService';
import { pollerManager } from '@/lib/zkteco/pollerManager';
import {
  startContractReminderScheduler,
  stopContractReminderScheduler,
} from '@/lib/contracts/reminderScheduler';
import {
  startEvaluationScheduler,
  stopEvaluationScheduler,
} from '@/lib/evaluations/evaluationScheduler';
import {
  startOnboardingDraftScheduler,
  stopOnboardingDraftScheduler,
} from '@/lib/contracts/onboardingDraftScheduler';
import {
  startRecruitmentReportScheduler,
  stopRecruitmentReportScheduler,
} from '@/lib/contracts/recruitmentReportScheduler';
import {
  startRequisitionReminderScheduler,
  stopRequisitionReminderScheduler,
} from '@/lib/contracts/requisitionReminderScheduler';
import {
  startLeaveAccrualScheduler,
  stopLeaveAccrualScheduler,
} from '@/lib/leave/accrualScheduler';
import {
  startLeaveBalanceReminderScheduler,
  stopLeaveBalanceReminderScheduler,
} from '@/lib/leave/leaveBalanceReminderScheduler';
import {
  startAssetMaintenanceScheduler,
  stopAssetMaintenanceScheduler,
} from '@/lib/assets/assetMaintenanceScheduler';
import {
  startKpiReminderScheduler,
  stopKpiReminderScheduler,
} from '@/lib/kpi/kpiReminderScheduler';
import {
  startLegalReminderScheduler,
  stopLegalReminderScheduler,
} from '@/lib/legal/legalReminderScheduler';
import {
  startRoomBookingReminderScheduler,
  stopRoomBookingReminderScheduler,
} from '@/lib/rooms/roomBookingReminderScheduler';
import {
  startRoomCheckinScheduler,
  stopRoomCheckinScheduler,
} from '@/lib/rooms/roomCheckinScheduler';
import {
  startWarehouseScheduler,
  stopWarehouseScheduler,
} from '@/lib/warehouse/warehouseSchedulers';
import {
  startShortLinkScheduler,
  stopShortLinkScheduler,
} from '@/lib/shortlinks/shortLinkScheduler';
import {
  startTaskOverdueScheduler,
  stopTaskOverdueScheduler,
} from '@/lib/tasks/taskOverdueScheduler';
import {
  startAttendanceSummaryScheduler,
  stopAttendanceSummaryScheduler,
} from '@/lib/attendance/attendanceSummaryScheduler';
import {
  startAttendanceAutoSendScheduler,
  stopAttendanceAutoSendScheduler,
} from '@/lib/attendance/attendanceAutoSendScheduler';
import {
  startOnboardingChecklistScheduler,
  stopOnboardingChecklistScheduler,
} from '@/lib/onboarding/onboardingChecklistScheduler';
import {
  startArchiveBookingsScheduler,
  stopArchiveBookingsScheduler,
} from '@/lib/rooms/archiveBookingsScheduler';
import {
  startTicketAutoCloseScheduler,
  stopTicketAutoCloseScheduler,
} from '@/lib/tickets/ticketAutoCloseScheduler';
import {
  startTicketArchiveScheduler,
  stopTicketArchiveScheduler,
} from '@/lib/tickets/ticketArchiveScheduler';
import {
  startNotificationOutboxScheduler,
  stopNotificationOutboxScheduler,
} from '@/lib/notifications/outboxScheduler';
import {
  startBirthdayScheduler,
  stopBirthdayScheduler,
} from '@/lib/birthdays/birthdayScheduler';
import {
  startSolaceReminderScheduler,
  stopSolaceReminderScheduler,
} from '@/lib/solace/solaceReminderScheduler';
import {
  startSolaceShiftReminderScheduler,
  stopSolaceShiftReminderScheduler,
} from '@/lib/solace/solaceShiftReminderScheduler';
import {
  startSolaceBroadcastScheduler,
  stopSolaceBroadcastScheduler,
} from '@/lib/solace/solaceBroadcastScheduler';
import {
  startMediaCleanupScheduler,
  stopMediaCleanupScheduler,
} from '@/lib/media/mediaCleanupScheduler';
import { ensureBookingWebhook } from '@/lib/telegram/bookingBot';

let proxyServer: AttendanceProxyServer | null = null;

export async function startAttendanceServices() {
  try {
    // ──────────────────────────────────────────────────────────────
    // ZKTeco Polling — đa máy, đọc cấu hình từ DB (attendance_machines).
    // Chỉ poll máy connection_mode='pull'; máy 'push' tự gửi qua ADMS.
    // ──────────────────────────────────────────────────────────────
    pollerManager.start().catch((err) => {
      console.error('❌ Failed to start pollers:', err);
    });

    // ──────────────────────────────────────────────────────────────
    // Nhắc gia hạn hợp đồng (module Nhân Sự) — scheduler 9h/15h VN.
    // ──────────────────────────────────────────────────────────────
    startContractReminderScheduler();

    // ──────────────────────────────────────────────────────────────
    // Đánh giá thử việc / học việc — scheduler 9h/15h VN.
    // ──────────────────────────────────────────────────────────────
    startEvaluationScheduler();

    // ──────────────────────────────────────────────────────────────
    // Tự tạo bản nháp thỏa thuận (Hợp tác + Bảo mật) 1 ngày trước khi
    // nhân sự mới vào làm — scheduler 9h VN.
    // ──────────────────────────────────────────────────────────────
    startOnboardingDraftScheduler();

    // ──────────────────────────────────────────────────────────────
    // Báo cáo tuyển dụng tuần — Telegram Thứ Hai 8h VN.
    // ──────────────────────────────────────────────────────────────
    startRecruitmentReportScheduler();

    // ──────────────────────────────────────────────────────────────
    // Nhắc Yêu Cầu Tuyển Dụng sắp hết hạn (5 & 1 ngày trước) — 9h VN.
    // ──────────────────────────────────────────────────────────────
    startRequisitionReminderScheduler();

    // ──────────────────────────────────────────────────────────────
    // Cộng phép năm tự động (module Nghỉ Phép) — scheduler 7h sáng VN.
    // ──────────────────────────────────────────────────────────────
    startLeaveAccrualScheduler();

    // ──────────────────────────────────────────────────────────────
    // Nhắc phép năm sắp hết hạn chuyển năm — scheduler 9h VN.
    // ──────────────────────────────────────────────────────────────
    startLeaveBalanceReminderScheduler();

    // ──────────────────────────────────────────────────────────────
    // Nhắc bảo hành/bảo trì tài sản sắp hết hạn — scheduler 9h VN.
    // ──────────────────────────────────────────────────────────────
    startAssetMaintenanceScheduler();

    // ──────────────────────────────────────────────────────────────
    // Nhắc hạn KPI (cá nhân + đơn vị) sắp hết kỳ — scheduler 9h VN.
    // ──────────────────────────────────────────────────────────────
    startKpiReminderScheduler();

    // ──────────────────────────────────────────────────────────────
    // Nhắc hạn Pháp Chế: giấy phép/hợp đồng/ủy quyền sắp hết hạn +
    // nghĩa vụ tuân thủ đến kỳ — scheduler slot sáng.
    // ──────────────────────────────────────────────────────────────
    startLegalReminderScheduler();

    // ──────────────────────────────────────────────────────────────
    // Nhắc phòng họp sắp diễn ra (30 phút trước) — scheduler mỗi 5 phút.
    // ──────────────────────────────────────────────────────────────
    startRoomBookingReminderScheduler();

    // ──────────────────────────────────────────────────────────────
    // Tự động hoá nhận/trả phòng (nhắc check-in/out + tự nhả no-show) — mỗi 3 phút.
    // ──────────────────────────────────────────────────────────────
    startRoomCheckinScheduler();

    // ──────────────────────────────────────────────────────────────
    // Warehouse: purge ảnh chấm công quá hạn + báo cáo email tháng — mỗi 30 phút.
    // ──────────────────────────────────────────────────────────────
    startWarehouseScheduler();

    // ──────────────────────────────────────────────────────────────
    // Dọn link rút gọn đã hết hạn quá hạn ân hạn — mỗi 12 giờ.
    // ──────────────────────────────────────────────────────────────
    startShortLinkScheduler();

    // ──────────────────────────────────────────────────────────────
    // Nhắc task/ticket quá hạn hoặc đến hạn hôm nay — scheduler 8:30 VN.
    // ──────────────────────────────────────────────────────────────
    startTaskOverdueScheduler();

    // ──────────────────────────────────────────────────────────────
    // Tổng kết chấm công cuối tháng — chạy ngày 1 lúc 8h VN.
    // ──────────────────────────────────────────────────────────────
    startAttendanceSummaryScheduler();

    // ──────────────────────────────────────────────────────────────
    // Tự động gửi bảng công về Bộ Phận Chấm Công khi tới hạn nộp
    // (quản lý chỉ xem, không duyệt/gửi) — scheduler 30 phút/lần.
    // ──────────────────────────────────────────────────────────────
    startAttendanceAutoSendScheduler();

    // ──────────────────────────────────────────────────────────────
    // Nhắc onboarding submission chưa xử lý > 2 ngày — scheduler 10h VN.
    // ──────────────────────────────────────────────────────────────
    startOnboardingChecklistScheduler();

    // ──────────────────────────────────────────────────────────────
    // Lưu trữ booking phòng họp cũ > 7 ngày — scheduler 2h sáng VN.
    // ──────────────────────────────────────────────────────────────
    startArchiveBookingsScheduler();
    startFdvReminders();

    // ──────────────────────────────────────────────────────────────
    // Tự động đóng ticket resolved/rejected quá 3 ngày — scheduler 17h VN.
    // ──────────────────────────────────────────────────────────────
    startTicketAutoCloseScheduler();

    // ──────────────────────────────────────────────────────────────
    // Tự động lưu trữ ticket kết thúc (hoàn thành/hủy/đóng) quá 7 ngày — 3h VN.
    // ──────────────────────────────────────────────────────────────
    startTicketArchiveScheduler();

    // ──────────────────────────────────────────────────────────────
    // Hộp thư đi Telegram — drain + retry mỗi 30s (đảm bảo gửi).
    // ──────────────────────────────────────────────────────────────
    startNotificationOutboxScheduler();

    // ──────────────────────────────────────────────────────────────
    // Sinh nhật — digest ngày 1 + nhắc BOD & Leader hôm nay (mỗi 30 phút).
    // ──────────────────────────────────────────────────────────────
    startBirthdayScheduler();

    // ──────────────────────────────────────────────────────────────
    // Solace — nhắc công nợ + cảnh báo tồn kho thấp (mỗi sáng, 30 phút/tick).
    // ──────────────────────────────────────────────────────────────
    startSolaceReminderScheduler();

    // ──────────────────────────────────────────────────────────────
    // Solace — nhắc kết ca (tối) + tự kết ca ngày hôm trước (rạng sáng).
    // ──────────────────────────────────────────────────────────────
    startSolaceShiftReminderScheduler();

    // ──────────────────────────────────────────────────────────────
    // Solace Marketing — phát bài broadcast đã hẹn giờ (tick mỗi phút).
    // ──────────────────────────────────────────────────────────────
    startSolaceBroadcastScheduler();

    // ──────────────────────────────────────────────────────────────
    // Media (MinIO) — dọn record presigned 'pending' bỏ ngang + xoá object
    // của media đã soft-delete quá hạn giữ rác. Không có S3 thì tick bỏ qua.
    // ──────────────────────────────────────────────────────────────
    startMediaCleanupScheduler();

    // ──────────────────────────────────────────────────────────────
    // Bot FADO Notification — tự đăng ký webhook (nhận message cho /booking)
    // + lệnh menu /booking. Idempotent, không phá luồng duyệt.
    // ──────────────────────────────────────────────────────────────
    void ensureBookingWebhook();

    // ──────────────────────────────────────────────────────────────
    // TCP Proxy (nếu máy gửi data qua TCP)
    // ──────────────────────────────────────────────────────────────
    const listenPort = parseInt(process.env.ATTENDANCE_PROXY_PORT || '0', 10);
    if (listenPort > 0) {
      try {
        proxyServer = new AttendanceProxyServer();
        await proxyServer.start(listenPort);
        console.log(`✅ Attendance proxy started on port ${listenPort}`);
      } catch (err) {
        console.error('❌ Failed to start attendance proxy:', err);
      }
    }
  } catch (err) {
    console.error('❌ Failed to start attendance services:', err);
  }
}

export function stopAttendanceServices() {
  if (proxyServer) {
    proxyServer.stop();
    proxyServer = null;
  }
  pollerManager.stopAll();
  stopContractReminderScheduler();
  stopEvaluationScheduler();
  stopOnboardingDraftScheduler();
  stopRecruitmentReportScheduler();
  stopRequisitionReminderScheduler();
  stopLeaveAccrualScheduler();
  stopLeaveBalanceReminderScheduler();
  stopAssetMaintenanceScheduler();
  stopKpiReminderScheduler();
  stopLegalReminderScheduler();
  stopRoomBookingReminderScheduler();
  stopRoomCheckinScheduler();
  stopWarehouseScheduler();
  stopShortLinkScheduler();
  stopNotificationOutboxScheduler();
  stopTaskOverdueScheduler();
  stopAttendanceSummaryScheduler();
  stopAttendanceAutoSendScheduler();
  stopOnboardingChecklistScheduler();
  stopArchiveBookingsScheduler();
  stopTicketAutoCloseScheduler();
  stopTicketArchiveScheduler();
  stopBirthdayScheduler();
  stopSolaceReminderScheduler();
  stopSolaceShiftReminderScheduler();
  stopSolaceBroadcastScheduler();
  stopMediaCleanupScheduler();
}

// Fire-and-forget khi module được import — không await để không block server startup
if (typeof window === 'undefined') {
  startAttendanceServices().catch(console.error);

  process.on('SIGTERM', () => {
    console.log('Shutting down...');
    stopAttendanceServices();
    process.exit(0);
  });
}
