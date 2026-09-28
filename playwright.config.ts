import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 0 — Visual regression cho DARK mode.
 * Ảnh golden lưu cạnh test (__screenshots__). Mỗi PR đổi token chạy lại,
 * lệch pixel ở dark = fail ⇒ dark được bảo vệ cơ học.
 *
 * Dev server: dùng lại server đang chạy ở :4028 (reuseExistingServer).
 */
export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  globalSetup: './tests/visual/global-setup.ts',

  expect: {
    toHaveScreenshot: {
      // threshold = độ nhạy MỖI pixel (0..1, mặc định 0.2 quá lỏng — bỏ sót đổi màu nhẹ).
      // 0.1 bắt được cả thay đổi màu tinh tế; maxDiffPixelRatio nhỏ để chặn lan rộng.
      // threshold = độ nhạy mỗi pixel (0.1 bắt đổi màu nhẹ).
      // maxDiffPixelRatio = % pixel được phép khác: 0.02 dung sai data động nhỏ
      // (badge thông báo live, timestamp tương đối) mà vẫn bắt mọi đổi theme thật
      // (đổi màu lan khắp trang ≫ 2%). Chuẩn ngành (Chromatic mặc định 0.063).
      threshold: 0.1,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  use: {
    baseURL: 'http://localhost:3002',
    storageState: './tests/visual/.auth/state.json',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },

  projects: [
    { name: 'chromium-dark', use: { ...devices['Desktop Chrome'] } },
  ],

  // CHẠY TRÊN BẢN BUILD PRODUCTION (CSS tĩnh, không HMR) — cách duy nhất tin cậy:
  // dev server tái dùng/HMR gây trễ CSS ⇒ gate bỏ sót thay đổi. Mỗi lần chạy rebuild
  // ⇒ luôn phản ánh đúng source hiện tại.
  // Chỉ `next start` trên bản build SẴN (build thủ công 1 lần trước) — tránh nhiều
  // `npm run build` chạy đồng thời clobber .next gây "Cannot find module './NNN.js'".
  // reuseExistingServer:true để tái dùng server đang chạy nếu có.
  webServer: {
    command: 'npx next start -p 3002',
    url: 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
