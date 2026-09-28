# Tài liệu hướng dẫn FADO AssetFlow

Trang tài liệu (docs portal) dựng bằng [VitePress](https://vitepress.dev). Thư mục này **độc lập** với app Next.js — có `package.json` riêng, không ảnh hưởng build/Docker của ứng dụng chính.

## Chạy tại máy

```bash
cd documentation
npm install
npm run docs:dev      # xem trước tại http://localhost:5173
```

## Build tĩnh (để deploy hoặc xuất)

```bash
npm run docs:build    # kết quả ở .vitepress/dist
npm run docs:preview  # xem thử bản build
```

## Cấu trúc nội dung

```
documentation/
├── index.md              # Trang chủ
├── bat-dau/              # Giới thiệu, đăng nhập, giao diện, phân quyền
├── vai-tro/              # Lối đi nhanh theo vai trò
├── chuc-nang/            # Cẩm nang từng module (phần chính)
├── quan-tri/             # Quản trị hệ thống
├── phu-luc/              # FAQ, xử lý sự cố, thuật ngữ
└── public/screenshots/   # Ảnh chụp màn hình minh họa
```

## Quy ước ảnh chụp màn hình

Trong nội dung, chỗ cần ảnh được đánh dấu bằng comment HTML mô tả ảnh, theo sau là thẻ ảnh trỏ tới `public/screenshots/...`:

```md
<!-- SCREENSHOT: /asset-management — mô tả nội dung cần chụp -->
![Mô tả](/screenshots/tai-san/tong-quan.png)
```

Khi có ảnh thật, đặt file vào `public/screenshots/<module>/<ten>.png` đúng đường dẫn là ảnh tự hiển thị.
