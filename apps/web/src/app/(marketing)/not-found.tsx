import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function MarketingNotFound() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
            <p className="text-6xl font-bold text-primary">404</p>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Halaman Tidak Ditemukan</h1>
            <p className="mt-2 max-w-md text-muted-foreground">
                Halaman yang Anda cari tidak ada atau telah dipindahkan.
            </p>
            <div className="mt-8">
                <Link href="/">
                    <Button>Kembali ke Beranda</Button>
                </Link>
            </div>
        </div>
    );
}
