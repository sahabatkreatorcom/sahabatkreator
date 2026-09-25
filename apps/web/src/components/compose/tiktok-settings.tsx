// Pengaturan TikTok di Compose — dibuat terpisah dari platform-settings-panel
// karena syaratnya paling banyak (audit Content Posting API):
//
// 1. Tampilkan nickname akun target dari creator_info/query (guideline #1a)
// 2. Dropdown privacy TANPA default, opsinya dari privacy_level_options (#2b)
// 3. Toggle "Izinkan komentar/Duet/Stitch" — tak satu pun tercentang default (#2c);
//    dinonaktifkan bila creator_info melarang. Post foto hanya menampilkan komentar.
// 4. Disclosure konten komersial (default OFF) + label Promotional/Paid partnership (#3a)
// 5. Branded content tidak boleh private (#3b)
// Deklarasi Music Usage Confirmation dicek di validasi sebelum tombol publish.

import { AlertCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import {
  useTikTokCreatorInfo,
  type TikTokCreatorInfoState,
} from "@/hooks/use-tiktok-creator-info";
import { cn } from "@/lib/utils";
import type { SettingsState } from "./compose-types";

/** Label human-readable untuk tiap opsi privacy TikTok */
const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Semua orang",
  MUTUAL_FOLLOW_FRIENDS: "Teman yang saling follow",
  FOLLOWER_OF_CREATOR: "Follower saya",
  SELF_ONLY: "Hanya saya",
};

/** Fallback bila API tidak mengembalikan privacy_level_options */
const FALLBACK_PRIVACY_OPTIONS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "SELF_ONLY",
];

const CHECKBOX =
  "h-3.5 w-3.5 shrink-0 accent-[var(--accent-gold)] disabled:opacity-40";

function CheckboxRow({
  checked,
  disabled,
  onChecked,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChecked: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2 text-[var(--text-secondary)] text-xs",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChecked(e.target.checked)}
        className={cn("mt-0.5", CHECKBOX)}
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/** Kartu identitas akun target — wajib tampil agar user tahu post ke mana */
function CreatorCard({
  creator,
  fallbackUsername,
  onRetry,
}: {
  creator: TikTokCreatorInfoState;
  fallbackUsername: string;
  onRetry: () => void;
}) {
  if (creator.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Memuat info akun TikTok…
      </p>
    );
  }

  if (creator.status === "blocked") {
    return (
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--error)] bg-[var(--error-light,transparent)] p-2.5">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--error)]" />
        <p className="text-[11px] text-[var(--error)]">
          {creator.message} Posting dihentikan sementara — coba lagi nanti.
        </p>
      </div>
    );
  }

  if (creator.status === "error") {
    return (
      <div className="flex items-start justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5">
        <p className="text-[11px] text-[var(--text-muted)]">
          Info akun TikTok gagal dimuat — pilihan privacy bisa terbatas.{" "}
          <span className="text-[var(--error)]">{creator.message}</span>
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--accent-gold)] hover:underline"
        >
          <RefreshCw className="h-3 w-3" /> Ulangi
        </button>
      </div>
    );
  }

  const info = creator.info;
  const nickname = info.creatorNickname?.trim() || `@${fallbackUsername}`;
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-2.5">
      {info.creatorAvatarUrl ? (
        <img
          src={info.creatorAvatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-xs font-semibold">
          {nickname.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{nickname}</span>
        <span className="block text-[11px] text-[var(--text-muted)]">
          Akun tujuan post TikTok · @{info.creatorUsername ?? fallbackUsername}
        </span>
      </span>
    </div>
  );
}

export function TikTokSettings({
  accountId,
  value: s,
  onChange,
  hasVideo,
}: {
  accountId: string;
  value: SettingsState;
  onChange: (next: SettingsState) => void;
  /** Ada video terpilih → post video (duet/stitch relevan); tanpa video → foto */
  hasVideo: boolean;
}) {
  const queryClient = useQueryClient();
  const creator = useTikTokCreatorInfo([accountId])[accountId] ?? { status: "loading" as const };

  const retry = () =>
    queryClient.invalidateQueries({ queryKey: ["tiktok-creator-info", accountId] });

  const ready = creator.status === "ready";
  const info = ready ? creator.info : null;

  // Opsi privacy WAJIB dari creator_info; fallback hanya bila API tak mengembalikan.
  const baseOptions =
    info && info.privacyLevelOptions.length > 0
      ? info.privacyLevelOptions
      : FALLBACK_PRIVACY_OPTIONS;
  // Branded content tidak boleh private (guideline #3b) → SELF_ONLY disembunyikan
  const branded = s.tiktokBrandContent === true;
  const options = branded ? baseOptions.filter((o) => o !== "SELF_ONLY") : baseOptions;
  // Nilai tersimpan tidak ada di daftar (mis. akun berubah jadi private) →
  // tetap tampilkan agar user sadar & validasi bisa menandainya.
  const current = s.tiktokPrivacy ?? "";
  const currentMissing = current !== "" && !options.includes(current);

  const disclosureOn = s.tiktokDisclosure === true;
  const brandPicked = s.tiktokBrandOrganic === true || s.tiktokBrandContent === true;

  return (
    <div className="space-y-3">
      <CreatorCard creator={creator} fallbackUsername={accountId} onRetry={retry} />

      {/* Privacy — tanpa default value (guideline #2b) */}
      <div className="space-y-1.5">
        <Label className="text-xs">
          Siapa yang bisa menonton <span className="text-[var(--error)]">*</span>
        </Label>
        <select
          value={current}
          onChange={(e) => onChange({ ...s, tiktokPrivacy: e.target.value })}
          className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
        >
          <option value="" disabled>
            Pilih status privasi…
          </option>
          {currentMissing && <option value={current}>{current} (tidak tersedia)</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {PRIVACY_LABELS[o] ?? o}
            </option>
          ))}
        </select>
        {branded && current === "SELF_ONLY" && (
          <p className="text-[11px] text-[var(--warning)]">
            Branded content tidak boleh private — pilih visibilitas lain.
          </p>
        )}
        {branded && (
          <p className="text-[11px] text-[var(--text-muted)]">
            Visibilitas "Hanya saya" disembunyikan karena branded content harus publik.
          </p>
        )}
        {s.tiktokPrivacy && !ready && (
          <p className="text-[11px] text-[var(--warning)]">
            Opsi privacy akan diverifikasi ulang dari akun TikTok saat info termuat.
          </p>
        )}
      </div>

      {/* Interaksi — semua default OFF, wajib dicentang manual (guideline #2c) */}
      <div className="space-y-1.5">
        <Label className="text-xs">Interaksi yang diizinkan</Label>
        <p className="text-[11px] text-[var(--text-muted)]">
          Sesuai aturan TikTok, tak satu pun diizinkan secara default — centang yang kamu
          izinkan.
        </p>
        <CheckboxRow
          checked={s.tiktokAllowComment === true}
          disabled={info?.commentDisabled === true}
          onChecked={(v) => onChange({ ...s, tiktokAllowComment: v })}
        >
          Izinkan komentar
          {info?.commentDisabled && (
            <span className="block text-[11px] text-[var(--text-muted)]">
              Dinonaktifkan di pengaturan privasi akun — tidak bisa diubah.
            </span>
          )}
        </CheckboxRow>
        {hasVideo && (
          <>
            <CheckboxRow
              checked={s.tiktokAllowDuet === true}
              disabled={info?.duetDisabled === true}
              onChecked={(v) => onChange({ ...s, tiktokAllowDuet: v })}
            >
              Izinkan Duet
              {info?.duetDisabled && (
                <span className="block text-[11px] text-[var(--text-muted)]">
                  Akun private / Duet dimatikan di pengaturan akun.
                </span>
              )}
            </CheckboxRow>
            <CheckboxRow
              checked={s.tiktokAllowStitch === true}
              disabled={info?.stitchDisabled === true}
              onChecked={(v) => onChange({ ...s, tiktokAllowStitch: v })}
            >
              Izinkan Stitch
              {info?.stitchDisabled && (
                <span className="block text-[11px] text-[var(--text-muted)]">
                  Akun private / Stitch dimatikan di pengaturan akun.
                </span>
              )}
            </CheckboxRow>
          </>
        )}
        {!hasVideo && (
          <p className="text-[11px] text-[var(--text-muted)]">
            Duet & Stitch tidak berlaku untuk post foto — hanya komentar yang ditampilkan.
          </p>
        )}
      </div>

      {/* Judul khusus post foto (guideline #2a) — post video memakai caption */}
      {!hasVideo && (
        <div className="space-y-1.5">
          <Label className="text-xs">Judul post foto (maks 90 karakter)</Label>
          <input
            type="text"
            value={s.tiktokTitle ?? ""}
            maxLength={90}
            onChange={(e) => onChange({ ...s, tiktokTitle: e.target.value })}
            placeholder="Judul singkat — kosongkan untuk pakai awal caption"
            className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-2 text-xs"
          />
        </div>
      )}

      {/* Disclosure konten komersial (guideline #3a) — default OFF */}
      <div className="space-y-1.5">
        <CheckboxRow
          checked={disclosureOn}
          onChecked={(v) =>
            onChange({ ...s, tiktokDisclosure: v, tiktokBrandOrganic: false, tiktokBrandContent: false })
          }
        >
          Konten ini mempromosikan diri, brand, produk, atau jasa
          <span className="block text-[11px] text-[var(--text-muted)]">
            Nonaktif secara default — aktifkan hanya bila konten bersifat promosional.
          </span>
        </CheckboxRow>

        {disclosureOn && (
          <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-light)] p-2.5">
            <CheckboxRow
              checked={s.tiktokBrandOrganic === true}
              onChecked={(v) => onChange({ ...s, tiktokBrandOrganic: v })}
            >
              Merek saya sendiri (Brand Organic)
              <span className="block text-[11px] text-[var(--text-muted)]">
                Video/foto kamu akan dilabeli <b>Promotional content</b>.
              </span>
            </CheckboxRow>
            <CheckboxRow
              checked={s.tiktokBrandContent === true}
              onChecked={(v) => onChange({ ...s, tiktokBrandContent: v })}
            >
              Branded content (pihak ketiga)
              <span className="block text-[11px] text-[var(--text-muted)]">
                {s.tiktokBrandOrganic === true
                  ? "Video/foto kamu akan dilabeli Paid partnership."
                  : "Video/foto kamu akan dilabeli 'Paid partnership'."}
              </span>
            </CheckboxRow>
            {!brandPicked && (
              <p
                className="flex items-start gap-1.5 text-[11px] text-[var(--warning)]"
                title="You need to indicate if your content promotes yourself, a third party, or both"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Pilih minimal satu: apakah konten mempromosikan dirimu, pihak ketiga, atau keduanya.
              </p>
            )}
            {s.tiktokBrandContent === true && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Branded content tidak bisa diatur private — visibilitas "Hanya saya" disembunyikan.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Label AIGC */}
      <CheckboxRow
        checked={s.tiktokIsAigc === true}
        onChecked={(v) => onChange({ ...s, tiktokIsAigc: v })}
      >
        Konten dibuat/diedit AI (label AIGC)
        <span className="block text-[11px] text-[var(--text-muted)]">
          Wajib diaktifkan bila konten realistis dibuat atau diedit AI secara signifikan — sesuai
          kebijakan pelabelan TikTok.
        </span>
      </CheckboxRow>

      <p className="text-[11px] text-[var(--text-muted)]">
        Setelah publish, konten diproses TikTok dan bisa butuh beberapa menit sebelum tampil di
        profil. {info?.maxVideoPostDurationSec ? `Batas durasi video akun ini ${info.maxVideoPostDurationSec} detik.` : ""}
      </p>
    </div>
  );
}
