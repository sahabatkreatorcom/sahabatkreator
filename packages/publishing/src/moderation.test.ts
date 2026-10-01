// Test moderasi komentar — hide/unhide & delete per platform.
//
// Latar: tombol "Sembunyikan" di Inbox mengembalikan 500 "Terjadi kesalahan
// internal" untuk Threads, karena `moderationEndpoint()` hanya mengenal
// Instagram/Facebook dan melempar `comment_moderation_unsupported`. Padahal
// izin `threads_manage_replies` yang diminta ke Meta MENCANGKUP hide/unhide
// balasan — jadi fitur ini wajib jalan.
//
// Yang dikunci di sini:
//  - Threads memakai endpoint sendiri `POST /{reply-id}/manage_reply`
//    (bukan pola Instagram/Facebook), dengan `hide=true|false`.
//  - Yang dikirim adalah **reply id**, bukan post id.
//  - Hapus balasan Threads ditolak dengan pesan jelas (API Threads tidak
//    menyediakan delete), bukan memanggil endpoint yang salah.
//  - Perilaku Instagram/Facebook tidak berubah (regression guard).

import { afterEach, describe, expect, it, vi } from "vitest";
import { GRAPH_FB_URL, GRAPH_THREADS_URL } from "./config";
import { httpRequest } from "./http";
import { moderateComment } from "./moderation";

vi.mock("./http", async () => {
  const actual = await vi.importActual<typeof import("./http")>("./http");
  return { ...actual, httpRequest: vi.fn() };
});

const mockedRequest = vi.mocked(httpRequest);

/** Response palsu minimal yang cocok dengan HttpResponse. */
function fakeResponse(opts: { ok?: boolean; status?: number; body?: string }) {
  const { ok = true, status = 200, body = '{"success":true}' } = opts;
  return {
    ok,
    status,
    headers: new Headers(),
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("moderateComment — Threads", () => {
  it("hide memakai endpoint /manage_reply dengan hide=true", async () => {
    mockedRequest.mockResolvedValue(fakeResponse({}) as never);

    await moderateComment(
      {
        platform: "threads",
        accessToken: "THREADS_TOKEN",
        platformItemId: "17900000000000001",
        hidden: true,
      },
      "hide",
    );

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    const [url, options] = mockedRequest.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe(`${GRAPH_THREADS_URL}/17900000000000001/manage_reply`);
    expect(options.method).toBe("POST");
    expect(options.body).toBe("hide=true");
    expect(options.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(options.query).toEqual({ access_token: "THREADS_TOKEN" });
  });

  it("unhide mengirim hide=false", async () => {
    mockedRequest.mockResolvedValue(fakeResponse({}) as never);

    await moderateComment(
      {
        platform: "threads",
        accessToken: "THREADS_TOKEN",
        platformItemId: "17900000000000002",
        hidden: false,
      },
      "hide",
    );

    const [, options] = mockedRequest.mock.calls[0] as [string, Record<string, unknown>];
    expect(options.body).toBe("hide=false");
  });

  it("hidden undefined diperlakukan sebagai unhide (false)", async () => {
    mockedRequest.mockResolvedValue(fakeResponse({}) as never);

    await moderateComment({ platform: "threads", accessToken: "T", platformItemId: "123" }, "hide");

    const [, options] = mockedRequest.mock.calls[0] as [string, Record<string, unknown>];
    expect(options.body).toBe("hide=false");
  });

  it("delete ditolak dengan pesan jelas tanpa memanggil API", async () => {
    await expect(
      moderateComment({ platform: "threads", accessToken: "T", platformItemId: "123" }, "delete"),
    ).rejects.toMatchObject({ code: "comment_moderation_unsupported" });

    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("platformItemId kosong ditolak sebelum memanggil API", async () => {
    await expect(
      moderateComment({ platform: "threads", accessToken: "T", platformItemId: null }, "hide"),
    ).rejects.toMatchObject({ code: "no_platform_item" });

    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("response non-2xx dilempar sebagai PublishError", async () => {
    mockedRequest.mockResolvedValue(
      fakeResponse({ ok: false, status: 400, body: '{"error":{"message":"bad"}}' }) as never,
    );

    await expect(
      moderateComment({ platform: "threads", accessToken: "T", platformItemId: "123" }, "hide"),
    ).rejects.toMatchObject({ code: "http_400" });
  });
});

describe("moderateComment — Instagram & Facebook (regression)", () => {
  it("instagram pakai graph.facebook.com dengan parameter hide", async () => {
    mockedRequest.mockResolvedValue(fakeResponse({}) as never);

    await moderateComment(
      {
        platform: "instagram",
        accessToken: "TOKEN",
        platformItemId: "17800000000000001",
        hidden: true,
      },
      "hide",
    );

    const [url, options] = mockedRequest.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe(`${GRAPH_FB_URL}/17800000000000001`);
    expect((options.query as Record<string, unknown>).hide).toBe(true);
  });

  it("facebook pakai parameter is_hidden", async () => {
    mockedRequest.mockResolvedValue(fakeResponse({}) as never);

    await moderateComment(
      {
        platform: "facebook",
        accessToken: "TOKEN",
        platformItemId: "122000000000000001",
        hidden: true,
        accountMetadata: { pageAccessToken: "PAGE_TOKEN" },
      },
      "hide",
    );

    const [, options] = mockedRequest.mock.calls[0] as [string, Record<string, unknown>];
    expect((options.query as Record<string, unknown>).is_hidden).toBe(true);
    expect((options.query as Record<string, unknown>).access_token).toBe("PAGE_TOKEN");
  });

  it("platform tak dikenal tetap ditolak", async () => {
    await expect(
      moderateComment({ platform: "tiktok", accessToken: "T", platformItemId: "1" }, "hide"),
    ).rejects.toMatchObject({ code: "comment_moderation_unsupported" });
  });
});
