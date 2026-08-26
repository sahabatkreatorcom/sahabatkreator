"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function slugify(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

export function NewWorkspaceForm() {
    const router = useRouter();
    const [name, setName] = React.useState("");
    const [slug, setSlug] = React.useState("");
    const [slugTouched, setSlugTouched] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // slug mengikuti nama otomatis, kecuali user pernah edit slug manual
    React.useEffect(() => {
        if (!slugTouched) setSlug(slugify(name));
    }, [name, slugTouched]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!slug) {
            setError("URL workspace tidak boleh kosong.");
            return;
        }

        setLoading(true);
        const { data, error } = await authClient.organization.create({ name, slug });
        setLoading(false);

        if (error) {
            setError(
                error.code === "ORGANIZATION_SLUG_TAKEN" || error.message?.includes("slug")
                    ? "URL workspace ini sudah dipakai. Coba yang lain."
                    : "Gagal membuat workspace. Coba lagi."
            );
            return;
        }

        await authClient.organization.setActive({ organizationId: data.id });
        router.push("/dashboard");
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
                <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                    {error}
                </div>
            )}

            <div>
                <Label htmlFor="ws-name">Nama workspace</Label>
                <Input
                    id="ws-name"
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Brand ABC"
                />
            </div>

            <div>
                <Label htmlFor="ws-slug">URL workspace</Label>
                <div className="flex items-center rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
                    <span className="pl-3 text-sm text-muted-foreground">{(process.env.NEXT_PUBLIC_APP_URL || "https://sahabatkreator.com").replace("https://", "")}/</span>
                    <input
                        id="ws-slug"
                        required
                        value={slug}
                        onChange={(e) => {
                            setSlugTouched(true);
                            setSlug(slugify(e.target.value));
                        }}
                        placeholder="brand-abc"
                        className="h-10 w-full bg-transparent pr-3 text-sm text-foreground focus-visible:outline-none"
                    />
                </div>
            </div>

            <Button type="submit" className="w-full" loading={loading}>
                Buat workspace
            </Button>
        </form>
    );
}