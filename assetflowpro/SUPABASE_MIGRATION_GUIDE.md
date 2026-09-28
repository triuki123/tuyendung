# Supabase Migration Guide - AssetFlow Pro

## 📋 Các Bước Setup Supabase

### **Bước 1: Chạy SQL Schema trong Supabase**

1. Vào https://supabase.com → đăng nhập với tài khoản của bạn
2. Chọn project: `ulsxqlsgkgfhuahscars`
3. Vào **SQL Editor** (bên trái)
4. Bấm **"New query"** hoặc **"+"**
5. Copy toàn bộ nội dung từ file `SUPABASE_SETUP.sql`
6. Paste vào SQL editor
7. Bấm **"Run"** (hoặc Ctrl+Enter)
8. Chờ tới khi thấy ✓ (Success)

**Lưu ý:** 
- Nếu gặp error `already exists`, bỏ qua - tables đã tồn tại
- Hãy kiểm tra trong **"Database"** → **"Tables"** để xác nhận tables được tạo

### **Bước 2: Verify Tables**

Kiểm tra các tables được tạo:

1. Vào **Database** → **Tables**
2. Bạn sẽ thấy các tables:
   - ✓ users
   - ✓ assets
   - ✓ asset_history
   - ✓ tickets
   - ✓ tasks
   - ✓ delete_requests

### **Bước 3: Chạy Migration Script**

Bây giờ hãy migrate mock data lên Supabase:

**Option A: Chạy từ Browser Console**
```javascript
// Mở DevTools (F12) → Console
// Paste đoạn code này:

import { migrateToSupabase } from '/src/lib/migrate-to-supabase.ts';
await migrateToSupabase();
```

**Option B: Tạo API endpoint**

Tôi đã tạo sẵn - chỉ cần call:
```bash
curl http://localhost:4028/api/migrate
```

**Option C: Node.js Script**
```bash
cd assetflowpro
node -r ts-node/register src/lib/migrate-to-supabase.ts
```

### **Bước 4: Verify Data**

Kiểm tra dữ liệu đã được migrate:

1. Vào Supabase Dashboard
2. Chọn từng table
3. Xem dữ liệu trong **"Data"** tab
4. Bạn sẽ thấy:
   - 5 users đã import
   - 20+ assets
   - 10+ tickets
   - 10+ tasks
   - v.v.

---

## 🔧 Environment Variables

Thêm vào `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ulsxqlsgkgfhuahscars.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

---

## 📡 API Routes (Sẽ Tạo Tiếp)

Các API endpoints cần tạo:

```
GET    /api/assets              → Lấy danh sách assets
POST   /api/assets              → Tạo asset mới
PUT    /api/assets/[id]         → Cập nhật asset
DELETE /api/assets/[id]         → Xóa asset

GET    /api/tickets             → Lấy danh sách tickets
POST   /api/tickets             → Tạo ticket mới
PUT    /api/tickets/[id]        → Cập nhật ticket

GET    /api/tasks               → Lấy danh sách tasks
POST   /api/tasks               → Tạo task mới
PUT    /api/tasks/[id]          → Cập nhật task

GET    /api/migrate             → Chạy migration
```

---

## ⚠️ Troubleshooting

### **Lỗi: "Already exists"**
→ Tables đã tồn tại, bỏ qua cảnh báo

### **Lỗi: "Permission denied"**
→ Kiểm tra RLS settings trong Supabase
→ Vào **Database** → **Authentication** → **Policies**

### **Lỗi: "Invalid API Key"**
→ Kiểm tra Public API Key có đúng không
→ Vào Settings → API → Copy lại anon key

### **Dữ liệu không migrate**
→ Kiểm tra console log xem có error nào
→ Verify tables tồn tại trước khi migrate
→ Kiểm tra Network tab xem request gửi đi chưa

---

## 🚀 Tiếp Theo

Sau khi migrate data:

1. **Tạo API routes** → Kết nối Supabase
2. **Update components** → Dùng real data thay vì mockData
3. **Setup authentication** → Supabase Auth
4. **Add subscriptions** → Real-time updates
5. **Deploy** → Production

---

## 📝 Các File Được Tạo

```
src/lib/supabase.ts                    → Supabase client + types
src/lib/migrate-to-supabase.ts         → Migration script
SUPABASE_SETUP.sql                     → Schema SQL
SUPABASE_MIGRATION_GUIDE.md            → Hướng dẫn này
```

---

## ✅ Checklist

- [ ] Tạo tài khoản Supabase
- [ ] Chạy SQL schema
- [ ] Verify tables tạo thành công
- [ ] Chạy migration script
- [ ] Verify dữ liệu trong Supabase
- [ ] Thêm environment variables
- [ ] Tạo API routes
- [ ] Update components để dùng API
- [ ] Test tất cả chức năng
- [ ] Deploy to production

---

**Hỏi nếu có vấn đề! 🙋**
