# syntax=docker/dockerfile:1

# ---- deps: install production + build dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# ---- builder: compile the Next.js standalone bundle ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Next imports server route modules while collecting build metadata. db.ts validates
# that production has a connection string at import time, although no query is run
# during this phase. Use a non-routable build-only value; the runner receives the
# real DATABASE_URL from docker-compose at runtime and this value is not copied.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
# NEXT_PUBLIC_* values are inlined at build time, so the app base URL (used to
# build password-reset links) must be provided here. DATABASE_URL is read at runtime.
ARG NEXT_PUBLIC_APP_URL=http://localhost:4028
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4028
ENV TZ=Asia/Ho_Chi_Minh

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# --chown bắt buộc: API avatar ghi file vào public/avatars lúc runtime bằng user nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Tạo sẵn thư mục avatars (mount point cho volume) với quyền ghi cho nextjs
RUN mkdir -p /app/public/avatars && chown nextjs:nodejs /app/public/avatars

# zklib là server-only module, Next.js standalone không tự bundle
# Phải copy vào runner để ZKTeco poller hoạt động khi deploy
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/zklib ./node_modules/zklib

# sharp (xử lý avatar) là native module: standalone trace đôi khi bỏ sót binary
# @img/sharp-linuxmusl-*. Copy nguyên sharp + @img + 3 dep JS (color/detect-libc/
# semver) từ stage deps (đã cài cho alpine/musl) để chắc chắn chạy được.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/detect-libc ./node_modules/detect-libc
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/semver ./node_modules/semver
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/color ./node_modules/color
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/color-convert ./node_modules/color-convert
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/color-string ./node_modules/color-string
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/color-name ./node_modules/color-name
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/simple-swizzle ./node_modules/simple-swizzle
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/is-arrayish ./node_modules/is-arrayish

# dotenv + pg cần cho scripts/run-migrations.js (chạy trước khi Next.js start)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/pg-connection-string ./node_modules/pg-connection-string

# Chay migrations theo thu tu truoc khi start app.
# run-migrations.js track lich su qua bang _migrations -> moi file chi chay 1 lan.
# reconcile.sql + migrate.mjs giu lai de tuong thich nguoc (khong xoa).
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/run-migrations.js ./scripts/run-migrations.js
COPY --from=builder --chown=nextjs:nodejs /app/docker/postgres/reconcile.sql ./docker/postgres/reconcile.sql
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations

USER nextjs
EXPOSE 4028
CMD ["sh", "-c", "node scripts/run-migrations.js && node scripts/migrate.mjs && node server.js"]
