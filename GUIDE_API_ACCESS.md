# Panduan Pengajuan Akses API — Social Media Platforms

Panduan lengkap untuk mengajukan akses API ke masing-masing platform sosial media yang didukung oleh Sahabat Kreator.

---

## Daftar Platform yang Didukung

| Platform | OAuth | API Base | Status |
|----------|-------|----------|--------|
| Instagram (Standalone) | ✅ | `graph.instagram.com/v26.0` | Production |
| Instagram (via Facebook Page) | ✅ | `graph.facebook.com/v26.0` | Production |
| Facebook | ✅ | `graph.facebook.com/v26.0` | Production |
| Threads | ✅ | `graph.threads.net/v1.0` | Production |
| TikTok | ✅ | `open.tiktokapis.com/v2` | Production |
| YouTube | ✅ | `youtube.googleapis.com/v3` | Production |
| Pinterest | ✅ | `api.pinterest.com/v5` | Production |
| Google Business | ✅ | `mybusinessbusinessinformation.googleapis.com/v1` | Production |
| LinkedIn | ✅ | `api.linkedin.com/v2` | Production |
| Bluesky | ❌ | `bsky.social/xrpc` | Custom Auth |
| Meta (IG + FB) | ✅ | Shared | Production |

---

## 1. Meta Platforms (Instagram + Facebook)

Meta menggunakan satu aplikasi untuk mengakses Instagram dan Facebook secara bersamaan.

### Langkah-langkah

#### A. Daftar Developer Meta
1. Buka [developers.facebook.com](https://developers.facebook.com)
2. Login dengan akun Facebook personal Anda
3. Klik **My Apps** → **Create App**
4. Pilih tipe: **Business** → **Next**
5. Masukkan nama aplikasi (contoh: `Sahabat Kreator`)
6. Klik **Create App**

#### B. Konfigurasi Basic Settings
1. Di dashboard app, buka **Settings → Basic**
2. Salin **App ID** dan **App Secret** (simpan aman!)
3. Tambahkan **App Domain**: `sahabatkreator.com` (atau domain production Anda)
4. Tambahkan **Privacy Policy Url** (wajib untuk review)
5. Tambahkan **Data Processing Amendment** jika handling data EU

#### C. Tambahkan Product: Instagram Graph API
1. Di dashboard app, klik **Add Product**
2. Pilih **Instagram Graph API** → **Set Up**
3. Hubungkan Instagram Business Account:
   - Klik **Connect Account**
   - Login Instagram Business account yang ingin diintegrasikan
   - Pilih Facebook Page yang terhubung (opsional)
   - Konfirmasi permissions

#### D. Tambahkan Product: Facebook Login
1. Klik **Add Product** → pilih **Facebook Login** → **Set Up**
2. Buka **Facebook Login → Settings**
3. Pastikan **User Data Deletion** diaktifkan
4. Tambahkan **Valid OAuth Redirect URIs**:
   ```
   https://sahabatkreator.com/api/auth/callback/meta
   ```

#### E. Konfigurasi Permissions (Scopes)
Di **Instagram Graph API → Permissions**, tambahkan:
- `instagram_basic` — Profil dasar Instagram
- `instagram_content_publish` — Publish konten
- `instagram_manage_comments` — Kelola komentar
- `instagram_manage_insights` — Statistik
- `instagram_manage_messages` — Pesan DM
- `pages_show_list` — Daftar Pages
- `pages_read_engagement` — Baca engagement Page
- `business_management` — Kelola business assets

Di **Facebook Login → Permissions**, tambahkan:
- `public_profile` — Profil publik
- `pages_manage_posts` — Publish ke Page
- `publish_video` — Publish video
- `pages_read_engagement` — Baca engagement
- `pages_manage_engagement` — Kelola engagement
- `pages_show_list` — Daftar Page
- `business_management` — Kelola business
- `read_insights` — Statistik Page

#### F. Buat App Review (jika ingin public)
1. Buka **App Review → Make [App Name] Public**
2. Submit permissions yang ingin diaktifkan untuk user lain
3. Tunggu approval dari Meta (bisa 1-7 hari kerja)

#### G. Environment Variables
Simpan kredensial ke `.env`:
```env
META_CLIENT_ID=your_app_id
META_CLIENT_SECRET=your_app_secret
```

---

## 2. Instagram Business (Standalone)

Instagram memiliki API standalone yang tidak memerlukan Facebook Page.

### Langkah-langkah

#### A. Buat Aplikasi Instagram Graph API
1. Ikuti langkah 1-6 di bagian **Meta Platforms** di atas
2. Untuk Instagram standalone, pastikan Anda menggunakan **Instagram Graph API**, bukan Facebook Login

#### B. Konversi ke Business Account
1. Buka Instagram mobile app
2. Pergi ke profil Anda → **Menu (☰) → Settings → Account → Switch to Professional Account**
3. Pilih kategori (Creator atau Business)
4. Tautkan ke Facebook Page (opsional, tapi disarankan)

#### C. Permissions Khusus Instagram
Pastikan scopes berikut diaktifkan:
- `instagram_business_basic` — Profil bisnis
- `instagram_business_content_publish` — Publish post/reel
- `instagram_business_manage_comments` — Kelola komentar
- `instagram_business_manage_insights` — Statistik
- `instagram_business_manage_messages` — DM business

#### D. Environment Variables
```env
INSTAGRAM_CLIENT_ID=your_app_id
INSTAGRAM_CLIENT_SECRET=your_app_secret
```

---

## 3. Threads (Meta)

Threads menggunakan Meta OAuth yang sama dengan Instagram/Facebook.

### Langkah-langkah

#### A. Gunakan Aplikasi Meta yang Sudah Dibuat
1. Buka [developers.facebook.com](https://developers.facebook.com)
2. Pilih app yang sama dengan konfigurasi Instagram/Facebook

#### B. Tambahkan Product Threads API
1. Di dashboard app, klik **Add Product**
2. Pilih **Threads API** → **Set Up**
3. Hubungkan Instagram Business Account yang sudah terhubung

#### C. Permissions Threads
Tambahkan scopes berikut:
- `threads_basic` — Profil dasar Threads
- `threads_content_publish` — Publish thread
- `threads_manage_insights` — Statistik
- `threads_manage_replies` — Kelola balasan
- `threads_read_replies` — Baca balasan
- `threads_share_to_instagram` — Share ke Instagram

#### D. Valid OAuth Redirect URI
Tambahkan di **Settings → Basic**:
```
https://sahabatkreator.com/api/auth/callback/threads
```

#### E. Environment Variables
```env
THREADS_CLIENT_ID=your_meta_app_id
THREADS_CLIENT_SECRET=your_meta_app_secret
```

---

## 4. TikTok

### Langkah-langkah

#### A. Daftar Developer TikTok
1. Buka [developers.tiktok.com](https://developers.tiktok.com)
2. Login dengan akun TikTok Anda
3. Klik **Go to Developer Portal** → **Create App**
4. Pilih tipe: **Business** → **Next**
5. Isi nama app dan deskripsi → **Submit**

#### B. Konfigurasi App
1. Di dashboard app, buka **App Management → Basic Information**
2. Salin **Client Key** dan **Client Secret**
3. Tambahkan **Redirect URIs**:
   ```
   https://sahabatkreator.com/api/auth/callback/tiktok
   ```

#### C. Aktifkan Fitur
1. Buka **Products → TikTok for Websites** → **Activate**
2. Buka **Permissions** dan aktifkan:
   - `user.info.profile` — Profil pengguna
   - `user.info.stats` — Statistik profil
   - `video.publish` — Publish video
   - `video.upload` — Upload video
   - `video.list` — Daftar video

#### D. App Review (jika ingin public)
1. Buka **Apps → Your Apps → [App Name] → Review**
2. Submit untuk review publik
3. Tunggu approval (biasanya 1-3 hari)

#### E. Environment Variables
```env
TIKTOK_CLIENT_ID=your_client_key
TIKTOK_CLIENT_SECRET=your_client_secret
```

---

## 5. YouTube (Google)

### Langkah-langkah

#### A. Daftar Google Cloud Project
1. Buka [console.cloud.google.com](https://console.cloud.google.com)
2. Klik **Select a Project → New Project**
3. Nama: `Sahabat Kreator` → **Create**
4. Pilih project yang baru dibuat

#### B. Aktifkan API
1. Buka **APIs & Services → Library**
2. Cari dan aktifkan:
   - **YouTube Data API v3**
   - **YouTube Analytics API**
   - **YouTube Channel Monitoring API** (opsional)

#### C. Buat Credentials OAuth 2.0
1. Buka **APIs & Services → Credentials**
2. Klik **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Nama: `Sahabat Kreator Web Client`
5. Tambahkan **Authorized redirect URIs**:
   ```
   https://sahabatkreator.com/api/auth/callback/youtube
   ```
6. Klik **Create**
7. Salin **Client ID** dan **Client Secret**

#### D. Permissions (Scopes)
Pastikan scopes berikut digunakan:
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube`
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

#### E. Environment Variables
```env
YOUTUBE_CLIENT_ID=your_google_client_id
YOUTUBE_CLIENT_SECRET=your_google_client_secret
```

---

## 6. Pinterest

### Langkah-langkah

#### A. Daftar Developer Pinterest
1. Buka [developers.pinterest.com](https://developers.pinterest.com)
2. Login dengan akun Pinterest Anda
3. Klik **My apps → Create app**
4. Isi:
   - App name: `Sahabat Kreator`
   - Description: deskripsi aplikasi
   - Website: `https://sahabatkreator.com`
5. Klik **Create**

#### B. Konfigurasi App
1. Di dashboard app, buka **Settings**
2. Salin **App ID** (Client ID)
3. Buka **Secrets** → salin **Client Secret**
4. Tambahkan **Redirect URLs**:
   ```
   https://sahabatkreator.com/api/auth/callback/pinterest
   ```

#### C. Permissions
Di **Permissions** tab, aktifkan:
- `user_accounts:read` — Baca profil user
- `boards:read` — Baca boards
- `boards:write` — Buat/edit board
- `pins:read` — Baca pins
- `pins:write` — Buat/edit pin

#### D. Sandbox Mode (Opsional)
Untuk testing, aktifkan **Sandbox Mode**:
- Set env `PINTEREST_SANDBOX=true`
- Semua action akan ke Pinterest Sandbox (tidak mempengaruhi akun asli)

#### E. Environment Variables
```env
PINTEREST_CLIENT_ID=your_app_id
PINTEREST_CLIENT_SECRET=your_client_secret
PINTEREST_SANDBOX=false
```

---

## 7. Google Business Profile

### Langkah-langkah

#### A. Gunakan Project Google Cloud yang Sama
1. Buka [console.cloud.google.com](https://console.cloud.google.com)
2. Pilih project yang sama dengan YouTube

#### B. Aktifkan API
1. Buka **APIs & Services → Library**
2. Cari dan aktifkan:
   - **Google Business Profile API**
   - **My Business Account Management API**
   - **My Business Information API**
   - **My Business Notifications API** (opsional)
   - **My Business Offers API** (opsional)

#### C. Buat OAuth Credential yang Sama
Gunakan OAuth Client ID yang sudah dibuat untuk YouTube, atau buat baru dengan redirect URI:
```
https://sahabatkreator.com/api/auth/callback/google-business
```

#### D. Permissions (Scopes)
```
https://www.googleapis.com/auth/business.manage
```

#### E. Environment Variables
```env
GOOGLE_BUSINESS_CLIENT_ID=your_google_client_id
GOOGLE_BUSINESS_CLIENT_SECRET=your_google_client_secret
```

---

## 8. LinkedIn

### Langkah-langkah

#### A. Daftar Developer LinkedIn
1. Buka [developer.linkedin.com](https://developer.linkedin.com)
2. Login dengan akun LinkedIn Anda
3. Klik **My Apps → Create App**
4. Isi:
   - App name: `Sahabat Kreator`
   - LinkedIn Page URL: (opsional)
   - Logo: (opsional)
   - Brief description: deskripsi aplikasi
5. Klik **Create App**

#### B. Konfigurasi OAuth
1. Di dashboard app, buka **Auth** tab
2. Tambahkan **Authorized redirect URLs**:
   ```
   https://sahabatkreator.com/api/auth/callback/linkedin
   ```
3. Salin **Client ID** dan **Client Secret**

#### C. Permissions (Scopes)
Di **OAuth 2.0 Settings**, aktifkan:
- `openid` — OpenID Connect
- `profile` — Profil pengguna
- `email` — Email pengguna
- `w_member_social` — Publish ke profil

#### D. Upload Logo & Brand Assets
1. Buka **App Details → Branding**
2. Upload logo dan asset sesuai spesifikasi LinkedIn

#### E. App Review (jika ingin public)
1. Buka **Sign Up & Authenticate → Review**
2. Submit untuk review publik
3. Tunggu approval (biasanya 1-5 hari kerja)

#### F. Environment Variables
```env
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
```

---

## 9. Bluesky

Bluesky menggunakan protocol AT Protocol yang berbeda dari OAuth tradisional.

### Langkah-langhang

#### A. Daftar Developer Bluesky
1. Buka [bluesky.social](https://bsky.social)
2. Buat akun Bluesky
3. Pergi ke **Settings → Applications → Create Application**
4. Simpan **Client ID** dan **Client Secret**

#### B. Konfigurasi Redirect URI
Tambahkan di application settings:
```
https://sahabatkreator.com/api/auth/callback/bluesky
```

#### C. Implementasi Custom Auth
Bluesky menggunakan AT Protocol, bukan OAuth 2.0. Implementasi memerlukan:
- Library: `@atproto/api` atau `bluesky`
- Endpoint: `https://bsky.social/xrpc/`
- Auth flow: login dengan email/password atau handle

#### D. Environment Variables
```env
BLUESKY_CLIENT_ID=your_client_id
BLUESKY_CLIENT_SECRET=your_client_secret
BLUESKY_SERVICE=https://bsky.social
```

---

## Checklist Keamanan & Compliance

### Sebelum Go-Live
- [ ] Semua client secret disimpan di environment variables (bukan di code)
- [ ] Redirect URI sudah diverifikasi dan hanya domain terpercaya
- [ ] App review disetujui untuk semua permissions publik
- [ ] Privacy Policy website sudah tersedia dan link-nya terdaftar
- [ ] User data deletion implemented (sesuai kebijakan platform)
- [ ] Token encryption enabled (AES-256 untuk stored tokens)
- [ ] Rate limiting implemented di server
- [ ] Error handling untuk expired/suspended tokens

### Dokumentasi yang Diperlukan
1. Privacy Policy (wajib untuk semua platform)
2. Terms of Service
3. Data Processing Agreement (untuk EU users)
4. App description & screenshots (untuk review)

---

## Ringkasan Environment Variables

Simpan semua kredensial di `.env`:

```env
# Meta (Instagram + Facebook)
META_CLIENT_ID=
META_CLIENT_SECRET=

# Instagram Standalone
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=

# Threads
THREADS_CLIENT_ID=
THREADS_CLIENT_SECRET=

# TikTok
TIKTOK_CLIENT_ID=
TIKTOK_CLIENT_SECRET=

# YouTube
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# Pinterest
PINTEREST_CLIENT_ID=
PINTEREST_CLIENT_SECRET=
PINTEREST_SANDBOX=false

# Google Business
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# Bluesky
BLUESKY_CLIENT_ID=
BLUESKY_CLIENT_SECRET=
BLUESKY_SERVICE=https://bsky.social
```

---

## Sumber Dokumentasi

| Platform | Dokumentasi |
|----------|-------------|
| Meta/Instagram | https://developers.facebook.com/docs/instagram-api |
| Threads | https://developers.facebook.com/docs/threads |
| TikTok | https://developers.tiktok.com/doc |
| YouTube | https://developers.google.com/youtube/v3 |
| Pinterest | https://developers.pinterest.com/docs/api/overview/ |
| Google Business | https://developers.google.com/my-business/content |
| LinkedIn | https://docs.microsoft.com/en-us/linkedin/shared/introduction |
| Bluesky | https://github.com/bluesky-social/atproto |

---

## Troubleshooting Umum

### Error: "Unsupported grant type"
- Pastikan `redirect_uri` di kode sama persis dengan yang terdaftar di developer console
- Periksa spasi dan trailing slash

### Error: "Code was already used"
- Authorization code hanya bisa dipakai sekali
- Refresh token harus digunakan untuk memperbarui access token

### Error: "Token has expired"
- Implementasikan token refresh otomatis
- Simpan `expires_at` dan refresh sebelum expired

### Error: "Permission denied"
- Cek apakah permission sudah di-approve di App Review
- Pastikan user mengauthorize semua scope yang diperlukan

### Error: "App not approved for production"
- Submit app untuk review di platform masing-masing
- Tunggu approval sebelum menggunakan di production
