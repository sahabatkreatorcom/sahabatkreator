// Test HTTP helper — lapisan bawah semua adapter platform. Bug di sini =
// request user dibuang sebagai "gagal padahal transien" (counter retry
// platform berkurang sia-sia) atau sebaliknya: request bad-request di-retry
// selamanya. Yang diuji:
//  - query serialization: array di-repeat per elemen (BUKAN set — data loss),
//    undefined di-skip, string biasa ditulis apa adanya.
//  - retry 429/5xx menghormati Retry-After (detik + HTTP-date), berhenti di
//    batas retries.
//  - network error → PublishError("network_error", retryable) — jangan sampai
//    TypeError fetch mentah bocor ke pipeline (error asing = retryable default,
//    tapi pesannya menyesatkan).
//  - throwFromResponse: mapping status → retryable (429/5xx/408 ya, 4xx tidak).
//  - extractErrorMessage: format Meta / LinkedIn / teks polos / kosong.
//  - downloadMedia: storage 403/404 → PublishError (bukan kirim halaman error
//    XML/HTML sebagai "media" ke platform).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadMedia,
  extractErrorMessage,
  type HttpResponse,
  httpRequest,
  parseRetryAfterMs,
  throwFromResponse,
} from "./http";

/** Response palsu minimal yang cocok dengan HttpResponse + punya .text()/.json(). */
function fakeResponse(opts: {
  ok?: boolean;
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}): HttpResponse {
  const { ok = true, status = 200, body = "", headers = {} } = opts;
  const hdr = new Headers(headers);
  return {
    ok,
    status,
    headers: hdr,
    json: () => Promise.resolve(JSON.parse(body) as unknown),
    text: () => Promise.resolve(body),
  };
}

type FetchImpl = typeof fetch;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: FetchImpl | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFetch !== undefined) globalThis.fetch = originalFetch;
});

describe("parseRetryAfterMs", () => {
  it("format detik → ms; 0 = retry segera", () => {
    expect(parseRetryAfterMs("120")).toBe(120_000);
    expect(parseRetryAfterMs("0")).toBe(0);
  });

  it("format HTTP-date → delta ke waktu itu (bisa 0 bila sudah lewat)", () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfterMs(past)).toBe(0);

    const future = new Date(Date.now() + 30_000).toUTCString();
    expect(parseRetryAfterMs(future)).toBeGreaterThan(20_000);
  });

  it("header aneh → null (tidak ada backoff)", () => {
    expect(parseRetryAfterMs(null)).toBe(null);
    expect(parseRetryAfterMs("sebentar")).toBe(null);
  });
});

describe("httpRequest — query serialization", () => {
  it("array di-repeat per elemen (append), undefined di-skip", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: "{}" }));
    await httpRequest("https://x.test/api", {
      query: {
        ids: ["a", "b", "c"],
        skip: undefined,
        flag: true,
        n: 42,
        s: "halo",
      },
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("ids=a&ids=b&ids=c");
    expect(url).not.toContain("skip=");
    expect(url).toContain("flag=true");
    expect(url).toContain("n=42");
    expect(url).toContain("s=halo");
  });

  it("query ditambah ke URL yang sudah punya '?'", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: "{}" }));
    await httpRequest("https://x.test/api?k=1", { query: { s: "v" } });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe("https://x.test/api?k=1&s=v");
  });

  it("tanpa query → URL tidak diubah", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: "{}" }));
    await httpRequest("https://x.test/api");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://x.test/api");
  });
});

describe("httpRequest — retry 429/5xx", () => {
  it("429 di-retry sampai sukses, menghormati Retry-After (detik)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({ ok: false, status: 429, headers: { "retry-after": "0" } }),
      )
      .mockResolvedValueOnce(fakeResponse({ body: '{"ok":1}' }));

    const res = await httpRequest("https://x.test/api", { retries: 2 });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("5xx berhenti di batas retries → response tetap dikembalikan (caller lihat status)", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 503 }));

    const res = await httpRequest("https://x.test/api", { retries: 1 });

    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2); // attempt 0 + 1 retry
  });

  it("retries: 0 → tidak ada retry sama sekali", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 429 }));
    await httpRequest("https://x.test/api", { retries: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("4xx (non-429) tidak di-retry — permintaan salah, ulangi tidak ada gunanya", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 400 }));
    await httpRequest("https://x.test/api");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("network error (fetch throw) → PublishError retryable, bukan TypeError mentah", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(httpRequest("https://x.test/api")).rejects.toMatchObject({
      name: "PublishError",
      code: "network_error",
      retryable: true,
    });
  });

  it("onResponse dipanggil untuk setiap response (rekam kuota) tapi error-nya tidak mematikan request", async () => {
    const onResponse = vi.fn().mockImplementation(() => {
      throw new Error("callback meledak");
    });
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: "{}" }));

    const res = await httpRequest("https://x.test/api", { onResponse });

    expect(res.ok).toBe(true);
    expect(onResponse).toHaveBeenCalledTimes(1);
  });
});

describe("throwFromResponse — mapping retryable", () => {
  it("429 → retryable", async () => {
    await expect(
      throwFromResponse(fakeResponse({ ok: false, status: 429, body: "" }), "ctx"),
    ).rejects.toMatchObject({ code: "http_429", retryable: true });
  });

  it("500/502/503/504 → retryable", async () => {
    for (const status of [500, 502, 503, 504]) {
      await expect(
        throwFromResponse(fakeResponse({ ok: false, status, body: "" }), "ctx"),
      ).rejects.toMatchObject({ code: `http_${status}`, retryable: true });
    }
  });

  it("408 (timeout) → retryable", async () => {
    await expect(
      throwFromResponse(fakeResponse({ ok: false, status: 408, body: "" }), "ctx"),
    ).rejects.toMatchObject({ code: "http_408", retryable: true });
  });

  it("400/401/403 → permanen (retryable false)", async () => {
    for (const status of [400, 401, 403]) {
      await expect(
        throwFromResponse(fakeResponse({ ok: false, status, body: "" }), "ctx"),
      ).rejects.toMatchObject({ code: `http_${status}`, retryable: false });
    }
  });

  it("context + pesan error disertakan", async () => {
    await expect(
      throwFromResponse(
        fakeResponse({ ok: false, status: 400, body: '{"error":{"message":"Bad caption"}}' }),
        "IG container",
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("IG container") });
  });
});

describe("extractErrorMessage — format tiap platform", () => {
  it("Meta: { error: { message, code } } → [code] message", async () => {
    const msg = await extractErrorMessage(
      fakeResponse({
        status: 400,
        body: '{"error":{"message":"Invalid parameter","code":100,"error_subcode":2207014}}',
      }),
    );
    expect(msg).toBe("[100] Invalid parameter");
  });

  it("OAuth: { error_description } → dipakai apa adanya", async () => {
    const msg = await extractErrorMessage(
      fakeResponse({ status: 401, body: '{"error_description":"Token expired"}' }),
    );
    expect(msg).toBe("Token expired");
  });

  it("LinkedIn/generic: { message }", async () => {
    const msg = await extractErrorMessage(
      fakeResponse({ status: 403, body: '{"message":"Insufficient scope"}' }),
    );
    expect(msg).toBe("Insufficient scope");
  });

  it("body kosong → fallback HTTP status", async () => {
    const msg = await extractErrorMessage(fakeResponse({ status: 503, body: "" }));
    expect(msg).toBe("HTTP 503");
  });

  it("teks non-JSON → dipotong 300 char (jangan banjir log)", async () => {
    const long = "x".repeat(1000);
    const msg = await extractErrorMessage(fakeResponse({ status: 500, body: long }));
    expect(msg).toHaveLength(300);
  });

  it("JSON tanpa field dikenali → fallback ke teks", async () => {
    const msg = await extractErrorMessage(
      fakeResponse({ status: 400, body: '{"unrelated":"stuff"}' }),
    );
    expect(msg).toBe('{"unrelated":"stuff"}');
  });
});

describe("downloadMedia — storage guard", () => {
  it("403/404 → PublishError retryable (jangan kirim halaman error sebagai media)", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 403 }));

    await expect(downloadMedia("https://r2.test/m/1")).rejects.toMatchObject({
      name: "PublishError",
      code: "media_fetch_failed",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // 4xx tidak retry
  });

  it("5xx di-retry lalu PublishError", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 500 }));

    await expect(downloadMedia("https://r2.test/m/1")).rejects.toMatchObject({
      code: "media_fetch_failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 2 retries
  });

  it("ok → ArrayBuffer media", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue(new Response(bytes.buffer, { status: 200 }));

    const buf = await downloadMedia("https://r2.test/m/1");
    expect(buf.byteLength).toBe(3);
  });
});
