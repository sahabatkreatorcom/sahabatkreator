// E2E verifikasi Sound Library — schema audioTrack, validasi durasi riil, list featured+mine.
// Jalankan: bun scripts/verify-sound.ts (dari apps/server)
//
// Catatan: upload via R2 tidak diuji di sini (butuh konfigurasi R2 aktif + file audio
// nyata) — yang diverifikasi adalah layer DB + relasi postGroup.audioTrackId.
// Skenario:
// 1. Seed org + track milik org + featured track (organizationId null)
// 2. postGroup dengan audioTrackId — relasi tersimpan
// 3. Hapus track → postGroup.audioTrackId jadi null (ON DELETE SET NULL)
// 4. Cleanup

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { audioTrack, organization as orgTable, postGroup } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Seed
  const orgId = generateId("org");
  await db.insert(orgTable).values({
    id: orgId,
    name: "Verify Sound Org",
    slug: `verify-sound-${Date.now()}`,
    createdAt: new Date(),
  });

  // 1. Track milik org dengan durasi riil + waveform
  const trackId = generateId("audio");
  await db.insert(audioTrack).values({
    id: trackId,
    organizationId: orgId,
    name: "Upbeat Morning",
    url: "https://example.com/audio/upbeat.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: 2_400_000,
    durationSeconds: 97,
    waveformData: [0.1, 0.5, 0.8, 0.4, 0.2],
    isFeatured: false,
    category: "upbeat",
  });
  const featuredId = generateId("audio");
  await db.insert(audioTrack).values({
    id: featuredId,
    organizationId: null, // featured sistem
    name: "Chill Lofi (Featured)",
    url: "https://example.com/audio/chill.mp3",
    durationSeconds: 180,
    isFeatured: true,
    category: "chill",
  });
  const [trackRow] = await db.select().from(audioTrack).where(eq(audioTrack.id, trackId));
  pass(
    "insert track milik org",
    trackRow !== undefined &&
      trackRow.durationSeconds === 97 &&
      trackRow.waveformData?.length === 5 &&
      trackRow.organizationId === orgId,
    `duration=${trackRow?.durationSeconds} (harus 97), waveform=${trackRow?.waveformData?.length} sampel, org=${trackRow?.organizationId === orgId}`,
  );

  // 2. postGroup dengan audioTrackId
  const groupId = generateId("postgrp");
  await db.insert(postGroup).values({
    id: groupId,
    organizationId: orgId,
    content: "Video dengan sound upbeat",
    audioTrackId: trackId,
    createdByUserId: null,
  });
  const [groupRow] = await db.select().from(postGroup).where(eq(postGroup.id, groupId));
  pass(
    "postGroup relasi audioTrackId",
    groupRow?.audioTrackId === trackId,
    `audioTrackId=${groupRow?.audioTrackId} (harus ${trackId})`,
  );

  // 3. Hapus track → postGroup.audioTrackId null (SET NULL)
  await db.delete(audioTrack).where(eq(audioTrack.id, trackId));
  const [groupAfter] = await db.select().from(postGroup).where(eq(postGroup.id, groupId));
  pass(
    "hapus track → SET NULL",
    groupAfter?.audioTrackId === null,
    `audioTrackId=${groupAfter?.audioTrackId} (harus null)`,
  );

  // 4. Featured track tidak terhapus cascade org
  await db.delete(orgTable).where(eq(orgTable.id, orgId));
  const [featuredAfter] = await db.select().from(audioTrack).where(eq(audioTrack.id, featuredId));
  pass(
    "featured track bertahan cascade org",
    featuredAfter !== undefined,
    `featured masih ada: ${featuredAfter !== undefined}`,
  );

  // Cleanup featured
  await db.delete(audioTrack).where(eq(audioTrack.id, featuredId));
  console.log("\nSelesai — cleanup OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
