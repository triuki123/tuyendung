// Chụp screenshot tài liệu từ PRODUCTION — đăng nhập THẬT qua form (auth cookie).
//
// Cách dùng (KHÔNG lưu mật khẩu vào file — truyền qua biến môi trường):
//   BASE_URL=https://assetflow.fadoai.com \
//   LOGIN_EMAIL=... LOGIN_PASSWORD=... \
//   ONLY=safe        # safe | sensitive | all  (mặc định all)
//   ONLY_MISSING=1   # chỉ chụp file chưa có
//   node documentation/scripts/capture-prod.mjs
//
// - `blur`: mảng CSS selector sẽ bị làm mờ (filter: blur) TRƯỚC khi chụp → PII
//   không lọt vào file PNG.
import puppeteer from 'puppeteer'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'screenshots')
const BASE = process.env.BASE_URL || 'https://assetflow.fadoai.com'
const EMAIL = process.env.LOGIN_EMAIL || ''
const PASSWORD = process.env.LOGIN_PASSWORD || ''
const ONLY = (process.env.ONLY || 'all').toLowerCase()
const ONLY_MISSING = process.env.ONLY_MISSING === '1'
const LOGIN_PATH = '/sign-up-login-screen'

// Vùng PII chung — gộp vào blur của từng trang nhạy cảm khi cần.
// (Tinh chỉnh selector theo DOM thực tế sau khi xem ảnh nháp.)

// route: đường dẫn; file: tên PNG; sensitive: cần đăng nhập + có thể blur;
// blur: danh sách selector làm mờ; waitText: chờ chuỗi xuất hiện trước khi chụp.
const SHOTS = [
  // ---- An toàn (không PII) ----
  { route: '/dashboard',                              file: 'dashboard/tong-quan.png' },
  { route: '/dashboard',                              file: 'bat-dau/giao-dien-chung.png' },
  { route: '/asset-management',                       file: 'tai-san/tong-quan.png' },
  { route: '/asset-management/hardware',              file: 'tai-san/phan-cung.png' },
  { route: '/organization',                           file: 'to-chuc/tong-quan.png' },
  { route: '/organization/companies-organization',   file: 'quan-tri/co-cau-to-chuc.png' },
  { route: '/tickets',                                file: 'tickets/tong-quan.png' },
  { route: '/tickets/admin/config',                   file: 'quan-tri/cau-hinh-ticket.png' },
  { route: '/tasks',                                  file: 'cong-viec/tong-quan.png' },
  { route: '/room-bookings',                          file: 'dat-phong/tong-quan.png' },
  { route: '/tra-cuu',                                file: 'tra-cuu/tong-quan.png' },
  { route: '/tra-cuu/du-lieu-cong',                   file: 'cham-cong/tong-quan.png' },
  { route: '/tra-cuu/du-lieu-cong/cau-hinh',          file: 'quan-tri/cau-hinh-cham-cong.png' },
  { route: '/bieu-mau',                               file: 'bieu-mau/tong-quan.png' },
  { route: '/history',                                file: 'lich-su/tong-quan.png' },
  { route: '/settings',                               file: 'quan-tri/cai-dat.png' },
  { route: '/duyet-yeu-cau',                          file: 'duyet-yeu-cau/tong-quan.png' },

  // ---- Nhạy cảm: chỉ /users có PII danh sách (tên · email · SĐT) → blur từng thẻ.
  // Thẻ người dùng nằm trong lưới grid-cols-1 sm:grid-cols-2 (khác lưới thẻ thống kê
  // ở trên), nên blur trực tiếp các con của lưới đó — số liệu phía trên vẫn rõ.
  { route: '/users',          file: 'quan-tri/nguoi-dung.png',     sensitive: true,
    blur: ['div.grid.grid-cols-1.sm\\:grid-cols-2 > div'] },
  // 3 trang dưới thực tế KHÔNG có PII (tab tổng quan / thẻ module / hồ sơ trống) → không blur.
  { route: '/nhan-su',        file: 'nhan-su/tong-quan.png' },
  { route: '/nguon-nhan-luc', file: 'nguon-nhan-luc/tong-quan.png' },
  { route: '/ho-so-cua-toi',  file: 'ho-so-cua-toi/tong-quan.png' },

  // ===== MÀN HÌNH CON (mỗi tính năng 1 ảnh phụ) =====
  // Chấm công — các màn con
  { route: '/tra-cuu/du-lieu-cong/cham-cong', file: 'cham-cong/diem-danh.png',  group: 'subs' },
  { route: '/tra-cuu/du-lieu-cong/tra-cuu',   file: 'cham-cong/bang-thang.png',  group: 'subs' },
  { route: '/tra-cuu/du-lieu-cong/nghi-phep', file: 'cham-cong/nghi-phep.png',   group: 'subs' },
  { route: '/tra-cuu/du-lieu-cong/xac-nhan',  file: 'cham-cong/xac-nhan.png',    group: 'subs', sensitive: true, blurRows: true },
  { route: '/tra-cuu/du-lieu-cong/tong-hop',  file: 'cham-cong/tong-hop.png',    group: 'subs', sensitive: true, blurRows: true },
  // Công việc — biểu đồ
  { route: '/tasks/analytics',                file: 'cong-viec/phan-tich.png',   group: 'subs' },
  // Đặt phòng — lịch sử
  { route: '/room-bookings/usage-history',    file: 'dat-phong/lich-su.png',     group: 'subs', sensitive: true, blurRows: true },
  // Duyệt yêu cầu — tab công & xóa tài sản
  { route: '/duyet-yeu-cau/cong',             file: 'duyet-yeu-cau/cong.png',    group: 'subs', sensitive: true, blurRows: true },
  { route: '/duyet-yeu-cau/xoa-tai-san',      file: 'duyet-yeu-cau/xoa-tai-san.png', group: 'subs', sensitive: true, blurRows: true },
  // Biểu mẫu — form công khai (không đăng nhập, trống → an toàn)
  { route: '/onboarding/thong-tin-nhan-su-dau-vao', file: 'bieu-mau/form-cong-khai.png', group: 'subs', noAuth: true },
  // Tài sản — modal thêm phần cứng (mở bằng click)
  { route: '/asset-management/hardware',      file: 'tai-san/them-phan-cung.png', group: 'subs',
    clickText: 'Thêm' },
  // Cài đặt — tab Phiên Đăng Nhập
  { route: '/settings',                       file: 'quan-tri/phien-dang-nhap.png', group: 'subs',
    clickText: 'Phiên' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function login(page) {
  console.log('→ Đăng nhập', BASE)
  // Vào trang login để cùng origin, rồi gọi API ngay trong trang — cookie httpOnly
  // (assetflow_session) tự được trình duyệt Puppeteer lưu lại cho các điều hướng sau.
  await page.goto(`${BASE}${LOGIN_PATH}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const res = await page.evaluate(async (email, password) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return { status: r.status, body: r.ok ? await r.text() : '' }
  }, EMAIL, PASSWORD)
  if (res.status !== 200) throw new Error(`Đăng nhập THẤT BẠI — API trả ${res.status}`)
  const hasCookie = (await page.cookies()).some((c) => c.name === 'assetflow_session')
  if (!hasCookie) throw new Error('Đăng nhập OK nhưng không thấy cookie phiên')
  // Cổng auth phía CLIENT đọc localStorage → tiêm user JSON để không bị đẩy về login.
  await page.evaluateOnNewDocument((raw) => {
    try {
      localStorage.setItem('currentUser', raw)
      localStorage.setItem('assetflow_auth', raw)
      // Tắt popup sinh nhật toàn cục (che màn hình) bằng cách đánh dấu "đã xem" hôm nay.
      const u = JSON.parse(raw)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
      if (u && u.id) localStorage.setItem(`birthday_popup_${u.id}_${today}`, '1')
    } catch {}
  }, res.body)
  console.log('✓ Đăng nhập OK (cookie + localStorage)')
}

async function capture(page, s) {
  const dest = join(OUT, s.file)
  if (ONLY_MISSING && existsSync(dest)) { console.log('· bỏ qua (đã có):', s.file); return true }
  mkdirSync(dirname(dest), { recursive: true })
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE}${s.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await sleep(3000)
      for (let w = 0; w < 12; w++) {
        const loading = await page.evaluate(() => /Đang tải|Loading/i.test(document.body.innerText || '')).catch(() => false)
        if (!loading) break
        await sleep(1500)
      }
      // Mở tab/modal nếu cần (click phần tử chứa đúng chữ).
      if (s.clickText) {
        const clicked = await page.evaluate((label) => {
          const els = [...document.querySelectorAll('button, a, [role="tab"], [role="button"]')]
          const el = els.find((e) => (e.textContent || '').trim().includes(label) && e.offsetParent !== null)
          if (el) { el.click(); return true }
          return false
        }, s.clickText)
        if (!clicked) console.log('  · không thấy nút:', s.clickText)
        await sleep(1800)
      } else {
        // Đóng mọi modal/overlay còn sót (Escape) trước khi chụp.
        await page.keyboard.press('Escape').catch(() => {})
        await sleep(400)
      }
      // Làm mờ vùng nhạy cảm TRƯỚC khi chụp
      if (s.blur && s.blur.length) {
        await page.evaluate((selectors) => {
          for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => { el.style.filter = 'blur(7px)' })
          }
        }, s.blur)
      }
      // Blur bền vững theo avatar-row: mọi dòng nhân sự đều có avatar tròn → leo lên
      // tới hàng/thẻ và làm mờ; thêm blur các ô lá chứa email/SĐT. Không phụ thuộc layout.
      if (s.blurRows) {
        await page.evaluate(() => {
          const rows = new Set()
          document.querySelectorAll('[class*="rounded-full"]').forEach((av) => {
            let n = av
            for (let i = 0; i < 6 && n.parentElement; i++) {
              const p = n.parentElement
              if (p.getBoundingClientRect().width > 520) break // p là container danh sách → n là hàng
              n = p
            }
            rows.add(n)
          })
          rows.forEach((el) => { el.style.filter = 'blur(9px)' })
          document.querySelectorAll('body *').forEach((el) => {
            if (el.children.length === 0 && /@\S+\.\S+|\b0\d{8,10}\b/.test(el.textContent || '')) el.style.filter = 'blur(7px)'
          })
        })
      }
      await sleep(1200)
      await page.screenshot({ path: dest })
      console.log('✓', s.route, '→', s.file, s.sensitive ? '(đã blur)' : '', attempt > 1 ? `(lần ${attempt})` : '')
      return true
    } catch (e) {
      if (attempt === 3) { console.log('✗', s.route, '→', s.file, '|', e.message); return false }
      await sleep(2000)
    }
  }
}

if (!EMAIL || !PASSWORD) { console.error('THIẾU LOGIN_EMAIL / LOGIN_PASSWORD'); process.exit(1) }

const list = SHOTS.filter((s) => {
  if (ONLY === 'all') return true
  if (ONLY === 'subs') return s.group === 'subs'
  if (ONLY === 'sensitive') return s.sensitive
  if (ONLY === 'safe') return !s.sensitive && s.group !== 'subs'
  return true
})
const authedList = list.filter((s) => !s.noAuth)
const pubList = list.filter((s) => s.noAuth)

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
let ok = 0, fail = 0

// ---- Trang cần đăng nhập ----
if (authedList.length) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  await login(page)
  for (const s of authedList) { (await capture(page, s)) ? ok++ : fail++ }
  await page.close()
}

// ---- Trang công khai (context sạch, KHÔNG đăng nhập) ----
if (pubList.length) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  for (const s of pubList) { (await capture(page, s)) ? ok++ : fail++ }
  await page.close()
}

await browser.close()
console.log(`\nXong: ${ok} ảnh OK, ${fail} lỗi. ONLY=${ONLY}. Thư mục: ${OUT}`)
