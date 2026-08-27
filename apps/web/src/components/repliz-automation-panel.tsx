"use client";

import { Bot, Plus, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  type Platform,
} from "@/lib/platforms/config";
import { cn } from "@/lib/utils";

interface ReplizRule {
  rule_id: string;
  platform: string;
  type: "keyword" | "ai" | "text";
  keywords?: string[];
  reply_text?: string;
  ai_prompt?: string;
  is_active: boolean;
  created_at: string;
}

type RuleType = "keyword" | "ai" | "text";

const PLATFORM_OPTIONS: Platform[] = [
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE",
  "THREADS",
  "LINKEDIN",
];

export function ReplizAutomationPanel() {
  const [rules, setRules] = useState<ReplizRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<ReplizRule | null>(null);

  const [platform, setPlatform] = useState<Platform>("INSTAGRAM");
  const [type, setType] = useState<RuleType>("keyword");
  const [keywords, setKeywords] = useState("");
  const [replyText, setReplyText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isActive, setIsActive] = useState(true);

  const loadRules = useCallback(async (p: Platform) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/repliz-automation?platform=${p.toLowerCase()}`,
      );
      if (res.status === 503) {
        setConfigured(false);
        return;
      }
      const data = await res.json();
      setRules(data.rules ?? []);
      setConfigured(true);
    } catch {
      setError("Gagal memuat rules Repliz.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules(platform);
  }, [platform, loadRules]);

  function resetForm() {
    setEditRule(null);
    setPlatform("INSTAGRAM");
    setType("keyword");
    setKeywords("");
    setReplyText("");
    setAiPrompt("");
    setIsActive(true);
  }

  async function saveRule() {
    try {
      setError(null);
      const body: Record<string, unknown> = {
        platform: platform.toLowerCase(),
        type,
        isActive,
      };

      if (type === "keyword") {
        body.keywords = keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
        body.replyText = replyText;
      } else if (type === "ai") {
        body.aiPrompt = aiPrompt;
      } else {
        body.replyText = replyText;
      }

      if (editRule) {
        await fetch("/api/repliz-automation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruleId: editRule.rule_id, ...body }),
        });
      } else {
        await fetch("/api/repliz-automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      setDialogOpen(false);
      resetForm();
      loadRules(platform);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan rule.");
    }
  }

  async function deleteRule(ruleId: string) {
    if (!confirm("Hapus rule ini?")) return;
    try {
      setError(null);
      await fetch(`/api/repliz-automation?ruleId=${ruleId}`, {
        method: "DELETE",
      });
      loadRules(platform);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus rule.");
    }
  }

  async function toggleRule(rule: ReplizRule) {
    try {
      setError(null);
      await fetch("/api/repliz-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: rule.rule_id,
          isActive: !rule.is_active,
        }),
      });
      loadRules(platform);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status.");
    }
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">Repliz belum dikonfigurasi</h3>
            <p className="text-sm text-muted-foreground">
              Set REPLIZ_ACCESS_KEY dan REPLIZ_SECRET_KEY di environment untuk
              mengaktifkan fitur AI auto-reply.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="font-medium">Repliz AI Automation</h3>
        </div>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Tambah Rule
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PLATFORM_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              platform === p
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-sm text-muted-foreground">Memuat rules…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada Repliz rule untuk platform ini. Tambah rule untuk auto-reply
          dengan AI atau keyword.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.rule_id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "font-medium",
                      !rule.is_active && "text-muted-foreground line-through",
                    )}
                  >
                    {rule.type === "ai"
                      ? "AI Auto-Reply"
                      : rule.type === "keyword"
                        ? "Keyword Auto-Reply"
                        : "Text Auto-Reply"}
                  </span>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{
                      background: PLATFORM_COLORS[rule.platform as Platform],
                    }}
                  >
                    {PLATFORM_LABELS[rule.platform as Platform]}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {rule.type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={rule.is_active ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => toggleRule(rule)}
                  >
                    {rule.is_active ? "Aktif" : "Nonaktif"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditRule(rule);
                      setPlatform(rule.platform as Platform);
                      setType(rule.type);
                      setKeywords(rule.keywords?.join(", ") ?? "");
                      setReplyText(rule.reply_text ?? "");
                      setAiPrompt(rule.ai_prompt ?? "");
                      setIsActive(rule.is_active);
                      setDialogOpen(true);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Zap className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRule(rule.rule_id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-red"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {rule.keywords && rule.keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {rule.keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {rule.reply_text && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {rule.reply_text}
                </p>
              )}
              {rule.ai_prompt && (
                <p className="mt-2 text-sm text-muted-foreground italic">
                  AI: {rule.ai_prompt}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editRule ? "Ubah Rule" : "Rule Baru"}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="repliz-platform">Platform</Label>
            <select
              id="repliz-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="repliz-type">Tipe Rule</Label>
            <select
              id="repliz-type"
              value={type}
              onChange={(e) => setType(e.target.value as RuleType)}
              className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="keyword">Keyword Auto-Reply</option>
              <option value="ai">AI Auto-Reply</option>
              <option value="text">Text Auto-Reply</option>
            </select>
          </div>

          {type === "keyword" && (
            <>
              <div>
                <Label htmlFor="repliz-keywords">Keyword (pisahkan koma)</Label>
                <Input
                  id="repliz-keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="promo, diskon, harga"
                />
                <p className="pt-1 text-xs text-muted-foreground">
                  Komentar yang mengandung keyword akan otomatis dibalas.
                </p>
              </div>
              <div>
                <Label htmlFor="repliz-reply">Pesan Balasan</Label>
                <textarea
                  id="repliz-reply"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Tulis pesan auto-reply…"
                />
              </div>
            </>
          )}

          {type === "ai" && (
            <div>
              <Label htmlFor="repliz-ai-prompt">AI Prompt</Label>
              <textarea
                id="repliz-ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Instruksi untuk AI dalam membalas komentar…"
              />
              <p className="pt-1 text-xs text-muted-foreground">
                AI akan generate balasan berdasarkan prompt ini dan konteks
                komentar.
              </p>
            </div>
          )}

          {type === "text" && (
            <div>
              <Label htmlFor="repliz-text">Pesan Balasan</Label>
              <textarea
                id="repliz-text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Tulis pesan auto-reply…"
              />
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-primary"
            />
            Aktif
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
              Batal
            </Button>
            <Button size="sm" onClick={saveRule}>
              Simpan
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
