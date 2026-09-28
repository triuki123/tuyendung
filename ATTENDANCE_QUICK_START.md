# ⚡ Quick Start: Máy Chấm Công & Sync Dữ Liệu

**TL;DR**: Máy kết nối được ✅, nhưng dữ liệu không hiển thị ❌ → Cần **gán mã (mapping)**

---

## 🚀 4 Bước Setup (5 Phút)

### Step 1: Kiểm Tra Device Punch

```bash
# Xem dữ liệu máy đã push chưa
curl -s 'http://localhost:4028/api/attendance/device-codes' \
  -H 'x-current-user-role: admin' | jq '.summary'
```

**Kết quả mong muốn**:
```json
{
  "total": 2,           // 2 mã khác nhau từ máy
  "mapped": 0,          // 0 cái đã gán
  "unmapped": 2,        // 2 cái chưa gán ← CẦN SETUP
  "totalPunches": 45    // 45 lần chấm
}
```

### Step 2: Lấy Danh Sách Mã Chưa Gán

```bash
curl -s 'http://localhost:4028/api/attendance/device-codes' \
  -H 'x-current-user-role: admin' | jq '.data[] | select(.user_id == null)'
```

**Output**:
```json
{
  "machine_id": "zkteco_ronald_jack_1",
  "employee_code": "E001",           // ← Mã ở máy
  "punch_count": 23,
  "first_seen": "2026-06-05T08:30Z",
  "last_seen": "2026-06-09T17:45Z",
  "mapping_id": null,                // ← null = chưa gán
  "user_id": null,
  "user_name": null
}
```

### Step 3: Tìm User Tương Ứng

```bash
# Tìm user theo employee_code hoặc tên
curl -s 'http://localhost:4028/api/users/search?q=E001' \
  | jq '.data[0] | {id, name, email}'
```

**Output**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Nguyễn Văn A",
  "email": "a.nguyen@company.com"
}
```

### Step 4: Gán Mã Cho User

```bash
curl -X POST 'http://localhost:4028/api/attendance/machine-mappings' \
  -H 'Content-Type: application/json' \
  -H 'x-current-user-id: admin_user_id' \
  -d '{
    "machine_id": "zkteco_ronald_jack_1",
    "employee_code": "E001",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "mode": "assign"
  }'
```

**Response**: ✅ Mapping created

---

## ✅ Kiểm Tra Kết Quả

Sau Step 4, dữ liệu tự động hiển thị:

```bash
# Xem dữ liệu công của user
curl -s 'http://localhost:4028/api/attendance/user-records?user_id=550e8400-e29b-41d4-a716-446655440000' \
  | jq '.data | length'
# → > 0 = Dữ liệu hiển thị ✅
```

---

## 🎯 Chế Độ Gán

| Tình Huống | Mode | Cách Dùng |
|-----------|------|----------|
| **Lần đầu gán** mã chưa bao giờ có | `assign` | Gán bình thường |
| **Sửa gán nhầm** người từ đầu | `correct` | Update user_id trên mapping cũ |
| **Bàn giao** mã cho người khác từ ngày X | `handover` | Thêm `"effective_from": "2026-06-15"` |

---

## 🔍 Troubleshooting

### ❌ Device Punch = 0
→ Máy chưa push data
- Kiểm tra máy có kết nối không: `ping asset.fadoai.com`
- Kiểm tra logs máy
- Máy config đúng IP/port chưa?

### ❌ Mapping Không Tạo
→ Check response error
```json
{ "error": "Thiếu employee_code hoặc user_id" }
```
→ Kiểm tra `employee_code` và `user_id` có đúng không

### ❌ Dữ Liệu Vẫn Không Hiển Thị
```sql
-- Check mapping
SELECT * FROM attendance_machine_mappings 
WHERE employee_code = 'E001' AND effective_to IS NULL;
-- → Phải có 1 dòng

-- Check device_punches
SELECT * FROM device_punches 
WHERE employee_code = 'E001' LIMIT 1;
-- → Phải có punch
```

---

## 📝 Checklist

- [ ] Máy kết nối được (handshake ✅)
- [ ] Device punch trong DB (> 0)
- [ ] Lấy danh sách mã chưa gán
- [ ] Tìm user tương ứng
- [ ] Gán mã → user (POST /api/attendance/machine-mappings)
- [ ] Kiểm tra dữ liệu hiển thị ✅

---

## 📚 Tài Liệu Chi Tiết

Xem: `ATTENDANCE_SYNC_SETUP.md`

---

## 💡 Kết Luận

✅ **Không lỗi, không thiếu hàm**
✅ **Chỉ cần admin gán mã**
✅ **Dữ liệu tự động hiển thị**

Done! 🎉
