---
phase: 5
title: "Test & Verify"
status: pending
priority: P2
effort: "0.5d"
dependencies: [4]
---

# Phase 5: Test & Verify

## Overview
Kiểm thử module Zimbra: unit (password pattern + LDAP escape), **negative security tests**, integration thủ công với Zimbra thật (teardown ép buộc), type-check + lint.

## Requirements
- Functional: verify 7 op chạy đúng với Zimbra thật + các path bảo mật bị chặn.
- Non-functional: `npm run type-check` + `npm run lint` pass; không lộ credential.

## Architecture
- **Không có test framework** trong repo (xác minh `package.json` — không jest/vitest/mocha, không script `test`; có warning "DO NOT MODIFY dependencies"). → Dùng **`node --test`** built-in (Node 20), KHÔNG thêm dep. Unit không cần Zimbra.
- Integration: script `scripts/zimbra-smoke.mjs` (KHÔNG commit credential) — create→verify→delete trong 1 run, delete trong `finally`. Dùng **domain/prefix test riêng** (vd `zztest-*`), không account thật.

## Related Code Files
- Create: test `node --test` cho `defaultPassword` + `escapeLdap`
- Create: `scripts/zimbra-smoke.mjs` (teardown finally)
- Read: toàn bộ file phase 1-4

## Implementation Steps
1. Unit `defaultPassword`: `nam@cty.com`+`@123`→`Nam@123`; `a@x.com`→`A@123`; tính từ canonical name.
2. Unit `escapeLdap`: input `)(objectClass=*` → escaped, không phá filter.
3. **Negative security tests** (P3 gate): (a) request không session → 401; (b) role `user`/`manager` → 403 (KHÔNG vacuous — phải là user authenticated-nhưng-không-đủ-quyền, không phải unauthenticated); (c) forged `x-current-user-role: super_admin` không bypass; (d) input LDAP metachar bị escape; (e) TLS verify bật mặc định.
4. `npm run type-check` — fix lỗi.
5. `npm run lint` — fix lỗi.
6. Smoke test (`zimbra-smoke.mjs`, domain/prefix test): domains list → tạo account test → kiểm Zimbra admin → reset → login thử → search → add/remove member → **delete account test (finally)**.
7. Xác nhận `.env.local` không commit (đã trong .gitignore); không credential trong git diff/log.

## Success Criteria
- [ ] Unit defaultPassword + escapeLdap pass (`node --test`).
- [ ] Negative security tests pass: 401/403 đúng, forged header không bypass, injection escaped, TLS default on.
- [ ] type-check + lint pass.
- [ ] 7 op verify thành công trên Zimbra thật.
- [ ] Smoke script tự cleanup account test (finally) — không sót trên Zimbra.
- [ ] Không credential trong git diff / log.

## Risk Assessment
- Không test framework → `node --test` thuần, không vi phạm lock warning.
- 403 vacuous (P3 guard 403 mọi người) → test phải dùng admin hợp lệ pass + non-admin fail, phân biệt rõ.
- Account test sót trên prod (plaintext) → teardown `finally` + domain/prefix riêng bắt buộc.
