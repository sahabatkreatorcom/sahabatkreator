"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarClock, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useComposeOrchestration } from "@/hooks/use-compose-orchestration";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform } from "@/lib/platform-config";
import { PlatformIcon } from "@/components/ui/platform-icon";

interface ComposeMobileProps {
    orch: ReturnType<typeof useComposeOrchestration>;
}

const STEPS = ["Akun", "Konten", "Preview"];

export default function ComposeMobile({ orch }: ComposeMobileProps) {
    const { compose, onSaveDraft, onScheduleConfirm } = orch;
    const [step, setStep] = useState(0);

    const canProceed = step === 0 ? compose.selectedAccountIds.length > 0 : true;

    return (
        <div className="flex h-dvh flex-col bg-background">
            <header className="shrink-0 border-b border-border bg-card px-4 py-3 safe-area-top">
                <div className="flex items-center justify-between">
                    <button onClick={() => compose.router.back()} className="p-1 -ml-1">
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h1 className="text-sm font-semibold">{compose.editPostId ? "Edit Post" : "Post Baru"}</h1>
                    <div className="w-8" />
                </div>
                <div className="mt-3 flex gap-1">
                    {STEPS.map((_, i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`} />
                    ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                    {STEPS.map((s, i) => (
                        <span key={s} className={i === step ? "font-medium text-primary" : ""}>{s}</span>
                    ))}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4">
                {step === 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-medium uppercase text-muted-foreground mb-1">Pilih akun</p>
                        {compose.accounts.map((account) => {
                            const selected = compose.selectedAccountIds.includes(account.id);
                            return (
                                <button
                                    key={account.id}
                                    onClick={() => compose.setSelectedAccountIds((prev) => selected ? prev.filter((id) => id !== account.id) : [...prev, account.id])}
                                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card"}`}
                                >
                                    <div className="relative shrink-0">
                                        <span
                                            className="flex h-11 w-11 items-center justify-center rounded-full text-white"
                                            style={{ background: PLATFORM_COLORS[account.platform] }}
                                        >
                                            {account.avatar ? (
                                                <img src={account.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                                            ) : (
                                                <PlatformIcon platform={account.platform} size={20} />
                                            )}
                                        </span>
                                        {account.avatar && (
                                            <span
                                                className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background"
                                                style={{ background: PLATFORM_COLORS[account.platform] }}
                                            >
                                                <PlatformIcon platform={account.platform} size={10} />
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{account.name}</p>
                                        <p className="text-xs text-muted-foreground">{PLATFORM_LABELS[account.platform]}</p>
                                    </div>
                                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                                        {selected && (
                                            <svg className="h-3.5 w-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-4">
                        <textarea
                            value={compose.caption}
                            onChange={(e) => compose.setCaption(e.target.value)}
                            placeholder="Tulis caption kontenmu..."
                            rows={8}
                            className="w-full resize-none rounded-xl border border-input bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                            onClick={compose.handleAddMedia}
                            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
                        >
                            <ImagePlus className="h-5 w-5" />
                            <span className="text-sm font-medium">Tambah Media</span>
                        </button>
                        {compose.media.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                                {compose.media.map((m) => (
                                    <div key={m.id} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                                        {m.type === "video" ? (
                                            <video src={m.url} poster={m.thumbnailUrl} className="h-full w-full object-cover" muted />
                                        ) : (
                                            <img src={m.thumbnailUrl || m.url} alt="" className="h-full w-full object-cover" />
                                        )}
                                        <button
                                            onClick={() => compose.setMedia(compose.media.filter((x) => x.id !== m.id))}
                                            className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center text-xs"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Akun</p>
                            <div className="flex flex-wrap gap-2">
                                {compose.selectedAccounts.map((a) => (
                                    <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ background: PLATFORM_COLORS[a.platform] }}>
                                        <PlatformIcon platform={a.platform} size={12} />
                                        {a.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Caption</p>
                            <p className="text-sm whitespace-pre-wrap">{compose.caption || "(kosong)"}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Media</p>
                            <p className="text-sm">{compose.media.length} file</p>
                        </div>
                    </div>
                )}
            </main>

            <footer className="shrink-0 border-t border-border bg-card px-4 py-3 safe-area-bottom">
                <div className="flex gap-2">
                    {step > 0 && (
                        <Button variant="secondary" onClick={() => setStep((s) => s - 1)} className="flex-1">
                            <ChevronLeft className="mr-1 h-4 w-4" /> Kembali
                        </Button>
                    )}
                    {step < STEPS.length - 1 ? (
                        <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed} className="flex-1">
                            Lanjut <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={onSaveDraft} loading={compose.isSaving} className="flex-1">
                                Draft
                            </Button>
                            <Button onClick={onScheduleConfirm} loading={compose.isScheduling} className="flex-1">
                                <CalendarClock className="mr-1 h-4 w-4" /> Terbitkan
                            </Button>
                        </>
                    )}
                </div>
            </footer>
        </div>
    );
}
