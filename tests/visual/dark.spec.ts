import { test, expect, Page } from '@playwright/test';

/**
 * Baseline ảnh DARK cho các trang chính (super_admin để render tối đa).
 * Auth tiêm qua localStorage trước khi app chạy (không cần đăng nhập thật).
 */

// User thật trong DB dev (super_admin) — chỉ để client render, không gọi auth server.
const AUTH = {
  id: '4ff71fda-0505-4332-a490-684922435f1c',
  email: 'namtp@fadogroup.com.au',
  name: 'Trà Phương Nam',
  role: 'super_admin',
  department: '74ab7673-13d6-404f-a576-5f4e87f8f7fa',
  company: 'FADO Group',
};

// Các trang chính cần bảo vệ (bỏ trang public: login, reset-password).
const ROUTES: { name: string; path: string }[] = [
  { name: 'dashboard',          path: '/dashboard' },
  { name: 'asset-management',   path: '/asset-management' },
  { name: 'tickets',            path: '/tickets' },
  { name: 'tasks',              path: '/tasks' },
  { name: 'room-bookings',      path: '/room-bookings' },
  { name: 'duyet-yeu-cau',      path: '/duyet-yeu-cau' },
  { name: 'nguon-nhan-luc',     path: '/nguon-nhan-luc' },
  { name: 'nhan-su',            path: '/nhan-su' },
  { name: 'organization',       path: '/organization' },
  { name: 'users',              path: '/users' },
  { name: 'history',            path: '/history' },
  { name: 'tra-cuu',            path: '/tra-cuu' },
  { name: 'cau-hinh-he-thong',  path: '/cau-hinh-he-thong' },
  { name: 'settings',           path: '/settings' },
  { name: 'bieu-mau',           path: '/bieu-mau' },
  { name: 'email-signature',    path: '/email-signature' },
  { name: 'ho-so-cua-toi',      path: '/ho-so-cua-toi' },
  { name: 'delete-requests',    path: '/delete-requests' },
  // yeu-cau-tuyen-dung: LOẠI khỏi gate — render không xác định (93% pixel đổi giữa 2 lần,
  // nội dung động/race) ⇒ gây báo động giả. Cần mask/ổn định hoá riêng trước khi đưa lại.
];

async function seedAuth(page: Page) {
  await page.addInitScript((auth) => {
    try {
      localStorage.setItem('assetflow_auth', JSON.stringify(auth));
      localStorage.setItem('currentUser', JSON.stringify(auth));
      localStorage.setItem('userId', auth.id);
      // Khoá theme về dark cho baseline ổn định (không phụ thuộc cờ/light).
      localStorage.setItem('assetflow_theme', 'dark');
    } catch { /* noop */ }
  }, AUTH);
}

test.describe('Dark baseline', () => {
  for (const route of ROUTES) {
    test(route.name, async ({ page }) => {
      await seedAuth(page);
      // Chặn SSE realtime: kết nối streaming tích tụ làm next start đuối sau nhiều
      // trang ⇒ trang cuối render hỏng (flaky). SSE không ảnh hưởng ảnh tĩnh.
      await page.route('**/api/realtime-subscribe**', (r) => r.abort());
      // domcontentloaded (KHÔNG networkidle): trang thật mở SSE realtime ⇒ network
      // không bao giờ idle ⇒ networkidle sẽ timeout.
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      // Cho dữ liệu + render ổn định
      await page.waitForTimeout(4000);
      // Đảm bảo KHÔNG dính class light (baseline là dark)
      await page.evaluate(() => document.documentElement.classList.remove('light'));
      // Clip cố định (không fullPage): trang data-heavy đổi chiều cao 4px giữa 2 lần
      // ⇒ ảnh full-page lệch giả. Clip top 1600px: kích thước luôn cố định, phần đầu
      // (header + hàng nội dung đầu) ổn định ⇒ gate deterministic mà vẫn bắt đổi màu.
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        clip: { x: 0, y: 0, width: 1440, height: 1600 },
      });
    });
  }
});
