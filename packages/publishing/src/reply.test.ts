// Test reply adapter — khusus regression "balas komentar IG selalu 502".
//
// BUG ASLI (ditemukan di prod): reply IG memakai `POST /{id}/comments`, padahal
// node IG Comment TIDAK punya edge itu → platform menjawab HTTP 400
// "does not support this operation" → route mengembalikan 502 dan balasan tidak
// pernah terkirim. Yang benar: `POST /{ig-comment-id}/replies`.
//
// Strategi: global `fetch` di-stub (semua adapter lewat httpRequest yang memakai
// fetch global) lalu URL request diperiksa — regression ke `/comments` langsung
// ketahuan.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRAPH_FB_URL, GRAPH_IG_URL } from "./config";
import { sendReply } from "./reply";

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

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

/** URL absolut dari panggilan fetch pertama (tanpa query string). */
function firstCallPath(): string {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("fetch tidak pernah dipanggil");
  const url = String(call[0]);
  return url.split("?")[0] ?? url;
}

const baseInput = {
  platform: "instagram_standalone",
  accessToken: "IGAAUSOXqUZC",
  platformItemId: "17946390009072319", // ID komentar IG sungguhana
  platformAccountId: "29064425919829474",
  content: "Terima kasih kak!",
};

describe("sendReply — edge IG", () => {
  it("IG standalone: memakai /replies pada comment id (bukan /comments)", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: "17957883261227151" }));

    const result = await sendReply({ ...baseInput, itemType: "comment" });

    expect(firstCallPath()).toBe(`${GRAPH_IG_URL}/17946390009072319/replies`);
    expect(result.replyId).toBe("17957883261227151");
  });

  it("IG standalone mention: JUGA memakai /replies (platformItemId = comment id)", async () => {
    // Webhook mention IG menyimpan comment_id di platformItemId — balasan tetap
    // merupakan reply ke komentar tersebut.
    fetchMock.mockResolvedValueOnce(okJson({ id: "17957883261227152" }));

    await sendReply({ ...baseInput, itemType: "mention" });

    expect(firstCallPath()).toBe(`${GRAPH_IG_URL}/17946390009072319/replies`);
  });

  it("IG standalone tanpa itemType: default /replies (item inbox IG selalu komentar)", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: "17957883261227153" }));

    await sendReply({ ...baseInput, itemType: null });

    expect(firstCallPath()).toBe(`${GRAPH_IG_URL}/17946390009072319/replies`);
  });

  it("IG jalur Facebook Login: /replies di graph.facebook.com", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: "17957883261227154" }));

    await sendReply({ ...baseInput, platform: "instagram", itemType: "comment" });

    expect(firstCallPath()).toBe(`${GRAPH_FB_URL}/17946390009072319/replies`);
  });

  it("IG item level media: tetap /comments (top-level comment pada media)", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: "17957883261227155" }));

    await sendReply({ ...baseInput, itemType: "media" });

    expect(firstCallPath()).toBe(`${GRAPH_IG_URL}/17946390009072319/comments`);
  });

  it("gagal render bila kembali ke /comments — pesan error platform diteruskan", async () => {
    // Inilah error yang dilihat user sebelum fix: HTTP 400 subcode 33.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Unsupported post request.",
            type: "IGApiException",
            code: 100,
            error_subcode: 33,
          },
        }),
        { status: 400 },
      ),
    );

    await expect(sendReply({ ...baseInput, itemType: "comment" })).rejects.toThrowError(
      /IG standalone reply/,
    );
  });
});
