"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
    Loader2,
    Save,
    CheckCircle2,
    User,
    Building2,
    Palette,
    Bell,
    Globe,
    Sparkles,
    CreditCard,
    Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

interface Organization {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    timezone: string;
    accentColor: string;
    accentColorAlt: string;
    darkMode: boolean;
    aiDraftsEnabled: boolean;
    tier: string;
    subscriptionStatus: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
}

interface BrandVoice {
    id: string;
    samples: string[];
    toneProfile: Record<string, unknown> | null;
    guidelines: string | null;
}

interface OrgData {
    organization: Organization;
    brandVoice: BrandVoice | null;
    currentUserId: string | null;
}

const TIMEZONES = [
    "Asia/Jakarta",
    "Asia/Makassar",
    "Asia/Jayapura",
    "UTC",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Australia/Sydney",
];

type Tab = "profile" | "organization" | "appearance" | "notifications" | "accounts" | "brand-tone" | "security";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profil", icon: <User className="h-4 w-4" /> },
    { id: "organization", label: "Workspace", icon: <Building2 className="h-4 w-4" /> },
    { id: "appearance", label: "Tampilan", icon: <Palette className="h-4 w-4" /> },
    { id: "notifications", label: "Notifikasi", icon: <Bell className="h-4 w-4" /> },
    { id: "accounts", label: "Akun Terhubung", icon: <Globe className="h-4 w-4" /> },
    { id: "brand-tone", label: "Brand Voice", icon: <Sparkles className="h-4 w-4" /> },
    { id: "security", label: "Keamanan", icon: <Shield className="h-4 w-4" /> },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>("profile");
    const [data, setData] = useState<OrgData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [orgName, setOrgName] = useState("");
    const [timezone, setTimezone] = useState("Asia/Jakarta");
    const [darkMode, setDarkMode] = useState(false);
    const [aiDraftsEnabled, setAiDraftsEnabled] = useState(true);
    const [accentColor, setAccentColor] = useState("#D4A574");
    const [accentColorAlt, setAccentColorAlt] = useState("#E8B4B8");
    const [brandGuidelines, setBrandGuidelines] = useState("");
    const [brandSamples, setBrandSamples] = useState("");
    const [currentUser, setCurrentUser] = useState({ name: "", email: "", emailVerified: false });

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/organization");
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal memuat pengaturan.");
            setData(json);
            setOrgName(json.organization.name);
            setTimezone(json.organization.timezone);
            setDarkMode(json.organization.darkMode);
            setAiDraftsEnabled(json.organization.aiDraftsEnabled);
            setAccentColor(json.organization.accentColor);
            setAccentColorAlt(json.organization.accentColorAlt);
            setBrandGuidelines(json.brandVoice?.guidelines ?? "");
            setBrandSamples(json.brandVoice?.samples?.join(", ") ?? "");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal memuat pengaturan.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Load current user from auth client
    React.useEffect(() => {
        authClient.getSession().then((res) => {
            if (res?.data?.user) {
                const u = res.data.user;
                setCurrentUser({
                    name: u.name ?? "",
                    email: u.email ?? "",
                    emailVerified: u.emailVerified ?? false,
                });
            }
        });
    }, []);

    async function handleSaveOrg() {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const res = await fetch("/api/organization", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: orgName, timezone, darkMode, aiDraftsEnabled, accentColor, accentColorAlt }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal menyimpan.");
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan.");
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveBrandVoice() {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const res = await fetch("/api/organization", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    samples: brandSamples.split(",").map((s) => s.trim()).filter(Boolean),
                    guidelines: brandGuidelines,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Gagal menyimpan.");
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Gagal menyimpan.");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return <p className="py-12 text-sm text-muted-foreground">Memuat pengaturan…</p>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-lg font-semibold">Pengaturan</h1>
                <p className="text-sm text-muted-foreground">Kelola workspace, tampilan, dan pengaturan akun.</p>
            </div>

            {error && <p className="rounded-md bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>}
            {saved && (
                <p className="flex items-center gap-2 rounded-md bg-accent-green/10 px-3 py-2 text-sm text-accent-green">
                    <CheckCircle2 className="h-4 w-4" /> Tersimpan
                </p>
            )}

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-border">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                            activeTab === tab.id
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="min-h-[400px]">
                {activeTab === "profile" && (
                    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
                        <h2 className="text-sm font-semibold">Profil Saya</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Nama lengkap</Label>
                                <Input value={currentUser.name} disabled className="bg-muted" />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input value={currentUser.email} disabled className="bg-muted" />
                                {currentUser.emailVerified && (
                                    <span className="text-xs text-accent-green">Terverifikasi ✓</span>
                                )}
                            </div>
                        </div>
                        <div className="pt-2">
                            <a href="/api/auth/signout" className="text-sm text-accent-red hover:underline">
                                Keluar
                            </a>
                        </div>
                    </div>
                )}

                {activeTab === "organization" && data && (
                    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
                        <h2 className="text-sm font-semibold">Pengaturan Workspace</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="org-name">Nama workspace</Label>
                                <Input
                                    id="org-name"
                                    value={orgName}
                                    onChange={(e) => setOrgName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tz">Timezone</Label>
                                <Select value={timezone} onValueChange={setTimezone}>
                                    <SelectTrigger id="tz">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TIMEZONES.map((tz) => (
                                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex items-center justify-between rounded-md border border-border p-3">
                            <div>
                                <p className="text-sm font-medium">AI Drafts</p>
                                <p className="text-xs text-muted-foreground">Aktifkan saran konten AI</p>
                            </div>
                            <Switch checked={aiDraftsEnabled} onCheckedChange={setAiDraftsEnabled} />
                        </div>
                        <Button onClick={handleSaveOrg} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Simpan pengaturan
                        </Button>
                    </div>
                )}

                {activeTab === "appearance" && (
                    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
                        <h2 className="text-sm font-semibold">Tampilan</h2>
                        <div className="flex items-center justify-between rounded-md border border-border p-3">
                            <div>
                                <p className="text-sm font-medium">Mode gelap</p>
                                <p className="text-xs text-muted-foreground">Ubah tampilan ke mode gelap</p>
                            </div>
                            <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Warna utama</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="color"
                                        value={accentColor}
                                        onChange={(e) => setAccentColor(e.target.value)}
                                        className="h-10 w-10 rounded-md p-1"
                                    />
                                    <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="font-mono" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Warna sekunder</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="color"
                                        value={accentColorAlt}
                                        onChange={(e) => setAccentColorAlt(e.target.value)}
                                        className="h-10 w-10 rounded-md p-1"
                                    />
                                    <Input value={accentColorAlt} onChange={(e) => setAccentColorAlt(e.target.value)} className="font-mono" />
                                </div>
                            </div>
                        </div>
                        <Button onClick={handleSaveOrg} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Simpan tampilan
                        </Button>
                    </div>
                )}

                {activeTab === "notifications" && (
                    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
                        <h2 className="text-sm font-semibold">Pengaturan Notifikasi</h2>
                        <p className="text-sm text-muted-foreground">
                            Kelola notifikasi untuk postingan, error, dan akun.
                        </p>
                        <div className="space-y-3">
                            {["post_published", "post_failed", "token_expiring"].map((type) => (
                                <div key={type} className="flex items-center justify-between rounded-md border border-border p-3">
                                    <div>
                                        <p className="text-sm font-medium capitalize">{type.replace(/_/g, " ")}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {type === "post_published" && "Notifikasi saat postingan terbit"}
                                            {type === "post_failed" && "Notifikasi saat postingan gagal"}
                                            {type === "token_expiring" && "Notifikasi saat token mendekati kadaluarsa"}
                                        </p>
                                    </div>
                                    <Switch defaultChecked />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === "accounts" && (
                    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold">Akun Terhubung</h2>
                            <a href="/accounts" className="text-xs font-medium text-primary hover:underline">
                                Kelola akun
                            </a>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Kelola akun media sosial di halaman Akun.
                        </p>
                        <a href="/accounts">
                            <Button size="sm">Kelola Akun</Button>
                        </a>
                    </div>
                )}

                {activeTab === "brand-tone" && (
                    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
                        <h2 className="text-sm font-semibold">Brand Voice</h2>
                        <p className="text-sm text-muted-foreground">
                            Tetapkan nada komunikasi brand untuk konten AI.
                        </p>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="brand-guidelines">Pedoman Brand</Label>
                                <Textarea
                                    id="brand-guidelines"
                                    value={brandGuidelines}
                                    onChange={(e) => setBrandGuidelines(e.target.value)}
                                    placeholder="Contoh: Gunakan bahasa yang santai dan ramah. Hindari jargon teknis."
                                    rows={4}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="brand-samples">Contoh Konten (pisahkan koma)</Label>
                                <Input
                                    id="brand-samples"
                                    value={brandSamples}
                                    onChange={(e) => setBrandSamples(e.target.value)}
                                    placeholder="Contoh: postingan_1.html, postingan_2.html"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Tambahkan URL konten yang mewakili brand Anda.
                                </p>
                            </div>
                        </div>
                        <Button onClick={handleSaveBrandVoice} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Simpan brand voice
                        </Button>
                    </div>
                )}

                {activeTab === "security" && (
                    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
                        <h2 className="text-sm font-semibold">Keamanan</h2>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between rounded-md border border-border p-3">
                                <div>
                                    <p className="text-sm font-medium">Two-Factor Authentication</p>
                                    <p className="text-xs text-muted-foreground">Tambahkan lapisan keamanan tambahan</p>
                                </div>
                                <Button size="sm" variant="secondary">Aktifkan</Button>
                            </div>
                            <div className="flex items-center justify-between rounded-md border border-border p-3">
                                <div>
                                    <p className="text-sm font-medium">Ubah Password</p>
                                    <p className="text-xs text-muted-foreground">Keamanani akun Anda</p>
                                </div>
                                <a href="/auth/change-password">
                                    <Button size="sm" variant="secondary">Ubah</Button>
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}