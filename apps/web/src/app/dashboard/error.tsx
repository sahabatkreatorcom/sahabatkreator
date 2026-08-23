"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    React.useEffect(() => {
        console.error("[Dashboard Error]", error);
    }, [error]);

    return (
        <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
                <p className="text-lg font-medium text-destructive">Halaman gagal dimuat</p>
                <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
                    Coba lagi
                </Button>
            </div>
        </div>
    );
}
