---
phase: 1
title: "SOAP Client Foundation"
status: pending
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase 1: SOAP Client Foundation

## Overview
Lớp giao tiếp thuần với Zimbra Admin SOAP API: auth + token cache (single-flight), build/parse request, https.Agent cho self-signed TLS. Bao gồm spike verify contract Zimbra trước khi phase 2 build trên giả định. Nền cho mọi op khác.

> **Stack thực tế:** Next.js **13.5.6** (không phải 15) — xác minh `package.json`. App route chạy Node. Không route nào hiện khai `export const runtime` → không dựa vào hành vi App Router/undici của Next 15.

## Requirements
- Functional: auth admin → lấy authToken; gửi request admin có token; parse response/lỗi Zimbra. Spike xác minh contract thật.
- Non-functional: token cache single-flight (1 AuthRequest cho N request đồng thời); auto re-auth + retry 1 lần khi `AUTH_EXPIRED`; timeout 6s (không 15s) để tránh cascade; file < 200 dòng.

## Architecture
- File mới: `src/lib/zimbra/soap-client.ts`, `src/lib/zimbra/config.ts`, `src/lib/zimbra/types.ts`.
- Zimbra Admin JSON-over-SOAP: POST JSON tới `ZIMBRA_ADMIN_URL`:
  ```json
  { "Header": { "context": { "_jsns": "urn:zimbra", "authToken": "<token>" } },
    "Body": { "<Op>Request": { "_jsns": "urn:zimbraAdmin" } } }
  ```
- `AuthRequest` (`urn:zimbraAdmin`) `{ name, password }` → `Body.AuthResponse.authToken[0]._content`.
- **Transport — `https.request` là PRIMARY** (không phải fallback): trên Next 13.5, `fetch(url,{agent})`/dispatcher không nhận Node `https.Agent` đáng tin. Dùng `https.request` + custom agent. (Đảo lại so với draft cũ.)
- **TLS:** config default `ZIMBRA_TLS_REJECT_UNAUTHORIZED=true` + hỗ trợ pin CA qua `ca:` (`ZIMBRA_CA_CERT`). **Validate đã chốt: deployment này KHÔNG có CA cert** → set `ZIMBRA_TLS_REJECT_UNAUTHORIZED=false`, chấp nhận rủi ro MITM (chỉ chạy trong mạng nội bộ tin cậy giữa app server ↔ Zimbra). Log cảnh báo rõ khi verify tắt. KHÔNG set `NODE_TLS_REJECT_UNAUTHORIZED` global (chỉ áp cho agent này). Nếu sau lấy được CA → bật lại verify + pin.
- **Token cache single-flight:** module-level lưu `Promise<{token,expiresAt}>`, không phải token thô. N request đồng thời cùng await 1 promise → 1 AuthRequest. Re-auth khi thiếu/hết hạn. Lưu ý: serverless/multi-instance (Docker `node server.js` + `@netlify/plugin-nextjs`) → cache per-instance, chấp nhận.
- `callAdmin(op, payload)`: lấy token → POST (timeout 6s, AbortController/`req.destroy`) → fault `service.AUTH_EXPIRED`/`service.AUTH_REQUIRED` → clear, re-auth, retry 1 lần → parse `Body.<Op>Response` hoặc ném `ZimbraError(code, reason)`.

## Related Code Files
- Create: `src/lib/zimbra/config.ts` (đọc ENV, validate)
- Create: `src/lib/zimbra/soap-client.ts` (auth, single-flight cache, callAdmin via https.request)
- Create: `src/lib/zimbra/types.ts` (ZimbraDomain, ZimbraAccount, ZimbraDL)
- Create (tạm, không commit credential): `scripts/zimbra-spike.mjs` — verify contract
- Modify: `.env.local.example` (thêm ZIMBRA_* keys, KHÔNG giá trị thật)

## Implementation Steps
1. `config.ts`: `getZimbraConfig()` đọc `ZIMBRA_ADMIN_URL/USER/PASSWORD`, `ZIMBRA_TLS_REJECT_UNAUTHORIZED` (default true), `ZIMBRA_CA_CERT` (optional), `ZIMBRA_DEFAULT_PASSWORD_SUFFIX` (default `@123`). Ném lỗi rõ nếu thiếu URL/USER/PASSWORD.
2. `soap-client.ts`: `httpsAgent` (rejectUnauthorized từ config + ca nếu có); `authenticate()` AuthRequest, cache `Promise` với `expiresAt = now + lifetime*0.9` (default 12h). Single-flight guard.
3. `callAdmin<TReq,TRes>(op, payload)` via `https.request`, timeout 6s, parse JSON, xử lý `Body.Fault` → `ZimbraError`.
4. Retry once khi token expired.
5. `types.ts`: type response thô + domain-friendly.
6. **Spike (`zimbra-spike.mjs`):** verify thật trên Zimbra server: (a) GetAllDomains trả gì; (b) SetPassword nhận `account by='name'` hay cần zimbraId (GetAccount); (c) SearchDirectory filter LDAP syntax đúng; (d) AddDistributionListMember selector. **Ghi kết quả vào phase-02 trước khi build service.**

## Success Criteria
- [ ] `callAdmin('GetAllDomains', {})` trả list domain thật (không 401/TLS error).
- [ ] N (≥3) request đồng thời lúc cache rỗng → đúng **1** AuthRequest (single-flight, per-instance).
- [ ] Config default verify=true; deployment này set `ZIMBRA_TLS_REJECT_UNAUTHORIZED=false` (không CA) → kết nối self-signed thành công; tắt verify CHỈ áp cho agent Zimbra, KHÔNG leak global (route/fetch khác vẫn verify).
- [ ] Spike ghi rõ: selector cho SetPassword/DL-member + cú pháp SearchDirectory filter.

## Risk Assessment
- Zimbra version lệch schema → spike (step 6) phát hiện trước khi build phase 2.
- `https.request` + self-signed: không có CA (validate) → verify off cho agent Zimbra ở mọi env; chấp nhận MITM trong mạng nội bộ. Nếu sau có CA → pin + bật lại.
- Token race: single-flight Promise bắt buộc (không chỉ cache token thô).
- Cascade khi Zimbra down: timeout 6s + retry 1 lần → tối đa ~12s/route; UI lazy-load (phase 4).
