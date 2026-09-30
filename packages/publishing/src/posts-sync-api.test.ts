// Test layer fetch posts-sync (khusus Bluesky — sumber baru).
//
// Kenapa penting: posts-sync menulis langsung ke tabel `post` (is_external=true).
// Salah memetakan embed → thumbnail/media = kartu kosong di grid /post-results,
// dan salah filter = repost & balasan orang lain ikut diklaim sebagai karya sendiri.
//
// Strategi sama dengan adapters.test.ts: global `fetch` di-stub, logika
// parsing/normalisasi asli tetap diuji (bukan di-mock).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBlueskyOwnPosts } from "./posts-sync-api";

let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof fetch | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFetch !== undefined) globalThis.fetch = originalFetch;
});

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

const ACTOR = "did:plc:lkn7fhs4ap2s26bb2ef3wvjw";
const POST_URI = `at://${ACTOR}/app.bsky.feed.post/3mwj2esmqmz24`;

/** Satu item feed Bluesky dengan bentuk mendekati response asli. */
function feedItem(over: {
  uri?: string;
  createdAt?: string;
  text?: string;
  embed?: unknown;
  reply?: unknown;
  reason?: unknown;
}) {
  return {
    ...(over.reason ? { reason: over.reason } : {}),
    post: {
      uri: over.uri ?? POST_URI,
      author: { handle: "syahidsyahdan.bsky.social" },
      record: {
        $type: "app.bsky.feed.post",
        text: over.text ?? "Halo dunia",
        createdAt: over.createdAt ?? "2026-09-27T14:51:25.611Z",
        ...(over.reply ? { reply: over.reply } : {}),
      },
      ...(over.embed ? { embed: over.embed } : {}),
    },
  };
}

describe("getBlueskyOwnPosts", () => {
  it("pakai AppView publik + filter tanpa balasan, tanpa header Authorization", async () => {
    fetchMock.mockResolvedValueOnce(json({ feed: [] }));
    await getBlueskyOwnPosts(ACTOR);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed");
    expect(url).toContain("filter=posts_no_replies");
    expect(url).toContain("actor=");
    expect(url).toContain("lkn7fhs4ap2s26bb2ef3wvjw");
    // Dibaca tanpa token — app password hanya dipakai saat publish
    expect((init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
  });

  it("embed images → IMAGE + thumbnail + permalink bsky.app", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        feed: [
          feedItem({
            embed: {
              $type: "app.bsky.embed.images#view",
              images: [
                { thumb: "https://cdn.bsky.app/thumb1", fullsize: "https://cdn.bsky.app/full1" },
              ],
            },
          }),
        ],
      }),
    );

    const res = await getBlueskyOwnPosts(ACTOR);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      externalId: POST_URI,
      caption: "Halo dunia",
      mediaType: "IMAGE",
      mediaUrl: "https://cdn.bsky.app/full1",
      thumbnailUrl: "https://cdn.bsky.app/thumb1",
      permalink: "https://bsky.app/profile/syahidsyahdan.bsky.social/post/3mwj2esmqmz24",
    });
    expect(res.data[0]?.publishedAt.toISOString()).toBe("2026-09-27T14:51:25.611Z");
  });

  it("beberapa gambar → CAROUSEL; video → VIDEO + playlist", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        feed: [
          feedItem({
            uri: `at://${ACTOR}/app.bsky.feed.post/carousel`,
            embed: {
              $type: "app.bsky.embed.images#view",
              images: [
                { thumb: "t1", fullsize: "f1" },
                { thumb: "t2", fullsize: "f2" },
              ],
            },
          }),
          feedItem({
            uri: `at://${ACTOR}/app.bsky.feed.post/video`,
            embed: {
              $type: "app.bsky.embed.video#view",
              playlist: "https://video.bsky.app/playlist.m3u8",
              thumbnail: "https://video.bsky.app/poster.jpg",
            },
          }),
        ],
      }),
    );

    const res = await getBlueskyOwnPosts(ACTOR);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((p) => p.mediaType)).toEqual(["CAROUSEL", "VIDEO"]);
    expect(res.data[1]).toMatchObject({
      mediaUrl: "https://video.bsky.app/playlist.m3u8",
      thumbnailUrl: "https://video.bsky.app/poster.jpg",
    });
  });

  it("recordWithMedia (kutipan + gambar) → media diambil dari properti media", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        feed: [
          feedItem({
            embed: {
              $type: "app.bsky.embed.recordWithMedia#view",
              record: { $type: "app.bsky.embed.record#view" },
              media: {
                $type: "app.bsky.embed.images#view",
                images: [{ thumb: "qthumb", fullsize: "qfull" }],
              },
            },
          }),
        ],
      }),
    );

    const res = await getBlueskyOwnPosts(ACTOR);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({
      mediaType: "IMAGE",
      mediaUrl: "qfull",
      thumbnailUrl: "qthumb",
    });
  });

  it("teks tanpa embed → TEXT tanpa media", async () => {
    fetchMock.mockResolvedValueOnce(json({ feed: [feedItem({ text: "cuma teks" })] }));
    const res = await getBlueskyOwnPosts(ACTOR);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ mediaType: "TEXT", caption: "cuma teks" });
    expect(res.data[0]?.mediaUrl).toBeUndefined();
  });

  it("repost & balasan dibuang; post lebih tua dari `since` disaring", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        feed: [
          // repost orang lain
          feedItem({ reason: { $type: "app.bsky.feed.defs#reasonRepost" } }),
          // balasan
          feedItem({
            uri: `at://${ACTOR}/app.bsky.feed.post/reply`,
            reply: { parent: { uri: "at://x" }, root: { uri: "at://y" } },
          }),
          // terlalu tua
          feedItem({ uri: `at://${ACTOR}/app.bsky.feed.post/old`, createdAt: "2026-01-01T00:00:00Z" }),
          // valid
          feedItem({ uri: `at://${ACTOR}/app.bsky.feed.post/keep` }),
        ],
      }),
    );

    const res = await getBlueskyOwnPosts(ACTOR, new Date("2026-09-01T00:00:00Z"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((p) => p.externalId)).toEqual([`at://${ACTOR}/app.bsky.feed.post/keep`]);
  });

  it("HTTP error → ok:false dengan pesan platform", async () => {
    // 400 = tidak di-retry httpRequest (hanya 429/5xx yang di-retry)
    fetchMock.mockResolvedValueOnce(new Response("bad actor", { status: 400 }));

    const res = await getBlueskyOwnPosts(ACTOR);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("400");
  });
});
