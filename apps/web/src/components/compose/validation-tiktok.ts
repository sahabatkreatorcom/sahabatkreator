// Aturan validasi khusus TikTok — dipisah dari validation-panel agar panel
// tetap ringkas. Mencakup syarat audit Content Posting API:
// - creator_info wajib termuat sebelum publish (opsi privacy + batas durasi)
// - privacy wajib dipilih & harus termasuk privacy_level_options akun
// - disclosure komersial wajib memilih minimal satu opsi bila toggle aktif
// - branded content tidak boleh private
// - deklarasi Music Usage Confirmation wajib dicentang
// - durasi video dibandingkan max_video_post_duration_sec dari API

import type { TikTokCreatorInfoState } from "@/hooks/use-tiktok-creator-info";
import type {
  ValidationAccount,
  ValidationIssue,
  ValidationMedia,
  ValidationPlatformSettings,
} from "./validation-panel";

/** Fallback durasi bila API tidak mengembalikan max_video_post_duration_sec */
export const TIKTOK_FALLBACK_MAX_DURATION_SEC = 60;
/** Batas karakter judul post foto TikTok */
export const TIKTOK_PHOTO_TITLE_LIMIT = 90;

type Input = {
  account: ValidationAccount;
  settings?: ValidationPlatformSettings;
  media: ValidationMedia[];
  creator: TikTokCreatorInfoState | undefined;
  scheduleMode: "now" | "schedule" | "draft";
};

function issue(message: string): ValidationIssue {
  return { severity: "error", platform: "tiktok", message };
}

function warn(message: string): ValidationIssue {
  return { severity: "warning", platform: "tiktok", message };
}

export function validateTikTokPost(input: Input): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { settings, creator, media, scheduleMode } = input;
  // Draft hanya disimpan, tidak dipublish — persyaratan publish belum berlaku
  const publishing = scheduleMode !== "draft";

  // ---- Format foto (berlaku untuk draft juga — sifat media, bukan persyaratan publish)
  const imageMedia = media.filter((m) => m.mimeType.startsWith("image/"));
  for (const image of imageMedia) {
    if (image.mimeType !== "image/jpeg" && image.mimeType !== "image/webp") {
      issues.push(
        issue(
          `TikTok hanya mendukung foto JPEG/WebP — ada foto berformat ${image.mimeType}. Buka editor gambar atau gunakan resize untuk mengonversinya ke JPEG.`,
        ),
      );
    }
  }

  const title = settings?.tiktokTitle?.trim();
  if (title && title.length > TIKTOK_PHOTO_TITLE_LIMIT) {
    issues.push(
      issue(`Judul post foto ${title.length} karakter melebihi batas TikTok (maks 90).`),
    );
  }

  if (!publishing) return issues;

  // ---- creator_info wajib sebelum publish (Content Sharing Guidelines #1)
  if (!creator || creator.status === "loading") {
    issues.push(
      issue(
        "Info akun TikTok belum termuat — buka panel Pengaturan Platform dan tunggu info kreator selesai dimuat.",
      ),
    );
    return issues;
  }
  if (creator.status === "blocked") {
    issues.push(issue(creator.message));
    return issues;
  }
  if (creator.status === "error") {
    issues.push(
      issue(
        `Gagal memuat info akun TikTok (${creator.message}) — klik "Ulangi" di panel Pengaturan Platform.`,
      ),
    );
    return issues;
  }

  const info = creator.info;

  // ---- Privacy: wajib dipilih, tanpa default, harus valid untuk akun ini
  const privacy = settings?.tiktokPrivacy?.trim();
  if (!privacy) {
    issues.push(issue("Pilih status privasi TikTok (Siapa yang bisa menonton) sebelum publish."));
  } else if (info.privacyLevelOptions.length > 0 && !info.privacyLevelOptions.includes(privacy)) {
    issues.push(
      issue(
        `Status privasi "${privacy}" tidak tersedia untuk akun ini — pilih salah satu dari opsi yang tersedia.`,
      ),
    );
  }

  // ---- Disclosure konten komersial (guideline #3a)
  if (settings?.tiktokDisclosure) {
    if (!settings.tiktokBrandOrganic && !settings.tiktokBrandContent) {
      issues.push(
        issue(
          "Disclosure konten komersial aktif — pilih minimal satu: merek sendiri atau branded content.",
        ),
      );
    }
    if (settings.tiktokBrandContent && privacy === "SELF_ONLY") {
      issues.push(
        issue("Branded content tidak boleh private — ubah status privasi menjadi publik/followers."),
      );
    }
  }

  // ---- Deklarasi Music Usage Confirmation (wajib sebelum publish)
  if (!settings?.tiktokMusicConsent) {
    issues.push(
      issue(
        "Centang persetujuan Music Usage Confirmation TikTok di atas tombol publish sebelum posting.",
      ),
    );
  }

  // ---- Durasi video vs batas akun
  const maxDuration = info.maxVideoPostDurationSec ?? TIKTOK_FALLBACK_MAX_DURATION_SEC;
  const videoMedia = media.filter((m) => m.mimeType.startsWith("video/"));
  for (const video of videoMedia) {
    if (video.durationSeconds == null || video.durationSeconds <= 0) {
      issues.push(
        warn(
          "Durasi video tidak diketahui — pastikan video tidak melebihi batas durasi akun TikTok sebelum publish.",
        ),
      );
      continue;
    }
    if (video.durationSeconds > maxDuration) {
      issues.push(
        issue(
          `Durasi video ${Math.round(video.durationSeconds)} detik melebihi batas akun TikTok (${maxDuration} detik) — potong video atau gunakan video lain.`,
        ),
      );
    }
  }

  return issues;
}
