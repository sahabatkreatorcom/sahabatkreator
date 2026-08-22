import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string[] }>;
}

// Halaman yang sudah punya versi English lengkap
const EN_PAGES = ["kebijakan-privasi", "penghapusan-data", "syarat-ketentuan"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = slug.join("/");
  
  const titles: Record<string, string> = {
    "kebijakan-privasi": "Privacy Policy | Sahabat Kreator",
    "penghapusan-data": "Data Deletion Policy | Sahabat Kreator",
    "syarat-ketentuan": "Terms & Conditions | Sahabat Kreator",
  };

  return {
    title: titles[path] || "Page | Sahabat Kreator",
    alternates: {
      canonical: `https://sahabatkreator.com/en/${path}`,
      languages: {
        "id-ID": `https://sahabatkreator.com/${path}`,
        "en-US": `https://sahabatkreator.com/en/${path}`,
      },
    },
    robots: {
      index: EN_PAGES.includes(path),
      follow: true,
    },
  };
}

export default async function EnglishFallbackPage({ params }: Props) {
  const { slug = [] } = await params;
  const path = slug.join("/");

  // Jika ini halaman legal yang sudah ada versi English-nya
  if (EN_PAGES.includes(path)) {
    // Render komponen dari folder app yang sesuai
    const PageComponent = (await import(`../${path}/page`)).default;
    return <PageComponent />;
  }

  // Untuk halaman lain yang belum diterjemahkan
  return (
    <main className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <span className="text-2xl font-bold text-primary">🌐</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Not Available in English</h1>
        <p className="mt-3 text-muted-foreground">
          This page is currently only available in Indonesian.
        </p>
        <div className="mt-8">
          <a
            href={`/${path}`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            View in Indonesian →
          </a>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          We&apos;re working on translations. Thank you for your patience.
        </p>
      </div>
    </main>
  );
}
