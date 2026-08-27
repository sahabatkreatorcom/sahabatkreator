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

interface DMAutoReplyRule {
  rule_id: string;
  platform: string;
  type: "keyword" | "ai" | "text";
  keywords?: string[];
  reply_text?: string;
  ai_prompt?: string;
  is_active: boolean;
  delay_ms?: number;
  exception_keywords?: string[];
  created_at: string;
}

type RuleType = "keyword" | "ai" | "text";

const PLATFORM_OPTIONS: Platform[] = [
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "TIKTOK",
  "LINKEDIN",
];

export default function DMAutomationPage() {
  const [rules, setRules] = useState<DMAutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<DMAutoReplyRule | null>(null);

  const [platform, setPlatform] = useState<Platform>("INSTAGRAM");
  const [type, setType] = useState<RuleType>("keyword");
  const [keywords, setKeywords] = useState("");
  const [replyText, setReplyText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [delayMs, setDelayMs] = useState("0");
  const [exceptionKeywords, setExceptionKeywords] = useState("");
  const [isActive, setIsActive] = useState(true);

  const loadRules = useCallback(async (p: Platform) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dm/auto-reply?platform=${p.toLowerCase()}`);
      if (res.status === 503) {
        setConfigured(false);
        return;
      }
      const data = await res.json();
      setRules(data.rules ?? []);
      setConfigured(true);
    } catch {
      setError("Gagal memuat rules DM auto-reply.");
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
    setDelayMs("0");
    setExceptionKeywords("");
    setIsActive(true);
  }

  async function saveRule() {
    try {
      setError(null);
      const body: Record<string, unknown> = {
        platform: platform.toLowerCase(),
        type,
        isActive,
        delayMs: Number(delayMs) || 0,
      };

      if (type === "keyword") {
        body.keywords = keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
        body.replyText = replyText;
        body.exceptionKeywords = exceptionKeywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      } else if (type === "ai") {
        body.aiPrompt = aiPrompt;
      } else {
        body.replyText = replyText;
      }

      if (editRule) {
        await fetch("/api/dm/auto-reply", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ruleId: editRule.rule_id, ...body }),
        });
      } else {
        await fetch("/api/dm/auto-reply", {
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
      await fetch(`/api/dm/auto-reply?ruleId=${ruleId}`, { method: "DELETE" });
      loadRules(platform);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus rule.");
    }
  }

  async function toggleRule(rule: DMAutoReplyRule) {
    try {
      setError(null);
      await fetch("/api/dm/auto-reply", {
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
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">DM Auto-Reply</h1>
          <p className="text-sm text-muted-foreground">
            Auto-reply untuk pesan langsung di media sosial.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-medium">Repliz belum dikonfigurasi</h3>
              <p className="text-sm text-muted-foreground">
                Set REPLIZ_ACCESS_KEY dan REPLIZ_SECRET_KEY di environment untuk
                mengaktifkan fitur DM auto-reply.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">DM Auto-Reply</h1>
          <p className="text-sm text-muted-foreground">
            Auto-reply untuk pesan langsung di media sosial.
          </p>
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
          Belum ada DM auto-reply rule untuk platform ini. Tambah rule untuk
          auto-reply dengan AI atau keyword.
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
                  {rule.delay_ms && rule.delay_ms > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Delay: {rule.delay_ms}ms
                    </span>
                  )}
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
                      setDelayMs(String(rule.delay_ms ?? 0));
                      setExceptionKeywords(
                        rule.exception_keywords?.join(", ") ?? "",
                      );
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
              {rule.exception_keywords &&
                rule.exception_keywords.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Kecualikan: {rule.exception_keywords.join(", ")}
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
            <Label htmlFor="dm-platform">Platform</Label>
            <select
              id="dm-platform"
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
            <Label htmlFor="dm-type">Tipe Rule</Label>
            <select
              id="dm-type"
              value={type}
              onChange={(e) => setType(e.target.value as RuleType)}
              className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="keyword">Keyword Auto-Reply</option>
              <option value="ai">AI Auto-Reply</option>
              <option value="text">Text Auto-Reply</option>
            </select>
          </div>

          <div>
            <Label htmlFor="dm-delay">Delay (ms)</Label>
            <Input
              id="dm-delay"
              type="number"
              value={delayMs}
              onChange={(e) => setDelayMs(e.target.value)}
              placeholder="0"
            />
            <p className="pt-1 text-xs text-muted-foreground">
              Delay sebelum auto-reply dikirim (anti-detection).
            </p>
          </div>

          {type === "keyword" && (
            <>
              <div>
                <Label htmlFor="dm-keywords">Keyword (pisahkan koma)</Label>
                <Input
                  id="dm-keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="promo, diskon, harga"
                />
                <p className="pt-1 text-xs text-muted-foreground">
                  DM yang mengandung keyword akan otomatis dibalas.
                </p>
              </div>
              <div>
                <Label htmlFor="dm-reply">Pesan Balasan</Label>
                <textarea
                  id="dm-reply"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Tulis pesan auto-reply…"
                />
              </div>
              <div>
                <Label htmlFor="dm-exceptions">
                  Kecualikan Keyword (pisahkan koma)
                </Label>
                <Input
                  id="dm-exceptions"
                  value={exceptionKeywords}
                  onChange={(e) => setExceptionKeywords(e.target.value)}
                  placeholder="stop, unsubscribe"
                />
                <p className="pt-1 text-xs text-muted-foreground">
                  DM yang mengandung keyword ini TIDAK akan di-auto-reply.
                </p>
              </div>
            </>
          )}

          {type === "ai" && (
            <div>
              <Label htmlFor="dm-ai-prompt">AI Prompt</Label>
              <textarea
                id="dm-ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="Instruksi untuk AI dalam membalas DM…"
              />
              <p className="pt-1 text-xs text-muted-foreground">
                AI akan generate balasan berdasarkan prompt ini dan konteks DM.
              </p>
            </div>
          )}

          {type === "text" && (
            <div>
              <Label htmlFor="dm-text">Pesan Balasan</Label>
              <textarea
                id="dm-text"
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
