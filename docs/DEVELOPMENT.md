# Sahabat Kreator — Panduan Pengembangan

Panduan lengkap untuk developer yang ingin berkontribusi atau melanjutkan pengembangan Sahabat Kreator.

---

## 1. Tech Stack

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Framework | Next.js 16 | 16.3.1 (App Router, Turbopack) |
| UI | React + Tailwind CSS | 19.2.8 + 4.3.3 |
| Backend | Node.js | 22 (standalone output) |
| Database | PostgreSQL | 16 Alpine |
| Cache/Queue | Redis | 7 Alpine, AOF |
| ORM | Drizzle ORM | 0.45.2 |
| Auth | better-auth | ~1.6.30 |
| Queue | BullMQ | 5.34.10 |
| Storage | Cloudflare R2 | AWS S3 SDK |
| Build | Turborepo | 2.10.10 |
| Lint | Biome | 2.5.9 |
| Type | TypeScript | 6.0.3 |

---

## 2. Setup Lokal

### Prerequisites
- Node.js 22+
- pnpm 10+
- PostgreSQL (lokal atau Neon)
- Redis (opsional untuk queue)
- Docker (opsional, untuk full stack)

### Install
```bash
git clone <repo-url>
cd sahabat-kreator
pnpm install
```

### Environment
```bash
cp .env.example .env
# Edit .env, isi minimal:
#   DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CORS_ORIGIN, NEXT_PUBLIC_APP_URL
```

### Migrasi Database
```bash
# Generate schema dari kode
pnpm db:generate

# Push schema ke DB (development)
pnpm db:push

# Jalankan migrasi (production style)
pnpm db:migrate

# Buka Drizzle Studio
pnpm db:studio
```

### Jalankan Development
```bash
# Semua app (web + worker)
pnpm dev

# Hanya web
pnpm dev:web

# Hanya worker
pnpm --filter worker dev
```

Web berjalan di `http://localhost:3000`.

---

## 3. Struktur Codebase

### Apps

#### `apps/web/`
Next.js app dengan struktur:
```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── accounts/       # Social account management
│   │   ├── analytics/      # Analytics endpoints
│   │   ├── billing/        # Payment & subscription
│   │   ├── cron/           # Fallback cron jobs
│   │   ├── inbox/          # Comment inbox
│   │   ├── media/          # Media library
│   │   ├── posts/          # Post CRUD
│   │   ├── push/           # Web push notifications
│   │   ├── stock-media/    # Stock media search
│   │   └── webhooks/       # Platform webhook handlers
│   ├── dashboard/          # Protected dashboard pages
│   ├── admin/              # Admin panel pages
│   └── (marketing)/        # Public pages (landing, blog, pricing)
├── components/             # React components
│   ├── dashboard/          # Dashboard-specific components
│   ├── ui/                 # Reusable UI (shadcn/ui)
│   └── admin/              # Admin panel components
├── lib/                    # Business logic
│   ├── publishing/         # Platform publishers (fb, ig, tiktok, yt, etc.)
│   ├── analytics/          # Analytics sync
│   ├── inbox/              # Inbox sync & automation
│   ├── platforms/          # OAuth, token refresh, credentials
│   └── webhooks/           # Webhook handlers & verification
├── instrumentation.ts      # Next.js startup hook (BullMQ workers)
└── middleware.ts           # Auth middleware
```

#### `apps/worker/`
Media processing worker:
```
src/
├── index.ts                # Main loop (poll → transcode → update)
├── ffmpeg.ts               # FFmpeg wrapper
├── transcoder/             # Transcoder abstraction
│   ├── local.ts            # FFmpeg implementation
│   ├── types.ts            # Transcoder interface
│   └── index.ts            # Factory (resolve by env)
└── posts/                  # Post transcoding helpers
```

### Packages

#### `packages/auth/`
Konfigurasi better-auth:
```
src/
├── auth.ts                 # Auth client setup
├── org.ts                  # Organization management
├── team.ts                 # Member management
└── admin.ts                # Admin utilities
```

#### `packages/db/`
Schema & migrasi:
```
src/
├── schema/                 # Drizzle schema (82 tabel)
│   ├── auth.ts
│   ├── social.ts
│   ├── post.ts
│   ├── analytics.ts
│   ├── media.ts
│   ├── commerce.ts
│   ├── content.ts
│   ├── seb.ts
│   └── settings.ts
├── index.ts                # DB instance export
├── migrations/             # SQL migration files
└── drizzle.config.ts       # Drizzle config
```

#### `packages/env/`
Single source of truth environment loader:
```
src/
├── load.ts                 # loadRootEnv() - navigates to workspace root
├── server.ts               # Server env (zod validation)
└── web.ts                  # Client env (Next.js validated)
```

#### `packages/payment/`
Billing & payment integration:
```
src/
├── sumopod.ts              # SumoPod Pay integration
├── encryption.ts           # AES-256-GCM encrypt/decrypt
├── billing.ts              # Plan limits & subscription logic
└── types.ts                # TypeScript types
```

#### `packages/queue/`
BullMQ configuration:
```
src/
└── index.ts                # Queue constants, enqueue helpers, health check
```

---

## 4. Menambah Platform Baru

Langkah untuk menambah platform baru (misal: X/Twitter):

### 1. Tambah schema
Edit `packages/db/src/schema/social.ts`:
```typescript
export const socialAccount = pgTable("social_account", {
  // ... existing fields
  platform: text("platform").notNull().$type<Platform>(),
});
```
Pastikan enum `Platform` di `enum.ts` sudah mencakup platform baru.

### 2. Buat publisher
Buat `apps/web/src/lib/publishing/twitter.ts`:
```typescript
import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

const TWITTER_API_BASE = "https://api.twitter.com/2";

export async function publishToTwitter(
  account: PlatformAccount,
  payload: PublishPayload,
): Promise<PublishResponse> {
  // Implementasi publish ke Twitter API
}
```

### 3. Daftarkan di orchestrator
Edit `apps/web/src/lib/publishing/orchestrator.ts`:
```typescript
import { publishToTwitter } from "./twitter";

// ...
case "TWITTER":
  return publishToTwitter(account, payload);
```

### 4. Tambah konfigurasi OAuth
Edit `apps/web/src/lib/platforms/config.ts`:
```typescript
export const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
  // ...
  TWITTER: {
    name: "X (Twitter)",
    icon: "x",
    callbackUrl: `${process.env.BETTER_AUTH_URL}/api/accounts/callback/twitter`,
    scopes: ["tweet.read", "tweet.write", "users.read"],
  },
};
```

### 5. Test
```bash
pnpm --filter web check-types
pnpm --filter web build
```

---

## 5. Menambah Migrasi Database

### Cara standar (rekomendasi)
```bash
# 1. Edit schema di packages/db/src/schema/
# 2. Generate migration
pnpm db:generate

# 3. Review file migrasi di packages/db/src/migrations/
# 4. Test di lokal
pnpm db:push

# 5. Commit & push
git add packages/db/src/migrations/
git commit -m "feat: add column X to table Y"
git push
```

### Migrasi manual (jika generate gagal)
Buat file SQL di `packages/db/src/migrations/`:
```sql
-- 0006_name_of_change.sql
ALTER TABLE post ADD COLUMN IF NOT EXISTS new_column VARCHAR(255);
```

---

## 6. Testing

### Unit Test
```bash
pnpm test
```

### E2E Test (Playwright)
```bash
# Setup .env.e2e
cp apps/web/.env.example apps/web/.env.e2e

# Run tests
pnpm --filter web test:e2e

# Show report
pnpm --filter web test:e2e:report
```

---

## 7. Code Quality

### Lint & Format
```bash
# Check semua file
pnpm check

# Auto-fix
pnpm check --write
```

### Type Check
```bash
# Semua workspace
pnpm -r check-types

# Hanya web
pnpm --filter web check-types
```

### Build
```bash
pnpm build
```

---

## 8. Debugging

### Queue Worker
Cek log BullMQ:
```bash
docker compose logs -f web | grep "\[queue-worker\]"
```

### Media Worker
```bash
docker compose logs -f worker
```

### Database Query
Gunakan Drizzle Studio:
```bash
pnpm db:studio
```

### Redis Inspection
```bash
docker exec -it <redis-container> redis-cli
redis> KEYS "*"
redis> DBSIZE
redis> INFO stats
```

---

## 9. Troubleshooting Umum

| Gejala | Solusi |
|--------|--------|
| `better-auth` error issuer | Pastikan `better-auth` pin `~1.6.29` di `pnpm-workspace.yaml` |
| `@swc/helpers` missing di Docker | Sudah di-fix: salin `@swc/helpers` eksplisit ke standalone |
| Health check 503 | Cek `DATABASE_URL` dan status postgres container |
| Worker tidak process video | Cek `WORKER_POLL_INTERVAL_MS` dan log worker |
| Token sosial expired | Refresh via dashboard Connections → klik "Refresh Token" |
| Redis connection refused | Pastikan `REDIS_URL` benar, cek container redis up |
| Build gagal env validation | Pastikan semua ARG di docker-compose.yml terisi |

---

## 10. Kontribusi

1. Fork repo
2. Buat branch fitur (`feat/nama-fitur`)
3. Jalankan `pnpm check --write` sebelum commit
4. Jalankan `pnpm -r check-types` pastikan hijau
5. Buat PR dengan deskripsi perubahan

---

*Last updated: 2026-08-22*
