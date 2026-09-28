# App vỏ bọc in hoá đơn — mPOS NextPay **P8**

Webapp Solace chạy trong trình duyệt **không** với tới được đầu in tích hợp của P8
(sandbox bảo mật). Giải pháp: 1 **app Android WebView** mỏng nạp
`https://assetflow.fadoai.com/solace-pos` và **tiêm cầu in `window.NativePrinter`**;
webapp đã sẵn sàng gọi cầu in này (xem `src/app/solace/pos/lib/printInvoice.ts`).

## Hợp đồng cầu in (web ↔ native) — ĐÃ cố định ở phía web
App phải `addJavascriptInterface(..., "NativePrinter")` với các hàm:

| JS gọi | Native làm |
|---|---|
| `window.NativePrinter.isAvailable()` → `boolean` | trả `true` nếu in được |
| `window.NativePrinter.printText(text)` | in chuỗi văn bản (UTF‑8, đã xuống dòng sẵn, khổ 32 cột/58mm) |
| `window.NativePrinter.cut()` (tuỳ chọn) | cắt giấy / đẩy giấy |

Webapp tự dò: có `NativePrinter` → in thẳng; không có → in qua trình duyệt như cũ.
**Không cần sửa webapp nữa.**

## Máy đã xác định: **KOZEN P8** — KHÔNG cần NextPay
CPU-Z cho biết: Model **P8 (D1)**, Manufacturer **Mpos**, Brand **Kozen**, chip **MT6762**, Android 11.
→ Đây là **Kozen P8**; SDK in là **của hãng Kozen**, không phải NextPay.

- **SDK in dùng package `com.pos.sdk.printer`** (có sẵn trong firmware máy).
- **Luồng in**: `open()` → `addPrintLine(dòng)` (mỗi dòng) → `beginPrint()` → `close()`.
- **Khổ giấy**: ~58mm, **24 ký tự/dòng** (SDK chính chủ hỗ trợ thẻ `<C> <L> <R> <B> <img>`, `width="24"`).
- **Code tham khảo có sẵn (port sang `printText()` là chạy):**
  - Flutter: `pub.dev/packages/kozen_printer`
  - Cordova: `cordova-plugin-kozen-p8-printer`
  - SDK chính chủ + `printer_v3.0.aar`: `kozenenterprise.com/sdk`
- Lấy **`printer_v3.0.aar`** (hoặc jar `com.pos.sdk`) bỏ vào `app/libs/`, khai báo trong `build.gradle`, rồi ghép vào `printText()` (xem chú thích trong `MainActivity.kt`).
- Kozen P8 thường **cho cài APK ngoài** (không khoá như Sunmi/Pax) → bạn tự build & cài được, khỏi xin ai ký.

## Cách dựng (Android Studio)
1. Tạo project mới: **Empty Views Activity** (Kotlin), `minSdk 24+`.
2. Chép `MainActivity.kt` (trong thư mục này) đè vào, sửa `package` cho khớp.
3. `AndroidManifest.xml`: thêm `<uses-permission android:name="android.permission.INTERNET"/>`,
   và cho Activity `android:exported="true"` + launcher intent.
4. Thêm **SDK in P8** vào `app/libs/` + khai báo trong `build.gradle`.
5. Ghép lệnh gọi SDK vào `PrinterBridge.printText()` (chỗ `// TODO P8 SDK`).
   - Hầu hết SDK có dạng: `printer.printText(text)` / `printer.printString(...)` rồi `printer.start()/feed()`.
   - Nếu chữ Việt bị lỗi font → set charset/encoding theo tài liệu SDK (thường UTF‑8 hoặc GBK).
6. Build APK → cài lên P8 → mở app (nó tự vào /solace-pos).

## Kiểm thử nhanh không cần SDK
Tạm để `printText` ghi log + `Toast` (đã có sẵn trong file) → bấm In trong webapp,
thấy Toast hiện nội dung bill ⇒ cầu in đã thông; chỉ còn ghép SDK in thật.
