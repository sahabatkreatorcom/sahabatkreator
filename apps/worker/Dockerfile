# Worker media — ekstrak frame & transcode video via ffmpeg
# Build: docker build -f apps/worker/Dockerfile -t sahabat-kreator-worker .
# Jalankan sebagai container terpisah di VPS.

FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter worker... 

FROM deps AS runner
COPY apps/worker ./apps/worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "worker", "start"]