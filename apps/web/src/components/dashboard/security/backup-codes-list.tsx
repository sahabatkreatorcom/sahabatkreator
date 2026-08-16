"use client";

import * as React from "react";
import { Copy, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackupCodesList({ codes }: { codes: string[] }) {
    const [copied, setCopied] = React.useState(false);

    function handleCopy() {
        navigator.clipboard.writeText(codes.join("\n"));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function handleDownload() {
        const blob = new Blob([codes.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "sahabat-kreator-backup-codes.txt";
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted p-4 font-mono text-sm">
                {codes.map((code) => (
                    <span key={code}>{code}</span>
                ))}
            </div>
            <div className="mt-3 flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Tersalin" : "Salin"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleDownload}>
                    <Download className="h-3.5 w-3.5" />
                    Unduh .txt
                </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
                Setiap kode hanya bisa dipakai sekali. Simpan di tempat aman — kode ini
                cara Anda masuk kalau kehilangan akses ke aplikasi authenticator.
            </p>
        </div>
    );
}