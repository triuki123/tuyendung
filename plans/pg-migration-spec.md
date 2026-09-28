# Spec: chuyển data layer từ supabase-js sang Postgres thuần (`pg`)

Tất cả agent ĐỌC file này trước khi sửa. Mục tiêu: bỏ `@supabase/supabase-js`, dùng pool `pg` qua helper trong `src/lib/db.ts`. App chạy với Postgres container (DATABASE_URL). KHÔNG dùng Supabase Auth/Storage/PostgREST.

## Helper có sẵn — `src/lib/db.ts`

```ts
import { query, queryOne, execute, withTransaction, buildInsert, buildUpdateById, pool, User, AuditLog } from '@/lib/db';

query<T>(text, params?): Promise<T[]>        // trả mọi row
queryOne<T>(text, params?): Promise<T|null>  // row đầu hoặc null
execute(text, params?): Promise<number>      // số row bị tác động
withTransaction(async (client) => {...})     // BEGIN/COMMIT/ROLLBACK tự động
buildInsert(table, {col:val,...})            // -> {text,params} INSERT ... RETURNING *
buildUpdateById(table, id, {col:val,...})    // -> {text,params} UPDATE ... WHERE id=$n RETURNING *
```

- Types `User`, `AuditLog` giờ export từ `@/lib/db` (KHÔNG còn `@/lib/supabase`). Đổi mọi `import { User, AuditLog } from '@/lib/supabase'` → `from '@/lib/db'`.
- Tham số dùng placeholder `$1,$2,...` (pg). KHÔNG nội suy chuỗi vào SQL (chống SQL injection).

## Quy tắc bắt buộc

1. **Giữ nguyên chữ ký + shape trả về của mọi hàm service.** Trước đây supabase trả `data` = mảng row (select) hoặc 1 object (`.single()`), error thì throw. Sau rewrite phải trả y hệt: mảng row, hoặc object/null. Caller (routes) KHÔNG được vỡ.
2. **Đọc schema thật** trong `migrations/*.sql` để biết tên cột/bảng chính xác trước khi viết SQL. Đừng đoán cột.
3. Bỏ mọi `import ... from '@/lib/supabase'` và `createClient`. Thay bằng `@/lib/db`.
4. Giữ error handling: nếu code cũ `if (error) throw error`, nay dùng try/catch quanh query hoặc để lỗi pg ném tự nhiên (route đã có try/catch). Giữ thông điệp lỗi tương đương.
5. **Comment code: chỉ giải thích lý do, KHÔNG nhắc tên phase/finding/plan.**
6. Không tạo file "enhanced" mới — sửa trực tiếp file hiện có.

## Bảng ánh xạ supabase → SQL

| supabase-js | SQL/pg |
|---|---|
| `.from('t').select('*')` | `query('SELECT * FROM t')` |
| `.select('a,b')` | `SELECT a, b` |
| `.eq('c', v)` | `WHERE c = $1` (params `[v]`) |
| `.neq` `.gt` `.gte` `.lt` `.lte` | `<>` `>` `>=` `<` `<=` |
| `.in('c', arr)` | `WHERE c = ANY($1)` (params `[arr]`) |
| `.ilike('c','%x%')` | `WHERE c ILIKE $1` |
| `.or('a.eq.1,b.eq.2')` | `WHERE (a = $1 OR b = $2)` |
| `.is('c', null)` | `WHERE c IS NULL` |
| `.order('c',{ascending:false})` | `ORDER BY c DESC` |
| `.limit(n)` / `.range(a,b)` | `LIMIT n` / `LIMIT (b-a+1) OFFSET a` |
| `.single()` | dùng `queryOne`, hoặc `rows[0]` |
| `.insert(obj).select().single()` | `buildInsert` rồi `queryOne(text,params)` |
| `.insert([..])` (nhiều) | nhiều `buildInsert` trong `withTransaction`, hoặc multi-row VALUES |
| `.update(obj).eq('id',id).select().single()` | `buildUpdateById('t', id, obj)` rồi `queryOne` |
| `.delete().eq('id',id)` | `execute('DELETE FROM t WHERE id = $1',[id])` |
| `.select('id',{count:'exact',head:true})` | `queryOne<{count:string}>('SELECT COUNT(*)::int AS count FROM t')` → `.count` |

### Embedding/join (PostgREST) → JOIN thật
- `.select('tags(*)')` từ `user_tags` → JOIN `tags` lấy cột tags.
- `.select('user_id, tag_id, tags(id,name,color)')` → SELECT có JOIN `tags t ON t.id = user_tags.tag_id`, map kết quả thành object lồng `{ user_id, tag_id, tags: {id,name,color} }`. Xem code cũ để dựng đúng shape.

### Supabase Auth (CHỈ ở auth routes)
- `supabaseAdmin.auth.admin.listUsers()` → KHÔNG còn auth service. Thay bằng `query('SELECT * FROM users')` (hoặc lọc theo email). App tự quản user trong bảng `users` (cột `password` bcrypt).
- `supabaseAdmin.auth.admin.updateUserById(id,{password})` → app dùng bcrypt + cột `users.password`. Hash bằng `bcryptjs` rồi `execute('UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2',[hash,id])`. Xem reset-password route để giữ logic.

### rpc / setup routes
- `supabase.rpc('exec'|'execute_sql',{sql_query})` ở `admin/setup-database`, `setup/phase2-migration` → chạy trực tiếp `execute(sql)` qua pool pg. Giữ chức năng tạo bảng. (Lưu ý: với container, schema đã init sẵn; các route này vẫn nên chạy idempotent `CREATE TABLE IF NOT EXISTS`.)

## Kiểm tra sau khi sửa
- Chạy `npx tsc --noEmit` cho phần mình phụ trách (hoặc báo lỗi còn lại).
- Không còn `@/lib/supabase` hay `@supabase/supabase-js` trong file đã sửa.
