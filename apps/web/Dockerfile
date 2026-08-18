# Web app (Next.js) — build untuk VPS Docker.
# Build: docker build -f apps/web/Dockerfile -t sahabat-kreator-web .
#
# Catatan:
#   - pnpm 10 membutuhkan instalasi workspace penuh (tidak bisa --filter pada install),
#     jadi stage `deps` meng-install semua package lalu build hanya package web.
#   - Env build-time (DATABASE_URL, BETTER_AUTH_*) wajib diset karena t3-env/zod
#     memvalidasi saat `next build`; disalurkan via ARG agar tidak tersimpan di image final.

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
ENV DATABASE_URL=$DATABASE_URL \
    BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET \
    BETTER_AUTH_URL=$BETTER_AUTH_URL \
    CORS_ORIGIN=$CORS_ORIGIN \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY apps/web ./apps/web
RUN pnpm --filter web build

# ---- Runner ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 1001 nextjs
COPY --from=deps --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=deps --chown=nextjs:nextjs /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps --chown=nextjs:nextjs /app/packages ./packages
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next ./apps/web/.next
COPY --from=build --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public
COPY --from=build --chown=nextjs:nextjs /app/apps/web/package.json ./apps/web/package.json
USER nextjs
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
