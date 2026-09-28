// Chèn ảnh màn hình con vào ĐÚNG placeholder (theo gợi ý trong comment SCREENSHOT).
// Mỗi entry: file .md, hint (chuỗi con duy nhất trong dòng <!-- SCREENSHOT ... -->), img, alt.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..')

const MAP = [
  ['chuc-nang/cham-cong.md',   'du-lieu-cong/cham-cong',  '/screenshots/cham-cong/diem-danh.png',   'Màn hình chấm công vào/ra: đồng hồ, GPS, ảnh xác nhận'],
  ['chuc-nang/cham-cong.md',   'du-lieu-cong/tra-cuu',    '/screenshots/cham-cong/bang-thang.png',  'Tra cứu dữ liệu công theo tháng — tab Tổng Hợp / App / Vân Tay'],
  ['chuc-nang/cham-cong.md',   'du-lieu-cong/nghi-phep',  '/screenshots/cham-cong/nghi-phep.png',   'Nghỉ phép — quỹ phép năm và đơn của tôi'],
  ['chuc-nang/dat-phong.md',   'usage-history',           '/screenshots/dat-phong/lich-su.png',     'Lịch sử sử dụng phòng họp'],
  ['chuc-nang/duyet-yeu-cau.md','duyet-yeu-cau/cong',     '/screenshots/duyet-yeu-cau/cong.png',    'Duyệt công — các tab Bù Công, Tăng Ca, Bảng Công, Nghỉ Phép'],
  ['chuc-nang/duyet-yeu-cau.md','duyet-yeu-cau/xoa-tai-san','/screenshots/duyet-yeu-cau/xoa-tai-san.png', 'Duyệt yêu cầu xóa tài sản chờ phê duyệt'],
  ['chuc-nang/tai-san.md',     'SCREENSHOT: modal thêm',  '/screenshots/tai-san/them-phan-cung.png','Modal thêm tài sản mới — nhập thông tin cơ bản'],
  ['chuc-nang/bieu-mau.md',    'onboarding/thong-tin',    '/screenshots/bieu-mau/form-cong-khai.png','Biểu mẫu thông tin nhận việc (liên kết công khai)'],
  ['quan-tri/cai-dat.md',      'SCREENSHOT: /settings',   '/screenshots/quan-tri/phien-dang-nhap.png','Tab Phiên Đăng Nhập — quản lý thiết bị đang đăng nhập'],
]

const MARK = '<!-- SCREENSHOT:'
let done = 0, skip = 0
for (const [rel, hint, img, alt] of MAP) {
  const p = join(DOCS, rel)
  let src = readFileSync(p, 'utf8')
  // Duyệt từng comment SCREENSHOT, chọn đúng comment chứa hint.
  let from = 0, start = -1
  while (true) {
    const c = src.indexOf(MARK, from)
    if (c < 0) break
    const cEnd = src.indexOf('-->', c)
    if (cEnd < 0) break
    if (src.slice(c, cEnd).includes(hint)) { start = c; break }
    from = cEnd + 3
  }
  if (start < 0) { console.log('· KHÔNG thấy comment:', rel, '|', hint); skip++; continue }
  const infoIdx = src.indexOf('::: info', start)
  const closeIdx = infoIdx >= 0 ? src.indexOf('\n:::', infoIdx + 8) : -1
  if (infoIdx < 0 || closeIdx < 0) { console.log('· block lỗi:', rel); skip++; continue }
  src = src.slice(0, start) + `![${alt}](${img})` + src.slice(closeIdx + 4)
  writeFileSync(p, src, 'utf8')
  console.log('✓', rel, '←', img)
  done++
}
console.log(`\nXong: chèn ${done}, bỏ qua ${skip}.`)
