// Asisten AI untuk variasi caption per platform — pilih akun target lalu hasil
// generate/rewrite langsung ditulis ke variasi akun tersebut (bukan caption utama).
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { AiComposerPanel } from "./ai-panel";

type AccountLite = { id: string; platform: string; username: string };

export function VariationsAiPanel({
  accounts,
  baseContent,
  baseHashtags,
  variations,
  hashtagVariations,
  onApplyVariation,
  onApplyHashtags,
}: {
  accounts: AccountLite[];
  baseContent: string;
  baseHashtags: string;
  variations: Record<string, string>;
  hashtagVariations: Record<string, string>;
  onApplyVariation: (accountId: string, text: string) => void;
  onApplyHashtags: (accountId: string, tags: string) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  if (!account) {
    return (
      <p className="mt-4 border-[var(--border-light)] border-t pt-4 text-[var(--text-muted)] text-xs">
        Pilih akun dulu untuk membuat variasi caption dengan AI.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-[var(--border-light)] border-t pt-4">
      <div className="space-y-2">
        <Label htmlFor="variations-ai-account">Akun target variasi</Label>
        <select
          id="variations-ai-account"
          value={account.id}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.username} — {a.platform}
            </option>
          ))}
        </select>
      </div>

      <AiComposerPanel
        variant="inline"
        title={`Asisten AI — variasi @${account.username}`}
        platform={account.platform}
        content={variations[account.id]?.trim() ? variations[account.id] : baseContent}
        hashtags={
          hashtagVariations[account.id]?.trim() ? hashtagVariations[account.id] : baseHashtags
        }
        onApplyContent={(text) => onApplyVariation(account.id, text)}
        onApplyHashtags={(tags) => onApplyHashtags(account.id, tags)}
      />
    </div>
  );
}
