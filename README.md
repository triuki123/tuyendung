# AssetFlow Pro

**Hệ thống quản lý vòng đời tài sản doanh nghiệp cho các tổ chức Việt Nam**

AssetFlow Pro là nền tảng web tổng hợp giúp doanh nghiệp quản lý toàn bộ vòng đời tài sản từ nhập kho, phân bổ, bảo trì đến thanh lý. Giao diện tiếng Việt trực quan, hệ thống phân quyền linh hoạt, và tích hợp báo cáo chi tiết.

## 🚀 Tính Năng Chính

- **Quản Lý Tài Sản** — Theo dõi tài sản phần cứng, phần mềm, domain, email tập trung
- **Dashboard & Analytics** — Biểu đồ xu hướng, phân bố theo phòng ban, cảnh báo bảo trì
- **Hệ Thống Ticket** — Quản lý yêu cầu hỗ trợ, kanban board, lịch sử trạng thái
- **Đặt Phòng Họp** — Lịch đặt phòng, QR check-in/check-out, kiểm tra xung đột
- **Quản Lý Tổ Chức** — Công ty, phòng ban, chức danh, người quản lý, cấu trúc tổ chức
- **Phân Quyền Chi Tiết** — 11 module, 6 action/module, linh hoạt RBAC
- **Lịch Sử & Audit** — Theo dõi toàn bộ hoạt động, ai làm gì lúc nào
- **Giao Diện Responsive** — Hoạt động tốt trên desktop, tablet, mobile

## 🛠️ Stack Công Nghệ

| Thành Phần | Công Nghệ | Phiên Bản |
|-----------|-----------|---------|
| Framework Web | Next.js | 13.5.6 (App Router) |
| UI Library | React | 19.0.3 |
| Ngôn Ngữ | TypeScript | ^5 |
| Styling | Tailwind CSS | 3.4.6 |
| Database | Supabase (PostgreSQL) | ^2.105.4 |
| Authentication | bcryptjs | 3.0.3 |
| Email | AWS SES + Nodemailer | ^3.1047.0 |
| Charts | Recharts | 2.15.2 |
| QR Code | qrcode.react, html5-qrcode | ^4.2.0, ^2.3.8 |

## ⚙️ Yêu Cầu Hệ Thống

- Node.js 18+
- npm 9+ hoặc yarn
- Supabase account (free: supabase.com)
- AWS account (optional, cho email via SES)

## 🚀 Cài Đặt & Chạy Local

### 1. Clone Repository
```bash
git clone <repository-url>
cd assetflowpro
npm install
```

### 2. Setup Environment
```bash
# Copy template
cp .env.local.example .env.local

# Edit với Supabase credentials
nano .env.local
```

**Cần add vào .env.local:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
AWS_ACCESS_KEY_ID=your_aws_key (optional)
AWS_SECRET_ACCESS_KEY=your_aws_secret (optional)
```

Chi tiết xem [Deployment Guide](/docs/deployment-guide.md)

### 3. Setup Database
```bash
npm run setup-database
```

### 4. Start Development Server
```bash
npm run dev
# http://localhost:4028
```

## 📖 Available Scripts

```bash
npm run dev          # Start dev server (port 4028)
npm run build        # Build for production
npm run serve        # Start production server
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
npm run format       # Format code with Prettier
npm run type-check   # TypeScript type checking
```

## 📚 Documentation

Xem chi tiết tại thư mục `/docs`:

- **[Project Overview & PDR](/docs/project-overview-pdr.md)** — Tổng quan sản phẩm, đối tượng người dùng, tính năng, phạm vi
- **[Codebase Summary](/docs/codebase-summary.md)** — Bản đồ mã nguồn, thư viện chính, module, services
- **[Code Standards](/docs/code-standards.md)** — Quy chuẩn code, convention, pattern, best practices
- **[System Architecture](/docs/system-architecture.md)** — Kiến trúc tổng thể, data flow, database schema, auth
- **[Project Roadmap](/docs/project-roadmap.md)** — Lộ trình phát triển, phase 1-4, milestones
- **[Deployment Guide](/docs/deployment-guide.md)** — Hướng dẫn deploy, env setup, Netlify, troubleshooting

## 🔐 Bảo Mật

- ✅ Xác thực người dùng bắt buộc (bcryptjs password hashing)
- ✅ Phân quyền chi tiết theo module (RBAC)
- ✅ Logging toàn bộ hoạt động (audit logs)
- ✅ API protection (permission middleware)
- ✅ Không lưu API key trong code (sử dụng .env.local)

**Lưu ý:** Không commit file `.env.local`. Cả `SUPABASE_SERVICE_ROLE_KEY` và `AWS_SECRET_ACCESS_KEY` phải bảo mật.

## 📊 Cấu Trúc Dự Án

```
assetflowpro/
├── src/
│   ├── app/              # Next.js App Router (pages + API routes)
│   │   ├── api/          # RESTful API endpoints
│   │   ├── dashboard/    # Dashboard feature
│   │   ├── asset-management/  # Asset management
│   │   ├── tickets/      # Ticket system
│   │   ├── users/        # User management
│   │   └── ...           # Other features
│   ├── components/       # Shared React components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities & services
│   │   ├── supabase.ts   # Supabase client
│   │   ├── modules.ts    # Module permissions
│   │   ├── permissions.ts # Permission checking
│   │   └── services/     # Business logic services
│   └── context/          # React Context
├── migrations/           # Database schema migrations
├── docs/                 # Project documentation
├── public/               # Static assets
├── next.config.mjs       # Next.js config
├── tsconfig.json         # TypeScript config
└── package.json          # Dependencies
```

## 🚀 Deployment

### Netlify (Recommended)

1. Push code to GitHub
2. Connect repository to Netlify
3. Set environment variables
4. Auto-deploy on every `git push main`

Chi tiết xem [Deployment Guide](/docs/deployment-guide.md#📦-deployment-to-netlify)

## 📞 Support & Contact

- **Email:** nguyenminhtri173@gmail.com
- **Issues:** GitHub Issues
- **Docs:** `/docs` folder

## 📋 Lộ Trình Phát Triển

- **Phase 1** ✅ — Foundation (basic assets, dashboard, auth)
- **Phase 2** 🔄 — Module permissions, tickets, room booking, organization
- **Phase 3** 📅 — Mobile app, advanced analytics, public API
- **Phase 4** 📅 — Multi-tenancy, workflow builder, BI dashboard

Xem chi tiết [Project Roadmap](/docs/project-roadmap.md)

## 🙏 Công Nhân

- Built with Next.js & React
- Styled with Tailwind CSS
- Powered by Supabase
- Deployed on Netlify