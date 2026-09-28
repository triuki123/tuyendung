-- Migration 309: cho phép users.password NULL
-- Chỉ SSO (spec §7.5): mật khẩu sống ở SSO, user thường KHÔNG giữ bcrypt hash local nữa
-- (usersService.createUser/updateUser/adminChangeUserPassword ghi NULL trừ super_admin —
-- super_admin giữ hash để break-glass khi SSO sự cố). Cột này vốn NOT NULL từ migration 001.
ALTER TABLE users
  ALTER COLUMN password DROP NOT NULL;
