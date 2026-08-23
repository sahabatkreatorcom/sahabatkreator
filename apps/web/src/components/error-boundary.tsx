"use client";

import * as React from "react";

export function ErrorBoundary({
    children,
    fallback,
}: {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}) {
    const [hasError, setHasError] = React.useState(false);
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
        const handler = (event: ErrorEvent) => {
            console.error("[ErrorBoundary] Caught:", event.error);
            setHasError(true);
            setError(event.error instanceof Error ? event.error : new Error(String(event.error)));
        };
        window.addEventListener("error", handler);
        return () => window.removeEventListener("error", handler);
    }, []);

    if (hasError) {
        if (fallback) return fallback;
        return (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-accent-red/30 bg-accent-red/5 p-6">
                <div className="text-center">
                    <p className="text-sm font-medium text-accent-red">Terjadi kesalahan</p>
                    <p className="mt-1 text-xs text-muted-foreground">{error?.message}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:opacity-90"
                    >
                        Muat ulang
                    </button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
