// Test OAuth connect flow: authorize URL builder, token exchange, refresh, scope helper.
// fetch global di-stub agar retry/parsing/response handling httpRequest benar-benar
// dieksekusi — tidak ada mock di level httpRequest (unit under test justru integrasinya).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GRAPH_IG_EXCHANGE_LONG_LIVED_URL,
  GRAPH_IG_REFRESH_URL,
  GRAPH_THREADS_EXCHANGE_LONG_LIVED_URL,
  GRAPH_THREADS_REFRESH_URL,
  YOUTUBE_API_URL,
} from "./config";
import { buildAuthorizeUrl, exchangeCodeForToken, refreshAccessToken } from "./oauth/authorize";
import { isOAuthPlatformSupported, OAUTH_CONFIGS } from "./oauth/platform-configs";
import { fetchPlatformProfile } from "./oauth/profile";
import { parseExtraScopes, parseGrantedScopes, requestedScopes } from "./oauth/scopes";
import type { AppCredential, OAuthPlatform, TokenResult } from "./oauth/types";
import { PublishError } from "./types";

const CRED: AppCredential = {
  clientId: "cid-123",
  clientSecret: "secret-abc",
  redirectUri: "https://srv.test/api/oauth/x/callback",
};

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

/** Antrian response per-request; ambil berurutan, error bila habis (deteksi mock salah urut). */
function queue(...responses: Response[]) {
  const it = responses[Symbol.iterator]();
  fetchMock.mockImplementation(async () => {
    const r = it.next();
    if (r.done) throw new Error("fetch mock: antrian response habis — cek urutan test");
    return r.value;
  });
}

function callAt(i: number): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, init: init ?? {} };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildAuthorizeUrl", () => {
  it("instagram: URL dialog Meta + params wajib + scope spasi", () => {
    const url = new URL(buildAuthorizeUrl("instagram", CRED, "state-csrf-1"));
    const config = OAUTH_CONFIGS.instagram;

    expect(`${url.origin}${url.pathname}`).toBe(config.authorizeUrl);
    expect(url.searchParams.get("client_id")).toBe(CRED.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(CRED.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-csrf-1");
    // URLSearchParams serialize space → "+" saat dibuat; di-parse balik jadi space.
    expect(url.searchParams.get("scope")).toBe(config.scopes.join(" "));
  });

  it("tiktok: param client_key + scope dipisah koma", () => {
    const url = new URL(buildAuthorizeUrl("tiktok", CRED, "s2"));
    const config = OAUTH_CONFIGS.tiktok;

    expect(url.searchParams.get("client_key")).toBe(CRED.clientId);
    expect(url.searchParams.get("client_id")).toBeNull();
    expect(url.searchParams.get("scope")).toBe(config.scopes.join(","));
  });

  it("youtube: param ekstra Google (offline + select_account + include_granted_scopes)", () => {
    const url = new URL(buildAuthorizeUrl("youtube", CRED, "s3"));

    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("select_account consent");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("extraScopes dari kredensial digabung & tanpa duplikat", () => {
    const cred: AppCredential = {
      ...CRED,
      extra: { extraScopes: "video.upload  user.info.basic,video.list" },
    };
    const scopes = requestedScopes("tiktok", cred);
    expect(scopes).toContain("video.upload");
    expect(scopes.filter((s) => s === "user.info.basic")).toHaveLength(1);
    // urutan stabil: config dulu, baru extra
    expect(scopes.slice(0, OAUTH_CONFIGS.tiktok.scopes.length)).toEqual(
      OAUTH_CONFIGS.tiktok.scopes,
    );
  });

  it("bluesky (flow belum aktif) → oauth_not_supported permanent", () => {
    try {
      buildAuthorizeUrl("bluesky", CRED, "s");
      throw new Error("bluesky seharusnya tidak punya authorize URL");
    } catch (e) {
      expect(e).toBeInstanceOf(PublishError);
      expect((e as PublishError).code).toBe("oauth_not_supported");
      expect((e as PublishError).retryable).toBe(false);
    }
  });
});

describe("exchangeCodeForToken", () => {
  it("generic (facebook): body urlencoded + hasil token + expiresAt + scope fallback", async () => {
    queue(json({ access_token: "at-fb", refresh_token: "rt-fb", expires_in: 3600 }));

    const res = await exchangeCodeForToken("facebook", CRED, "code-fb");

    const { url, init } = callAt(0);
    expect(url).toBe(OAUTH_CONFIGS.facebook.tokenUrl);
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-fb");
    expect(body.get("redirect_uri")).toBe(CRED.redirectUri);
    expect(body.get("client_id")).toBe(CRED.clientId);
    expect(body.get("client_secret")).toBe(CRED.clientSecret);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    expect(res.accessToken).toBe("at-fb");
    expect(res.refreshToken).toBe("rt-fb");
    expect(res.expiresAt?.getTime()).toBeGreaterThan(Date.now());
    // tidak ada scope granted di response → fallback ke yang diminta
    expect(res.scopes).toEqual(requestedScopes("facebook", CRED));
  });

  it("tiktok: token nested di data.access_token & tanpa refresh_token", async () => {
    queue(
      json({
        data: { access_token: "at-tt", expires_in: 7200, refresh_token: "rt-tt" },
      }),
    );

    const res = await exchangeCodeForToken("tiktok", CRED, "code-tt");

    expect(res.accessToken).toBe("at-tt");
    // refresh_token yang dikembalikan platform dipersist apa adanya
    expect(res.refreshToken).toBe("rt-tt");
  });

  it("pinterest: exchange pakai HTTP Basic client_id:client_secret", async () => {
    queue(json({ access_token: "at-pin", refresh_token: "rt-pin" }));

    await exchangeCodeForToken("pinterest", CRED, "code-pin");

    const { init } = callAt(0);
    const expected = `Basic ${Buffer.from(`${CRED.clientId}:${CRED.clientSecret}`).toString("base64")}`;
    expect((init.headers as Record<string, string>).Authorization).toBe(expected);
  });

  it("response non-2xx → oauth_token_exchange_failed (pesan sertakan status + body)", async () => {
    queue(json({ error: { message: "Invalid code" } }, 400));

    await expect(exchangeCodeForToken("facebook", CRED, "bad")).rejects.toMatchObject({
      code: "oauth_token_exchange_failed",
      retryable: false,
      message: expect.stringContaining("400"),
    });
  });

  it("response tanpa access_token → oauth_no_token", async () => {
    queue(json({ token_type: "Bearer" }));

    await expect(exchangeCodeForToken("facebook", CRED, "c")).rejects.toMatchObject({
      code: "oauth_no_token",
    });
  });

  it("threads: short-lived langsung di-upgrade ke long-lived 60 hari", async () => {
    queue(
      json({ access_token: "at-short", expires_in: 86400 }),
      json({ access_token: "at-long", expires_in: 5184000 }),
    );

    const res = await exchangeCodeForToken("threads", CRED, "code-th");

    // request kedua = endpoint upgrade, GET dengan grant_type th_exchange_token
    const second = callAt(1);
    const u = new URL(second.url);
    expect(`${u.origin}${u.pathname}`).toBe(GRAPH_THREADS_EXCHANGE_LONG_LIVED_URL);
    expect(u.searchParams.get("grant_type")).toBe("th_exchange_token");
    expect(u.searchParams.get("client_secret")).toBe(CRED.clientSecret);
    expect(u.searchParams.get("access_token")).toBe("at-short");

    expect(res.accessToken).toBe("at-long");
    expect(res.refreshToken).toBe("at-long"); // long-lived dipakai refresh berikutnya
    expect(res.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 5_000_000);
  });

  it("threads: gagal upgrade → lanjut short-lived (tidak throw)", async () => {
    queue(json({ access_token: "at-short", expires_in: 86400 }), text("nope", 400));

    const res = await exchangeCodeForToken("threads", CRED, "code-th");

    expect(res.accessToken).toBe("at-short");
  });

  it("instagram_standalone: upgrade long-lived via ig_exchange_token", async () => {
    queue(
      json({ access_token: "at-ig-short", expires_in: 3600 }),
      json({ access_token: "at-ig-long", expires_in: 5184000 }),
    );

    const res = await exchangeCodeForToken("instagram_standalone", CRED, "code-ig");

    const u = new URL(callAt(1).url);
    expect(`${u.origin}${u.pathname}`).toBe(GRAPH_IG_EXCHANGE_LONG_LIVED_URL);
    expect(u.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(res.accessToken).toBe("at-ig-long");
    expect(res.refreshToken).toBe("at-ig-long");
  });

  it("scope yang di-grant platform dipakai bila tersedia", async () => {
    queue(json({ access_token: "at-li", expires_in: 3600, scope: "openid profile email" }));

    const res = await exchangeCodeForToken("linkedin", CRED, "code-li");

    expect(res.scopes).toEqual(["openid", "profile", "email"]);
  });
});

describe("refreshAccessToken", () => {
  it("generic (pinterest): POST refresh + Basic auth + rotating refresh_token", async () => {
    queue(json({ access_token: "at-new", refresh_token: "rt-new", expires_in: 3600 }));

    const res = await refreshAccessToken("pinterest", CRED, "rt-old");

    const { url, init } = callAt(0);
    expect(url).toBe(OAUTH_CONFIGS.pinterest.tokenUrl);
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-old");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);

    expect(res.accessToken).toBe("at-new");
    // Pinterest rotating: RT baru harus dipersist
    expect(res.refreshToken).toBe("rt-new");
  });

  it("generic: platform tanpa rotasi RT → RT lama dipertahankan", async () => {
    queue(json({ access_token: "at-new", expires_in: 3600 }));

    const res = await refreshAccessToken("facebook", CRED, "rt-old");

    expect(res.refreshToken).toBe("rt-old");
  });

  it("threads: GET th_refresh_token, token baru = AT sekaligus RT", async () => {
    queue(json({ access_token: "at-th-2", expires_in: 5184000 }));

    const res = await refreshAccessToken("threads", CRED, "at-th-1");

    const u = new URL(callAt(0).url);
    expect(`${u.origin}${u.pathname}`).toBe(GRAPH_THREADS_REFRESH_URL);
    expect(u.searchParams.get("grant_type")).toBe("th_refresh_token");
    expect(u.searchParams.get("access_token")).toBe("at-th-1");

    expect(res.accessToken).toBe("at-th-2");
    expect(res.refreshToken).toBe("at-th-2");
  });

  it("threads: response non-2xx → oauth_refresh_failed (pesan ajak reconnect)", async () => {
    queue(text("token expired", 400));

    await expect(refreshAccessToken("threads", CRED, "at-th-1")).rejects.toMatchObject({
      code: "oauth_refresh_failed",
      retryable: false,
      message: expect.stringContaining("hubungkan ulang"),
    });
  });

  it("threads: tanpa access_token → oauth_no_token", async () => {
    queue(json({ expires_in: 5184000 }));

    await expect(refreshAccessToken("threads", CRED, "at-th-1")).rejects.toMatchObject({
      code: "oauth_no_token",
    });
  });

  it("instagram_standalone: GET ig_refresh_token", async () => {
    queue(json({ access_token: "at-ig-2", expires_in: 5184000 }));

    const res = await refreshAccessToken("instagram_standalone", CRED, "at-ig-1");

    const u = new URL(callAt(0).url);
    expect(`${u.origin}${u.pathname}`).toBe(GRAPH_IG_REFRESH_URL);
    expect(u.searchParams.get("grant_type")).toBe("ig_refresh_token");
    expect(res.accessToken).toBe("at-ig-2");
  });

  it("instagram_standalone: non-2xx → oauth_refresh_failed", async () => {
    queue(text("bad", 400));

    await expect(refreshAccessToken("instagram_standalone", CRED, "at-ig-1")).rejects.toMatchObject(
      { code: "oauth_refresh_failed" },
    );
  });

  it("generic: non-2xx → oauth_refresh_failed", async () => {
    queue(json({ error: "invalid_grant" }, 400));

    await expect(refreshAccessToken("pinterest", CRED, "rt-old")).rejects.toMatchObject({
      code: "oauth_refresh_failed",
      message: expect.stringContaining("400"),
    });
  });

  it("generic: tanpa access_token → oauth_no_token", async () => {
    queue(json({ token_type: "Bearer" }));

    await expect(refreshAccessToken("pinterest", CRED, "rt-old")).rejects.toMatchObject({
      code: "oauth_no_token",
    });
  });

  it("bluesky → oauth_not_supported permanent", async () => {
    await expect(refreshAccessToken("bluesky", CRED, "x")).rejects.toMatchObject({
      code: "oauth_not_supported",
      retryable: false,
    });
  });
});

describe("fetchPlatformProfile — channel YouTube", () => {
  const TOKEN: TokenResult = { accessToken: "at-yt", scopes: ["s1"] };

  it("kembalikan SEMUA channel di extra.channels; channel pertama tetap identitas akun", async () => {
    queue(
      json({
        items: [
          {
            id: "UC-1",
            snippet: {
              title: "Channel Satu",
              thumbnails: { default: { url: "https://img/1.jpg" } },
            },
          },
          { id: "UC-2", snippet: { title: "Channel Dua" } },
        ],
      }),
    );

    const profile = await fetchPlatformProfile("youtube", TOKEN);

    // Request benar: /channels?part=snippet&mine=true + Bearer token
    const { url, init } = callAt(0);
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(`${YOUTUBE_API_URL}/channels`);
    expect(u.searchParams.get("mine")).toBe("true");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer at-yt");

    // Backward compatible: channel pertama tetap jadi identitas akun
    expect(profile.platformAccountId).toBe("UC-1");
    expect(profile.username).toBe("Channel Satu");
    expect(profile.avatarUrl).toBe("https://img/1.jpg");

    // Regresi bug lama: dulu items[0] dipakai & sisanya dibuang diam-diam —
    // sekarang semua channel tersedia untuk picker.
    expect(profile.extra?.channels).toEqual([
      { id: "UC-1", title: "Channel Satu", thumbnailUrl: "https://img/1.jpg" },
      { id: "UC-2", title: "Channel Dua", thumbnailUrl: null },
    ]);
  });

  it("item tanpa id dibuang; title kosong fallback ke id", async () => {
    queue(json({ items: [{ snippet: { title: "Tanpa ID" } }, { id: "UC-9" }] }));

    const profile = await fetchPlatformProfile("youtube", TOKEN);

    expect(profile.platformAccountId).toBe("UC-9");
    expect(profile.username).toBe("UC-9"); // snippet.title kosong → fallback id
    expect(profile.extra?.channels).toEqual([{ id: "UC-9", title: "UC-9", thumbnailUrl: null }]);
  });

  it("tanpa channel → oauth_no_channel (permanent)", async () => {
    queue(json({ items: [] }));

    await expect(fetchPlatformProfile("youtube", TOKEN)).rejects.toMatchObject({
      code: "oauth_no_channel",
      retryable: false,
    });
  });
});

describe("scope helper", () => {
  it("parseExtraScopes: pisah spasi/koma, buang kosong", () => {
    expect(parseExtraScopes({ ...CRED, extra: { extraScopes: "a b,c  d" } })).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(parseExtraScopes({ ...CRED, extra: { extraScopes: " , " } })).toEqual([]);
    expect(parseExtraScopes(CRED)).toEqual([]);
  });

  it("requestedScopes: dedup config + extra", () => {
    const scopes = requestedScopes("linkedin", {
      ...CRED,
      extra: { extraScopes: "openid extra-1" },
    });
    expect(scopes.filter((s) => s === "openid")).toHaveLength(1);
    expect(scopes).toContain("extra-1");
  });

  it("parseGrantedScopes: parse string; invalid → undefined", () => {
    expect(parseGrantedScopes({ scope: "a b" })).toEqual(["a", "b"]);
    expect(parseGrantedScopes({ scope: "a,b" })).toEqual(["a", "b"]);
    expect(parseGrantedScopes({ scope: "" })).toBeUndefined();
    expect(parseGrantedScopes({ scope: "   " })).toBeUndefined();
    expect(parseGrantedScopes({ scope: null })).toBeUndefined();
    expect(parseGrantedScopes({})).toBeUndefined();
  });
});

describe("isOAuthPlatformSupported", () => {
  it("true untuk platform OAuth aktif", () => {
    const supported: OAuthPlatform[] = [
      "instagram",
      "instagram_standalone",
      "facebook",
      "threads",
      "tiktok",
      "youtube",
      "pinterest",
      "linkedin",
      "linkedin_org",
      "google_business",
    ];
    for (const p of supported) expect(isOAuthPlatformSupported(p)).toBe(true);
  });

  it("false untuk bluesky (app password) & platform tak dikenal", () => {
    expect(isOAuthPlatformSupported("bluesky")).toBe(false);
    expect(isOAuthPlatformSupported("snapchat" as OAuthPlatform)).toBe(false);
  });

  it("menyempitkan tipe ke OAuthPlatform", () => {
    const input = "tiktok" as string;
    if (isOAuthPlatformSupported(input)) {
      // compile-only assertion: input ter-narrow ke OAuthPlatform
      const _ok: OAuthPlatform = input;
      expect(_ok).toBe("tiktok");
    } else {
      throw new Error("tiktok harus terdeteksi supported");
    }
  });
});
