# Phê duyệt trực tiếp trên Telegram — Cài đặt & Vận hành

Tính năng cho phép **người quản lý duyệt/từ chối ngay trên Telegram** (không cần đăng nhập web).
AssetFlow Pro vẫn là hệ thống dữ liệu chính; Telegram chỉ là kênh thông báo + phê duyệt.

## Loại yêu cầu đang hỗ trợ (thử nghiệm)
- Đơn nghỉ phép (`leave`)
- Đề xuất bù công (`adj`)
- Khai báo tăng ca (`ot`)
- Đặt phòng họp (`room`)

> Mở rộng: thêm 1 entry vào `REGISTRY` trong `src/lib/telegram/approvalRegistry.ts` — KHÔNG sửa webhook.

## Luồng hoạt động
1. Nhân viên tạo yêu cầu trên AssetFlow.
2. Hệ thống xác định **người duyệt** (quản lý trực tiếp `manager_id`; riêng đặt phòng → Super Admin qua `SUPER_ADMIN_TELEGRAM_CHAT_ID`).
3. Gửi tin Telegram kèm nút **✅ Duyệt · ❌ Từ chối · 🔍 Xem chi tiết**.
4. Người duyệt bấm nút → Telegram gọi webhook → hệ thống:
   - Xác thực người duyệt theo `telegram_chat_id`.
   - **Gọi nội bộ chính API duyệt sẵn có** (`/api/leave/requests/[id]`, `/api/attendance/adjustments/[id]`, `/api/attendance/overtime/[id]`, `/api/room-bookings/[id]`) → tái dụng toàn bộ kiểm tra quyền + nghiệp vụ + thông báo nhân viên.
   - Sửa lại tin nhắn (gỡ nút) + toast xác nhận + ghi `audit_logs`.
5. Chống bấm lại: nếu đơn đã xử lý, API trả lỗi → Telegram báo "Không thể xử lý".

## Biến môi trường
```
TELEGRAM_BOT_TOKEN=...                 # đã có
SUPER_ADMIN_TELEGRAM_CHAT_ID=...       # chat id nhận yêu cầu đặt phòng (đã có)
TELEGRAM_WEBHOOK_SECRET=<chuoi-bi-mat> # MỚI — khuyến nghị, chống callback giả
NEXT_PUBLIC_APP_URL=https://assetflow.fadoai.com
```

## Đăng ký Webhook (làm 1 lần sau khi deploy)
Chạy lệnh sau (thay `<TOKEN>` và `<SECRET>` cho khớp env):
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://assetflow.fadoai.com/api/telegram/webhook" \
  -d "secret_token=<SECRET>" \
  -d "allowed_updates=[\"callback_query\",\"message\"]"
```
Kiểm tra: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## Điều kiện để người duyệt nhận & bấm được
- Người duyệt đã khai **Telegram User ID** trong *Hồ sơ của tôi* và **BẬT** nhận thông báo (`telegram_enabled`).
- Người duyệt đã **bấm Start** cho bot (Telegram chặn bot nhắn người chưa start).

## Bảo mật
- `secret_token` khớp header `X-Telegram-Bot-Api-Secret-Token` (chống callback giả).
- Xác thực người bấm theo `telegram_chat_id` → user active.
- Quyền duyệt do chính API nội bộ kiểm tra (vd: quản lý trực tiếp của nhân viên).
- Chống duyệt trùng: API trả 409 nếu đơn đã xử lý → webhook báo lỗi, không đổi trạng thái.

## Mở rộng tương lai (đã chừa chỗ)
Thiết kế registry + gọi-nội-bộ cho phép thêm: phê duyệt nhiều cấp, tuần tự/song song, SLA reminder, escalation — bằng cách bổ sung loại mới + logic trong API duyệt tương ứng, không phải sửa webhook.

## File đã tạo / sửa
**Tạo mới:**
- `src/lib/telegram/approvalRegistry.ts` — registry loại yêu cầu + parse/build callback_data
- `src/lib/telegram/sendApproval.ts` — helper gửi yêu cầu duyệt (nút) cho người duyệt
- `src/app/api/telegram/webhook/route.ts` — webhook nhận callback Duyệt/Từ chối
- `docs/telegram-approval-setup.md` — tài liệu này

**Sửa:**
- `src/lib/services/telegramService.ts` — thêm `sendTelegramApprovalRequest`, `answerTelegramCallback`, `editTelegramMessage`
- `src/app/api/leave/requests/route.ts` — gửi yêu cầu duyệt kèm nút (leave)
- `src/app/api/attendance/adjustments/route.ts` — (adj)
- `src/app/api/attendance/overtime/route.ts` — (ot)
- `src/lib/services/notificationsService.ts` — `sendNewRoomBookingNotificationToAdmin` gửi kèm nút (room)
