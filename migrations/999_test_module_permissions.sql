-- Test Script for Module Permissions System
-- Run this AFTER executing migration 023_add_module_permissions_to_users.sql
-- This script verifies that the permission system is properly configured

-- Test 1: Verify module_permissions column exists
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'module_permissions';
-- Expected result: One row with data_type = 'jsonb'

-- Test 2: Verify GIN index on module_permissions exists
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'users' AND indexname LIKE '%module_permissions%';
-- Expected result: One row with GIN index

-- Test 3: Check comment on column
SELECT
  col_description((table_name::text || '.' || column_name::text)::regclass, ordinal_position)
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'module_permissions';
-- Expected result: Comment about JSON object format

-- Test 4: Verify default value
SELECT
  column_name,
  column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'module_permissions';
-- Expected result: column_default contains '{}'

-- Test 5: Check first 5 users and their permissions
SELECT
  id,
  email,
  name,
  role,
  module_permissions,
  created_at
FROM public.users
LIMIT 5;

-- Test 6: Check users with permissions assigned (if any exist)
SELECT
  id,
  email,
  name,
  role,
  jsonb_object_keys(module_permissions) as module_id,
  created_at
FROM public.users
WHERE module_permissions != '{}'::jsonb
LIMIT 10;

-- Test 7: Verify permissions structure for a specific user (if exists)
-- Uncomment and replace UUID with actual user ID
-- SELECT
--   id,
--   email,
--   module_permissions->>'users' as users_permissions,
--   module_permissions->>'dashboard' as dashboard_permissions,
--   module_permissions->>'asset-management' as asset_management_permissions
-- FROM public.users
-- WHERE id = 'YOUR_USER_ID_HERE';

-- Test 8: Count users with empty vs non-empty permissions
SELECT
  CASE
    WHEN module_permissions = '{}'::jsonb THEN 'Empty'
    ELSE 'With Permissions'
  END as permission_status,
  COUNT(*) as count
FROM public.users
GROUP BY permission_status;

-- Test 9: Verify permissions are stored correctly (sample format)
-- This shows how to query nested JSON permissions
SELECT
  id,
  email,
  name,
  role,
  jsonb_array_length(module_permissions->'users') as user_module_permissions_count,
  module_permissions->'users' as user_permissions
FROM public.users
WHERE module_permissions->'users' IS NOT NULL
LIMIT 5;

-- Test 10: Performance check - Query with GIN index should be fast
EXPLAIN ANALYZE
SELECT id, email, name
FROM public.users
WHERE module_permissions @> '{"users": ["view"]}'::jsonb
LIMIT 10;
-- This should use the idx_users_module_permissions index

-- Test 11: Cleanup/Reset (CAUTION: Uncomment only if needed to reset)
-- This resets all module_permissions to empty object
-- UPDATE public.users SET module_permissions = '{}'::jsonb WHERE id != 'PROTECT_THIS_ID';

-- Summary: All tests should show:
-- ✅ Column exists and is JSONB type
-- ✅ GIN index exists
-- ✅ Default value is '{}'::JSONB
-- ✅ Queries use the index for good performance
-- ✅ Permissions are stored in correct JSON format
