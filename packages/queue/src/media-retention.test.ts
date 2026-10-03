// Test klasifikasi objek R2 untuk rekonsiliasi media.
//
// MENGAPA PENTING: satu-satunya cara job ini bisa merusak data user adalah bila
// ia salah mengira keluaran fitur lain (subtitle, PDF carousel, hasil render)
// sebagai "media yatim" lalu menghapusnya. Test di bawah mengunci batas itu:
// hanya basename berpola `sk_media_*` yang pernah boleh dihapus, dan hanya bila
// barisnya benar-benar hilang dari DB serta sudah lewat masa tenggang.
import { describe, expect, it } from "vitest";
import {
  basenameOf,
  classifyMediaObject,
  isMediaLibraryKey,
  isOrganizationPrefix,
  MEDIA_ORPHAN_GRACE_DAYS,
} from "./media-retention";

const ORG = "org_abc123";
const NOW = new Date("2026-10-03T12:00:00.000Z");

/** Helper: bikin key bergaya produksi `{orgId}/{yyyy}/{mm}/{basename}`. */
function keyOf(basename: string): string {
  return `${ORG}/2026/10/${basename}`;
}

/** Helper: tanggal `n` hari sebelum NOW. */
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

const NO_KNOWN: ReadonlySet<string> = new Set<string>();

describe("basenameOf", () => {
  it("mengambil segmen terakhir dari key ber-prefix", () => {
    expect(basenameOf("org/2026/10/sk_media_abc.jpg")).toBe("sk_media_abc.jpg");
  });

  it("mengembalikan key apa adanya bila tidak ada slash", () => {
    expect(basenameOf("sk_media_abc.jpg")).toBe("sk_media_abc.jpg");
  });

  it("tidak terganggu trailing slash (key folder)", () => {
    expect(basenameOf("org/2026/10/")).toBe("");
  });
});

describe("isMediaLibraryKey", () => {
  it("mengenali file pustaka media", () => {
    expect(isMediaLibraryKey(keyOf("sk_media_ztcydgxae1.jpg"))).toBe(true);
    expect(isMediaLibraryKey(keyOf("sk_media_ztcydgxae1.mp4"))).toBe(true);
    expect(isMediaLibraryKey(keyOf("sk_media_9f0a1b2c3d.png"))).toBe(true);
  });

  it("menolak keluaran fitur lain yang tinggal di folder yang sama", () => {
    // Keluarga inilah yang dulu hampir dihapus oleh job berbasis "tidak ada di
    // tabel media" — subtitle dan PDF memang tidak pernah muncul di tabel itu.
    const artifacts = [
      "render_job123.mp4",
      "render_job123_thumb.jpg",
      "render_job123.srt",
      "clipper_job123.srt",
      "carousel_job123.pdf",
      "carousel_job123_slide_1.jpg",
      "carousel_job123_slideshow.mp4",
      "12345678.jpg", // media stok (Pixabay/Pexels)
    ];
    for (const name of artifacts) {
      expect(isMediaLibraryKey(keyOf(name)), `${name} bukan file pustaka`).toBe(false);
    }
  });

  it("menolak nama yang hanya mirip (prefix tapi tanpa ekstensi)", () => {
    expect(isMediaLibraryKey(keyOf("sk_media_abc"))).toBe(false);
    expect(isMediaLibraryKey(keyOf("sk_media_.jpg"))).toBe(false);
    expect(isMediaLibraryKey(keyOf("xsk_media_abc.jpg"))).toBe(false);
  });
});

describe("classifyMediaObject", () => {
  it("key yang tercatat di DB selalu 'known' — walau sangat tua", () => {
    const key = keyOf("sk_media_abc.jpg");
    const verdict = classifyMediaObject({ key, lastModified: daysAgo(9999) }, new Set([key]), NOW);
    expect(verdict).toBe("known");
  });

  it("'known' menang atas segalanya, termasuk objek non-pustaka", () => {
    // Bila DB ternyata mencatat key ini (mis. thumbnail media), jangan sentuh.
    const key = keyOf("render_job123_thumb.jpg");
    expect(classifyMediaObject({ key, lastModified: daysAgo(9999) }, new Set([key]), NOW)).toBe(
      "known",
    );
  });

  it("yatim di dalam masa tenggang → 'held'", () => {
    const key = keyOf("sk_media_orphan1.jpg");
    expect(classifyMediaObject({ key, lastModified: daysAgo(1) }, NO_KNOWN, NOW)).toBe("held");
    expect(classifyMediaObject({ key, lastModified: daysAgo(13) }, NO_KNOWN, NOW)).toBe("held");
  });

  it("yatim lewat masa tenggang → 'orphan'", () => {
    const key = keyOf("sk_media_orphan2.jpg");
    expect(classifyMediaObject({ key, lastModified: daysAgo(15) }, NO_KNOWN, NOW)).toBe("orphan");
    expect(classifyMediaObject({ key, lastModified: daysAgo(400) }, NO_KNOWN, NOW)).toBe("orphan");
  });

  it("tepat di batas 14 hari sudah 'orphan' — batas inklusif", () => {
    // Konvensi sama dengan retention.ts: "tepat di deadline" berarti sudah
    // lewat. Dikunci di test supaya tidak diam-diam bergeser jadi 15 hari.
    const key = keyOf("sk_media_orphan3.jpg");
    expect(classifyMediaObject({ key, lastModified: daysAgo(14) }, NO_KNOWN, NOW)).toBe("orphan");
    // Sehari lebih muda masih ditahan.
    expect(classifyMediaObject({ key, lastModified: daysAgo(13) }, NO_KNOWN, NOW)).toBe("held");
  });

  it("non-pustaka tidak pernah 'orphan' — dilaporkan sebagai 'unknown'", () => {
    const artifacts = [
      "render_job123.mp4",
      "render_job123.srt",
      "clipper_job123.srt",
      "carousel_job123.pdf",
      "carousel_job123_slide_2.jpg",
      "carousel_job123_slideshow.mp4",
      "87654321.jpg",
    ];
    for (const name of artifacts) {
      expect(
        classifyMediaObject({ key: keyOf(name), lastModified: daysAgo(9999) }, NO_KNOWN, NOW),
        `${name} harus 'unknown' walau sangat tua`,
      ).toBe("unknown");
    }
  });

  it("lastModified null → 'unknown', tidak menebak", () => {
    const key = keyOf("sk_media_abc.jpg");
    expect(classifyMediaObject({ key, lastModified: null }, NO_KNOWN, NOW)).toBe("unknown");
  });

  it("lastModified null tetap 'unknown' meski DB tidak mengenalnya", () => {
    // Kasus nyata: R2 kadang tidak mengirim LastModified. Tanpa waktu kita tidak
    // bisa membuktikan objek sudah lewat tenggang → jangan hapus.
    expect(
      classifyMediaObject(
        { key: keyOf("sk_media_baru.jpg"), lastModified: null },
        new Set([keyOf("sk_media_lain.jpg")]),
        NOW,
      ),
    ).toBe("unknown");
  });

  it("menghormati graceDays kustom (lebih ketat maupun lebih longgar)", () => {
    const key = keyOf("sk_media_abc.jpg");
    const threeDaysAgo = { key, lastModified: daysAgo(3) };
    expect(classifyMediaObject(threeDaysAgo, NO_KNOWN, NOW, 1)).toBe("orphan");
    expect(classifyMediaObject(threeDaysAgo, NO_KNOWN, NOW, 30)).toBe("held");
  });

  it("graceDays 0 → semua yatim langsung 'orphan' (mode tanpa tenggang)", () => {
    const key = keyOf("sk_media_abc.jpg");
    expect(classifyMediaObject({ key, lastModified: daysAgo(0) }, NO_KNOWN, NOW, 0)).toBe("orphan");
    expect(classifyMediaObject({ key, lastModified: daysAgo(1) }, NO_KNOWN, NOW, 0)).toBe("orphan");
  });
});

describe("isOrganizationPrefix", () => {
  it("menerima id organisasi better-auth (32 alfanumerik)", () => {
    expect(isOrganizationPrefix("Jtjrg5zR68T1OAQgo3rGWM4e4RwoNciT/")).toBe(true);
    expect(isOrganizationPrefix("Jtjrg5zR68T1OAQgo3rGWM4e4RwoNciT")).toBe(true);
  });

  it("menolak namespace non-organisasi seperti dfm/", () => {
    // Bucket berisi prefix root `dfm/`. Job tidak boleh menelusuri (apalagi
    // menghapus) isinya — itu namespace aplikasi lain, bukan folder org.
    expect(isOrganizationPrefix("dfm/")).toBe(false);
    expect(isOrganizationPrefix("dfm")).toBe(false);
    expect(isOrganizationPrefix("assets/")).toBe(false);
    expect(isOrganizationPrefix("tmp/")).toBe(false);
  });

  it("menolak prefix kosong atau ber-slash bersarang", () => {
    expect(isOrganizationPrefix("/")).toBe(false);
    expect(isOrganizationPrefix("")).toBe(false);
    expect(isOrganizationPrefix("org/2026/")).toBe(false);
  });

  it("menolak nama dengan karakter di luar alfanumerik/-/_", () => {
    expect(isOrganizationPrefix("org dengan spasi/")).toBe(false);
    expect(isOrganizationPrefix("org.id.dengan.titik/")).toBe(false);
  });
});

describe("MEDIA_ORPHAN_GRACE_DAYS", () => {
  it("14 hari — disetujui user (bukan 7 hari usulan awal)", () => {
    expect(MEDIA_ORPHAN_GRACE_DAYS).toBe(14);
  });

  it("berbeda dari batas retensi platform (30 hari) — domainnya beda", () => {
    // File media = unggahan user, bukan data platform. Masa tenggang di sini
    // murni margin operasional, jadi tidak boleh disamakan dengan 30 hari.
    expect(MEDIA_ORPHAN_GRACE_DAYS).not.toBe(30);
  });
});
