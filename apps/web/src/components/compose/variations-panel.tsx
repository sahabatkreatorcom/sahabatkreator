// Panel variasi caption + hashtag per platform — custom tiap akun terpilih.
// Kosong = pakai caption utama (default). Ini mengisi item.content/item.hashtags
// saat POST /posts. Dirender sebagai konten tab di dalam kartu "Konten".
import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export type AccountLite = {
  id: string;
  platform: string;
  username: string;
};

/** Batas karakter per platform — sama dengan CHAR_LIMITS di compose */
const CHAR_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  x: 280,
  linkedin: 3000,
  tiktok: 2200,
  youtube: 5000,
  threads: 500,
  pinterest: 500,
  google_business: 1500,
  manual: 5000,
};

/** Maks hashtag per platform */
const HASHTAG_LIMITS: Record<string, number> = {
  instagram: 30,
  linkedin: 5,
  threads: 1,
  pinterest: 20,
};

export function VariationsPanel({
  selectedAccounts,
  accounts,
  variations,
  hashtagVariations,
  baseHashtags,
  onChange,
  onHashtagsChange,
  baseContent,
}: {
  selectedAccounts: string[];
  accounts: AccountLite[];
  variations: Record<string, string>;
  /** Hashtag custom per akun — string koma/spasi, kosong = pakai hashtag utama */
  hashtagVariations: Record<string, string>;
  /** String hashtag utama (field input compose) */
  baseHashtags: string;
  /** Update variasi caption (accountId → caption custom) */
  onChange: (next: Record<string, string>) => void;
  /** Update variasi hashtag (accountId → hashtag custom) */
  onHashtagsChange: (next: Record<string, string>) => void;
  baseContent: string;
}) {
  // Tab aktif = accountId (bukan platform — dua akun platform sama tetap tab terpisah)
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const selected = accounts.filter((a) => selectedAccounts.includes(a.id));
  if (selected.length === 0) {
    return (
      <p className="text-[var(--text-secondary)] text-sm">
        Pilih akun terlebih dahulu untuk membuat variasi caption per platform.
      </p>
    );
  }

  const parseTags = (s: string) =>
    s
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);

  const withVariation =
    selected.filter((a) => variations[a.id]?.trim() || hashtagVariations[a.id]?.trim());
  const allUseBase = withVariation.length === 0;

  // Tab aktif default = akun terpilih pertama yang punya variasi, atau akun pertama
  const currentTab = activeTab && selected.some((a) => a.id === activeTab)
    ? activeTab
    : (withVariation[0]?.id ?? selected[0]!.id);
  const activeAccount = selected.find((a) => a.id === currentTab)!;
  const activeCfg = PLATFORMS[activeAccount.platform as keyof typeof PLATFORMS];
  const activeValue = variations[activeAccount.id] ?? "";
  const activeTags = hashtagVariations[activeAccount.id] ?? "";
  const activeLimit = CHAR_LIMITS[activeAccount.platform] ?? 2200;
  const activeHashtagLimit = HASHTAG_LIMITS[activeAccount.platform];
  const baseExceedsActive = activeLimit < baseContent.length;
  const isCustom = Boolean(activeValue.trim() || activeTags.trim());

  const activeTagCount = parseTags(activeTags).length;
  const tagOverLimit =
    activeTagCount > 0 && activeHashtagLimit !== undefined && activeTagCount > activeHashtagLimit;

  const hasAnyVariation = Object.values(variations).some((v) => v?.trim()) ||
    Object.values(hashtagVariations).some((v) => v?.trim());

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[var(--text-secondary)] text-xs">
          Kosongkan untuk pakai caption utama. Sesuaikan gaya tiap platform — caption X lebih
          pendek, IG bisa lebih storytelling. Hashtag bisa juga dibedakan per platform.
        </p>
        {!allUseBase && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({});
              onHashtagsChange({});
            }}
            className="shrink-0 text-xs"
          >
            <RotateCcw className="h-3 w-3" />
            Reset semua
          </Button>
        )}
      </div>

      {/* Tab per akun terpilih — ganti textarea panjang jadi satu editor */}
      <div
        role="tablist"
        className="flex flex-wrap gap-1.5 border-[var(--border-light)] border-b pb-3"
      >
        {selected.map((account) => {
          const cfg = PLATFORMS[account.platform as keyof typeof PLATFORMS];
          const Icon = cfg?.icon;
          const isCustomTab = Boolean(
            variations[account.id]?.trim() || hashtagVariations[account.id]?.trim(),
          );
          const isOver =
            isCustomTab &&
            (variations[account.id]?.length ?? 0) > (CHAR_LIMITS[account.platform] ?? 2200);
          const isActive = account.id === currentTab;
          return (
            <button
              key={account.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(account.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors ${
                isActive
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                  : "border-[var(--border)] hover:border-[var(--accent-gold)]"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />}
              @{account.username}
              {isCustomTab && (
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isOver ? "bg-red-500" : "bg-[var(--accent-gold)]",
                  )}
                  title="Punya caption/hashtag custom"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Editor caption + hashtag untuk tab aktif */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm">
            {isCustom && <Check className="h-3.5 w-3.5 text-[var(--accent-gold)]" />}
            <span className="font-medium">{activeCfg?.label ?? activeAccount.platform}</span>
            <span className="text-[var(--text-muted)]">@{activeAccount.username}</span>
          </span>
          <span
            className={cn(
              "text-[10px]",
              activeValue.trim()
                ? activeValue.length > activeLimit
                  ? "font-semibold text-red-500"
                  : "text-[var(--accent-gold)]"
                : "text-[var(--text-muted)]",
            )}
          >
            {activeValue.trim()
              ? `${activeValue.length}/${activeLimit} (custom)`
              : "pakai caption utama"}
          </span>
        </div>
        <Textarea
          rows={5}
          placeholder={`Caption khusus ${activeCfg?.label ?? activeAccount.platform} (opsional)...`}
          value={activeValue}
          onChange={(e) => onChange({ ...variations, [activeAccount.id]: e.target.value })}
          className="text-sm"
        />
        {baseExceedsActive && !activeValue.trim() && baseContent.trim() && (
          <p className="text-[11px] font-medium text-red-500">
            Caption utama {baseContent.length} karakter melebihi batas{" "}
            {activeCfg?.label ?? activeAccount.platform} ({activeLimit}) — isi variasi untuk
            platform ini.
          </p>
        )}

        {/* Hashtag custom untuk platform ini */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] text-xs">
              Hashtag khusus platform ini
            </span>
            <span
              className={cn(
                "text-[10px]",
                activeTags.trim()
                  ? tagOverLimit
                    ? "font-semibold text-red-500"
                    : "text-[var(--accent-gold)]"
                  : "text-[var(--text-muted)]",
              )}
            >
              {activeTags.trim()
                ? `${activeTagCount} tag${activeHashtagLimit ? ` / maks ${activeHashtagLimit}` : ""}`
                : "pakai hashtag utama"}
            </span>
          </div>
          <Input
            placeholder="khusus platform ini (opsional) — kosongkan untuk pakai hashtag utama"
            value={activeTags}
            onChange={(e) =>
              onHashtagsChange({ ...hashtagVariations, [activeAccount.id]: e.target.value })
            }
            className="text-sm"
          />
          {tagOverLimit && (
            <p className="text-[11px] font-medium text-red-500">
              {activeTagCount} hashtag melebihi batas{" "}
              {activeCfg?.label ?? activeAccount.platform} (maks {activeHashtagLimit}).
            </p>
          )}
        </div>
      </div>

      {allUseBase && (baseContent.trim() || baseHashtags.trim()) && (
        <p className="text-[var(--text-muted)] text-xs">
          Semua platform akan memakai caption utama ({baseContent.length} karakter) dan{" "}
          {parseTags(baseHashtags).length} hashtag utama.
          {selected.some((a) => (CHAR_LIMITS[a.platform] ?? 2200) < baseContent.length) && (
            <span className="ml-1 font-medium text-red-500">
              Peringatan: caption utama melebihi batas sebagian platform — isi variasi.
            </span>
          )}
        </p>
      )}
      {hasAnyVariation && (
        <p className="text-[var(--text-muted)] text-xs">
          {withVariation.length} dari {selected.length} akun memakai variasi custom.
        </p>
      )}
    </div>
  );
}
