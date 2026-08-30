"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Send, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useComposeOrchestration } from "@/hooks/use-compose-orchestration";

interface ComposeMobileProps {
    orch: ReturnType<typeof useComposeOrchestration>;
}

const STEPS = ["Akun", "Konten", "Setelan", "Preview"];

export default function ComposeMobile({ orch }: ComposeMobileProps) {
    const { compose, onSaveDraft, onScheduleConfirm, onPublishNow } = orch;
    const [step, setStep] = useState(0);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="sticky top-0 z-40 border-b border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between">
                    <button onClick={() => compose.router.back()} className="p-1">
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h1 className="text-sm font-semibold">{compose.editPostId ? "Edit Post" : "Post Baru"}</h1>
                    <div className="w-8" />
                </div>
                <div className="mt-3 flex gap-1">
                    {STEPS.map((s, i) => (
                        <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
                    ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                    {STEPS.map((s, i) => (
                        <span key={s} className={i === step ? "font-medium text-primary" : ""}>{s}</span>
                    ))}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 pb-24">
                {step === 0 && (
                    <div className="space-y-3">
                        <p className="text-xs font-medium uppercase text-muted-foreground">Pilih akun</p>
                        {compose.accounts.map((account) => {
                            const selected = compose.selectedAccountIds.includes(account.id);
                            return (
                                <button
                                    key={account.id}
                                    onClick={() => compose.setSelectedAccountIds((prev) => selected ? prev.filter((id) => id !== account.id) : [...prev, account.id])}
                                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left ${selected ? "border-primary bg-primary/10" : "border-border"}`}
                                >
                                    {account.avatar ? (
                                        <img src={account.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                                    ) : (
                                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{account.name[0]}</div>
                                    )}
                                    <div>
                                        <p className="text-sm font-medium">{account.name}</p>
                                        <p className="text-xs text-muted-foreground">{account.platform}</p>
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
                            placeholder="Tulis caption..."
                            rows={6}
                            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <Button variant="secondary" onClick={compose.handleAddMedia} className="w-full">
                            Tambah Media
                        </Button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-3">
                        <p className="text-xs font-medium uppercase text-muted-foreground">Ringkasan platform</p>
                        {compose.uniquePlatforms.map((p) => (
                            <div key={p} className="rounded-lg border border-border p-3">
                                <p className="text-sm font-medium">{p}</p>
                            </div>
                        ))}
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-border p-4">
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Caption</p>
                            <p className="text-sm">{compose.caption || "(kosong)"}</p>
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Media</p>
                            <p className="text-sm">{compose.media.length} file</p>
                        </div>
                    </div>
                )}
            </main>

            <footer className="fixed bottom-0 inset-x-0 border-t border-border bg-card px-4 py-3 flex gap-2">
                {step > 0 && (
                    <Button variant="secondary" onClick={() => setStep((s) => s - 1)} className="flex-1">
                        <ChevronLeft className="mr-1 h-4 w-4" /> Kembali
                    </Button>
                )}
                {step < STEPS.length - 1 ? (
                    <Button onClick={() => setStep((s) => s + 1)} className="flex-1">
                        Lanjut <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                ) : (
                    <>
                        <Button variant="secondary" onClick={onSaveDraft} loading={compose.isSaving} className="flex-1">
                            Draft
                        </Button>
                        <Button onClick={onScheduleConfirm} loading={compose.isScheduling} className="flex-1">
                            <CalendarClock className="mr-1 h-4 w-4" /> Jadwalkan
                        </Button>
                    </>
                )}
            </footer>
        </div>
    );
}
