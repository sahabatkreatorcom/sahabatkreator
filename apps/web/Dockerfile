# Web app (Next.js) �?" build untuk VPS Docker.
# Build: docker build -f apps/web/Dockerfile -t sahabat-kreator-web .
#
# Catatan:
#   - pnpm 10 membutuhkan instalasi workspace penuh (tidak bisa --filter pada install),
#     jadi stage `deps` meng-install semua package lalu build hanya package web.
#   - Env build-time (DATABASE_URL, BETTER_AUTH_*) wajib diset karena t3-env/zod
#     memvalidasi saat `next build`; disalurkan via ARG agar tidak tersimpan di image final.
#   - `output: "standalone"` di next.config.ts: image runner hanya berisi hasil tracing
#     (modul yang benar-benar dipakai), tanpa node_modules workspace utuh.

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ---- Deps: instal seluruh workspace (pnpm 10 tidak mendukung --filter saat install) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM deps AS build
ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG CORS_ORIGIN
ARG NEXT_PUBLIC_APP_URL
ARG ENCRYPTION_KEY
ARG R2_ACCOUNT_ID
ARG R2_ACCESS_KEY_ID
ARG R2_SECRET_ACCESS_KEY
ARG R2_BUCKET_NAME
ENV DATABASE_URL=$DATABASE_URL \
    BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET \
    BETTER_AUTH_URL=$BETTER_AUTH_URL \
    CORS_ORIGIN=$CORS_ORIGIN \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    ENCRYPTION_KEY=$ENCRYPTION_KEY \
    R2_ACCOUNT_ID=$R2_ACCOUNT_ID \
    R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID \
    R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
    R2_BUCKET_NAME=$R2_BUCKET_NAME \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY apps/web ./apps/web
RUN pnpm --filter web build

# ---- Runner (standalone) ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 1001 nextjs

# Hasil tracing standalone (server + node_modules yang diperlukan saja).
# Karena outputFileTracingRoot = root workspace, struktur mempertahankan
# prefix `apps/web/` → salin seluruh standalone ke /app lalu cwd di apps/web.
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
# Aset statis & public dipasang via symlink (pola resmi Next.js).
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
# Entry standalone membaca working dirnya sendiri; set cwd ke app agar aset ditemukan.
WORKDIR /app/apps/web
CMD ["node", "server.js"]