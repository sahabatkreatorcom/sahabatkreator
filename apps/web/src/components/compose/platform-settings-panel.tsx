// Panel pengaturan per platform di Compose — expose platformSettings + firstComment
// yang sudah didukung schema & pipeline (kolom jsonb platform_settings + first_comment).
// Field ditampilkan hanya untuk akun terpilih yang platformnya relevan.

import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Loader2, MapPin, Search, Settings2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TikTokCreatorInfoState } from "@/hooks/use-tiktok-creator-info";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import type { SettingsState } from "./compose-types";
import { TikTokConsent } from "./tiktok-consent";
import { TikTokSettings } from "./tiktok-settings";

/** Picker lokasi Threads — cari via /threads/locations (scope threads_location_tagging) */
function ThreadsLocationPicker({
  accountId,
  value,
  valueName,
  onChange,
}: {
  accountId: string;
  value?: string;
  valueName?: string;
  onChange: (id?: string, name?: string) => void;
}) {
  const [q, setQ] = useState("");
  const search = useMutation({
    mutationFn: () =>
      api.get<{ locations: { id: string; name?: string; address?: string }[] }>(
        `/threads/locations?accountId=${accountId}&q=${encodeURIComponent(q.trim())}`,
      ),
    onError: (error) => toast.error((error as Error).message),
  });
  const results = search.data?.locations ?? [];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Tag lokasi (opsional)</Label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent-gold)]" />
            <span className="truncate">{valueName || value}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange(undefined, undefined)}
            className="shrink-0 text-[var(--text-muted)] hover:text-[var(--error)]"
            aria-label="Hapus lokasi"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) search.mutate();
              }}
              placeholder="Cari lokasi, mis. Jakarta"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={search.isPending || !q.trim()}
              onClick={() => search.mutate()}
            >
              {search.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          {results.length > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-light)] p-1">
              {results.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onChange(l.id, l.name ?? l.address ?? l.id)}
                  className="w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-tertiary)]"
                >
                  {l.name ?? l.id}
                  {l.address ? (
                    <span className="text-[var(--text-muted)]"> — {l.address}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-[var(--text-muted)]">
        Lokasi ditempel ke post Threads via <code>location_id</code> (butuh izin
        threads_location_tagging).
      </p>
    </div>
  );
}

type AccountLite = {
  id: string;
  platform: string;
  username: string;
  /** ID Halaman di Facebook — dipakai untuk token mention `@[page-id]` */
  platformAccountId: string;
  /** Akun via bridge Repliz — hint fitur disesuaikan */
  isBridge?: boolean;
};

export function PlatformSettingsPanel({
  accounts,
  selectedAccountIds,
  settings,
  onChange,
  hasVideoMedia = false,
  tiktokCreator,
}: {
  accounts: AccountLite[];
  selectedAccountIds: string[];
  settings: Record<string, SettingsState>;
  onChange: (accountId: string, next: SettingsState) => void;
  /** Ada video terpilih — TikTok butuh ini (post video vs post foto) */
  hasVideoMedia?: boolean;
  /** creator_info TikTok per akun — nickname ditampilkan di header akun */
  tiktokCreator?: Record<string, TikTokCreatorInfoState | undefined>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const selected = accounts.filter((a) => selectedAccountIds.includes(a.id));
  const tiktokAccountIds = selected.filter((a) => a.platform === "tiktok").map((a) => a.id);

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
          // Nickname akun TikTok dari creator_info — wajib tampil agar user
          // tahu konten akan diposting ke akun yang mana (guideline #1a).
          const creatorState = isTikTok ? tiktokCreator?.[account.id] : undefined;
          const creatorNickname =
            creatorState?.status === "ready" ? creatorState.info.creatorNickname?.trim() : "";

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
                  {creatorNickname && (
                    <span
                      className="max-w-[160px] truncate font-normal text-[var(--text-muted)]"
                      title="Akun tujuan post TikTok (dari creator_info)"
                    >
                      → {creatorNickname}
                    </span>
                  )}
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
                      Didukung: IG (2 jalur), FB, Threads (via reply), YouTube, Bluesky,
                      LinkedIn company page (linkedin_org).
                      TikTok/Pinterest/GGBP tidak punya API create-comment → tidak ditampilkan.
                      LinkedIn personal (linkedin) juga tidak: app "Share on LinkedIn" hanya
                      punya scope w_member_social; sejak Jun 2023 LinkedIn memindahkan akses
                      tulis komentar ke w_member_social_feed (product Community Management API
                      terpisah). Jangan tawarkan field yang pasti gagal (403). */}
                  {[
                    "instagram",
                    "instagram_standalone",
                    "facebook",
                    "threads",
                    "youtube",
                    "bluesky",
                    "linkedin_org",
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
                  {account.platform === "linkedin" && (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      LinkedIn personal tidak mendukung first comment via API — LinkedIn
                      memerlukan product Community Management API (app terpisah + company page
                      terverifikasi). Gunakan LinkedIn company page untuk fitur ini.
                    </p>
                  )}

                  {/* TikTok — komponen terpisah (syarat audit Content Posting API) */}
                  {isTikTok && (
                    <TikTokSettings
                      accountId={account.id}
                      value={s}
                      onChange={(next) => onChange(account.id, next)}
                      hasVideo={hasVideoMedia}
                    />
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

                  {/* Facebook link + Page Mentions */}
                  {isFacebook && (
                    <>
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
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {account.isBridge
                            ? "Pada post foto/video, link disisipkan ke caption karena API tidak menerima link terpisah untuk jenis post tersebut."
                            : "Pada post foto/video, link disisipkan ke caption karena API Facebook tidak menerima link terpisah untuk jenis post tersebut."}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Sebut Halaman (Page Mentions)</Label>
                        {accounts.filter((a) => a.platform === "facebook" && a.id !== account.id)
                          .length === 0 ? (
                          <p className="text-[11px] text-[var(--text-muted)]">
                            Hubungkan Halaman Facebook lain dulu untuk bisa menyebutnya di post ini.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {accounts
                              .filter((a) => a.platform === "facebook" && a.id !== account.id)
                              .map((page) => {
                                const pageId = page.platformAccountId;
                                const checked = (s.facebookMentions ?? []).includes(pageId);
                                return (
                                  <label
                                    key={page.id}
                                    className="flex items-center gap-2 text-[var(--text-secondary)] text-xs"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const current = s.facebookMentions ?? [];
                                        onChange(account.id, {
                                          ...s,
                                          facebookMentions: e.target.checked
                                            ? [...new Set([...current, pageId])]
                                            : current.filter((id) => id !== pageId),
                                        });
                                      }}
                                      className="accent-[var(--accent-gold)]"
                                    />
                                    @{page.username}
                                  </label>
                                );
                              })}
                          </div>
                        )}
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Halaman terpilih ditambahkan sebagai mention (@[id]) di akhir caption.
                        </p>
                      </div>
                    </>
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
                      <ThreadsLocationPicker
                        accountId={account.id}
                        value={s.threadsLocationId}
                        valueName={s.threadsLocationName}
                        onChange={(id, name) =>
                          onChange(account.id, {
                            ...s,
                            threadsLocationId: id,
                            threadsLocationName: name,
                          })
                        }
                      />
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

      {/* Deklarasi persetujuan TikTok — selalu tampil walau accordion tertutup,
          agar user bisa centang sebelum tombol publish (syarat audit). */}
      <TikTokConsent accountIds={tiktokAccountIds} settings={settings} onChange={onChange} />
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
    // privacy TANPA default — wajib dipilih user (dicek validasi sebelum publish)
    if (s.tiktokPrivacy) settings.privacy = s.tiktokPrivacy;
    // Flag interaksi SELALU ikut terkirim (false bila tak dicentang) — Content
    // Sharing Guidelines: "none should be checked by default".
    settings.allowComment = s.tiktokAllowComment === true;
    settings.allowDuet = s.tiktokAllowDuet === true;
    settings.allowStitch = s.tiktokAllowStitch === true;
    if (s.tiktokIsAigc) settings.isAigc = true;
    if (s.tiktokTitle?.trim()) settings.title = s.tiktokTitle.trim().slice(0, 90);
    // Disclosure konten komersial — hanya dikirim bila toggle aktif
    if (s.tiktokDisclosure) {
      settings.disclosure = true;
      if (s.tiktokBrandOrganic) settings.brandOrganic = true;
      if (s.tiktokBrandContent) settings.brandContent = true;
    }
    if (s.tiktokMusicConsent) settings.musicConsent = true;
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
  // Page Mentions — dibaca adapter facebook.ts sebagai token `@[page-id]`
  if (platform === "facebook" && s.facebookMentions?.length) {
    settings.mentions = s.facebookMentions;
  }
  // Threads: cross-post ke IG Story (dibaca adapter sebagai crossreshareToIg)
  if (platform === "threads" && s.threadsShareToIg) {
    settings.crossreshareToIg = true;
  }
  // Threads: tag lokasi — adapter kirim sebagai location_id
  if (platform === "threads" && s.threadsLocationId) {
    settings.locationId = s.threadsLocationId;
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

export type { SettingsState };
