import { test, Page } from '@playwright/test';

/**
 * Audit TƯƠNG PHẢN CHỮ ở LIGHT: tìm chữ SÁNG trên nền SÁNG (vd text-white trên
 * card đã thành trắng) ⇒ khó đọc. Bổ sung điểm mù của light-audit (chỉ dò nền).
 * Báo cáo: phần tử có ratio WCAG < 3 và chữ sáng (luminance > 0.5).
 */
const ROUTES = [
  'dashboard', 'asset-management', 'tickets', 'tasks', 'room-bookings',
  'duyet-yeu-cau', 'nguon-nhan-luc', 'nhan-su', 'organization', 'users',
  'history', 'tra-cuu', 'cau-hinh-he-thong', 'settings', 'bieu-mau',
  'email-signature', 'ho-so-cua-toi', 'delete-requests',
];

async function seedLight(page: Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('assetflow_theme', 'light'); } catch { /* noop */ }
  });
}

test.describe('Contrast audit', () => {
  for (const name of ROUTES) {
    test(name, async ({ page }) => {
      await seedLight(page);
      await page.route('**/api/realtime-subscribe**', (r) => r.abort());
      await page.goto(`/${name}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      await page.evaluate(() => document.documentElement.classList.add('light'));
      await page.waitForTimeout(500);

      const hits = await page.evaluate(() => {
        const lum = (s: string): number | null => {
          const m = s.match(/[\d.]+/g); if (!m || m.length < 3) return null;
          const a = m[3] !== undefined ? Number(m[3]) : 1;
          if (a < 0.5) return null;
          const ch = [m[0], m[1], m[2]].map(Number).map((v) => {
            v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
        };
        const effBg = (el: HTMLElement): string => {
          let e: HTMLElement | null = el;
          while (e) {
            const bg = getComputedStyle(e).backgroundColor;
            const m = bg.match(/[\d.]+/g);
            if (m) { const a = m[3] !== undefined ? Number(m[3]) : 1; if (a > 0.5) return bg; }
            e = e.parentElement;
          }
          return 'rgb(232,235,241)';
        };
        const out: { cls: string; txt: string; color: string; bg: string; ratio: number }[] = [];
        const seen = new Set<string>();
        document.querySelectorAll<HTMLElement>('*').forEach((el) => {
          // chỉ phần tử có CHỮ trực tiếp
          const hasText = Array.from(el.childNodes).some(
            (n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0
          );
          if (!hasText) return;
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.opacity === '0') return;
          // Bỏ qua nếu el/tổ tiên gần có nền GRADIENT (chữ trắng trên gradient màu = OK,
          // audit chỉ đọc background-color nên hay báo nhầm nút/avatar gradient).
          let g: HTMLElement | null = el;
          for (let i = 0; i < 4 && g; i++, g = g.parentElement) {
            if (getComputedStyle(g).backgroundImage.includes('gradient')) return;
          }
          const lt = lum(cs.color);
          const bg = effBg(el);
          const lb = lum(bg);
          if (lt == null || lb == null) return;
          if (lt < 0.5) return; // chỉ quan tâm CHỮ SÁNG
          const ratio = (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
          if (ratio >= 3) return; // đủ tương phản
          const cls = (el.className || '').toString().slice(0, 60) || el.tagName.toLowerCase();
          const key = cls + '|' + cs.color + '|' + bg;
          if (seen.has(key)) return;
          seen.add(key);
          out.push({ cls, txt: (el.textContent || '').trim().slice(0, 25), color: cs.color, bg, ratio: Math.round(ratio * 100) / 100 });
        });
        return out.sort((a, b) => a.ratio - b.ratio).slice(0, 10);
      });

      if (hits.length === 0) {
        console.log(`\n✅ [${name}] chữ đọc tốt`);
      } else {
        console.log(`\n🔧 [${name}] ${hits.length} chữ sáng/nền sáng:`);
        for (const h of hits) {
          console.log(`   ratio=${h.ratio} color=${h.color} bg=${h.bg} "${h.txt}" «${h.cls}»`);
        }
      }
    });
  }
});
