// Panel validasi pre-publish — cek aturan per platform secara client-side murni.
// Error = memblokir publish (tombol publish di-disable), warning = hanya peringatan.

import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ListChecks } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/** Akun yang dipilih di compose (subset field yang dipakai validasi) */
export type ValidationAccount = {
  id: string;
  platform: string;
  username: string;
};

/** Media yang dilampirkan ke compose */
export type ValidationMedia = {
  id: string;
  mimeType: string;
  /** Durasi video dalam detik — null bila bukan video / tidak diketahui */
  durationSeconds?: number | null;
};

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: ValidationSeverity;
  /** Platform terkait — null untuk issue umum (jadwal, akun, dsb) */
  platform: string | null;
  message: string;
};

export type ValidatePostInput = {
  /** Caption utama */
  content: string;
  /** String hashtag dipisah koma/spasi (format field input compose) */
  hashtags: string;
  /** Variasi caption custom per akun (accountId → caption, kosong = caption utama) */
  variations: Record<string, string>;
  /** Pengaturan khusus per akun (accountId → settings) */
  platformSettings: Record<string, ValidationPlatformSettings>;
  /** Akun yang dipilih */
  accounts: ValidationAccount[];
  /** Media yang dilampirkan (sudah di-filter dari mediaIds) */
  media: ValidationMedia[];
  /** ISO string / value datetime-local jadwal — null bila posting sekarang / draft */
  scheduledAt: string | null;
  /** Mode publish: now / schedule / draft */
  scheduleMode: "now" | "schedule" | "draft";
};

export type ValidationPlatformSettings = {
  postType?: "feed" | "story";
  youtubeTitle?: string;
  tiktokPrivacy?: string;
};

/** Batas caption per platform (karakter) — hardcode tabel aturan */
const CAPTION_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  x: 280,
  linkedin: 3000,
  tiktok: 2200,
  youtube: 5000,
  threads: 500,
  pinterest: 500,
  bluesky: 300,
  google_business: 1500,
  manual: 5000,
};

/** Batas panjang judul YouTube */
const YOUTUBE_TITLE_LIMIT = 100;
/** Batas panjang deskripsi video YouTube */
const YOUTUBE_DESCRIPTION_LIMIT = 5000;
/** Durasi maksimum video TikTok (detik) */
const TIKTOK_MAX_DURATION_SECONDS = 60;
/** Batas hashtag Instagram */
const INSTAGRAM_MAX_HASHTAGS = 30;
/** Batas media carousel Instagram */
const INSTAGRAM_MAX_CAROUSEL_MEDIA = 10;
/** Caption Facebook di atas nilai ini = warning (belum tentu gagal) */
const FACEBOOK_LONG_CAPTION_WARNING = 5000;

/** Hitung jumlah hashtag dari string input (pemisah koma/spasi, prefix # diabaikan) */
function countHashtags(hashtags: string): number {
  return hashtags
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean).length;
}

/** Caption efektif untuk sebuah akun — variasi custom bila diisi, fallback caption utama */
function effectiveCaption(account: ValidationAccount, input: ValidatePostInput): string {
  const variation = input.variations[account.id]?.trim();
  return variation || input.content;
}

/**
 * Validasi post sebelum publish — murni client-side, tanpa panggilan API.
 * Return daftar issue (error + warning). Error memblokir tombol publish.
 */
export function validatePost(input: ValidatePostInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const hasMedia = input.media.length > 0;

  // --- Validasi umum ---
  if (input.accounts.length === 0) {
    issues.push({
      severity: "error",
      platform: null,
      message: "Pilih minimal satu akun social media.",
    });
  }

  if (!input.content.trim() && !hasMedia) {
    issues.push({
      severity: "error",
      platform: null,
      message: "Konten kosong — tulis caption atau lampirkan media.",
    });
  }

  // Jadwal di masa lalu hanya relevan untuk mode schedule
  if (input.scheduleMode === "schedule" && input.scheduledAt) {
    const scheduled = new Date(input.scheduledAt);
    if (!Number.isNaN(scheduled.getTime()) && scheduled.getTime() < Date.now()) {
      issues.push({
        severity: "error",
        platform: null,
        message: "Jadwal berada di masa lalu — pilih waktu di masa depan.",
      });
    }
  }

  // --- Validasi per platform (akun terpilih) ---
  const hashtagCount = countHashtags(input.hashtags);
  const videoMedia = input.media.filter((m) => m.mimeType.startsWith("video/"));

  for (const account of input.accounts) {
    const platform = account.platform;
    const settings = input.platformSettings[account.id];
    const caption = effectiveCaption(account, input);
    const captionLength = caption.length;
    const limit = CAPTION_LIMITS[platform];

    // Batas caption per platform
    if (limit !== undefined && captionLength > limit) {
      issues.push({
        severity: "error",
        platform,
        message: `Caption ${captionLength} karakter melebihi batas ${platform === "x" ? "X" : (PLATFORMS[platform as keyof typeof PLATFORMS]?.label ?? platform)} (${limit}).`,
      });
    }

    if (platform === "instagram" || platform === "instagram_standalone") {
      // Hashtag maks 30
      if (hashtagCount > INSTAGRAM_MAX_HASHTAGS) {
        issues.push({
          severity: "error",
          platform: "instagram",
          message: `Jumlah hashtag ${hashtagCount} melebihi batas Instagram (maks ${INSTAGRAM_MAX_HASHTAGS}).`,
        });
      }
      // Story wajib media
      if (settings?.postType === "story" && !hasMedia) {
        issues.push({
          severity: "error",
          platform: "instagram",
          message: "Story Instagram membutuhkan media (gambar/video vertikal).",
        });
      }
      // Carousel maks 10 media (hanya untuk feed post)
      if (settings?.postType !== "story" && input.media.length > INSTAGRAM_MAX_CAROUSEL_MEDIA) {
        issues.push({
          severity: "error",
          platform: "instagram",
          message: `Media terlampir ${input.media.length} melebihi batas carousel Instagram (maks ${INSTAGRAM_MAX_CAROUSEL_MEDIA}).`,
        });
      }
    }

    if (platform === "tiktok") {
      // Durasi video maks 60 detik — cek bila durasi tersedia di objek media
      for (const video of videoMedia) {
        if (video.durationSeconds != null && video.durationSeconds > TIKTOK_MAX_DURATION_SECONDS) {
          issues.push({
            severity: "warning",
            platform: "tiktok",
            message: `Durasi video ${video.durationSeconds} detik melebihi 60 detik — post bisa dipotong otomatis oleh TikTok.`,
          });
        }
      }
      // Story/reel TikTok wajib video
      if (settings?.postType === "story" && videoMedia.length === 0) {
        issues.push({
          severity: "error",
          platform: "tiktok",
          message: "Story/Reel TikTok membutuhkan video — lampirkan minimal satu video.",
        });
      }
    }

    if (platform === "youtube") {
      // Judul wajib — diambil dari youtubeTitle atau fallback caption
      const title = settings?.youtubeTitle?.trim() || caption.trim();
      if (!title) {
        issues.push({
          severity: "error",
          platform: "youtube",
          message: "Judul video wajib diisi — isi kolom judul atau caption.",
        });
      } else if (title.length > YOUTUBE_TITLE_LIMIT) {
        issues.push({
          severity: "error",
          platform: "youtube",
          message: `Judul video ${title.length} karakter melebihi batas YouTube (maks ${YOUTUBE_TITLE_LIMIT}).`,
        });
      }
      // Deskripsi maks 5000 (caption dipakai sebagai deskripsi)
      if (captionLength > YOUTUBE_DESCRIPTION_LIMIT) {
        issues.push({
          severity: "error",
          platform: "youtube",
          message: `Deskripsi video ${captionLength} karakter melebihi batas YouTube (maks ${YOUTUBE_DESCRIPTION_LIMIT}).`,
        });
      }
    }

    if (platform === "pinterest") {
      // Pin wajib media
      if (!hasMedia) {
        issues.push({
          severity: "error",
          platform: "pinterest",
          message: "Pin Pinterest membutuhkan media — lampirkan gambar/video.",
        });
      }
    }

    if (platform === "facebook" && captionLength > FACEBOOK_LONG_CAPTION_WARNING) {
      issues.push({
        severity: "warning",
        platform: "facebook",
        message: `Caption sangat panjang (${captionLength} karakter) — post Facebook yang panjang cenderung mendapat engagement lebih rendah.`,
      });
    }
  }

  return issues;
}

/** Panel collapsible daftar issue validasi */
export function ValidationPanel({
  issues,
  defaultOpen = true,
}: {
  issues: ValidationIssue[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const hasErrors = errorCount > 0;

  // Status badge di header panel
  const statusBadge = hasErrors ? (
    <Badge variant="destructive" className="text-[10px]">
      {errorCount} error
    </Badge>
  ) : warningCount > 0 ? (
    <Badge variant="warning" className="text-[10px]">
      {warningCount} peringatan
    </Badge>
  ) : (
    <Badge variant="success" className="text-[10px]">
      Siap publish
    </Badge>
  );

  return (
    <div className={cn("card overflow-hidden", hasErrors && "border-[var(--error)]")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="flex items-center gap-2">
          <ListChecks
            className={cn(
              "h-4 w-4",
              hasErrors
                ? "text-[var(--error)]"
                : warningCount > 0
                  ? "text-[var(--warning)]"
                  : "text-[var(--text-muted)]",
            )}
          />
          <span className="font-semibold">Validasi ({issues.length})</span>
          {statusBadge}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--text-muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-[var(--border-light)] border-t">
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 px-6 py-4 text-[var(--text-secondary)] text-sm">
              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
              Semua aturan terpenuhi — konten siap dipublikasikan.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-light)]">
              {issues.map((issue, index) => {
                const cfg = issue.platform
                  ? PLATFORMS[issue.platform as keyof typeof PLATFORMS]
                  : undefined;
                const Icon = issue.severity === "error" ? AlertCircle : AlertTriangle;
                return (
                  <li
                    key={`${issue.platform ?? "umum"}-${index}`}
                    className="flex items-start gap-2.5 px-6 py-3"
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        issue.severity === "error"
                          ? "text-[var(--error)]"
                          : "text-[var(--warning)]",
                      )}
                    />
                    <p className="flex-1 text-[var(--text-secondary)] text-sm">{issue.message}</p>
                    {issue.platform && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[10px] text-[var(--text-secondary)]"
                        title={cfg?.label ?? issue.platform}
                      >
                        {cfg?.label ?? issue.platform}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
