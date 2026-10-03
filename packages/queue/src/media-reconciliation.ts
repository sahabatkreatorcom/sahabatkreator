// Rekonsiliasi R2 ↔ tabel `media`: cari objek yatim lalu hapus yang sudah lewat
// masa tenggang.
//
// MENGAPA JOB INI ADA
// Sumber utama objek yatim adalah bug urutan di `DELETE /media/:id`: baris DB
// dihapus LEBIH DULU, baru `deleteObject()` dipanggil dengan `.catch()` yang
// menelan error. Bila panggilan R2 gagal (jaringan, kredensial, 5xx), baris DB
// sudah hilang — berikut `storage_key` satu-satunya petunjuk letak objeknya —
// sehingga tidak ada lagi yang bisa mengulang penghapusan. Objek itu jadi yatim
// permanen. Urutan itu sudah dibalik (objek dulu, baris DB belakangan), tapi
// objek yatim yang terlanjur ada tetap perlu disapu. Itulah tugas job ini.
//
// BATAS TANGGUNG JAWAB (penting)
// Hanya objek dengan basename berpola pustaka media (`sk_media_*`) yang pernah
// dihapus. Satu folder organisasi juga berisi subtitle, PDF carousel, dan hasil
// render yang MEMANG tidak punya baris di `media`; menghapusnya berarti
// menghancurkan hasil kerja user. Objek seperti itu dilaporkan sebagai
// `unknown` dan tidak pernah disentuh. Aturan ini hidup di `media-retention.ts`
// dan diuji terpisah.

import { db } from "@sahabatkreator/db";
import { audioTrack, media, videoJob } from "@sahabatkreator/db/schema";
import {
  classifyMediaObject,
  isOrganizationPrefix,
  MEDIA_ORPHAN_GRACE_DAYS,
} from "./media-retention";
import {
  deleteObjectByKey,
  isR2Configured,
  listObjectsUnderPrefix,
  listTopLevelPrefixes,
  type R2ObjectInfo,
} from "./r2";

/**
 * Batas jumlah penghapusan per putaran.
 *
 * Job ini menghapus file milik user; bila logika klasifikasi suatu saat salah,
 * tanpa batas ia bisa mengosongkan bucket dalam satu malam. Dengan batas ini
 * kerusakan dibatasi dan sisanya menunggu putaran berikutnya (setelah ada yang
 * memeriksa laporan). Sengaja TIDAK dapat dilampaui lewat parameter HTTP.
 */
const MAX_DELETES_PER_RUN = 500;

/** Batas jumlah contoh objek yang dilaporkan per kategori (hasil tetap dihitung penuh). */
const MAX_REPORTED_PER_CATEGORY = 50;

export type ReconciledObject = {
  key: string;
  size: number;
  lastModified: Date | null;
};

export type MediaReconciliationResult = {
  dryRun: boolean;
  graceDays: number;
  orgsScanned: number;
  /** Prefix level teratas yang bukan folder organisasi (mis. `dfm/`) — dilewati. */
  prefixesSkipped: string[];
  objectsScanned: number;
  knownCount: number;
  heldCount: number;
  orphanCount: number;
  unknownCount: number;
  orphanBytes: number;
  /** Objek yang benar-benar dihapus. Kosong saat dryRun. */
  deleted: ReconciledObject[];
  /** Kandidat hapus yang tidak jadi dihapus karena batas per putaran. */
  deleteSkippedByLimit: number;
  /** Contoh kandidat hapus (terisi juga saat dryRun — inilah gunanya dry-run). */
  orphans: ReconciledObject[];
  held: ReconciledObject[];
  unknown: ReconciledObject[];
  errors: string[];
};

export type ReconcileMediaOptions = {
  now?: Date;
  graceDays?: number;
  /** Batasi ke organisasi tertentu — untuk uji coba. Default: semua prefix org. */
  orgIds?: string[];
  /** true = hitung dan laporkan saja, jangan hapus. */
  dryRun?: boolean;
  /** Batasi jumlah prefix organisasi yang diproses (untuk uji bertahap). */
  limitOrgs?: number;
};

/**
 * Ambil storage key dari URL R2.
 *
 * Duplikat kecil dari helper di `apps/server/src/routes/media.ts` (paket ini
 * tidak boleh mengimpor dari `apps/`). Dipakai untuk memulihkan key thumbnail
 * dari kolom `thumbnail_url`, yang hanya menyimpan URL — bukan key.
 */
function storageKeyFromUrl(url: string | null, organizationId: string): string | null {
  if (!url) return null;
  const idx = url.indexOf(`/${organizationId}/`);
  return idx >= 0 ? url.slice(idx + 1) : null;
}

/**
 * Semua key R2 yang tercatat di DB, dari seluruh organisasi dalam satu kali
 * jalan (bukan per organisasi) supaya tidak ada N+1 query.
 *
 * Cakupannya sengaja lebih luas dari sekadar `media.storage_key`:
 * - `media.thumbnail_url` — thumbnail adalah objek R2 terpisah yang tidak
 *   muncul di kolom key mana pun.
 * - `media.url` — biasanya sama dengan storage_key, tapi ikut dimasukkan agar
 *   tidak ada objek yang terhapus hanya karena bentuk URL-nya berbeda.
 * - `video_job.srt_storage_key` — subtitle hasil render. Tidak akan pernah
 *   diklasifikasi sebagai yatim (basename-nya bukan `sk_media_*`), tapi
 *   mencantumkannya membuat laporan `unknown` lebih bersih.
 * - `audio_track.storage_key` — audio BGM, termasuk milik org.
 *
 * Key yang tidak dikenal hanya membuat klasifikasi lebih konservatif, jadi
 * menambah cakupan di sini selalu aman.
 */
async function collectKnownKeys(): Promise<Set<string>> {
  const known = new Set<string>();

  const mediaRows = await db
    .select({
      organizationId: media.organizationId,
      storageKey: media.storageKey,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
    })
    .from(media);

  for (const row of mediaRows) {
    known.add(row.storageKey);
    const fromUrl = storageKeyFromUrl(row.url, row.organizationId);
    if (fromUrl) known.add(fromUrl);
    const fromThumb = storageKeyFromUrl(row.thumbnailUrl, row.organizationId);
    if (fromThumb) known.add(fromThumb);
  }

  const srtRows = await db.select({ key: videoJob.srtStorageKey }).from(videoJob);
  for (const row of srtRows) {
    if (row.key) known.add(row.key);
  }

  const audioRows = await db.select({ key: audioTrack.storageKey }).from(audioTrack);
  for (const row of audioRows) {
    if (row.key) known.add(row.key);
  }

  return known;
}

/**
 * Sapu objek yatim di R2.
 *
 * Aman dipanggil berulang: objek yang sudah dihapus tidak muncul lagi di
 * listing, dan objek yang masih di dalam masa tenggang dibiarkan. Tidak ada
 * state yang disimpan — kebenarannya selalu R2 + tabel `media`.
 */
export async function reconcileMediaObjects(
  options: ReconcileMediaOptions = {},
): Promise<MediaReconciliationResult> {
  const now = options.now ?? new Date();
  const graceDays = options.graceDays ?? MEDIA_ORPHAN_GRACE_DAYS;
  const dryRun = options.dryRun ?? false;

  const result: MediaReconciliationResult = {
    dryRun,
    graceDays,
    orgsScanned: 0,
    prefixesSkipped: [],
    objectsScanned: 0,
    knownCount: 0,
    heldCount: 0,
    orphanCount: 0,
    unknownCount: 0,
    orphanBytes: 0,
    deleted: [],
    deleteSkippedByLimit: 0,
    orphans: [],
    held: [],
    unknown: [],
    errors: [],
  };

  if (!isR2Configured()) {
    result.errors.push("R2 belum dikonfigurasi — rekonsiliasi dilewati.");
    return result;
  }

  const knownKeys = await collectKnownKeys();

  const prefixes = await listTopLevelPrefixes();
  const orgPrefixes = prefixes.filter(isOrganizationPrefix);
  result.prefixesSkipped = prefixes.filter((p) => !isOrganizationPrefix(p));

  let targets = orgPrefixes;
  if (options.orgIds?.length) {
    const wanted = new Set(options.orgIds.map((id) => `${id}/`));
    targets = orgPrefixes.filter((p) => wanted.has(p));
  }
  if (options.limitOrgs && options.limitOrgs > 0) {
    targets = targets.slice(0, options.limitOrgs);
  }

  for (const prefix of targets) {
    const organizationId = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    result.orgsScanned += 1;

    let objects: R2ObjectInfo[];
    try {
      objects = await listObjectsUnderPrefix(prefix);
    } catch (err) {
      result.errors.push(`${organizationId}: gagal daftar objek — ${describe(err)}`);
      continue;
    }

    for (const object of objects) {
      result.objectsScanned += 1;
      const info: ReconciledObject = {
        key: object.key,
        size: object.size,
        lastModified: object.lastModified,
      };

      const verdict = classifyMediaObject(object, knownKeys, now, graceDays);

      if (verdict === "known") {
        result.knownCount += 1;
        continue;
      }
      if (verdict === "held") {
        result.heldCount += 1;
        pushCapped(result.held, info);
        continue;
      }
      if (verdict === "unknown") {
        result.unknownCount += 1;
        pushCapped(result.unknown, info);
        continue;
      }

      // verdict === "orphan"
      result.orphanCount += 1;
      result.orphanBytes += object.size;
      pushCapped(result.orphans, info);

      if (dryRun) continue;
      if (result.deleted.length >= MAX_DELETES_PER_RUN) {
        result.deleteSkippedByLimit += 1;
        continue;
      }

      try {
        await deleteObjectByKey(object.key);
        result.deleted.push(info);
      } catch (err) {
        // Satu objek gagal jangan menghentikan seluruh sapuan; key-nya tetap
        // dilaporkan lewat `orphans` sehingga bisa dicoba lagi nanti.
        result.errors.push(`${object.key}: gagal hapus — ${describe(err)}`);
      }
    }
  }

  return result;
}

function pushCapped(list: ReconciledObject[], item: ReconciledObject): void {
  if (list.length < MAX_REPORTED_PER_CATEGORY) list.push(item);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
