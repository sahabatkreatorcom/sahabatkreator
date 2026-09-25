// Creator info TikTok untuk Compose — wajib saat merender panel pengaturan
// TikTok (Content Sharing Guidelines #1): nickname akun target, opsi privacy
// yang valid, status interaksi, dan batas durasi video.
//
// Rate limit upstream 20 req/menit per token → cache 5 menit, retry 1.
// Akun terblokir (409: kuota harian / spam risk) TIDAK di-retry.

import { useQueries } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";

export type TikTokCreatorInfo = {
  creatorUsername: string | null;
  creatorNickname: string | null;
  creatorAvatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
};

export type TikTokCreatorInfoState =
  | { status: "loading" }
  | { status: "ready"; info: TikTokCreatorInfo }
  /** API bilang user/client tidak bisa posting lagi — publish harus berhenti */
  | { status: "blocked"; code: string; message: string }
  | { status: "error"; message: string };

const STALE_MS = 5 * 60_000;

async function fetchCreatorInfo(accountId: string): Promise<TikTokCreatorInfo> {
  return api.get<TikTokCreatorInfo>(
    `/tiktok/creator-info?accountId=${encodeURIComponent(accountId)}`,
  );
}

/**
 * Ambil creator_info untuk daftar akun TikTok terpilih.
 * Return Record<accountId, state> — akun non-TikTok / tanpa id tidak dikirim.
 */
export function useTikTokCreatorInfo(accountIds: string[]): Record<string, TikTokCreatorInfoState> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["tiktok-creator-info", id],
      queryFn: () => fetchCreatorInfo(id),
      staleTime: STALE_MS,
      gcTime: STALE_MS,
      retry: (failureCount: number, error: unknown) => {
        // 4xx (token expired, akun diblokir, dsb) jangan di-retry
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 1;
      },
    })),
  });

  const map: Record<string, TikTokCreatorInfoState> = {};
  ids.forEach((id, index) => {
    const q = results[index];
    if (!q || q.isPending) {
      map[id] = { status: "loading" };
      return;
    }
    if (q.data) {
      map[id] = { status: "ready", info: q.data };
      return;
    }
    const error = q.error;
    if (error instanceof ApiError && error.status === 409) {
      map[id] = {
        status: "blocked",
        code: error.code ?? "tiktok_blocked",
        message: error.message,
      };
      return;
    }
    map[id] = {
      status: "error",
      message: error instanceof Error ? error.message : "Gagal memuat info kreator TikTok",
    };
  });
  return map;
}
