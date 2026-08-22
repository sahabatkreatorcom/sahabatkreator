# Sahabat Kreator — API Reference

Dokumentasi endpoint API utama Sahabat Kreator. Semua endpoint kecuali login/register memerlukan autentikasi bearer token.

---

## Authentication

### Login / Register
```
POST /api/auth/sign-in/email
Body: { email, password }

POST /api/auth/sign-up
Body: { email, password, name }
```

### OAuth Callback
```
GET /api/accounts/callback/[platform]?code=...&state=...
```
Platform: `facebook`, `instagram`, `tiktok`, `youtube`, `pinterest`, `linkedin`, `threads`, `google_business`

---

## Organizations (Workspace)

### List organizations
```
GET /api/organization
```

### Create organization
```
POST /api/organization
Body: { name }
```

### Set active workspace
```
POST /api/organization/active
Body: { organizationId }
```

---

## Social Accounts (Connections)

### List accounts
```
GET /api/accounts
Query: platform (optional filter)
```

### Get page choices (FB/IG Page picker)
```
GET /api/accounts/pending/[sessionId]
```

### Select page (FB/IG Page flow)
```
POST /api/accounts/pending/[sessionId]
Body: { accountId }
```

### Refresh token
```
POST /api/accounts/refresh
Body: { accountId }
```

---

## Posts

### List posts
```
GET /api/posts
Query:
  - status: DRAFT | SCHEDULED | PUBLISHING | PUBLISHED | FAILED | all (default: all)
  - limit: number (default: 20, max: 100)
  - offset: number (default: 0)
```
Response:
```json
{
  "posts": [
    {
      "id": "uuid",
      "caption": "...",
      "status": "scheduled",
      "scheduledAt": "2026-08-22T10:00:00Z",
      "publishedAt": "2026-08-22T10:00:05Z",
      "createdAt": "2026-08-22T09:00:00Z",
      "platform": "TIKTOK",
      "postUrl": "https://tiktok.com/@user/video/xxx",
      "account": { "id": "uuid", "platform": "TIKTOK", "name": "My Account", "avatar": "..." },
      "media": [{ "id": "uuid", "url": "...", "thumbnailUrl": "...", "type": "video" }],
      "linkedGroupId": "uuid"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### Create post(s)
```
POST /api/posts
Body: {
  caption: "string",
  platformAccountIds: string[],    // akun target per post
  mediaIds: string[],             // ID media dari library
  scheduledAt?: string,           // ISO datetime (opsional)
  autoPublish?: boolean,          // true = publish langsung
  firstComment?: string,          // komentar pertama (IG/FB support)
  pillarId?: string,              // konten pillar
  platformSettings?: Record<string, PlatformSettingsInput>  // per-platform settings
}
```
Response:
```json
{ "posts": [...], "linkedGroupId": "uuid", "count": 3 }
```

### Update post
```
PATCH /api/posts/[id]
Body: { caption?, scheduledAt?, platformSettings? }
```

### Delete post
```
DELETE /api/posts/[id]
```

### Cancel scheduled post
```
DELETE /api/posts/[id]/schedule
```
Membatalkan job BullMQ yang tertunda.

---

## Media Library

### List media
```
GET /api/media
Query:
  - folderId: "root" | uuid
  - type: image | video | audio | all
  - search: string
  - limit: number (default: 50, max: 200)
  - offset: number
```

### Upload media
```
POST /api/media
Content-Type: multipart/form-data
Fields:
  - file: File
  - folderId?: string
  - tags?: string (comma-separated)
```

### Update media metadata
```
PATCH /api/media
Body: { id, filename?, tags?, folderId?, altText? }
```

### Delete media
```
DELETE /api/media
Body: { ids: string[] }
```

---

## Inbox (Comments)

### List comments
```
GET /api/inbox
Query:
  - platform: TIKTOK | INSTAGRAM | FACEBOOK | YOUTUBE | THREADS (optional)
  - status: UNREAD | READ | REPLIED (optional)
  - limit: number
  - offset: number
```

### Mark as read/replied
```
PATCH /api/inbox/[id]
Body: { status: "READ" | "REPLIED" }
```

### Reply to comment
```
POST /api/inbox/[id]/reply
Body: { message: string }
```

### Sync comments (manual)
```
POST /api/inbox/sync
Headers:
  Authorization: Bearer <token>
  x-organization-id: <orgId>
```

---

## Analytics

### Overview
```
GET /api/analytics/overview
Headers:
  x-organization-id: <orgId>
Query:
  - period: 7d | 30d | 90d (default: 7d)
```

### Trends
```
GET /api/analytics/trends
Headers:
  x-organization-id: <orgId>
Query:
  - platform: (optional)
  - days: number (default: 7)
```

### Sync analytics (manual)
```
POST /api/analytics/sync
Headers:
  Authorization: Bearer <token>
  x-organization-id: <orgId>
```

---

## Admin

### Admin stats
```
GET /api/admin/stats
Requires: admin role
```

### Admin billing stats
```
GET /api/admin/billing/stats
Requires: admin role
```
Returns: totalRevenue, monthlyRevenue, revenueLastMonth, activeSubscriptions, totalCustomers, churnRate

### Admin platform credentials
```
GET /api/admin/platform-credentials
Requires: admin role
Returns: list platform credentials (masked secrets)

PUT /api/admin/platform-credentials
Requires: admin role
Body: {
  platform: "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "PINTEREST" | "LINKEDIN" | "THREADS" | "GOOGLE_BUSINESS",
  clientId: string,
  clientSecret: string,
  webhookVerifyToken?: string,
  enabled: boolean
}
```

### Admin SumoPod config
```
GET /api/admin/sumo-pod
Requires: admin role
Returns: masked SumoPod config

PUT /api/admin/sumo-pod
Requires: admin role
Body: { sumopodApiKey, sumopodApiSecret, sumopodBaseUrl, sumopodWebhookToken, active: boolean }
```

### Blog posts
```
GET  /api/admin/blog/posts        → list (admin only)
POST /api/admin/blog/posts        → create (admin only)
GET  /api/admin/blog/posts/[id]   → detail
PATCH /api/admin/blog/posts/[id]  → update
DELETE /api/admin/blog/posts/[id] → delete
```

---

## Billing

### Get plan info
```
GET /api/billing
```

### Create checkout session
```
POST /api/billing
Body: { planId: "FREE" | "STANDARD" | "BUSINESS" }
Response: { checkoutUrl: "https://sumopod.com/..." }
```

### Webhook callback
```
POST /api/billing/webhook
Headers:
  svix-id: <uuid>
  svix-timestamp: <unix_ts>
  svix-signature: <hmac>
  X-Webhook-Token: <token>
```

---

## Push Notifications

### Get VAPID status & subscriptions
```
GET /api/push
Response: {
  isSupported: boolean,
  isVapidConfigured: boolean,
  vapidPublicKey: string | null,
  subscriptions: [{ id, userAgent, createdAt }]
}
```

### Register subscription
```
POST /api/push
Body: { endpoint, p256dh, auth, userAgent? }
```

### Delete subscription
```
DELETE /api/push
Body: { subscriptionId: string }
```

---

## Stock Media

### Search Pixabay
```
GET /api/stock-media/pixabay
Query: query, page, per_page
```

### Search Pexels
```
GET /api/stock-media/pexels
Query: query, page, per_page
```

### Search Unsplash
```
GET /api/stock-media/unsplash
Query: query, page, per_page
```

### Import media (by URL)
```
POST /api/stock-media/import
Body: { url: string }
Allowed domains: pixabay.com, pexels.com, unsplash.com
```

---

## Seb AI

### Chat with Seb
```
POST /api/seb/chat
Body: { message: string }
Response: { reply: string, sources?: [...] }
```

### Get strategy report
```
POST /api/seb/strategy
Body: { days: number (default 90) }
```

### Scan website
```
POST /api/seb/scan
Body: { url: string }
```

### Analyze media
```
POST /api/seb/analyze-media
Body: { mediaUrl: string, question?: string }
```

---

## Cron (Fallback — bila Redis tidak tersedia)

Semua endpoint cron memerlukan header `Authorization: Bearer <CRON_SECRET>`.

```
POST /api/cron/publish          → claim & publish SCHEDULED posts
POST /api/cron/billing          → downgrade org expired ke FREE tier
POST /api/cron/check-tiktok-pending → resolve TikTok async publish
POST /api/cron/refresh-tokens   → auto-refresh token sosial expired
```

---

## Health

```
GET /api/health
Response:
{
  "ok": true,
  "db": true,
  "redis": true,
  "ts": "2026-08-22T..."
}
```
Status 503 bila DB atau Redis unavailable.

```
GET /api/admin/health
Requires: admin role
Response: detailed system metrics (workers active, queue depth, etc.)
```

---

## Common Response Format

```json
{
  "ok": true,
  "data": { ... },
  "error": null,
  "meta": { "total": 42, "limit": 20, "offset": 0 }
}
```

Error response:
```json
{ "error": "Pesan error dalam bahasa Indonesia" }
```

---

*Last updated: 2026-08-22*
