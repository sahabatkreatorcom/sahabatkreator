// Panel pengaturan per platform di Compose — expose platformSettings + firstComment
// yang sudah didukung schema & pipeline (kolom jsonb platform_settings + first_comment).
// Field ditampilkan hanya untuk akun terpilih yang platformnya relevan.

import { ChevronDown, Settings2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type SettingsState = {
  firstComment: string;
  // Instagram/Facebook post type: feed (default) atau story (STORIES, 1 media, tanpa caption)
  postType?: "feed" | "story";
  // TikTok
  tiktokPrivacy?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  tiktokDisableComment?: boolean;
  tiktokDisableDuet?: boolean;
  tiktokDisableStitch?: boolean;
  // Label konten AI (AIGC) — wajib aktif bila konten dibuat/diedit AI secara signifikan
  tiktokIsAigc?: boolean;
  // YouTube
  youtubeTitle?: string;
  youtubePrivacy?: "public" | "unlisted" | "private";
  youtubeCategory?: string;
  youtubeMadeForKids?: boolean;
  /** Disclosure konten sintetis/AI di YouTube */
  youtubeSyntheticMedia?: boolean;
  // Pinterest
  pinterestLink?: string;
  // Facebook
  facebookLink?: string;
  // Threads: cross-post post ini ke Instagram Story
  threadsShareToIg?: boolean;
};

type AccountLite = { id: string; platform: string; username: string };

export function PlatformSettingsPanel({
  accounts,
  selectedAccountIds,
  settings,
  onChange,
}: {
  accounts: AccountLite[];
  selectedAccountIds: string[];
  settings: Record<string, SettingsState>;
  onChange: (accountId: string, next: SettingsState) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const selected = accounts.filter((a) => selectedAccountIds.includes(a.id));

  if (selected.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <Settings2 className="h-4 w-4 text-[var(--text-muted)]" />
        <h2 className="font-semibold">Pengaturan Platform</h2>
      </div>
      <p className="mb-4 text-[var(--text-muted)] text-xs">
        First comment & pengaturan khusus per platform (opsional)
      </p>

      <div className="space-y-2">
        {selected.map((account) => {
          const cfg = PLATFORMS[account.platform as keyof typeof PLATFORMS];
          const isOpen = open === account.id;
          const s = settings[account.id] ?? { firstComment: "" };
          const isTikTok = account.platform === "tiktok";
          const isYouTube = account.platform === "youtube";
          const isPinterest = account.platform === "pinterest";
          const isFacebook = account.platform === "facebook";
          const isThreads = account.platform === "threads";
          const isInstagram =
            account.platform === "instagram" || account.platform === "instagram_standalone";

          return (
            <div
              key={account.id}
              className="rounded-[var(--radius-md)] border border-[var(--border-light)]"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : account.id)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2 font-medium text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: cfg?.color ?? "var(--text-muted)" }}
                  />
                  {cfg?.label ?? account.platform} · @{account.username}
                  {s.firstComment.trim() !== "" && (
                    <span
                      className="text-[10px] text-[var(--accent-gold)]"
                      title="Punya first comment"
                    >
                      • FC
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-[var(--text-muted)] transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen && (
                <div className="space-y-3 border-[var(--border-light)] border-t p-3">
                  {/* Post type (feed/story) — didukung Instagram kedua jalur */}
                  {isInstagram && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Jenis konten</Label>
                      <select
                        value={s.postType ?? "feed"}
                        onChange={(e) =>
                          onChange(account.id, {
                            ...s,
                            postType: e.target.value as SettingsState["postType"],
                          })
                        }
                        className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
                      >
                        <option value="feed">Feed Post (foto/video/Reels)</option>
                        <option value="story">Story (1 media, rasio 9:16, 24 jam)</option>
                      </select>
                      {s.postType === "story" && (
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Story hanya memakai 1 media pertama, tanpa caption & first comment.
                          Gunakan gambar/video vertikal 1080×1920.
                        </p>
                      )}
                    </div>
                  )}

                  {/* First comment — diposting sebagai komentar pertama setelah post tayang.
                      Didukung: IG (2 jalur), FB, Threads (via reply), YouTube, Bluesky, LinkedIn.
                      TikTok/Pinterest/GGBP tidak punya API create-comment → tidak ditampilkan. */}
                  {[
                    "instagram",
                    "instagram_standalone",
                    "facebook",
                    "threads",
                    "youtube",
                    "bluesky",
                    "linkedin",
                  ].includes(account.platform) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">First comment (komentar pertama otomatis)</Label>
                      <Input
                        value={s.firstComment}
                        onChange={(e) =>
                          onChange(account.id, { ...s, firstComment: e.target.value })
                        }
                        placeholder="Tambahkan hashtag tambahan di komentar pertama…"
                        className="h-8 text-xs"
                        disabled={s.postType === "story"}
                      />
                    </div>
                  )}

                  {/* TikTok privacy */}
                  {isTikTok && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Siapa yang bisa menonton</Label>
                        <select
                          value={s.tiktokPrivacy ?? "PUBLIC_TO_EVERYONE"}
                          onChange={(e) =>
                            onChange(account.id, {
                              ...s,
                              tiktokPrivacy: e.target.value as SettingsState["tiktokPrivacy"],
                            })
                          }
                          className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
                        >
                          <option value="PUBLIC_TO_EVERYONE">Semua orang</option>
                          <option value="MUTUAL_FOLLOW_FRIENDS">Teman yang saling follow</option>
                          <option value="SELF_ONLY">Hanya saya</option>
                        </select>
                      </div>
                      {(
                        [
                          ["tiktokDisableComment", "Nonaktifkan komentar"],
                          ["tiktokDisableDuet", "Nonaktifkan Duet"],
                          ["tiktokDisableStitch", "Nonaktifkan Stitch"],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-[var(--text-secondary)] text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={s[key] ?? false}
                            onChange={(e) =>
                              onChange(account.id, { ...s, [key]: e.target.checked })
                            }
                            className="accent-[var(--accent-gold)]"
                          />
                          {label}
                        </label>
                      ))}
                      <label className="flex items-start gap-2 text-[var(--text-secondary)] text-xs">
                        <input
                          type="checkbox"
                          checked={s.tiktokIsAigc ?? false}
                          onChange={(e) =>
                            onChange(account.id, { ...s, tiktokIsAigc: e.target.checked })
                          }
                          className="mt-0.5 accent-[var(--accent-gold)]"
                        />
                        <span>
                          Konten dibuat/diedit AI (label AIGC)
                          <span className="block text-[11px] text-[var(--text-muted)]">
                            Wajib diaktifkan bila konten realistis dibuat atau diedit AI secara
                            signifikan — sesuai kebijakan pelabelan TikTok.
                          </span>
                        </span>
                      </label>
                    </>
                  )}

                  {/* YouTube */}
                  {isYouTube && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Judul video (maks 100 karakter)</Label>
                        <Input
                          value={s.youtubeTitle ?? ""}
                          onChange={(e) =>
                            onChange(account.id, { ...s, youtubeTitle: e.target.value })
                          }
                          placeholder="Default: 100 karakter pertama caption"
                          className="h-8 text-xs"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Privasi</Label>
                        <select
                          value={s.youtubePrivacy ?? "public"}
                          onChange={(e) =>
                            onChange(account.id, {
                              ...s,
                              youtubePrivacy: e.target.value as SettingsState["youtubePrivacy"],
                            })
                          }
                          className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
                        >
                          <option value="public">Publik</option>
                          <option value="unlisted">Tidak terdaftar</option>
                          <option value="private">Privat</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Kategori</Label>
                        <select
                          value={s.youtubeCategory ?? "22"}
                          onChange={(e) =>
                            onChange(account.id, { ...s, youtubeCategory: e.target.value })
                          }
                          className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
                        >
                          <option value="22">Orang & Blog</option>
                          <option value="24">Hiburan</option>
                          <option value="26">Cara & Gaya</option>
                          <option value="27">Pendidikan</option>
                          <option value="28">Sains & Teknologi</option>
                          <option value="10">Musik</option>
                          <option value="17">Olahraga</option>
                          <option value="20">Gaming</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-[var(--text-secondary)] text-xs">
                        <input
                          type="checkbox"
                          checked={s.youtubeMadeForKids ?? false}
                          onChange={(e) =>
                            onChange(account.id, {
                              ...s,
                              youtubeMadeForKids: e.target.checked,
                            })
                          }
                          className="accent-[var(--accent-gold)]"
                        />
                        Konten untuk anak-anak (Made for Kids)
                      </label>
                      <label className="flex items-start gap-2 text-[var(--text-secondary)] text-xs">
                        <input
                          type="checkbox"
                          checked={s.youtubeSyntheticMedia ?? false}
                          onChange={(e) =>
                            onChange(account.id, {
                              ...s,
                              youtubeSyntheticMedia: e.target.checked,
                            })
                          }
                          className="mt-0.5 accent-[var(--accent-gold)]"
                        />
                        <span>
                          Mengandung konten sintetis/AI (disclosure)
                          <span className="block text-[11px] text-[var(--text-muted)]">
                            Aktifkan bila ada adegan realistis yang dibuat/diubah AI — sesuai
                            kebijakan disclosure YouTube.
                          </span>
                        </span>
                      </label>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Tip: video vertikal 9:16 (atau persegi) ≤ 3 menit otomatis menjadi Shorts —
                        tidak perlu pengaturan khusus. Video lain tayang sebagai video biasa.
                      </p>
                    </>
                  )}

                  {/* Pinterest link */}
                  {isPinterest && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Link tujuan pin (URL)</Label>
                      <Input
                        value={s.pinterestLink ?? ""}
                        onChange={(e) =>
                          onChange(account.id, { ...s, pinterestLink: e.target.value })
                        }
                        placeholder="https://tokokamu.com/produk"
                        className="h-8 text-xs"
                        type="url"
                      />
                    </div>
                  )}

                  {/* Facebook link */}
                  {isFacebook && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Link pada post (opsional)</Label>
                      <Input
                        value={s.facebookLink ?? ""}
                        onChange={(e) =>
                          onChange(account.id, { ...s, facebookLink: e.target.value })
                        }
                        placeholder="https://tokokamu.com"
                        className="h-8 text-xs"
                        type="url"
                      />
                    </div>
                  )}

                  {/* Threads: share to IG Story */}
                  {isThreads && (
                    <>
                      <label className="flex items-start gap-2 text-[var(--text-secondary)] text-xs">
                        <input
                          type="checkbox"
                          checked={s.threadsShareToIg ?? false}
                          onChange={(e) =>
                            onChange(account.id, {
                              ...s,
                              threadsShareToIg: e.target.checked,
                            })
                          }
                          className="mt-0.5 accent-[var(--accent-gold)]"
                        />
                        <span>
                          Bagikan juga ke Instagram Story
                          <span className="block text-[11px] text-[var(--text-muted)]">
                            Post Threads ini otomatis di-cross-post sebagai Story di akun IG yang
                            tertaut. Hanya untuk post dengan media.
                          </span>
                        </span>
                      </label>
                      {s.threadsShareToIg && (
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Butuh izin &quot;Share to Instagram&quot; — bila gagal, hubungkan ulang
                          akun Threads Anda.
                        </p>
                      )}
                    </>
                  )}

                  {/* Instagram tip */}
                  {isInstagram && s.postType !== "story" && (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Tip: video otomatis di-publish sebagai Reels di Instagram.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bangun platformSettings payload dari state UI → dikirim ke API /posts */
export function buildPlatformSettings(
  platform: string,
  s: SettingsState | undefined,
): Record<string, unknown> | undefined {
  if (!s) return undefined;
  const settings: Record<string, unknown> = {};

  // Post type story (IG kedua jalur) — diteruskan ke adapter sebagai postType
  if (["instagram", "instagram_standalone"].includes(platform) && s?.postType === "story") {
    settings.postType = "story";
  }

  if (platform === "tiktok") {
    if (s.tiktokPrivacy) settings.privacy = s.tiktokPrivacy;
    if (s.tiktokDisableComment) settings.disableComment = true;
    if (s.tiktokDisableDuet) settings.disableDuet = true;
    if (s.tiktokDisableStitch) settings.disableStitch = true;
    if (s.tiktokIsAigc) settings.isAigc = true;
  }
  if (platform === "youtube") {
    if (s.youtubeTitle?.trim()) settings.title = s.youtubeTitle.trim();
    if (s.youtubePrivacy) settings.privacyStatus = s.youtubePrivacy;
    if (s.youtubeCategory) settings.categoryId = s.youtubeCategory;
    if (s.youtubeMadeForKids) settings.madeForKids = true;
    if (s.youtubeSyntheticMedia) settings.containsSyntheticMedia = true;
  }
  if (platform === "pinterest" && s.pinterestLink?.trim()) {
    settings.link = s.pinterestLink.trim();
  }
  if (platform === "facebook" && s.facebookLink?.trim()) {
    settings.link = s.facebookLink.trim();
  }
  // Threads: cross-post ke IG Story (dibaca adapter sebagai crossreshareToIg)
  if (platform === "threads" && s.threadsShareToIg) {
    settings.crossreshareToIg = true;
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

export type { SettingsState };
