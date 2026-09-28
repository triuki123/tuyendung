// Chèn ảnh đã chụp vào tài liệu: thay block placeholder ĐẦU TIÊN của mỗi trang
// (<!-- SCREENSHOT ... --> + ::: info 📸 Ảnh minh họa ... :::) bằng ảnh thật.
// Các block placeholder còn lại (ảnh phụ chưa chụp) giữ nguyên.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS = join(__dirname, '..')

// file (tương đối documentation/) → { img: đường dẫn /screenshots, alt }
const MAP = {
  'bat-dau/dang-nhap.md':            { img: '/screenshots/bat-dau/dang-nhap.png',        alt: 'Màn hình đăng nhập' },
  'bat-dau/giao-dien-chung.md':      { img: '/screenshots/bat-dau/giao-dien-chung.png',  alt: 'Giao diện chung — sidebar và topbar' },
  'chuc-nang/dashboard.md':          { img: '/screenshots/dashboard/tong-quan.png',      alt: 'Trung Tâm Điều Hành' },
  'chuc-nang/tai-san.md':            { img: '/screenshots/tai-san/tong-quan.png',        alt: 'Trang Quản lý Tài sản' },
  'chuc-nang/to-chuc.md':            { img: '/screenshots/to-chuc/tong-quan.png',        alt: 'Trang Tổ chức' },
  'chuc-nang/tickets.md':            { img: '/screenshots/tickets/tong-quan.png',        alt: 'Trang Ticket Hỗ trợ' },
  'chuc-nang/cong-viec.md':          { img: '/screenshots/cong-viec/tong-quan.png',      alt: 'Trang Công việc' },
  'chuc-nang/dat-phong.md':          { img: '/screenshots/dat-phong/tong-quan.png',      alt: 'Trang Đặt phòng họp' },
  'chuc-nang/cham-cong.md':          { img: '/screenshots/cham-cong/tong-quan.png',      alt: 'Trang Dữ liệu Chấm công' },
  'chuc-nang/tra-cuu.md':            { img: '/screenshots/tra-cuu/tong-quan.png',        alt: 'Trang Tra cứu' },
  'chuc-nang/ho-so-cua-toi.md':      { img: '/screenshots/ho-so-cua-toi/tong-quan.png',  alt: 'Trang Hợp đồng & Hồ sơ của tôi' },
  'chuc-nang/duyet-yeu-cau.md':      { img: '/screenshots/duyet-yeu-cau/tong-quan.png',  alt: 'Trang Duyệt yêu cầu' },
  'chuc-nang/nhan-su.md':            { img: '/screenshots/nhan-su/tong-quan.png',        alt: 'Trang Quản lý Hồ sơ (Nhân sự)' },
  'chuc-nang/nguon-nhan-luc.md':     { img: '/screenshots/nguon-nhan-luc/tong-quan.png', alt: 'Trang Nguồn nhân lực' },
  'chuc-nang/bieu-mau.md':           { img: '/screenshots/bieu-mau/tong-quan.png',       alt: 'Trang Biểu mẫu' },
  'chuc-nang/lich-su.md':            { img: '/screenshots/lich-su/tong-quan.png',        alt: 'Trang Lịch sử hoạt động' },
  'quan-tri/nguoi-dung.md':          { img: '/screenshots/quan-tri/nguoi-dung.png',      alt: 'Trang Quản lý Người dùng' },
  'quan-tri/co-cau-to-chuc.md':      { img: '/screenshots/quan-tri/co-cau-to-chuc.png',  alt: 'Trang Cơ cấu tổ chức' },
  'quan-tri/cau-hinh-ticket.md':     { img: '/screenshots/quan-tri/cau-hinh-ticket.png', alt: 'Trang Cấu hình Ticket' },
  'quan-tri/cau-hinh-cham-cong.md':  { img: '/screenshots/quan-tri/cau-hinh-cham-cong.png', alt: 'Trang Cấu hình Chấm công' },
  'quan-tri/cai-dat.md':             { img: '/screenshots/quan-tri/cai-dat.png',         alt: 'Trang Cài đặt' },
}

// Khớp: (tùy chọn) dòng comment SCREENSHOT + block ::: info 📸 ... :::
const BLOCK = /(?:<!-- *SCREENSHOT:[^\n]*-->\n)?::: info 📸 Ảnh minh họa\n[\s\S]*?\n:::/

let done = 0, skip = 0
for (const [rel, { img, alt }] of Object.entries(MAP)) {
  const p = join(DOCS, rel)
  if (!existsSync(p)) { console.log('· thiếu file:', rel); skip++; continue }
  const src = readFileSync(p, 'utf8')
  if (!BLOCK.test(src)) { console.log('· không thấy placeholder:', rel); skip++; continue }
  const out = src.replace(BLOCK, `![${alt}](${img})`)
  writeFileSync(p, out, 'utf8')
  console.log('✓', rel, '←', img)
  done++
}
console.log(`\nXong: chèn ${done} ảnh, bỏ qua ${skip}.`)
