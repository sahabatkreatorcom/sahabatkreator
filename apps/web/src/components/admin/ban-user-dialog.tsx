"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const durations = [
    { value: "86400", label: "1 hari" },
    { value: "604800", label: "7 hari" },
    { value: "2592000", label: "30 hari" },
    { value: "", label: "Permanen" },
];

export function BanUserDialog({
    open,
    userName,
    userId,
    onClose,
    onBanned,
}: {
    open: boolean;
    userName: string;
    userId: string;
    onClose: () => void;
    onBanned: () => void;
}) {
    const [reason, setReason] = React.useState("");
    const [duration, setDuration] = React.useState("604800");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error } = await authClient.admin.banUser({
            userId,
            banReason: reason || undefined,
            banExpiresIn: duration ? Number(duration) : undefined,
        });

        setLoading(false);
        if (error) {
            setError("Gagal ban user. Coba lagi.");
            return;
        }
        setReason("");
        onBanned();
    }

    return (
        <Dialog open={open} onClose={onClose} title={`Ban ${userName}`} description="User tidak akan bisa masuk selama durasi ini.">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div role="alert" className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
                        {error}
                    </div>
                )}

                <div>
                    <Label htmlFor="ban-reason">Alasan (opsional, tersimpan di catatan internal)</Label>
                    <Input id="ban-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. spam, pelanggaran ToS" />
                </div>

                <div>
                    <Label htmlFor="ban-duration">Durasi</Label>
                    <select
                        id="ban-duration"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {durations.map((d) => (
                            <option key={d.label} value={d.value}>
                                {d.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" variant="destructive" loading={loading}>
                        Ban user
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}