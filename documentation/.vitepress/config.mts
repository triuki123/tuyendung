import { defineConfig } from 'vitepress'

// Cấu hình trang tài liệu FADO AssetFlow
// Chạy:  cd documentation && npm install && npm run docs:dev
export default defineConfig({
  lang: 'vi-VN',
  title: 'FADO AssetFlow',
  description: 'Tài liệu hướng dẫn sử dụng hệ thống quản lý tài sản & vận hành doanh nghiệp',
  lastUpdated: true,
  // cleanUrls=false: link có đuôi .html để khớp file tĩnh khi Next phục vụ từ public/ (tránh 404)
  cleanUrls: false,
  // Phục vụ tài liệu tĩnh ngay trong webapp Next.js tại /help
  base: '/help/',
  outDir: '../public/help',

  // Ảnh OG khi chia sẻ link /help (Zalo, Facebook, Telegram...) — dùng URL tuyệt đối
  head: [
    // Favicon dùng chung với web chính (public/icon.svg + public/favicon.ico ở root)
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' }],
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    // Montserrat cho tiêu đề thương hiệu (hero) — tải ở trình duyệt người dùng, không ảnh hưởng build
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'FADO AssetFlow' }],
    ['meta', { property: 'og:title', content: 'FADO AssetFlow — Trung Tâm Trợ Giúp' }],
    ['meta', { property: 'og:description', content: 'Tài liệu hướng dẫn sử dụng hệ thống quản lý tài sản & vận hành doanh nghiệp.' }],
    ['meta', { property: 'og:image', content: 'https://assetflow.fadoai.com/help/og-image.png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:url', content: 'https://assetflow.fadoai.com/help/' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'FADO AssetFlow — Trung Tâm Trợ Giúp' }],
    ['meta', { name: 'twitter:description', content: 'Tài liệu hướng dẫn sử dụng hệ thống quản lý tài sản & vận hành doanh nghiệp.' }],
    ['meta', { name: 'twitter:image', content: 'https://assetflow.fadoai.com/help/og-image.png' }],
  ],
  // Tạm bật trong lúc nội dung đang được hoàn thiện dần (nhiều trang trong menu chưa tạo).
  // Khi đã viết đủ trang, đổi lại thành false để bắt liên kết hỏng.
  ignoreDeadLinks: false,

  themeConfig: {
    // Logo ngang (Horizontal Lockup, có tagline) theo brand kit — sáng/tối theo giao diện
    logo: { light: '/logo-horizontal-light.png', dark: '/logo-horizontal-dark.png' },
    siteTitle: false,

    nav: [
      { text: 'Bắt đầu', link: '/bat-dau/gioi-thieu' },
      { text: 'Hướng dẫn nhanh', link: '/huong-dan/' },
      { text: 'Cẩm nang chức năng', link: '/chuc-nang/dashboard' },
      { text: 'Quản trị', link: '/quan-tri/nguoi-dung' },
      { text: 'FAQ', link: '/phu-luc/faq' },
      { text: '✨ Có gì mới', link: '/cap-nhat' },
    ],

    sidebar: [
      {
        text: '1. Bắt đầu',
        collapsed: false,
        items: [
          { text: 'Giới thiệu hệ thống', link: '/bat-dau/gioi-thieu' },
          { text: '🚀 Ngày đầu đi làm', link: '/bat-dau/ngay-dau-di-lam' },
          { text: 'Đăng nhập & đăng xuất', link: '/bat-dau/dang-nhap' },
          { text: 'Giao diện chung', link: '/bat-dau/giao-dien-chung' },
          { text: '📱 Dùng trên điện thoại & cài app', link: '/bat-dau/dien-thoai' },
          { text: 'Phân quyền & vai trò', link: '/bat-dau/phan-quyen' },
        ],
      },
      {
        text: '2. Hướng dẫn nhanh',
        collapsed: false,
        items: [
          { text: 'Tất cả hướng dẫn', link: '/huong-dan/' },
          { text: '🎬 Video hướng dẫn', link: '/huong-dan/video-huong-dan' },
          { text: '🎫 Gửi ticket hỗ trợ', link: '/huong-dan/gui-ticket' },
          { text: '🏢 Đặt phòng họp', link: '/huong-dan/dat-phong-hop' },
          { text: '🕘 Chấm công vào/ra', link: '/huong-dan/cham-cong' },
          { text: '📋 Bảng công cuối kỳ', link: '/huong-dan/nop-bang-cong' },
          { text: '🏖️ Xin nghỉ phép', link: '/huong-dan/xin-nghi-phep' },
          { text: '⏱️ Bù công · Tăng ca · Công tác', link: '/huong-dan/bu-cong-tang-ca' },
          { text: '✅ Tạo & giao công việc', link: '/huong-dan/tao-cong-viec' },
          { text: '👔 Duyệt yêu cầu (Quản lý)', link: '/huong-dan/duyet-yeu-cau' },
          { text: '📦 Tra cứu tài sản', link: '/huong-dan/tra-cuu-tai-san' },
        ],
      },
      {
        text: '3. Hướng dẫn theo vai trò',
        collapsed: false,
        items: [
          { text: 'Người dùng cuối', link: '/vai-tro/nguoi-dung-cuoi' },
          { text: 'Quản lý (Manager)', link: '/vai-tro/quan-ly' },
          { text: 'Quản trị viên (Admin)', link: '/vai-tro/admin' },
          { text: 'Super Admin', link: '/vai-tro/super-admin' },
        ],
      },
      {
        text: '4. Cẩm nang chức năng',
        collapsed: false,
        items: [
          { text: 'Dashboard', link: '/chuc-nang/dashboard' },
          { text: 'Quản lý Tài sản', link: '/chuc-nang/tai-san' },
          { text: 'Thông Báo - Truyền Thông', link: '/chuc-nang/thong-bao-truyen-thong' },
          { text: 'Văn Bản - Quyết Định', link: '/chuc-nang/van-ban-quyet-dinh' },
          { text: 'Đầu Mối Liên Hệ', link: '/chuc-nang/dau-moi-lien-he' },
          { text: 'Tổ chức', link: '/chuc-nang/to-chuc' },
          { text: 'Ticket Hỗ trợ', link: '/chuc-nang/tickets' },
          { text: 'Công việc', link: '/chuc-nang/cong-viec' },
          { text: 'Đặt phòng họp', link: '/chuc-nang/dat-phong' },
          { text: 'Hiệu Suất Phòng Họp', link: '/chuc-nang/hieu-suat-phong-hop' },
          { text: 'Chấm công & Nghỉ phép', link: '/chuc-nang/cham-cong' },
          { text: 'Tra cứu', link: '/chuc-nang/tra-cuu' },
          { text: 'Hồ sơ của tôi', link: '/chuc-nang/ho-so-cua-toi' },
          { text: 'Duyệt yêu cầu', link: '/chuc-nang/duyet-yeu-cau' },
          { text: 'Quản lý Hồ sơ (Nhân sự)', link: '/chuc-nang/nhan-su' },
          { text: 'Nguồn nhân lực (ATS)', link: '/chuc-nang/nguon-nhan-luc' },
          { text: 'Biểu mẫu', link: '/chuc-nang/bieu-mau' },
          { text: 'Kho / Xưởng', link: '/chuc-nang/kho-xuong' },
          { text: 'Đa Công Ty', link: '/chuc-nang/da-cong-ty' },
          { text: 'Chữ Ký Email', link: '/chuc-nang/chu-ky-email' },
          { text: 'Tạo Mã QR', link: '/chuc-nang/tao-ma-qr' },
          { text: 'Lịch sử', link: '/chuc-nang/lich-su' },
        ],
      },
      {
        text: '5. Quản trị hệ thống',
        collapsed: true,
        items: [
          { text: 'Người dùng & phân quyền', link: '/quan-tri/nguoi-dung' },
          { text: 'Cơ cấu tổ chức', link: '/quan-tri/co-cau-to-chuc' },
          { text: 'Cấu hình Ticket', link: '/quan-tri/cau-hinh-ticket' },
          { text: 'Cấu hình Ticket nâng cao', link: '/quan-tri/cau-hinh-ticket-nang-cao' },
          { text: 'Cấu hình Chấm công', link: '/quan-tri/cau-hinh-cham-cong' },
          { text: 'Cấu hình Tài Sản', link: '/quan-tri/cau-hinh-tai-san' },
          { text: 'Cài đặt hệ thống', link: '/quan-tri/cai-dat' },
        ],
      },
      {
        text: '6. Phụ lục',
        collapsed: true,
        items: [
          { text: 'Câu hỏi thường gặp (FAQ)', link: '/phu-luc/faq' },
          { text: 'Xử lý sự cố', link: '/phu-luc/xu-ly-su-co' },
          { text: 'Thuật ngữ', link: '/phu-luc/thuat-ngu' },
        ],
      },
      {
        text: '✨ Có gì mới',
        collapsed: false,
        items: [
          { text: 'Nhật ký cập nhật', link: '/cap-nhat' },
        ],
      },
    ],

    outline: { label: 'Trên trang này', level: [2, 3] },
    docFooter: { prev: 'Trang trước', next: 'Trang sau' },
    darkModeSwitchLabel: 'Giao diện',
    lightModeSwitchTitle: 'Chuyển sang nền sáng',
    darkModeSwitchTitle: 'Chuyển sang nền tối',
    sidebarMenuLabel: 'Mục lục',
    returnToTopLabel: 'Lên đầu trang',
    lastUpdatedText: 'Cập nhật lần cuối',

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Tìm kiếm', buttonAriaLabel: 'Tìm kiếm' },
          modal: {
            noResultsText: 'Không tìm thấy kết quả',
            resetButtonTitle: 'Xóa tìm kiếm',
            footer: { selectText: 'Chọn', navigateText: 'Di chuyển', closeText: 'Đóng' },
          },
        },
      },
    },

    footer: {
      message: 'Tài liệu nội bộ — FADO AssetFlow · Phiên bản 2026.06',
      copyright: '© FADO. Lưu hành nội bộ.',
    },
  },
})
