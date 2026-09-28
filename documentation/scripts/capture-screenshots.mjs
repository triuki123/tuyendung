// Chụp screenshot tự động cho tài liệu.
// Cách dùng:
//   1. App dev phải đang chạy ở http://localhost:4028
//   2. Đặt biến môi trường AUTH_JSON = chuỗi JSON phiên đăng nhập (assetflow_auth)
//   3. node documentation/scripts/capture-screenshots.mjs
//
// Phiên được tiêm vào localStorage trước khi tải trang (không cần nhập mật khẩu).
// ONLY_MISSING=1 → chỉ chụp các file chưa tồn tại.
import puppeteer from 'puppeteer'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'screenshots')
const BASE = process.env.BASE_URL || 'http://localhost:4028'
const AUTH = process.env.AUTH_JSON || ''
const ONLY_MISSING = process.env.ONLY_MISSING === '1'

// Các trang cần đăng nhập (auth) — chụp trước
const AUTHED = [
  { route: '/dashboard', file: 'dashboard/tong-quan.png' },
  { route: '/dashboard', file: 'bat-dau/giao-dien-chung.png' },
  { route: '/asset-management', file: 'tai-san/tong-quan.png' },
  { route: '/asset-management/hardware', file: 'tai-san/phan-cung.png' },
  { route: '/organization', file: 'to-chuc/tong-quan.png' },
  { route: '/tickets', file: 'tickets/tong-quan.png' },
  { route: '/tasks', file: 'cong-viec/tong-quan.png' },
  { route: '/room-bookings', file: 'dat-phong/tong-quan.png' },
  { route: '/tra-cuu/du-lieu-cong', file: 'cham-cong/tong-quan.png' },
  { route: '/tra-cuu', file: 'tra-cuu/tong-quan.png' },
  { route: '/ho-so-cua-toi', file: 'ho-so-cua-toi/tong-quan.png' },
  { route: '/duyet-yeu-cau', file: 'duyet-yeu-cau/tong-quan.png' },
  { route: '/nhan-su', file: 'nhan-su/tong-quan.png' },
  { route: '/nguon-nhan-luc', file: 'nguon-nhan-luc/tong-quan.png' },
  { route: '/bieu-mau', file: 'bieu-mau/tong-quan.png' },
  { route: '/history', file: 'lich-su/tong-quan.png' },
  { route: '/users', file: 'quan-tri/nguoi-dung.png' },
  { route: '/organization/companies-organization', file: 'quan-tri/co-cau-to-chuc.png' },
  { route: '/tickets/admin/config', file: 'quan-tri/cau-hinh-ticket.png' },
  { route: '/tra-cuu/du-lieu-cong/cau-hinh', file: 'quan-tri/cau-hinh-cham-cong.png' },
  { route: '/settings', file: 'quan-tri/cai-dat.png' },
]
// Trang công khai (không đăng nhập) — chụp cuối
const PUBLIC = [
  { route: '/sign-up-login-screen', file: 'bat-dau/dang-nhap.png' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function capture(page, s) {
  const dest = join(OUT, s.file)
  if (ONLY_MISSING && existsSync(dest)) { console.log('· bỏ qua (đã có):', s.file); return true }
  mkdirSync(dirname(dest), { recursive: true })
  // Thử tối đa 3 lần: lần đầu Next dev compile (chậm), lần sau đã cache nên nhanh
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE}${s.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await sleep(3000) // chờ React mount + gọi API
      // Chờ tới khi nội dung không còn trạng thái "Đang tải" (tối đa ~18s)
      for (let w = 0; w < 12; w++) {
        const loading = await page.evaluate(() => {
          const t = document.body.innerText || ''
          return /Đang tải|Loading/i.test(t)
        }).catch(() => false)
        if (!loading) break
        await sleep(1500)
      }
      await sleep(1500) // ổn định layout/biểu đồ trước khi chụp
      await page.screenshot({ path: dest })
      console.log('✓', s.route, '→', s.file, attempt > 1 ? `(lần ${attempt})` : '')
      return true
    } catch (e) {
      if (attempt === 3) { console.log('✗', s.route, '→', s.file, '|', e.message); return false }
      await sleep(2000) // chờ compile xong rồi thử lại
    }
  }
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })

// ---- Phiên đăng nhập ----
const ctxAuth = await browser.newPage()
await ctxAuth.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
if (AUTH) {
  await ctxAuth.evaluateOnNewDocument((raw) => {
    localStorage.setItem('assetflow_auth', raw)
    localStorage.setItem('currentUser', raw)
  }, AUTH)
}
let ok = 0, fail = 0
for (const s of AUTHED) { (await capture(ctxAuth, s)) ? ok++ : fail++ }
await ctxAuth.close()

// ---- Trang công khai (context sạch, không phiên) ----
const ctxPub = await browser.newPage()
await ctxPub.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
for (const s of PUBLIC) { (await capture(ctxPub, s)) ? ok++ : fail++ }
await ctxPub.close()

await browser.close()
console.log(`\nXong: ${ok} ảnh OK, ${fail} lỗi. Thư mục: ${OUT}`)
