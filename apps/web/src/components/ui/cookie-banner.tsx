"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { X, Cookie, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function CookieBanner() {
    const [visible, setVisible] = useState(false);
    const [open, setOpen] = useState(false);
    const [essential, setEssential] = useState(true);
    const [functional, setFunctional] = useState(false);
    const [analytics, setAnalytics] = useState(false);
    const [marketing, setMarketing] = useState(false);

    useEffect(() => {
        const choice = localStorage.getItem("cookie_consent");
        if (!choice) setVisible(true);
        else {
            try {
                const parsed = JSON.parse(choice);
                setFunctional(parsed.functional ?? false);
                setAnalytics(parsed.analytics ?? false);
                setMarketing(parsed.marketing ?? false);
            } catch { /* ignore */ }
        }
    }, []);

    function acceptAll() {
        save({ essential: true, functional: true, analytics: true, marketing: true });
    }

    function decline() {
        save({ essential: true, functional: false, analytics: false, marketing: false });
    }

    function save(choices: { essential: boolean; functional: boolean; analytics: boolean; marketing: boolean }) {
        localStorage.setItem("cookie_consent", JSON.stringify(choices));
        setVisible(false);
        setOpen(false);
    }

    if (!visible && !open) return null;

    return (
        <>
            {/* Banner */}
            {visible && (
                <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card p-4 shadow-lg">
                    <div className="container mx-auto max-w-4xl">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3 flex-1">
                                <Cookie className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium">Pengaturan Cookie</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Kami menggunakan cookie untuk meningkatkan pengalaman Anda. Cookie penting selalu aktif; lainnya dapat diatur di bawah.
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                                    <Settings className="h-4 w-4" />
                                    Kustomisasi
                                </Button>
                                <Button variant="ghost" size="sm" onClick={decline}>
                                    Tolak semua
                                </Button>
                                <Button size="sm" onClick={acceptAll}>
                                    Terima semua
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Drawer */}
            {open && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
                    <div className="relative ml-auto w-full max-w-sm bg-card border-l border-border p-6 shadow-xl overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-base font-semibold flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                Pengaturan Cookie
                            </h2>
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="space-y-5">
                            <CookieOption
                                type="essential"
                                title="Cookie Penting"
                                description="Diperlukan untuk fungsi dasar situs. Tidak dapat dinonaktifkan."
                                enabled={true}
                                toggleable={false}
                            />
                            <CookieOption
                                type="functional"
                                title="Cookie Fungsional"
                                description="Menyimpan preferensi Anda seperti bahasa dan tema."
                                enabled={functional}
                                onChange={() => setFunctional(!functional)}
                            />
                            <CookieOption
                                type="analytics"
                                title="Cookie Analitik"
                                description="Membantu kami memahami cara pengguna berinteraksi dengan situs."
                                enabled={analytics}
                                onChange={() => setAnalytics(!analytics)}
                            />
                            <CookieOption
                                type="marketing"
                                title="Cookie Pemasaran"
                                description="Digunakan untuk menampilkan konten yang relevan bagi Anda."
                                enabled={marketing}
                                onChange={() => setMarketing(!marketing)}
                            />
                        </div>

                        <div className="mt-8 flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                                Tutup
                            </Button>
                            <Button size="sm" onClick={() => save({ essential: true, functional, analytics, marketing })}>
                                Simpan Preferensi
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function CookieOption({
    type, title, description, enabled, toggleable = true, onChange,
}: {
    type: string;
    title: string;
    description: string;
    enabled: boolean;
    toggleable?: boolean;
    onChange?: () => void;
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
                <p className={cn(
                    "text-sm font-medium",
                    type === "essential" ? "text-primary" : ""
                )}>{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch
                checked={enabled}
                onCheckedChange={toggleable ? onChange : undefined}
                disabled={!toggleable}
                className={cn(
                    toggleable ? "cursor-pointer" : "cursor-default opacity-60",
                    type === "essential" && "opacity-60"
                )}
            />
        </div>
    );
}
