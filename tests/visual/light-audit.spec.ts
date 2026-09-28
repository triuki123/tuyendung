import { test, Page } from '@playwright/test';

/**
 * Bước 1 — DÒ mảng tối còn sót ở LIGHT mode (không phải regression; là báo cáo).
 * Quét DOM: phần tử nền tối kiểu "surface" (xanh-đen, ít bão hoà) + diện tích lớn
 * ⇒ nơi shim/token chưa với tới (gradient, inline-style, hex chưa map).
 * Bỏ qua nút accent (màu bão hoà) vì chúng NÊN tối cả ở light.
 */

const AUTH = {
  id: '4ff71fda-0505-4332-a490-684922435f1c',
  email: 'namtp@fadogroup.com.au',
  name: 'Trà Phương Nam',
  role: 'super_admin',
  department: '74ab7673-13d6-404f-a576-5f4e87f8f7fa',
  company: 'FADO Group',
};

const ROUTES = [
  'dashboard', 'asset-management', 'tickets', 'tasks', 'room-bookings',
  'duyet-yeu-cau', 'nguon-nhan-luc', 'nhan-su', 'organization', 'users',
  'history', 'tra-cuu', 'cau-hinh-he-thong', 'settings', 'bieu-mau',
  'email-signature', 'ho-so-cua-toi', 'delete-requests',
  // yeu-cau-tuyen-dung: bỏ — render không xác định (xem dark.spec.ts)
];

async function seedLight(page: Page) {
  await page.addInitScript((auth) => {
    try {
      localStorage.setItem('assetflow_auth', JSON.stringify(auth));
      localStorage.setItem('currentUser', JSON.stringify(auth));
      localStorage.setItem('userId', auth.id);
      localStorage.setItem('assetflow_theme', 'light');
    } catch { /* noop */ }
  }, AUTH);
}

test.describe('Light audit', () => {
  for (const name of ROUTES) {
    test(name, async ({ page }) => {
      await seedLight(page);
      await page.route('**/api/realtime-subscribe**', (r) => r.abort());
      await page.goto(`/${name}`, { waitUntil: 'domcontentloaded' });
      // Chờ loadPreferences (DB=dark) chạy xong RỒI mới ép light — nếu ép trước,
      // applyTheme từ DB sẽ gỡ class light và audit đọc nhầm chế độ tối.
      await page.waitForTimeout(4000);
      await page.evaluate(() => document.documentElement.classList.add('light'));
      await page.waitForTimeout(500);

      const hits = await page.evaluate(() => {
        const out: { cls: string; bg: string; area: number; grad: boolean }[] = [];
        const seen = new Set<string>();
        document.querySelectorAll<HTMLElement>('*').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 90 || r.height < 28) return;
          const cs = getComputedStyle(el);
          const bg = cs.backgroundColor;
          const bi = cs.backgroundImage;
          let dark = false, grad = false;
          const m = bg.match(/[\d.]+/g);
          if (m && m.length >= 3) {
            const [rr, gg, bb] = m.map(Number);
            const a = m[3] !== undefined ? Number(m[3]) : 1;
            const sat = Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
            // tối + ít bão hoà = surface (xanh-đen của theme), KHÔNG phải nút accent
            if (a > 0.6 && rr + gg + bb < 190 && sat < 45) dark = true;
          }
          if (!dark && bi && bi.includes('gradient')) {
            const nums = (bi.match(/rgba?\([^)]+\)/g) || [])
              .map((c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number))
              .filter((t) => t.length === 3);
            if (nums.some(([rr, gg, bb]) => rr + gg + bb < 190 && Math.max(rr, gg, bb) - Math.min(rr, gg, bb) < 45)) {
              grad = true; dark = true;
            }
          }
          if (!dark) return;
          const cls = (el.className || '').toString().slice(0, 70) || el.tagName.toLowerCase();
          const key = cls + '|' + bg;
          if (seen.has(key)) return;
          seen.add(key);
          out.push({ cls, bg, area: Math.round(r.width * r.height), grad });
        });
        return out.sort((a, b) => b.area - a.area).slice(0, 8);
      });

      if (hits.length === 0) {
        console.log(`\n✅ [${name}] sạch — không mảng tối`);
      } else {
        console.log(`\n🔧 [${name}] ${hits.length} mảng tối:`);
        for (const h of hits) {
          console.log(`   area=${h.area} ${h.grad ? '(gradient) ' : ''}bg=${h.bg}  «${h.cls}»`);
        }
      }
    });
  }
});
