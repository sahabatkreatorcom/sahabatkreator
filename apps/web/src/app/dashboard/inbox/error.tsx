"use client";

export default function InboxError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    console.error("[Inbox Error Boundary]", error);
    return (
        <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
                <p className="text-sm font-medium text-destructive">Halaman inbox gagal dimuat</p>
                <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
                <button
                    onClick={() => reset()}
                    className="mt-4 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
                >
                    Coba lagi
                </button>
            </div>
        </div>
    );
}
