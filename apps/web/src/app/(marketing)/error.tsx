"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function MarketingError() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
            <p className="text-6xl font-bold text-primary">500</p>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Terjadi Kesalahan</h1>
            <p className="mt-2 max-w-md text-muted-foreground">
                Maaf, ada kendala teknis saat memuat halaman ini. Silakan coba lagi sebentar lagi.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Button onClick={() => window.location.reload()}>Coba Lagi</Button>
                <Link href="/">
                    <Button variant="secondary">Kembali ke Beranda</Button>
                </Link>
            </div>
        </div>
    );
}
