# Web app (Next.js) — build untuk VPS Docker.
# Build: docker build -f apps/web/Dockerfile -t sahabat-kreator-web .

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter web...

FROM deps AS build
# Env wajib dibaca saat `next build` (t3-env zod validate). Isi saat build, bukan disimpan di image.
ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG CORS_ORIGIN
ENV DATABASE_URL=$DATABASE_URL \
    BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET \
    BETTER_AUTH_URL=$BETTER_AUTH_URL \
    CORS_ORIGIN=$CORS_ORIGIN \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY apps/web ./apps/web
RUN pnpm --filter web build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 1001 nextjs
COPY --from=deps --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=deps --chown=nextjs:nextjs /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps --chown=nextjs:nextjs /app/packages ./packages
COPY --from=build --chown=nextjs:nextjs /app/apps/web/.next ./apps/web/.next
COPY --from=build --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public
USER nextjs
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]