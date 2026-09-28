// Test pipeline publishing — perilaku kritis yang menjaga uang & reputasi user:
// race claim atomik, klasifikasi error retryable vs permanen, daily limit.
//
// ANALISA-CODEBASE.md rekomendasi #5 minta integration test dengan testcontainer
// Postgres+Redis. Docker tidak tersedia di lingkungan ini, jadi di-fallback ke
// unit test dengan db & adapter di-mock total. Yang diuji bukan SQL-nya (itu
// tanggungan drizzle + Postgres) melainkan KONTRAK state machine yang kalau
// berubah akan menyebabkan double-publish atau post user ditandai failed
// padahal seharusnya retry:
//  - claimDuePosts: hanya return id yang benar-benar ter-UPDATE (race aman).
//  - executePublish: PublishError retryable → throw (BullMQ retry); permanen
//    → markFailed + "failed"; error asing → retryable (aman default-nya).
//  - publishPost: mode DB fallback menandai retryable sebagai failed (tidak
//    ada backoff engine), permanen tetap failed.
//  - enforceDailyLimit: limit platform tercapai → PublishError permanen
//    (bukan retryable — menunggu tidak membantu, quota sudah habis hari ini).

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adapters from "./adapters";
import * as cryptoNs from "./crypto";
import {
  claimDuePosts,
  claimPostById,
  executePublish,
  pollInFlightPosts,
  pollPost,
  publishPost,
  recoverStalePosts,
  resetToScheduled,
} from "./pipeline";
import type { ReplyResult } from "./reply";
import * as replyNs from "./reply";
import { type AsyncPostStatus, PLATFORM_DAILY_LIMITS, PublishError } from "./types";

// --- Mock db: recorder SELECT/UPDATE/INSERT + return value per query ---
// Builder drizzle berantai (select().from().where()...); mock harus mengikuti
// rantai apa pun dan mencatat panggilan untuk assertion.
//
// vi.mock factory di-hoist ke atas oleh Vitest, jadi fixture wajib dibungkus
// vi.hoisted() — kalau tidak, `db` diakses sebelum inisialisasi (ReferenceError).
const { db, chainable, chainableReject } = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  };

  // Setiap method rantai return diri sendiri; await resolve ke `result`.
  function chainable(result: unknown) {
    const chain: Record<string, unknown> = {
      // biome-ignore lint/suspicious/noThenProperty: mock thenable — begini drizzle chain di-await.
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
    };
    const proxy = new Proxy(chain, {
      get(target, prop) {
        if (prop === "then") return target.then;
        // select().from().where()... — semua return proxy lagi
        return () => proxy;
      },
    });
    return proxy;
  }

  // Sama, tapi await MELEMPAR error — simulasi query gagal (koneksi drop).
  // .catch HARUS didefinisakan eksplisit: proxy mengembalikan () => proxy untuk
  // properti apa pun selain then/catch, jadi tanpa ini callback .catch() caller
  // diam-diam dibuang dan rejection tetap propagasi (resetToScheduled test).
  function chainableReject(error: unknown) {
    const chain: Record<string, unknown> = {
      // biome-ignore lint/suspicious/noThenProperty: mock thenable — begini drizzle chain di-await.
      then: (_onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.reject(error).catch(
          onRejected ??
            ((e) => {
              throw e;
            }),
        ),
      catch: (onRejected?: (e: unknown) => unknown) =>
        Promise.reject(error).catch(
          onRejected ??
            ((e) => {
              throw e;
            }),
        ),
    };
    const proxy = new Proxy(chain, {
      get(target, prop) {
        if (prop === "then") return target.then;
        if (prop === "catch") return target.catch;
        return () => proxy;
      },
    });
    return proxy;
  }

  return { db, chainable, chainableReject };
});

vi.mock("@sahabatkreator/db", () => ({
  db,
  notifyOrganization: vi.fn().mockResolvedValue(undefined),
  pushToOrganization: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sahabatkreator/db/schema", () => ({
  post: { id: "post.id" },
  postGroup: { id: "postGroup.id" },
  socialAccount: { id: "socialAccount.id" },
  media: { id: "media.id" },
  postMedia: { id: "postMedia.id" },
  bridgeConfig: { id: "bridgeConfig.id" },
}));

// Modul relatif ("./crypto" dsb.) TIDAK bisa di-vi.mock di Vitest 4 + config
// monorepo ini: mock specifiernya di-resolve relatif root, jadi "./crypto"
// diam-diam tidak cocok dan modul asli ikut dipakai (buktinya decrypt asli
// sempat melempar "Format ciphertext tidak valid"). Pakai namespace spy —
// binding ESM live, jadi pipeline yang import modul yang sama melihat mock ini
// juga, tanpa peduli dari mana vitest dijalankan.
const decryptSpy = vi.spyOn(cryptoNs, "decrypt").mockReturnValue("decrypted:fake");
const encryptSpy = vi.spyOn(cryptoNs, "encrypt").mockReturnValue("enc:fake");
const getAdapterSpy = vi.spyOn(adapters, "getAdapter").mockReturnValue(undefined);
const sendReplySpy = vi
  .spyOn(replyNs, "sendReply")
  .mockResolvedValue(undefined as unknown as ReplyResult);

function resetMocks(): void {
  db.select.mockReset();
  db.update.mockReset();
  db.insert.mockReset();
  db.delete.mockReset();
  db.execute.mockReset();
  getAdapterSpy.mockReset();
  sendReplySpy.mockReset();
  // Nilai default setelah reset (mockReset menghapus implementation).
  decryptSpy.mockReturnValue("decrypted:fake");
  encryptSpy.mockReturnValue("enc:fake");
}

/** Row post lengkap yang dikembalikan loadPostForPublish (struktur select). */
function mockPostRow(opts?: {
  accessTokenEnc?: string | null;
  platform?: string;
  firstComment?: string | null;
}): unknown {
  return {
    post: {
      id: "post_1",
      postGroupId: "grp_1",
      socialAccountId: "acc_1",
      platform: opts?.platform ?? "instagram",
      content: "Halo dunia",
      hashtags: ["test"],
      firstComment: opts?.firstComment ?? null,
      platformSettings: null,
      platformPostId: null,
      platformPostUrl: null,
    },
    groupContent: null,
    scheduledAt: null,
    account: {
      platformAccountId: "ig_123",
      accessTokenEnc: opts?.accessTokenEnc === undefined ? "token_enc" : opts.accessTokenEnc,
      refreshTokenEnc: null,
      username: "akuntest",
      metadata: null,
    },
  };
}

/** Adapter mock — hanya method publish yang dipakai pipeline di test ini. */
function fakeAdapter(
  publish: (input: unknown) => Promise<unknown>,
): ReturnType<typeof adapters.getAdapter> {
  return { platform: "instagram", publish } as unknown as ReturnType<typeof adapters.getAdapter>;
}

describe("claimDuePosts — race guard", () => {
  beforeEach(resetMocks);

  it("hanya mengembalikan id yang benar-benar ter-claim oleh UPDATE atomik", async () => {
    // Simulasi: 2 post due, tapi 1 sudah diclaim runner lain antara SELECT
    // dan UPDATE (RETURNING hanya 1 baris). Harusnya hanya 1 id dikembalikan —
    // bukan keduanya (post_2 milik runner lain, mengembalikannya = double-publish).
    db.execute.mockResolvedValueOnce({ rows: [{ id: "post_1" }, { id: "post_2" }] });
    db.update.mockReturnValueOnce(chainable([{ id: "post_1" }]));

    const claimed = await claimDuePosts(10);

    expect(claimed).toEqual(["post_1"]);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("mengembalikan array kosong bila tidak ada post due", async () => {
    db.execute.mockResolvedValueOnce({ rows: [] });
    db.update.mockReturnValueOnce(chainable([]));

    expect(await claimDuePosts(10)).toEqual([]);
  });
});

describe("executePublish — klasifikasi error", () => {
  beforeEach(resetMocks);

  /** Setup mock: loadPostForPublish (2x), loadPostMedia (1x), enforceDailyLimit (1x). */
  function setupHappyPath(dailyCount = 0): void {
    // Urutan query di executePublish: loadPostForPublish (dalam buildPublishInput),
    // loadPostMedia, loadPostForPublish (ulang), enforceDailyLimit.
    db.select
      .mockReturnValueOnce(chainable([mockPostRow()])) // loadPostForPublish #1
      .mockReturnValueOnce(chainable([])) // loadPostMedia
      .mockReturnValueOnce(chainable([mockPostRow()])) // loadPostForPublish #2
      .mockReturnValueOnce(chainable([{ total: dailyCount }])); // enforceDailyLimit
    db.update.mockReturnValue(chainable([])); // markPublished / markFailed / saveAsyncHandle
  }

  it("PublishError retryable di-throw ulang (BullMQ yang retry), bukan markFailed", async () => {
    setupHappyPath();
    // mockRejectedOnce tidak ada di Vitest 4 — gunakan implementation yang throw.
    getAdapterSpy.mockReturnValue(
      fakeAdapter(
        vi
          .fn()
          .mockImplementationOnce(() =>
            Promise.reject(new PublishError("rate_limited", "429", true)),
          ),
      ),
    );

    await expect(executePublish("post_1")).rejects.toMatchObject({
      name: "PublishError",
      code: "rate_limited",
      retryable: true,
    });

    // Tidak ada update status → post tetap bisa di-claim ulang di attempt berikutnya.
    // (markFailed akan set status='failed'; saveAsyncHandle set 'publishing'.)
    expect(db.update).not.toHaveBeenCalled();
  });

  it("PublishError permanen → markFailed + return 'failed'", async () => {
    setupHappyPath();
    getAdapterSpy.mockReturnValue(
      fakeAdapter(
        vi
          .fn()
          .mockImplementationOnce(() =>
            Promise.reject(new PublishError("token_invalid", "Token expired", false)),
          ),
      ),
    );

    await expect(executePublish("post_1")).resolves.toBe("failed");

    // markFailed dipanggil: update post set status='failed' + errorCode.
    expect(db.update).toHaveBeenCalled();
  });

  it("publish sukses → markPublished + return 'published'", async () => {
    setupHappyPath();
    // select ke-5: notifyPostEvent membaca row post setelah markPublished.
    db.select.mockReturnValueOnce(
      chainable([
        {
          organizationId: "org_1",
          platform: "instagram",
          content: "Halo dunia",
          postGroupId: "grp_1",
        },
      ]),
    );
    getAdapterSpy.mockReturnValue(
      fakeAdapter(
        vi.fn().mockResolvedValueOnce({
          status: "published",
          platformPostId: "ig_post_1",
          platformPostUrl: "https://instagram.com/p/abc",
        }),
      ),
    );

    await expect(executePublish("post_1")).resolves.toBe("published");
    // markPublished: update post set status='published' + platformPostId/url.
    expect(db.update).toHaveBeenCalled();
  });

  it("error asing dibungkus PublishError retryable (default aman: coba lagi)", async () => {
    setupHappyPath();
    getAdapterSpy.mockReturnValue(
      fakeAdapter(
        vi.fn().mockImplementationOnce(() => Promise.reject(new Error("network hangup"))),
      ),
    );

    await expect(executePublish("post_1")).rejects.toMatchObject({
      name: "PublishError",
      code: "unknown_error",
      retryable: true,
    });
  });

  it("adapter tidak ditemukan → markFailed permanen, bukan throw", async () => {
    setupHappyPath();
    getAdapterSpy.mockReturnValue(undefined);

    await expect(executePublish("post_1")).resolves.toBe("failed");
    expect(db.update).toHaveBeenCalled();
  });
});

describe("publishPost — mode DB fallback (tanpa BullMQ)", () => {
  beforeEach(resetMocks);

  it("retryable error ditandai failed (worker DB tidak punya backoff engine)", async () => {
    // publishPost menangkap throw retryable dari executePublish → markFailed.
    db.select
      .mockReturnValueOnce(chainable([mockPostRow()]))
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([mockPostRow()]))
      .mockReturnValueOnce(chainable([{ total: 0 }]));
    db.update.mockReturnValue(chainable([]));
    getAdapterSpy.mockReturnValue(
      fakeAdapter(
        vi
          .fn()
          .mockImplementationOnce(() =>
            Promise.reject(new PublishError("rate_limited", "429", true)),
          ),
      ),
    );

    await expect(publishPost("post_1")).resolves.toBe("failed");
    expect(db.update).toHaveBeenCalled();
  });
});

describe("enforceDailyLimit — limit platform", () => {
  beforeEach(resetMocks);

  it("limit tercapai → PublishError permanen (tidak retry)", async () => {
    const platform = "instagram";
    const limit = PLATFORM_DAILY_LIMITS[platform] ?? 50;
    expect(limit).toBeGreaterThan(0);

    db.select
      .mockReturnValueOnce(chainable([mockPostRow({ platform })]))
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([mockPostRow({ platform })]))
      .mockReturnValueOnce(chainable([{ total: limit }])); // sudah habis
    db.update.mockReturnValue(chainable([]));

    // enforceDailyLimit throw PublishError(daily_limit_reached, false) →
    // executePublish menangkap: permanen → markFailed + "failed" (bukan throw).
    await expect(executePublish("post_1")).resolves.toBe("failed");
    expect(db.update).toHaveBeenCalled();
  });

  it("platform manual (limit 0) → gagal permanen, bukan retry", async () => {
    expect(PLATFORM_DAILY_LIMITS.manual).toBe(0);

    db.select
      .mockReturnValueOnce(chainable([mockPostRow({ platform: "manual" })]))
      .mockReturnValueOnce(chainable([]))
      .mockReturnValueOnce(chainable([mockPostRow({ platform: "manual" })]));
    db.update.mockReturnValue(chainable([]));

    await expect(executePublish("post_1")).resolves.toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// pollPost / pollInFlightPosts — state machine async publish (TikTok publish_id,
// IG container). Bug di sini = post tayang tapi statusnya selamanya "publishing"
// (user tidak lihat hasilnya) ATAU post selesai dihitung lagi (double-count).
// ---------------------------------------------------------------------------

/** Row select pollPost (field di level atas, beda dari loadPostForPublish). */
function mockPollRow(opts?: {
  handle?: string | null;
  platform?: string;
  firstComment?: string | null;
}): unknown {
  return {
    platform: opts?.platform ?? "instagram",
    handle: opts?.handle === undefined ? "container_1" : opts.handle,
    socialAccountId: "acc_1",
    content: "Halo dunia",
    hashtags: ["test"],
    firstComment: opts?.firstComment ?? null,
    platformSettings: null,
  };
}

/** Row akun untuk lookup socialAccount (dipakai pollPost & pollInFlightPosts). */
function mockAccountRow(): unknown {
  return {
    accessTokenEnc: "token_enc",
    refreshTokenEnc: null,
    platformAccountId: "ig_123",
    username: "akuntest",
    metadata: null,
  };
}

describe("pollPost — polling async publish", () => {
  beforeEach(resetMocks);

  it("published → markPublished + 'published' (first comment best-effort)", async () => {
    db.select
      .mockReturnValueOnce(chainable([mockPollRow({ firstComment: "komentar pertama" })])) // pollPost row
      .mockReturnValueOnce(chainable([mockAccountRow()])) // load account
      .mockReturnValueOnce(chainable([])); // loadPostMedia (dalam checkStatus input)
    db.update.mockReturnValue(chainable([]));
    getAdapterSpy.mockReturnValue({
      platform: "instagram",
      publish: vi.fn(),
      checkStatus: vi.fn().mockResolvedValue({
        status: "published",
        platformPostId: "ig_999",
        platformPostUrl: "https://instagram.com/p/abc",
      }),
    });

    await expect(pollPost("post_1")).resolves.toBe("published");
    // markPublished + sendFirstComment (sendReply di-spy → resolve)
    expect(db.update).toHaveBeenCalled();
    expect(sendReplySpy).toHaveBeenCalledTimes(1);
  });

  it("platform balas failed → markFailed + 'failed'", async () => {
    db.select
      .mockReturnValueOnce(chainable([mockPollRow()]))
      .mockReturnValueOnce(chainable([mockAccountRow()]))
      .mockReturnValueOnce(chainable([]));
    db.update.mockReturnValue(chainable([]));
    getAdapterSpy.mockReturnValue({
      platform: "instagram",
      publish: vi.fn(),
      checkStatus: vi.fn().mockResolvedValue({
        status: "failed",
        code: "container_expired",
        message: "Container IG kadaluarsa",
      }),
    });

    await expect(pollPost("post_1")).resolves.toBe("failed");
    expect(db.update).toHaveBeenCalled();
  });

  it("masih diproses (status processing) → 'processing', tidak ada update", async () => {
    db.select
      .mockReturnValueOnce(chainable([mockPollRow()]))
      .mockReturnValueOnce(chainable([mockAccountRow()]))
      .mockReturnValueOnce(chainable([]));
    db.update.mockReturnValue(chainable([]));
    getAdapterSpy.mockReturnValue({
      platform: "instagram",
      publish: vi.fn(),
      checkStatus: vi.fn().mockResolvedValue({ status: "processing" }),
    });

    await expect(pollPost("post_1")).resolves.toBe("processing");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("handle belum ada → 'processing' (belum di-submit ke platform)", async () => {
    db.select.mockReturnValueOnce(chainable([mockPollRow({ handle: null })]));

    await expect(pollPost("post_1")).resolves.toBe("processing");
    expect(getAdapterSpy).not.toHaveBeenCalled();
  });

  it("post sudah selesai oleh runner lain → hentikan chain poll", async () => {
    // Row publishing tidak ketemu (status sudah published/failed) → cek status
    // final. Penting: job poll lama tidak boleh re-enqueue post yang sudah selesai.
    db.select
      .mockReturnValueOnce(chainable([])) // pollPost row (tidak ada)
      .mockReturnValueOnce(chainable([{ status: "failed" }])); // status final

    await expect(pollPost("post_1")).resolves.toBe("failed");
  });

  it("checkStatus throw permanen → markFailed (jangan buang attempt retry)", async () => {
    db.select
      .mockReturnValueOnce(chainable([mockPollRow()]))
      .mockReturnValueOnce(chainable([mockAccountRow()]))
      .mockReturnValueOnce(chainable([]));
    db.update.mockReturnValue(chainable([]));
    getAdapterSpy.mockReturnValue({
      platform: "instagram",
      publish: vi.fn(),
      checkStatus: vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.reject(new PublishError("container_expired", "expired", false)),
        ),
    });

    await expect(pollPost("post_1")).resolves.toBe("failed");
    expect(db.update).toHaveBeenCalled();
  });

  it("checkStatus throw retryable → re-throw (job poll di-retry)", async () => {
    db.select
      .mockReturnValueOnce(chainable([mockPollRow()]))
      .mockReturnValueOnce(chainable([mockAccountRow()]))
      .mockReturnValueOnce(chainable([]));
    db.update.mockReturnValue(chainable([]));
    getAdapterSpy.mockReturnValue({
      platform: "instagram",
      publish: vi.fn(),
      checkStatus: vi
        .fn()
        .mockImplementationOnce(() =>
          Promise.reject(new PublishError("rate_limited", "429", true)),
        ),
    });

    await expect(pollPost("post_1")).rejects.toMatchObject({
      name: "PublishError",
      code: "rate_limited",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("akun tidak ada saat polling → markFailed permanen", async () => {
    db.select.mockReturnValueOnce(chainable([mockPollRow()])).mockReturnValueOnce(chainable([])); // akun hilang
    db.update.mockReturnValue(chainable([]));
    getAdapterSpy.mockReturnValue({
      platform: "instagram",
      publish: vi.fn(),
      checkStatus: vi.fn(),
    });

    await expect(pollPost("post_1")).resolves.toBe("failed");
    expect(db.update).toHaveBeenCalled();
  });
});

describe("pollInFlightPosts — sweep worker fallback", () => {
  beforeEach(resetMocks);

  it("hitung published/failed/processing per post", async () => {
    // 2 post in-flight: 1 published, 1 masih processing.
    // Urutan select: inFlight list → (per post) account → media → notifyPostEvent
    // (hanya untuk published — markPublished membaca row post utk notifikasi).
    db.select
      .mockReturnValueOnce(
        chainable([
          {
            id: "p1",
            platform: "instagram",
            handle: "h1",
            socialAccountId: "a1",
            content: "a",
            hashtags: [],
            firstComment: null,
            platformSettings: null,
          },
          {
            id: "p2",
            platform: "instagram",
            handle: "h2",
            socialAccountId: "a1",
            content: "b",
            hashtags: [],
            firstComment: null,
            platformSettings: null,
          },
        ]),
      )
      .mockReturnValueOnce(chainable([mockAccountRow()])) // account p1
      .mockReturnValueOnce(chainable([])) // media p1
      .mockReturnValueOnce(
        chainable([
          { organizationId: "org_1", platform: "instagram", content: "a", postGroupId: "g1" },
        ]),
      ) // notify p1
      .mockReturnValueOnce(chainable([mockAccountRow()])) // account p2
      .mockReturnValueOnce(chainable([])); // media p2
    db.update.mockReturnValue(chainable([]));
    let n = 0;
    getAdapterSpy.mockReturnValue({
      platform: "instagram",
      publish: vi.fn(),
      checkStatus: vi.fn((): Promise<AsyncPostStatus> => {
        n++;
        return Promise.resolve(
          n === 1 ? { status: "published", platformPostId: "x" } : { status: "processing" },
        );
      }),
    });

    await expect(pollInFlightPosts(20)).resolves.toEqual({
      published: 1,
      failed: 0,
      processing: 1,
    });
  });

  it("error polling 1 post tidak mematikan sweep (post lain tetap diproses)", async () => {
    db.select
      .mockReturnValueOnce(
        chainable([
          {
            id: "p1",
            platform: "instagram",
            handle: "h1",
            socialAccountId: "a1",
            content: "a",
            hashtags: [],
            firstComment: null,
            platformSettings: null,
          },
          {
            id: "p2",
            platform: "instagram",
            handle: "h2",
            socialAccountId: "a1",
            content: "b",
            hashtags: [],
            firstComment: null,
            platformSettings: null,
          },
        ]),
      )
      .mockReturnValueOnce(chainable([mockAccountRow()])) // account p1
      .mockReturnValueOnce(chainable([])) // media p1
      // p1: checkStatus melempar → ditangkap per-row catch → processing
      .mockReturnValueOnce(chainable([mockAccountRow()])) // account p2
      .mockReturnValueOnce(chainable([])) // media p2
      // p2: published → markPublished → notifyPostEvent baca row post
      .mockReturnValueOnce(
        chainable([
          { organizationId: "org_1", platform: "instagram", content: "b", postGroupId: "g2" },
        ]),
      ); // notify p2
    db.update.mockReturnValue(chainable([]));
    let n = 0;
    getAdapterSpy.mockReturnValue({
      platform: "instagram",
      publish: vi.fn(),
      checkStatus: vi.fn((): Promise<AsyncPostStatus> => {
        n++;
        if (n === 1) throw new Error("network glitch");
        return Promise.resolve({ status: "published", platformPostId: "x" });
      }),
    });

    await expect(pollInFlightPosts(20)).resolves.toEqual({
      published: 1,
      failed: 0,
      processing: 1, // error → diproses sebagai processing (bukan throw)
    });
  });
});

describe("claimPostById / resetToScheduled / recoverStalePosts", () => {
  beforeEach(resetMocks);

  it("claimPostById true hanya bila UPDATE RETURNING mengembalikan baris", async () => {
    db.update.mockReturnValueOnce(chainable([{ id: "post_1" }]));
    expect(await claimPostById("post_1")).toBe(true);
  });

  it("claimPostById false bila sudah diclaim runner lain (status bukan scheduled/draft)", async () => {
    db.update.mockReturnValueOnce(chainable([]));
    expect(await claimPostById("post_1")).toBe(false);
  });

  it("resetToScheduled tidak throw saat update gagal (dipakai di path cleanup)", async () => {
    // Rantai update yang reject saat di-await — pipeline menangkapnya
    // (.catch) supaya cleanup job tidak crash karena 1 post.
    db.update.mockReturnValueOnce(chainableReject(new Error("connection lost")));
    await expect(resetToScheduled("post_1")).resolves.toBeUndefined();
  });

  it("recoverStalePosts menghitung post stuck yang di-fail-kan", async () => {
    // Post stuck "publishing" > 30 menit tanpa konfirmasi platform → fail-safe.
    db.update.mockReturnValueOnce(chainable([{ id: "p1" }, { id: "p2" }]));
    await expect(recoverStalePosts()).resolves.toBe(2);
  });
});
