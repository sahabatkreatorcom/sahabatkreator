// Deklarasi persetujuan sebelum publish ke TikTok — Content Sharing Guidelines:
// "there should be a declaration asking for a user's consent before the publish
// button." Teks wajib menyebut TikTok's Music Usage Confirmation, dan ditambah
// Branded Content Policy bila ada opsi Branded Content yang dicentang.
// Dicek oleh validasi (tiktokMusicConsent) → menonaktifkan tombol publish.

import { Scale } from "lucide-react";
import type { SettingsState } from "./compose-types";

const MUSIC_USAGE_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED_POLICY_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

export function TikTokConsent({
  accountIds,
  settings,
  onChange,
}: {
  /** Akun TikTok terpilih — komponen tidak dirender bila kosong */
  accountIds: string[];
  settings: Record<string, SettingsState>;
  onChange: (accountId: string, next: SettingsState) => void;
}) {
  if (accountIds.length === 0) return null;

  const base = (id: string): SettingsState => settings[id] ?? { firstComment: "" };
  const checked = accountIds.some((id) => base(id).tiktokMusicConsent === true);
  const hasBranded = accountIds.some((id) => base(id).tiktokBrandContent === true);
  const hasOwnBrand = accountIds.some((id) => base(id).tiktokBrandOrganic === true);

  const toggle = (next: boolean) => {
    for (const id of accountIds) onChange(id, { ...base(id), tiktokMusicConsent: next });
  };

  const labelPrompt = hasBranded
    ? "Video/foto kamu akan dilabeli 'Paid partnership'."
    : hasOwnBrand
      ? "Video/foto kamu akan dilabeli 'Promotional content'."
      : null;

  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-light)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
        <Scale className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        Pernyataan sebelum posting ke TikTok
      </div>
      <label className="flex items-start gap-2 text-[var(--text-secondary)] text-xs">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent-gold)]"
        />
        <span>
          Dengan memposting, saya menyetujui{" "}
          <a
            href={MUSIC_USAGE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent-gold)] underline underline-offset-2"
          >
            TikTok&apos;s Music Usage Confirmation
          </a>
          {hasBranded && (
            <>
              {" "}dan{" "}
              <a
                href={BRANDED_POLICY_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent-gold)] underline underline-offset-2"
              >
                TikTok&apos;s Branded Content Policy
              </a>
            </>
          )}
          .
          {labelPrompt && (
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">{labelPrompt}</span>
          )}
        </span>
      </label>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Prosesing TikTok bisa memakan waktu beberapa menit setelah publish.
      </p>
    </div>
  );
}
