# Đóng gói Solace POS (`/solace-pos`) thành APK

PWA `/solace-pos` đã đủ điều kiện đóng gói: HTTPS + manifest (`public/solace-pos.webmanifest`)
+ icon + `display: standalone`.

> ✅ **Đã build sẵn 2 APK** từ project `mpos-wrapper/` (WebView shell nạp thẳng
> `https://assetflow.fadoai.com/solace-pos`). 2 biến thể (product flavor):
>
> | APK (flavor) | applicationId | Dùng cho | In hoá đơn |
> |---|---|---|---|
> | `SolacePOS-P8.apk` (p8) | `com.fado.solacepos` | Máy **Kozen P8** | Đầu in tích hợp qua cầu `window.NativePrinter` (cần ghép SDK Kozen) |
> | `SolacePOS-Tablet.apk` (tablet) | `com.fado.solacepos.tablet` | Điện thoại/tablet thường | Qua trình duyệt (không tiêm cầu in) |
>
> 2 `applicationId` khác nhau → cài song song trên 1 máy không đụng. Cả 2 nạp web LIVE nên
> **không cần deploy gì thêm** để chạy.

Mục dưới: cách tự build lại 2 APK (B), và cách làm bản **TWA** chuẩn Chrome nếu muốn (A).

---

## A. Bản TWA — cho điện thoại/tablet (nhanh nhất)

TWA (Trusted Web Activity) = APK "vỏ" mở Chrome engine render thẳng `/solace-pos`, full
màn hình như app thật.

### Cách 1 — PWABuilder (không cần code)
1. Vào https://www.pwabuilder.com → dán `https://assetflow.fadoai.com/solace-pos`.
2. Bấm **Package For Stores → Android**. Để package id mặc định `com.fado.solacepos.twa`
   (KHỚP với `assetlinks.json` đã host sẵn — xem dưới).
3. Tải gói: gồm `app-release-signed.apk` (cài thử) + `signing.keystore` + thông tin
   **SHA-256 fingerprint**.
4. Cập nhật fingerprint vào `public/.well-known/assetlinks.json` (thay
   `REPLACE_WITH_SHA256_FINGERPRINT_OF_YOUR_SIGNING_KEY`) rồi **deploy lại webapp** — bước
   này để Android xác thực, bỏ thanh URL trên cùng.
5. Cài APK lên máy.

### Cách 2 — Bubblewrap CLI
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://assetflow.fadoai.com/solace-pos.webmanifest
bubblewrap build         # tạo keystore + APK; in ra SHA-256 fingerprint
bubblewrap fingerprint   # xem lại fingerprint khi cần
```
Rồi làm bước 4–5 như trên.

### Lấy & điền fingerprint thủ công (nếu tự ký)
```bash
keytool -list -v -keystore your.keystore -alias your_alias | grep "SHA256:"
```
Dán giá trị (định dạng `AB:CD:...`) vào mảng `sha256_cert_fingerprints` trong
`public/.well-known/assetlinks.json`. Verify sau khi deploy:
`https://assetflow.fadoai.com/.well-known/assetlinks.json` phải trả đúng JSON.

> ⚠️ `package_name` trong `assetlinks.json` PHẢI trùng `applicationId` của APK TWA. Đang để
> `com.fado.solacepos.twa` — khác `com.fado.solacepos` của bản WebView để 2 APK cùng cài được
> trên 1 máy không đụng nhau.

---

## B. Bản WebView — cho máy Kozen P8 (in hoá đơn tích hợp)

Project Android đã dựng sẵn trong `mpos-wrapper/`:

```
mpos-wrapper/
├── settings.gradle, build.gradle, gradle.properties
├── gradle/wrapper/gradle-wrapper.properties
└── app/
    ├── build.gradle, proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/fado/solacepos/MainActivity.kt   ← WebView + cầu in
        └── res/values/{strings,themes}.xml
```

### Build bằng dòng lệnh (đã verify)
Cần **JDK 17** + **Android SDK** (platform-tools, `platforms;android-34`, `build-tools;34.0.0`).
Tạo `mpos-wrapper/local.properties` với `sdk.dir=<đường dẫn SDK>` (file này KHÔNG commit).

```bash
# trong thư mục mpos-wrapper/
gradle assembleP8Debug        # → app/build/outputs/apk/p8/debug/app-p8-debug.apk
gradle assembleTabletDebug    # → app/build/outputs/apk/tablet/debug/app-tablet-debug.apk
# hoặc cả hai: gradle assembleP8Debug assembleTabletDebug
```
APK debug ký bằng debug-key → cài thẳng lên máy (bật "Cài từ nguồn không xác định"). Bản
release ký bằng keystore riêng: `assembleP8Release` / `assembleTabletRelease` (cấu hình
`signingConfigs` trong `app/build.gradle`).

### Hoặc Android Studio
1. **Open** thư mục `mpos-wrapper/` → Studio tự sync Gradle, tải SDK.
2. Chọn build variant `p8Debug` hoặc `tabletDebug` → **Run**. App mở `/solace-pos`. Trên bản
   p8, bấm In → hiện **Toast "IN BILL: …"** ⇒ cầu in đã thông.

### Ghép SDK in thật (chỉ bản p8)
1. Lấy `printer_v3.0.aar` (hoặc jar `com.pos.sdk`) từ `kozenenterprise.com/sdk` → bỏ vào
   `mpos-wrapper/app/libs/`.
2. Mở dòng `implementation files('libs/printer_v3.0.aar')` trong `app/build.gradle`.
3. Thay phần `Toast` trong `PrinterBridge.printText()` bằng luồng SDK
   (`open() → addPrintLine() → beginPrint() → close()` — chú thích sẵn trong file).
4. Build lại `assembleP8Debug`/`assembleP8Release` → cài lên P8 (P8 cho cài APK ngoài,
   không khoá như Sunmi/Pax).

Hợp đồng cầu in web ↔ native xem `mpos-wrapper/README.md`. Phía web đã cố định, **không cần
sửa webapp**.
