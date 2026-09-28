# 🔧 Hướng Dẫn: Cấu Hình Máy Chấm Công & Sync Dữ Liệu

**Tình trạng**: Máy chấm công kết nối được, nhưng dữ liệu không sync/hiển thị

---

## 🎯 Nguyên Nhân

Hệ thống chấm công hoạt động theo **Projection Model**:

```
Máy ZKTeco → POST /api/attendance/adms → device_punches table
                                              ↓
                                    (cần mapping)
                                              ↓
                    attendance_machine_mappings (mã → user)
                                              ↓
                          User's attendance_records
                                              ↓
                          Hiển thị ở dashboard/report
```

**Vấn đề**: Nếu KHÔNG CÓ mapping → dữ liệu không được JOIN → **KHÔNG HIỂN THỊ**.

---

## ✅ Kiểm Tra Trạng Thái Hiện Tại

### 1. Device Punch Được Ghi Không?

```sql
-- Check xem máy đã push data chưa
SELECT COUNT(*) as punch_count, 
       MIN(punch_time) as first_punch, 
       MAX(punch_time) as last_punch
FROM device_punches
WHERE machine_id = 'zkteco_ronald_jack_1';
```

**Kết quả**:
- `punch_count > 0` → ✅ Máy đã push data
- `punch_count = 0` → ❌ Máy chưa push (kiểm tra kết nối máy)

### 2. Mapping Được Tạo Chưa?

```sql
-- Check mapping từ mã → user
SELECT m.*, u.name 
FROM attendance_machine_mappings m
LEFT JOIN users u ON u.id = m.user_id::uuid
WHERE m.machine_id = 'zkteco_ronald_jack_1'
AND m.effective_to IS NULL;
```

**Kết quả**:
- Có kết quả → ✅ Mapping tồn tại, dữ liệu sẽ hiển thị
- Không có kết quả → ❌ **ĐÂY LÀ VẤN ĐỀ** - cần tạo mapping

### 3. Dữ Liệu Hiển Thị Ở User Chưa?

```sql
-- Check dữ liệu dạo từ device_punches qua mapping
SELECT COUNT(*) 
FROM device_punches dp
JOIN attendance_machine_mappings m
  ON m.machine_id = dp.machine_id 
  AND m.employee_code = dp.employee_code
  AND m.effective_to IS NULL
WHERE m.user_id = '<USER_UUID>';
```

**Kết quả**:
- `> 0` → ✅ Dữ liệu hiển thị
- `= 0` → ❌ Chưa mapping

---

## 🚀 Cách Setup (4 Bước)

### Step 1: Xem Danh Sách Mã Chấm Công Chưa Gán

**Cách A: Dùng API (admin)**

```bash
curl -X GET 'http://localhost:4028/api/attendance/device-codes' \
  -H 'x-current-user-role: admin'
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "machine_id": "zkteco_ronald_jack_1",
      "employee_code": "E001",
      "punch_count": 45,
      "first_seen": "2026-06-05T08:30:00Z",
      "last_seen": "2026-06-09T17:45:00Z",
      "mapping_id": null,  // ← null = chưa gán
      "user_id": null,
      "user_name": null,
      "user_email": null
    },
    {
      "machine_id": "zkteco_ronald_jack_1",
      "employee_code": "E002",
      "punch_count": 32,
      "first_seen": "2026-06-05T08:25:00Z",
      "last_seen": "2026-06-09T17:50:00Z",
      "mapping_id": null,
      "user_id": null,
      "user_name": null,
      "user_email": null
    }
  ],
  "summary": {
    "total": 2,
    "mapped": 0,
    "unmapped": 2,      // ← 2 mã chưa gán
    "totalPunches": 77
  }
}
```

**Cách B: Dashboard (future)**
- Truy cập `/tra-cuu/dau-moi` (nếu có UI)
- Xem danh sách mã + số lần chấm + user gán
- Filter: chưa gán (mapping_id = null)

### Step 2: Tìm User Tương Ứng

Sử dụng `employee_code` để tìm user:

```bash
curl -X GET 'http://localhost:4028/api/users/search?q=<employee_code_or_name>'
```

Hoặc search theo tên:
```bash
curl -X GET 'http://localhost:4028/api/users/search?q=Nguyễn%20Văn%20A'
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Nguyễn Văn A",
      "email": "a.nguyen@company.com",
      "phone": "0987654321",
      "department": "IT",
      "position": "Developer",
      "status": "active"
    }
  ]
}
```

### Step 3: Gán Mã Cho User (Mapping)

**API Endpoint**: `POST /api/attendance/machine-mappings`

```bash
curl -X POST 'http://localhost:4028/api/attendance/machine-mappings' \
  -H 'Content-Type: application/json' \
  -H 'x-current-user-id: <admin_id>' \
  -d '{
    "machine_id": "zkteco_ronald_jack_1",
    "employee_code": "E001",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "mode": "assign"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "map_e001_uuid",
    "machine_id": "zkteco_ronald_jack_1",
    "employee_code": "E001",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "effective_from": "1970-01-01T00:00:00Z",  // ← bao trùm toàn bộ lịch sử
    "effective_to": null,  // ← đang mở (không có ngày kết thúc)
    "created_at": "2026-06-09T10:30:00Z"
  }
}
```

### Step 4: Kiểm Tra Dữ Liệu Hiển Thị

Sau khi mapping, dữ liệu sẽ tự động hiển thị:

```bash
# Xem dữ liệu chấm công của user
curl -X GET 'http://localhost:4028/api/attendance/user-records?user_id=<uuid>'
```

Hoặc truy cập dashboard:
- `/tra-cuu/du-lieu-cong/tra-cuu` → Xem dữ liệu công của user
- `/tra-cuu/du-lieu-cong/cham-cong` → Bảng dữ liệu chấm công

---

## 🎯 3 Chế Độ Gán (Mode)

### 1. `"assign"` — Gán Lần Đầu (Default)

Dùng khi mã chưa bao giờ được gán cho ai.

```json
{
  "machine_id": "zkteco_ronald_jack_1",
  "employee_code": "E001",
  "user_id": "<uuid>",
  "mode": "assign"
}
```

**Hiệu lực**: `effective_from = 1970-01-01` (bao trùm **toàn bộ lịch sử** punch)

---

### 2. `"correct"` — Sửa Gán Nhầm

Dùng khi mã được gán cho sai người từ đầu, cần sửa về person đúng.

```json
{
  "machine_id": "zkteco_ronald_jack_1",
  "employee_code": "E001",
  "user_id": "<uuid_người_đúng>",
  "mode": "correct"
}
```

**Hiệu lực**: Cập nhật toàn bộ punch của mã từ trước đến nay sang user mới.

---

### 3. `"handover"` — Bàn Giao Mã Cho Người Mới

Dùng khi mã được sử dụng bởi nhiều người theo thời gian.

```json
{
  "machine_id": "zkteco_ronald_jack_1",
  "employee_code": "E001",
  "user_id": "<uuid_người_mới>",
  "mode": "handover",
  "effective_from": "2026-06-15T00:00:00Z"  // ← ngày bàn giao
}
```

**Hiệu lực**:
- `Trước 2026-06-15` → Punch của người cũ
- `Từ 2026-06-15 trở đi` → Punch của người mới

---

## 📊 Bulk-Assign Script (Option)

Nếu có nhiều mã cần gán, có thể viết script:

```javascript
const deviceCodes = [
  { employee_code: "E001", user_id: "uuid1", mode: "assign" },
  { employee_code: "E002", user_id: "uuid2", mode: "assign" },
  { employee_code: "E003", user_id: "uuid3", mode: "assign" },
];

for (const code of deviceCodes) {
  await fetch('/api/attendance/machine-mappings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-current-user-id': 'admin_id'
    },
    body: JSON.stringify({
      machine_id: 'zkteco_ronald_jack_1',
      ...code
    })
  });
  console.log(`✓ Gán ${code.employee_code}`);
}
```

---

## 🔄 Quy Trình Khi Thêm Máy Mới

1. **Admin thêm máy** → `/cau-hinh/may-cham-cong`
   - Nhập IP/hostname, port, tên máy
   - Bật chế độ kết nối (push/pull)

2. **Máy kết nối** → `/api/attendance/adms?SN=<serial>`
   - Máy nhận config (timestamps, realtime mode, etc.)
   - Máy bắt đầu push dữ liệu

3. **Device punch được ghi** → `device_punches` table
   - Dữ liệu thô từ máy (machine_id, employee_code, punch_time)

4. **Admin gán mã** → **← BƯỚC QUAN TRỌNG**
   - Truy cập `/api/attendance/device-codes` hoặc giao diện
   - Gán (machine_id, employee_code) → user
   - POST `/api/attendance/machine-mappings`

5. **Dữ liệu hiển thị** → User's dashboard
   - device_punches JOIN attendance_machine_mappings
   - Sheet stats refresh tự động
   - Nhân viên thấy dữ liệu công

---

## 🐛 Troubleshooting

### Dữ liệu không hiển thị sau khi mapping

**Kiểm tra**:
1. Mapping có `effective_to IS NULL` không?
   ```sql
   SELECT * FROM attendance_machine_mappings 
   WHERE machine_id = 'zkteco_ronald_jack_1' 
   AND employee_code = 'E001';
   ```
   → Nếu `effective_to` không null → mapping hết hạn

2. Punch time có nằm trong khoảng effective_from/to không?
   ```sql
   SELECT m.*, dp.punch_time
   FROM device_punches dp
   JOIN attendance_machine_mappings m
     ON m.machine_id = dp.machine_id 
     AND m.employee_code = dp.employee_code
   WHERE m.user_id = '<uuid>'
   LIMIT 5;
   ```

### Máy không push data

**Kiểm tra**:
1. Device punch table rỗng?
   ```sql
   SELECT COUNT(*) FROM device_punches;
   ```

2. Server logs có error không?
   ```bash
   docker logs <container_name> | grep ADMS
   ```

3. Máy config đúng `asset.fadoai.com:443` không?

### Mapping nhầm người

Dùng mode `"correct"` để sửa:
```bash
curl -X POST '/api/attendance/machine-mappings' \
  -d '{
    "machine_id": "zkteco_ronald_jack_1",
    "employee_code": "E001",
    "user_id": "<uuid_person_đúng>",
    "mode": "correct"
  }'
```

---

## 📝 Summary

| Bước | Hành Động | Endpoint | Kết Quả |
|------|-----------|----------|---------|
| 1 | Thêm máy | `POST /api/attendance/machines` | Machine config lưu |
| 2 | Máy kết nối | `GET /api/attendance/adms?SN=<serial>` | Máy nhận config |
| 3 | Máy push data | `POST /api/attendance/adms?table=ATTLOG` | device_punches ghi data |
| 4 | **Gán mã (QUAN TRỌNG)** | `POST /api/attendance/machine-mappings` | **attendance_machine_mappings tạo** |
| 5 | Xem dữ liệu | User dashboard | ✅ Dữ liệu hiển thị |

---

## 🔧 Code Liên Quan

- **ADMS Endpoint**: `src/app/api/attendance/adms/route.ts`
- **Mapping Service**: `src/lib/services/machineMappingService.ts`
- **Attendance Service**: `src/lib/services/attendanceService.ts`
- **Device Codes API**: `src/app/api/attendance/device-codes/route.ts`
- **Mapping Route**: `src/app/api/attendance/machine-mappings/route.ts`

---

**Kết luận**: System hoạt động bình thường, chỉ cần **tạo mapping từ (machine_id, employee_code) → user** là dữ liệu sẽ hiển thị ngay. Không cần thêm hàm gì.
