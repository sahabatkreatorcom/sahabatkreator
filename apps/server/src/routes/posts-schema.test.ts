// Test kontrak POST /posts — shape payload yang dikirim web app & public API.
//
// Regresi berbahaya pernah terjadi: schema memakai field "text" sementara
// kedua klien mengirim content/hashtags/firstComment. Zod strip key asing +
// "text required" → semua request create-post ditolak padahal klien benar.
// Test ini mengunci kontrak agar schema tidak lagi drift dari klien.
//
// Regresi kedua (1 Okt 2026): web app mengirim `null` EKSPLISIT untuk
// audioTrackId (tanpa sound) dan scheduledAt (mode draft), sementara schema
// memakai `.optional()` saja — Zod menolak null dengan
// "audioTrackId: Invalid input: expected string, received null" sehingga
// publish gagal TOTAL sebelum platform mana pun dipanggil. Payload klien
// di bawah menyalin bentuk asli `submitPost()` di use-compose-form.ts.

import { describe, expect, it } from "vitest";
import { createPostSchema } from "./posts";

const validPayload = {
  content: "Caption utama",
  scheduledAt: new Date().toISOString(),
  items: [
    {
      socialAccountId: "acc_1",
      content: "Caption per platform",
      hashtags: ["bali", "travel"],
      firstComment: "Pertamax!",
      mediaIds: ["media_1", "media_2"],
      platformSettings: { tiktok_privacy: "PUBLIC" },
    },
  ],
};

/** Bentuk persis yang dikirim `submitPost()` — termasuk null eksplisit. */
function webClientPayload(scheduleMode: "now" | "schedule" | "draft") {
  return {
    content: "Caption utama",
    scheduledAt:
      scheduleMode === "now"
        ? new Date().toISOString()
        : scheduleMode === "schedule"
          ? new Date(Date.now() + 3_600_000).toISOString()
          : null,
    // soundTrack tidak dipilih → `soundTrack?.id ?? null`
    audioTrackId: null,
    productIds: [],
    items: [
      {
        socialAccountId: "acc_1",
        content: "Caption utama",
        hashtags: [],
        mediaIds: ["media_1"],
        firstComment: undefined,
        platformSettings: { privacy: "SELF_ONLY" },
      },
    ],
  };
}

describe("createPostSchema — kontrak klien", () => {
  it("menerima payload web app / CreatePostItem (content, hashtags, firstComment)", () => {
    const parsed = createPostSchema.parse(validPayload);

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.content).toBe("Caption per platform");
    expect(parsed.items[0]?.hashtags).toEqual(["bali", "travel"]);
    expect(parsed.items[0]?.firstComment).toBe("Pertamax!");
    expect(parsed.items[0]?.mediaIds).toEqual(["media_1", "media_2"]);
  });

  it("field opsional boleh kosong (draft tanpa jadwal, tanpa caption per item)", () => {
    const parsed = createPostSchema.parse({
      items: [{ socialAccountId: "acc_1", mediaIds: [] }],
    });

    expect(parsed.items[0]?.content).toBeUndefined();
    // default [] — bukan undefined (kolom DB tidak nullable)
    expect(parsed.items[0]?.hashtags).toEqual([]);
    expect(parsed.productIds).toEqual([]);
    expect(parsed.scheduledAt).toBeUndefined();
  });

  it("menolak item tanpa socialAccountId", () => {
    expect(() => createPostSchema.parse({ items: [{ mediaIds: [] }] })).toThrowError();
  });

  it("menolak payload tanpa items (minimal 1 platform wajib)", () => {
    expect(() => createPostSchema.parse({ content: "tanpa item" })).toThrowError();
  });

  // ---- Regresi 1 Okt 2026: null eksplisit dari web app ----

  it.each(["now", "schedule", "draft"] as const)(
    "menerima payload asli web app mode %s (audioTrackId: null)",
    (mode) => {
      const parsed = createPostSchema.parse(webClientPayload(mode));

      expect(parsed.audioTrackId).toBeNull();
      expect(parsed.items).toHaveLength(1);
      if (mode === "draft") expect(parsed.scheduledAt).toBeNull();
    },
  );

  it("audioTrackId null tidak lagi ditolak (pesan lama: expected string, received null)", () => {
    expect(() => createPostSchema.parse({ audioTrackId: null, items: [] })).not.toThrowError();
  });

  it("scheduledAt null tidak lagi ditolak (mode draft)", () => {
    expect(() =>
      createPostSchema.parse({ scheduledAt: null, items: [{ socialAccountId: "acc_1" }] }),
    ).not.toThrowError();
  });

  it("tetap menolak tipe yang benar-benar salah (audioTrackId angka)", () => {
    expect(() => createPostSchema.parse({ audioTrackId: 42, items: [] })).toThrowError();
  });
});
