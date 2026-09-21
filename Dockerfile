# syntax=docker/dockerfile:1
# ============================================================================
# Sahabat Kreator — satu image untuk app / worker / migrate
# (dipilih lewat docker-compose.prod.yml / docker-compose.staging.yml).
#
# Context build: ROOT monorepo:
#   docker build -f Dockerfile \
#     --build-arg SERVER_URL=https://sahabatkreator.com \
#     --build-arg SITE_URL=https://sahabatkreator.com \
#     --build-arg INDEXABLE=true \
#     -t sahabatkreator-app:prod .
#
# Build args (pola deploy-lama):
#   SERVER_URL → origin API (VITE_SERVER_URL). Staging: https://app.sahabatkreator.com
#   SITE_URL   → canonical SEO (VITE_WEB_URL). SELALU https://sahabatkreator.com
#               agar canonical/og:url staging tetap menunjuk domain produksi.
#   INDEXABLE  → "true" HANYA produksi. Kosong untuk staging → build web
#               mendapat robots.txt Disallow / + meta noindex otomatis
#               (staging-seo-guard di apps/web/vite.config.ts).
# ============================================================================

FROM oven/bun:1-slim AS base
WORKDIR /app

# --- deps: install seluruh dependency workspace --------------------------------
# package.json tiap workspace disalin dulu agar layer cache tidak rusak
# setiap kali source berubah. (bunfig.toml ikut untuk `linker = "isolated"`.)
FROM base AS deps
COPY package.json bun.lock turbo.json bunfig.toml ./
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/publishing/package.json packages/publishing/
COPY packages/queue/package.json packages/queue/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

# --- build: web (Vite) + server (tsdown) ----------------------------------------
FROM deps AS build
ARG SITE_URL=https://sahabatkreator.com
ARG SERVER_URL=https://sahabatkreator.com
ARG INDEXABLE=""
# GA4 Measurement ID (G-XXXXXXX) — hanya produksi. Staging biarkan kosong
# agar tidak ada tracking di host noindex.
ARG GA_MEASUREMENT_ID=""
# Root .env sengaja tidak ikut (lihat .dockerignore) — variabel VITE_*
# di-inject lewat process env; Vite mengeksposnya ke import.meta.env saat build.
ENV VITE_SERVER_URL=${SERVER_URL} \
    VITE_WEB_URL=${SITE_URL} \
    VITE_INDEXABLE=${INDEXABLE} \
    VITE_GA_MEASUREMENT_ID=${GA_MEASUREMENT_ID}
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun run build \
    && mkdir -p apps/server/web-dist \
    && cp -r apps/web/dist/. apps/server/web-dist/

# --- runtime: image final -------------------------------------------------------
# Termasuk node_modules lengkap + source packages/db (drizzle-kit + schema)
# karena service "migrate" menjalankan db:push & seed dari image yang sama.
FROM oven/bun:1-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# User non-root (Debian slim tidak punya adduser, pakai useradd/groupadd)
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --no-create-home --shell /usr/sbin/nologin app

COPY --from=build --chown=app:app /app ./

USER app
EXPOSE 3000

# Default: server API + web-dist (compose meng-override untuk worker/migrate).
# cwd = apps/server → serveStatic menemukan folder web-dist.
WORKDIR /app/apps/server
CMD ["bun", "run", "dist/index.mjs"]
