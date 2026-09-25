// TikTok Content Posting API — /post/publish/creator_info/query/
// Wajib dipanggil saat merender halaman post ke TikTok (Content Sharing
// Guidelines #1): menampilkan nickname akun target, opsi privacy_level yang
// diizinkan akun, status interaksi (comment/duet/stitch), dan batas durasi
// video. Scope: video.publish. Rate limit: 20 req/menit per access token.

import { TIKTOK_PUBLISH_URL } from "./config";
import { httpRequest, throwFromResponse } from "./http";
import { PublishError } from "./types";

export type TikTokCreatorInfo = {
  creatorUsername: string | null;
  creatorNickname: string | null;
  creatorAvatarUrl: string | null;
  /** Opsi privacy yang valid untuk akun ini — UI wajib memakai daftar ini */
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  /** Batas durasi video (detik) — null bila tidak dikembalikan */
  maxVideoPostDurationSec: number | null;
};

type CreatorInfoResponse = {
  data?: {
    creator_avatar_url?: string;
    creator_username?: string;
    creator_nickname?: string;
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  };
  error?: { code?: string; message?: string; logid?: string; log_id?: string };
};

/**
 * Error code creator_info yang berarti posting DIBLOKIR — caller harus
 * menghentikan attempt publish dan meminta user mencoba nanti.
 * (Content Sharing Guidelines #1b: "creator cannot make more posts")
 */
export const TIKTOK_CREATOR_BLOCKED_CODES: Record<string, string> = {
  spam_risk_too_many_posts:
    "Batas post harian akun TikTok ini sudah tercapai — coba lagi lain waktu.",
  spam_risk_user_banned_from_posting:
    "Akun TikTok ini sedang dibatasi untuk posting baru — coba lagi lain waktu.",
  reached_active_user_cap:
    "Kuota pengguna aktif hari ini untuk aplikasi ini sudah penuh — coba lagi besok.",
};

/** Default fallback bila API tidak mengembalikan batas durasi */
export const TIKTOK_DEFAULT_MAX_DURATION_SEC = 60;

/** Panggil creator_info/query — lempar PublishError bila gagal / diblokir */
export async function fetchTikTokCreatorInfo(
  accessToken: string,
): Promise<TikTokCreatorInfo> {
  const res = await httpRequest<CreatorInfoResponse>(
    `${TIKTOK_PUBLISH_URL}/creator_info/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({}),
      retries: 1,
    },
  );
  if (!res.ok) await throwFromResponse(res, "TikTok creator info");
  const body = await res.json();
  const code = body.error?.code ?? "ok";
  if (code !== "ok") {
    const logid = body.error?.logid ?? body.error?.log_id;
    const blocked = TIKTOK_CREATOR_BLOCKED_CODES[code];
    throw new PublishError(
      `tiktok_${code}`,
      `${blocked ?? body.error?.message ?? code}${logid ? ` (log_id: ${logid})` : ""}`,
      false,
    );
  }

  const d = body.data ?? {};
  const options = Array.isArray(d.privacy_level_options)
    ? d.privacy_level_options.filter((v): v is string => typeof v === "string")
    : [];
  const maxDuration =
    typeof d.max_video_post_duration_sec === "number" &&
    Number.isFinite(d.max_video_post_duration_sec) &&
    d.max_video_post_duration_sec > 0
      ? d.max_video_post_duration_sec
      : null;

  return {
    creatorUsername: d.creator_username ?? null,
    creatorNickname: d.creator_nickname ?? null,
    creatorAvatarUrl: d.creator_avatar_url ?? null,
    privacyLevelOptions: options,
    commentDisabled: d.comment_disabled === true,
    duetDisabled: d.duet_disabled === true,
    stitchDisabled: d.stitch_disabled === true,
    maxVideoPostDurationSec: maxDuration,
  };
}
