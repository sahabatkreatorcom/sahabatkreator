import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Page Not Found | Sahabat Kreator",
  robots: {
    index: false,
    follow: false,
  },
};

interface Props {
  params: Promise<{ slug?: string[] }>;
}

export default async function EnglishNotFound({ params }: Props) {
  const { slug = [] } = await params;
  const path = slug.join("/");

  return (
    <main className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-2xl font-bold text-destructive">404</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Page Not Found</h1>
        <p className="mt-3 text-muted-foreground">
          The English version of this page is not yet available.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={path === "" ? "/" : `/${path}`}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ArrowLeft className="h-4 w-4" />
            View in Indonesian
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Back to Home
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          This page will be translated soon. Thank you for your patience.
        </p>
      </div>
    </main>
  );
}
