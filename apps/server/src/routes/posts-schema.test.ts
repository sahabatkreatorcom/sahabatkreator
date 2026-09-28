// Test kontrak POST /posts — shape payload yang dikirim web app & public API.
//
// Regresi berbahaya pernah terjadi: schema memakai field "text" sementara
// kedua klien mengirim content/hashtags/firstComment. Zod strip key asing +
// "text required" → semua request create-post ditolak padahal klien benar.
// Test ini mengunci kontrak agar schema tidak lagi drift dari klien.

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
});
