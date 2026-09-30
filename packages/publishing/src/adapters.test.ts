// Test adapter platform — 12 adapter, ~2.300 LOC tanpa test sama sekali (skor
// Testability 2/10 di ANALISA-CODEBASE.md). Inilah lapisan yang menangani
// kredensial OAuth 12 platform: bug di sini = post user gagal tayang atau
// terkirim ke endpoint yang salah tanpa pesan jelas.
//
// Strategi: global `fetch` di-stub (semua adapter lewat httpRequest/downloadMedia/
// httpUpload yang memakai fetch global) — jadi logika retry/parsing error asli
// ikut diuji, bukan di-mock. `@sahabatkreator/db` di-mock karena quota hook
// (onResponse) menulis snapshot kuota sebagai side-effect best-effort.
//
// Yang diuji per adapter:
//  - VALIDASI LOKAL (sebelum HTTP): format/limit media → PublishError permanen
//    (retryable:false). Kalau ini lolos, request yang salah ditembak ke platform
//    dan quota/hari terbuang sia-sia.
//  - HAPPY PATH: endpoint + field kunci benar + hasil (published/processing)
//    dan handle/platformPostUrl sesuai kontrak pipeline.
//  - KONTRAK ERROR: response error platform → retryable vs permanen sesuai
//    jenis kesalahan (rate limit = retry; konten ditolak = permanen).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdapter, supportedPlatforms } from "./adapters";
import type { PlatformAdapter, PublishInput, PublishMedia } from "./types";

// --- Mock db: hanya dipakai quota hook (side-effect write snapshot kuota) ---
const { db, chainable } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  };

  function chainable(result: unknown) {
    const chain: Record<string, unknown> = {
      // biome-ignore lint/suspicious/noThenProperty: mock thenable — begini drizzle chain di-await.
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
    };
    const proxy = new Proxy(chain, {
      get(target, prop) {
        if (prop === "then") return target.then;
        return () => proxy;
      },
    });
    return proxy;
  }

  return { db, chainable };
});

vi.mock("@sahabatkreator/db", () => ({
  db,
  notifyOrganization: vi.fn().mockResolvedValue(undefined),
  pushToOrganization: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@sahabatkreator/db/schema", () => ({
  apiQuotaSnapshot: { id: "apiQuotaSnapshot.id" },
  bridgeConfig: { id: "bridgeConfig.id" },
}));

// --- Fetch global stub ---

let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof fetch | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // quota hook resolve bersih (db.insert → chainable)
  db.insert.mockReturnValue(chainable([]));
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFetch !== undefined) globalThis.fetch = originalFetch;
  db.select.mockReset();
  db.update.mockReset();
  db.insert.mockReset();
  db.delete.mockReset();
  db.execute.mockReset();
});

/** Antrian response fetch (real Response supaya headers/json/arrayBuffer asli). */
function queue(...responses: Array<Response | (() => Response)>): void {
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(typeof r === "function" ? r() : r);
  }
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

function empty(init: ResponseInit = {}): Response {
  return new Response(null, init);
}

function binary(bytes: number[], init: ResponseInit = {}): Response {
  return new Response(new Uint8Array(bytes), { status: 200, ...init });
}

/**
 * Adapter untuk platform — validasi terdaftar di satu tempat (pesan jelas bila
 * typo key test, dan satu titik non-null assertion, bukan 50 sebaran).
 */
function adapter(platform: string): PlatformAdapter {
  const a = getAdapter(platform);
  if (!a) throw new Error(`adapter "${platform}" tidak terdaftar — cek key test`);
  return a;
}

// --- Fixture input ---

function input(opts: Partial<PublishInput> = {}): PublishInput {
  return {
    accessToken: "token_test",
    platformAccountId: "acc_1",
    content: "Caption test",
    hashtags: [],
    media: [],
    platformSettings: {},
    ...opts,
  };
}

function img(url = "https://r2.test/i.jpg", extra: Partial<PublishMedia> = {}): PublishMedia {
  return { url, type: "image", mimeType: "image/jpeg", altText: null, ...extra };
}
function vid(url = "https://r2.test/v.mp4", extra: Partial<PublishMedia> = {}): PublishMedia {
  return { url, type: "video", mimeType: "video/mp4", ...extra };
}

/** URL + init dari panggilan fetch ke-i. */
function callAt(i: number): { url: string; init: RequestInit } {
  const c = fetchMock.mock.calls[i];
  if (!c) throw new Error(`fetch tidak dipanggil ke-${i}`);
  return { url: String(c[0]), init: (c[1] ?? {}) as RequestInit };
}

// ---------------------------------------------------------------------------
// Registry — getAdapter adalah single source lookup adapter; miss = publish gagal
// padahal platform seharusnya didukung.
// ---------------------------------------------------------------------------

describe("getAdapter — registry", () => {
  it("semua platform terdaftar", () => {
    const platforms = supportedPlatforms();
    expect(platforms).toEqual(
      expect.arrayContaining([
        "instagram",
        "instagram_standalone",
        "facebook",
        "threads",
        "tiktok",
        "youtube",
        "bluesky",
        "linkedin",
        "linkedin_org",
        "pinterest",
        "google_business",
        "repliz",
      ]),
    );
  });

  it("linkedin_org memakai adapter LinkedIn yang sama (API identik, beda app OAuth)", () => {
    expect(getAdapter("linkedin_org")).toBe(getAdapter("linkedin"));
  });

  it("platform tidak dikenal → undefined (pipeline markFailed no_adapter)", () => {
    expect(getAdapter("myspace")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Instagram (jalur FB Graph)
// ---------------------------------------------------------------------------

describe("instagram adapter", () => {
  it("post teks murni → ig_requires_media permanen (IG tidak ada post teks)", async () => {
    await expect(adapter("instagram").publish(input())).rejects.toMatchObject({
      code: "ig_requires_media",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carousel >10 item → ig_carousel_limit permanen", async () => {
    const media = Array.from({ length: 11 }, (_, i) => img(`https://r2.test/i${i}.jpg`));
    await expect(adapter("instagram").publish(input({ media }))).rejects.toMatchObject({
      code: "ig_carousel_limit",
      retryable: false,
    });
  });

  it("reels dengan 2 media → ig_reels_single_video permanen", async () => {
    await expect(
      adapter("instagram").publish(
        input({
          media: [vid(), vid()],
          platformSettings: { mediaType: "REELS" },
        }),
      ),
    ).rejects.toMatchObject({ code: "ig_reels_single_video", retryable: false });
  });

  it("1 foto → container → status 'processing' + handle 'ig:' (worker poll final)", async () => {
    queue(json({ id: "cid_1" }));
    const res = await adapter("instagram").publish(input({ media: [img()] }));

    expect(res).toEqual({ status: "processing", handle: "ig:cid_1" });
    const { url } = callAt(0);
    expect(url).toContain("/acc_1/media");
    expect(url).toContain("image_url=");
    expect(url).not.toContain("media_type=REELS"); // foto → media_type kosong
  });

  it("1 video → media_type REELS wajib (Meta tolak VIDEO tunggal)", async () => {
    queue(json({ id: "cid_v" }));
    await adapter("instagram").publish(input({ media: [vid()] }));
    expect(callAt(0).url).toContain("media_type=REELS");
  });

  it("carousel 2 foto → 3 container (2 item + carousel) lalu processing", async () => {
    queue(json({ id: "c1" }), json({ id: "c2" }), json({ id: "main" }));
    const res = await adapter("instagram").publish(input({ media: [img(), img()] }));

    expect(res).toMatchObject({ status: "processing" });
    expect(callAt(0).url).toContain("is_carousel_item=true");
    expect(callAt(2).url).toContain("media_type=CAROUSEL");
    expect(callAt(2).url).toContain("children=c1%2Cc2");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("story → media_type STORIES, handle 'ig:'", async () => {
    queue(json({ id: "sid" }));
    const res = await adapter("instagram").publish(
      input({ media: [img()], platformSettings: { postType: "story" } }),
    );
    expect(callAt(0).url).toContain("media_type=STORIES");
    expect(res).toMatchObject({ status: "processing", handle: "ig:sid" });
  });

  it("container tanpa id → ig_no_container retryable (transien, jangan gagalkan post)", async () => {
    queue(json({}));
    await expect(adapter("instagram").publish(input({ media: [img()] }))).rejects.toMatchObject({
      code: "ig_no_container",
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Instagram standalone (graph.instagram.com)
// ---------------------------------------------------------------------------

describe("instagram_standalone adapter", () => {
  it("handle 'igs:' — host graph.instagram.com, bukan graph.facebook.com", async () => {
    queue(json({ id: "sid" }));
    const res = await adapter("instagram_standalone").publish(input({ media: [img()] }));
    expect(callAt(0).url).toContain("https://graph.instagram.com/");
    expect(res).toEqual({ status: "processing", handle: "igs:sid" });
  });

  it("teks murni → ig_requires_media permanen", async () => {
    await expect(adapter("instagram_standalone").publish(input())).rejects.toMatchObject({
      code: "ig_requires_media",
    });
  });
});

// ---------------------------------------------------------------------------
// Facebook Pages
// ---------------------------------------------------------------------------

describe("facebook adapter", () => {
  it("post teks → /feed → published + URL post", async () => {
    // FB post id format "{pageId}_{postId}" → URL pakai bagian setelah underscore
    queue(json({ id: "pg1_99" }));
    const res = await adapter("facebook").publish(input({ platformAccountId: "pg1" }));

    expect(res).toMatchObject({
      status: "published",
      platformPostId: "pg1_99",
      platformPostUrl: "https://www.facebook.com/pg1/posts/99",
    });
    expect(callAt(0).url).toContain("/pg1/feed");
  });

  it("video → /videos → published + URL video", async () => {
    queue(json({ id: "vid_1" }));
    const res = await adapter("facebook").publish(input({ media: [vid()] }));

    expect(callAt(0).url).toContain("/acc_1/videos");
    expect(res).toMatchObject({
      status: "published",
      platformPostUrl: "https://www.facebook.com/acc_1/videos/vid_1",
    });
  });

  it("1 foto → /photos → published", async () => {
    queue(json({ id: "ph_1", post_id: "page_1_ph_1" }));
    const res = await adapter("facebook").publish(input({ media: [img()] }));

    expect(callAt(0).url).toContain("/acc_1/photos");
    expect(res).toMatchObject({ platformPostId: "page_1_ph_1" });
  });

  it("multi-foto >10 → fb_carousel_limit permanen", async () => {
    const media = Array.from({ length: 11 }, (_, i) => img(`https://r2.test/i${i}.jpg`));
    await expect(adapter("facebook").publish(input({ media }))).rejects.toMatchObject({
      code: "fb_carousel_limit",
      retryable: false,
    });
  });

  it("carousel 2 foto → upload unpublished lalu /feed attached_media", async () => {
    queue(json({ id: "fbid_1" }), json({ id: "fbid_2" }), json({ id: "page_1_c_1" }));
    const res = await adapter("facebook").publish(input({ media: [img(), img()] }));

    expect(callAt(0).url).toContain("published=false");
    expect(callAt(2).url).toContain("attached_media%5B0%5D");
    expect(callAt(2).url).toContain("attached_media%5B1%5D");
    expect(res).toMatchObject({ status: "published", platformPostId: "page_1_c_1" });
  });

  it("mention halaman di-append sebagai @[page-id]", async () => {
    queue(json({ id: "post_1" }));
    await adapter("facebook").publish(
      input({ platformSettings: { mentions: ["123456", "123456", "789"] } }),
    );
    const body = callAt(0).init.body;
    expect(String(body)).not.toContain("%40%5B123456%5D");
    // mentions unik + di-append (cek query string: message di query untuk FB)
    expect(callAt(0).url).toContain("%40%5B123456%5D");
    expect(callAt(0).url).toContain("%40%5B789%5D");
    expect(callAt(0).url.match(/%40%5B123456%5D/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

describe("threads adapter", () => {
  it("teks murni → auto_publish_text 1-call → published + permalink", async () => {
    queue(json({ id: "t_1" }), json({ permalink: "https://www.threads.net/@x/post/t_1" }));
    const res = await adapter("threads").publish(input());

    expect(callAt(0).url).toContain("auto_publish_text=true");
    expect(res).toMatchObject({
      status: "published",
      platformPostId: "t_1",
      platformPostUrl: "https://www.threads.net/@x/post/t_1",
    });
  });

  it("teks >500 byte → threads_text_limit permanen", async () => {
    await expect(
      adapter("threads").publish(input({ content: "a".repeat(600) })),
    ).rejects.toMatchObject({ code: "threads_text_limit", retryable: false });
  });

  it(">1 media → threads_single_media permanen", async () => {
    await expect(
      adapter("threads").publish(input({ media: [img(), img()] })),
    ).rejects.toMatchObject({ code: "threads_single_media", retryable: false });
  });

  it("media audio → threads_media_unsupported permanen (jangan kirim text-only senyap)", async () => {
    await expect(
      adapter("threads").publish(
        input({ media: [{ url: "https://r2.test/a.mp3", type: "audio", mimeType: "audio/mpeg" }] }),
      ),
    ).rejects.toMatchObject({ code: "threads_media_unsupported", retryable: false });
  });

  it("1 foto → container → processing handle 'threads:'", async () => {
    queue(json({ id: "tc_1" }));
    const res = await adapter("threads").publish(input({ media: [img()] }));

    expect(callAt(0).url).toContain("media_type=IMAGE");
    expect(res).toEqual({ status: "processing", handle: "threads:tc_1" });
  });
});

// ---------------------------------------------------------------------------
// Google Business Profile
// ---------------------------------------------------------------------------

describe("google_business adapter", () => {
  it("platformAccountId tanpa /locations/ → gbp_location_required permanen", async () => {
    await expect(adapter("google_business").publish(input())).rejects.toMatchObject({
      code: "gbp_location_required",
      retryable: false,
    });
  });

  it("teks >1500 → gbp_text_limit permanen", async () => {
    await expect(
      adapter("google_business").publish(
        input({
          platformAccountId: "accounts/a/locations/l",
          content: "a".repeat(1501),
        }),
      ),
    ).rejects.toMatchObject({ code: "gbp_text_limit", retryable: false });
  });

  it("video → gbp_video_unsupported permanen (LocalPosts hanya PHOTO)", async () => {
    await expect(
      adapter("google_business").publish(
        input({ platformAccountId: "accounts/a/locations/l", media: [vid()] }),
      ),
    ).rejects.toMatchObject({ code: "gbp_video_unsupported", retryable: false });
  });

  it("post teks valid → published (name = post id platform)", async () => {
    queue(json({ name: "accounts/a/locations/l/localPosts/123" }));
    const res = await adapter("google_business").publish(
      input({ platformAccountId: "accounts/a/locations/l" }),
    );

    expect(callAt(0).url).toContain("/v4/accounts/a/locations/l/localPosts");
    expect(res).toMatchObject({
      status: "published",
      platformPostId: "accounts/a/locations/l/localPosts/123",
      scheduledOnPlatform: false,
    });
  });

  it("jadwal di masa depan → scheduledTime dikirim + scheduledOnPlatform true", async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    queue(json({ name: "lp_1" }));
    const res = await adapter("google_business").publish(
      input({
        platformAccountId: "accounts/a/locations/l",
        platformSettings: { scheduledAt: future },
      }),
    );
    expect(String(callAt(0).init.body)).toContain("scheduledTime");
    expect(res).toMatchObject({ scheduledOnPlatform: true });
  });
});

// ---------------------------------------------------------------------------
// Pinterest
// ---------------------------------------------------------------------------

describe("pinterest adapter", () => {
  it("board belum dipilih → pinterest_no_board permanen", async () => {
    await expect(
      adapter("pinterest").publish(input({ platformAccountId: "" })),
    ).rejects.toMatchObject({ code: "pinterest_no_board", retryable: false });
  });

  it("campuran foto+video → pinterest_mixed_media permanen", async () => {
    await expect(
      adapter("pinterest").publish(input({ media: [img(), vid()] })),
    ).rejects.toMatchObject({ code: "pinterest_mixed_media", retryable: false });
  });

  it("tanpa media → pinterest_requires_media permanen", async () => {
    await expect(adapter("pinterest").publish(input())).rejects.toMatchObject({
      code: "pinterest_requires_media",
      retryable: false,
    });
  });

  it("pin foto → 1 call → published + URL pin", async () => {
    queue(json({ id: "pin_99" }));
    const res = await adapter("pinterest").publish(input({ media: [img()] }));

    expect(callAt(0).url).toContain("/pins");
    expect(String(callAt(0).init.body)).toContain("source_type");
    expect(res).toMatchObject({
      status: "published",
      platformPostId: "pin_99",
      platformPostUrl: "https://www.pinterest.com/pin/pin_99/",
    });
  });

  it("pin video → register → download → upload S3 (204) → processing handle 'pin:'", async () => {
    queue(
      json({ media_id: "m_1", upload_url: "https://s3.test/up", upload_parameters: { x: "1" } }),
      binary([1, 2, 3, 4]),
      empty({ status: 204 }),
    );
    const res = await adapter("pinterest").publish(input({ media: [vid()] }));

    expect(callAt(0).url).toContain("/media");
    expect(callAt(2).url).toBe("https://s3.test/up");
    expect(res).toEqual({ status: "processing", handle: "pin:m_1" });
  });

  it("upload S3 non-204 → pinterest_upload_* retryable", async () => {
    queue(
      json({ media_id: "m_1", upload_url: "https://s3.test/up" }),
      binary([1]),
      empty({ status: 500 }),
    );
    // retry internal httpUpload (retries: 1) → 2x upload, lalu throw
    fetchMock.mockResolvedValueOnce(empty({ status: 500 }));

    await expect(adapter("pinterest").publish(input({ media: [vid()] }))).rejects.toMatchObject({
      code: "pinterest_upload_500",
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Bluesky
// ---------------------------------------------------------------------------

describe("bluesky adapter", () => {
  it("video → bluesky_video_unsupported permanen (v1 tidak support video)", async () => {
    // JWT token → skip createSession; cek media terjadi setelah blok session.
    await expect(
      adapter("bluesky").publish(input({ accessToken: "eyJjwt", media: [vid()] })),
    ).rejects.toMatchObject({
      code: "bluesky_video_unsupported",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("teks >300 grapheme → bluesky_text_limit permanen", async () => {
    await expect(
      adapter("bluesky").publish(input({ content: "a".repeat(301) })),
    ).rejects.toMatchObject({ code: "bluesky_text_limit", retryable: false });
  });

  it("post teks (JWT) → createRecord → published + URL bsky.app dari rkey", async () => {
    queue(json({ uri: "at://did:plc:abc/app.bsky.feed.post/xyz123" }));
    const res = await adapter("bluesky").publish(
      input({ accessToken: "eyJjwt.token", platformAccountId: "did:plc:abc" }),
    );

    expect(callAt(0).url).toContain("com.atproto.repo.createRecord");
    expect(res).toMatchObject({
      status: "published",
      platformPostId: "at://did:plc:abc/app.bsky.feed.post/xyz123",
      platformPostUrl: "https://bsky.app/profile/did:plc:abc/post/xyz123",
    });
  });

  it("app password (non-JWT) → createSession dulu (rate limit 300/hari, retries 0)", async () => {
    queue(json({ accessJwt: "eyJjwt" }), json({ uri: "at://did:plc:x/app.bsky.feed.post/r1" }));
    await adapter("bluesky").publish(
      input({ accessToken: "app-password", platformAccountId: "did:plc:x" }),
    );

    expect(callAt(0).url).toContain("com.atproto.server.createSession");
    expect(callAt(1).init.headers).toMatchObject({ Authorization: "Bearer eyJjwt" });
  });

  it("1 foto → uploadBlob embed → published", async () => {
    queue(
      binary([1, 2]),
      json({ blob: { $type: "blob", ref: "r" } }),
      json({ uri: "at://did:plc:z/app.bsky.feed.post/r2" }),
    );
    const res = await adapter("bluesky").publish(
      input({ accessToken: "eyJjwt", platformAccountId: "did:plc:z", media: [img()] }),
    );

    expect(callAt(1).url).toContain("com.atproto.repo.uploadBlob");
    expect(callAt(2).init.body as string).toContain("app.bsky.embed.images");
    expect(res).toMatchObject({ status: "published" });
  });

  it("createRecord gagal permanen (token invalid) → http_401 permanen", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "invalid_token" }, { status: 401 }));
    await expect(
      adapter("bluesky").publish(input({ accessToken: "eyJjwt" })),
    ).rejects.toMatchObject({ code: "http_401", retryable: false });
  });
});

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

describe("linkedin adapter", () => {
  it("teks >3000 → linkedin_text_limit permanen", async () => {
    await expect(
      adapter("linkedin").publish(input({ content: "a".repeat(3001) })),
    ).rejects.toMatchObject({ code: "linkedin_text_limit", retryable: false });
  });

  it("campuran foto+video → linkedin_mixed_media permanen", async () => {
    await expect(
      adapter("linkedin").publish(input({ media: [img(), vid()] })),
    ).rejects.toMatchObject({ code: "linkedin_mixed_media", retryable: false });
  });

  it("post teks → published via x-restli-id → permalink feed/update", async () => {
    queue(empty({ status: 201, headers: { "x-restli-id": "urn:li:share:456" } }));
    const res = await adapter("linkedin").publish(input());

    expect(callAt(0).url).toContain("/rest/posts");
    expect(res).toMatchObject({
      status: "published",
      platformPostId: "urn:li:share:456",
      platformPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:456/",
    });
  });

  it("post foto → images API init → download → upload → post (4 request)", async () => {
    queue(
      json({ value: { uploadUrl: "https://li.test/up", image: "urn:li:image:1" } }),
      binary([9, 9]), // download foto dari R2
      empty({ status: 201, headers: { etag: "etag1" } }), // upload binary
      empty({ status: 201, headers: { "x-restli-id": "urn:li:share:789" } }),
    );
    const res = await adapter("linkedin").publish(input({ media: [img()] }));

    expect(callAt(0).url).toContain("/rest/images?action=initializeUpload");
    expect(callAt(1).url).toBe("https://r2.test/i.jpg"); // download R2
    expect(callAt(2).url).toBe("https://li.test/up"); // upload LinkedIn
    expect(callAt(3).init.body as string).toContain("urn:li:image:1");
    expect(res).toMatchObject({ platformPostId: "urn:li:share:789" });
  });

  it("x-restli-id hilang → linkedin_no_post_id retryable", async () => {
    queue(empty({ status: 201 }));
    await expect(adapter("linkedin").publish(input())).rejects.toMatchObject({
      code: "linkedin_no_post_id",
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// TikTok
// ---------------------------------------------------------------------------

describe("tiktok adapter", () => {
  it("tanpa media → tiktok_requires_media permanen", async () => {
    await expect(adapter("tiktok").publish(input())).rejects.toMatchObject({
      code: "tiktok_requires_media",
      retryable: false,
    });
  });

  it("privacy belum dipilih → tiktok_privacy_required permanen (guideline: no default)", async () => {
    await expect(adapter("tiktok").publish(input({ media: [vid()] }))).rejects.toMatchObject({
      code: "tiktok_privacy_required",
      retryable: false,
    });
  });

  it("2 video → tiktok_single_video permanen", async () => {
    await expect(
      adapter("tiktok").publish(
        input({ media: [vid(), vid()], platformSettings: { privacy: "PUBLIC_TO_EVERYONE" } }),
      ),
    ).rejects.toMatchObject({ code: "tiktok_single_video", retryable: false });
  });

  it("campuran video+foto → tiktok_no_mixed_media permanen", async () => {
    await expect(
      adapter("tiktok").publish(
        input({ media: [vid(), img()], platformSettings: { privacy: "PUBLIC_TO_EVERYONE" } }),
      ),
    ).rejects.toMatchObject({ code: "tiktok_no_mixed_media", retryable: false });
  });

  it("foto non-JPEG/WebP → tiktok_photo_format permanen (TikTok tolak asinkron)", async () => {
    await expect(
      adapter("tiktok").publish(
        input({
          media: [img("https://r2.test/p.png", { mimeType: "image/png" })],
          platformSettings: { privacy: "SELF_ONLY" },
        }),
      ),
    ).rejects.toMatchObject({ code: "tiktok_photo_format", retryable: false });
  });

  it(">35 foto → tiktok_photo_limit permanen", async () => {
    const media = Array.from({ length: 36 }, (_, i) => img(`https://r2.test/p${i}.jpg`));
    await expect(
      adapter("tiktok").publish(input({ media, platformSettings: { privacy: "SELF_ONLY" } })),
    ).rejects.toMatchObject({ code: "tiktok_photo_limit", retryable: false });
  });

  it("video → /video/init PULL_FROM_URL → processing handle = publish_id", async () => {
    queue(json({ data: { publish_id: "pub_1" } }));
    const res = await adapter("tiktok").publish(
      input({ media: [vid()], platformSettings: { privacy: "MUTUAL_FOLLOW_FRIENDS" } }),
    );

    expect(callAt(0).url).toContain("/post/publish/video/init/");
    const body = JSON.parse(String(callAt(0).init.body));
    expect(body.source_info.source).toBe("PULL_FROM_URL");
    expect(body.post_info.privacy_level).toBe("MUTUAL_FOLLOW_FRIENDS");
    expect(res).toEqual({ status: "processing", handle: "pub_1" });
  });

  it("foto → /content/init → processing handle = publish_id", async () => {
    queue(json({ data: { publish_id: "pub_2" } }));
    const res = await adapter("tiktok").publish(
      input({ media: [img(), img()], platformSettings: { privacy: "SELF_ONLY" } }),
    );

    expect(callAt(0).url).toContain("/post/publish/content/init/");
    expect(JSON.parse(String(callAt(0).init.body)).media_type).toBe("PHOTO");
    expect(res).toEqual({ status: "processing", handle: "pub_2" });
  });

  it("error rate_limit_exceeded → retryable (jangan buang percobaan lain)", async () => {
    queue(json({ error: { code: "rate_limit_exceeded", message: "terlalu banyak" } }));
    await expect(
      adapter("tiktok").publish(
        input({ media: [vid()], platformSettings: { privacy: "SELF_ONLY" } }),
      ),
    ).rejects.toMatchObject({ code: "tiktok_rate_limit_exceeded", retryable: true });
  });

  it("error konten ditolak → permanen", async () => {
    queue(json({ error: { code: "video_format_invalid", message: "format aneh" } }));
    await expect(
      adapter("tiktok").publish(
        input({ media: [vid()], platformSettings: { privacy: "SELF_ONLY" } }),
      ),
    ).rejects.toMatchObject({ code: "tiktok_video_format_invalid", retryable: false });
  });

  it("HTTP 403 unaudited_client_can_only_post_to_private_accounts → pesan Indonesia, permanen", async () => {
    queue(
      json(
        { error: { code: "unaudited_client_can_only_post_to_private_accounts", message: "raw" } },
        { status: 403 },
      ),
    );
    const err = await adapter("tiktok")
      .publish(input({ media: [vid()], platformSettings: { privacy: "PUBLIC_TO_EVERYONE" } }))
      .catch((e: unknown) => e as { code: string; message: string; retryable: boolean });

    expect(err.code).toBe("tiktok_unaudited_client_can_only_post_to_private_accounts");
    expect(err.retryable).toBe(false);
    // Pesan diterjemahkan, bukan pesan mentah TikTok
    expect(err.message).toContain("belum lulus audit");
    expect(err.message).not.toContain("raw");
  });

  it("privacy_level_option_mismatch → pesan Indonesia menunjuk Pengaturan Platform", async () => {
    queue(json({ error: { code: "privacy_level_option_mismatch", message: "raw" } }));
    const err = await adapter("tiktok")
      .publish(input({ media: [vid()], platformSettings: { privacy: "PUBLIC_TO_EVERYONE" } }))
      .catch((e: unknown) => e as { code: string; message: string });

    expect(err.code).toBe("tiktok_privacy_level_option_mismatch");
    expect(err.message).toContain("Pengaturan Platform");
  });

  it("error code tanpa terjemahan → pakai pesan asli platform", async () => {
    queue(json({ error: { code: "some_new_code", message: "pesan asli tiktok" } }));
    const err = await adapter("tiktok")
      .publish(input({ media: [vid()], platformSettings: { privacy: "SELF_ONLY" } }))
      .catch((e: unknown) => e as { code: string; message: string });

    expect(err.code).toBe("tiktok_some_new_code");
    expect(err.message).toContain("pesan asli tiktok");
  });
});

// ---------------------------------------------------------------------------
// YouTube (resumable upload)
// ---------------------------------------------------------------------------

describe("youtube adapter", () => {
  it("tanpa video → youtube_requires_video permanen", async () => {
    await expect(adapter("youtube").publish(input())).rejects.toMatchObject({
      code: "youtube_requires_video",
      retryable: false,
    });
    await expect(adapter("youtube").publish(input({ media: [img()] }))).rejects.toMatchObject({
      code: "youtube_requires_video",
    });
  });

  it("upload chunk tunggal → published + watch URL", async () => {
    queue(
      binary([1, 2, 3, 4, 5]), // download video dari R2
      json({}, { status: 200, headers: { location: "https://upload.test/sess" } }), // init
      json({ id: "yt_1" }), // PUT chunk terakhir → 2xx
    );
    const res = await adapter("youtube").publish(input({ media: [vid()] }));

    expect(callAt(0).url).toBe("https://r2.test/v.mp4"); // download R2 dulu
    expect(callAt(1).url).toContain("googleapis.com/upload/youtube/v3/videos");
    expect(callAt(2).url).toBe("https://upload.test/sess");
    expect(callAt(2).init.headers).toMatchObject({ "Content-Range": "bytes 0-4/5" });
    expect(res).toMatchObject({
      status: "published",
      platformPostId: "yt_1",
      platformPostUrl: "https://www.youtube.com/watch?v=yt_1",
      scheduledOnPlatform: false,
    });
  });

  it("chunk 308 (Resume Incomplete) → lanjut chunk berikutnya dari offset server", async () => {
    queue(
      binary([1, 2, 3, 4, 5]),
      json({}, { status: 200, headers: { location: "https://upload.test/sess" } }),
      empty({ status: 308, headers: { range: "bytes=0-1" } }), // server terima 2 byte
      json({ id: "yt_2" }),
    );
    const res = await adapter("youtube").publish(input({ media: [vid()] }));

    // chunk kedua (call ke-3) mulai dari byte 2 = offset server + 1
    expect(callAt(2).init.headers).toMatchObject({ "Content-Range": "bytes 0-4/5" });
    expect(callAt(3).init.headers).toMatchObject({ "Content-Range": "bytes 2-4/5" });
    expect(res).toMatchObject({ platformPostId: "yt_2" });
  });

  it("jadwal masa depan → privacyStatus private + publishAt + scheduledOnPlatform", async () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    queue(
      binary([1, 2]),
      json({}, { status: 200, headers: { location: "https://upload.test/sess" } }),
      json({ id: "yt_3" }),
    );
    const res = await adapter("youtube").publish(
      input({ media: [vid()], platformSettings: { publishAt: future } }),
    );

    const initBody = JSON.parse(String(callAt(1).init.body));
    expect(initBody.status.privacyStatus).toBe("private");
    expect(initBody.status.publishAt).toBe(future);
    expect(res).toMatchObject({ scheduledOnPlatform: true });
  });

  it("init ditolak 403 (quota habis) → http_403 permanen", async () => {
    queue(binary([1]), json({ error: { message: "quota exceeded" } }, { status: 403 }));
    await expect(adapter("youtube").publish(input({ media: [vid()] }))).rejects.toMatchObject({
      code: "http_403",
      retryable: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Repliz bridge
// ---------------------------------------------------------------------------

describe("repliz adapter (bridge)", () => {
  const basicCred = `basic:${Buffer.from("key1:secret1").toString("base64")}`;

  it("kredensial tidak berformat basic → repliz_bad_credentials permanen", async () => {
    await expect(
      adapter("repliz").publish(input({ accessToken: "plain-token" })),
    ).rejects.toMatchObject({ code: "repliz_bad_credentials", retryable: false });
  });

  it("platform tidak didukung bridge → permanen", async () => {
    await expect(
      adapter("repliz").publish(
        input({
          accessToken: basicCred,
          platformSettings: { replizTargetPlatform: "myspace" },
        }),
      ),
    ).rejects.toMatchObject({ code: "repliz_unsupported_platform", retryable: false });
  });

  it("konten kosong total (caption/media/link) → empty_content permanen", async () => {
    await expect(
      adapter("repliz").publish(
        input({ accessToken: basicCred, content: "", platformSettings: {} }),
      ),
    ).rejects.toMatchObject({ code: "empty_content", retryable: false });
  });

  it("create schedule → processing handle = scheduleId (poll status bridge)", async () => {
    queue(json({ scheduleId: "sch_1" }, { status: 201 }));
    const res = await adapter("repliz").publish(
      input({ accessToken: basicCred, platformSettings: { replizTargetPlatform: "tiktok" } }),
    );

    expect(callAt(0).url).toContain("api.repliz.com/public/schedule");
    expect(callAt(0).init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("key1:secret1").toString("base64")}`,
    });
    expect(res).toEqual({ status: "processing", handle: "sch_1" });
  });

  it("mapping tipe: video pendek postType reels → 'reel'; foto banyak → 'album'", async () => {
    // callAt index global — 2 publish di test ini, urut: reel(#0), album(#1)
    queue(json({ scheduleId: "s1" }, { status: 201 }));
    await adapter("repliz").publish(
      input({
        accessToken: basicCred,
        media: [vid()],
        platformSettings: { replizTargetPlatform: "instagram", postType: "reels" },
      }),
    );
    expect(JSON.parse(String(callAt(0).init.body)).type).toBe("reel");

    queue(json({ scheduleId: "s2" }, { status: 201 }));
    await adapter("repliz").publish(
      input({
        accessToken: basicCred,
        media: [img(), img()],
        platformSettings: { replizTargetPlatform: "instagram" },
      }),
    );
    expect(JSON.parse(String(callAt(1).init.body)).type).toBe("album");
  });

  it("FB + link + 1 foto → type 'link' + meta.url (preview card native)", async () => {
    queue(json({ scheduleId: "s3" }, { status: 201 }));
    await adapter("repliz").publish(
      input({
        accessToken: basicCred,
        media: [img()],
        content: "c",
        platformSettings: { replizTargetPlatform: "facebook", link: "https://x.test" },
      }),
    );
    const body = JSON.parse(String(callAt(0).init.body));
    expect(body.type).toBe("link");
    expect(body.meta).toEqual({ url: "https://x.test" });
  });
});
