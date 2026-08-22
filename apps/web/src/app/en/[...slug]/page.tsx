import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string[] }>;
}

// Halaman-halaman yang sudah punya terjemahan English
const EN_PAGES = new Set([
  "",                    // root /en
  "kebijakan-privasi",
  "penghapusan-data",
  "syarat-ketentuan",
]);

export async function generateStaticParams() {
  // Generate semua path marketing untuk SSG
  return [
    { slug: [] },
    { slug: ["tentang"] },
    { slug: ["fitur"] },
    { slug: ["harga"] },
    { slug: ["blog"] },
    { slug: ["faq"] },
    { slug: ["karir"] },
    { slug: ["kontak"] },
    { slug: ["kebijakan-privasi"] },
    { slug: ["penghapusan-data"] },
    { slug: ["syarat-ketentuan"] },
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = slug.join("/");
  const isRoot = slug.length === 0;
  
  const titles: Record<string, string> = {
    "": "Sahabat Kreator | AI-Powered Social Media Management Platform",
    "tentang": "About Us | Sahabat Kreator",
    "fitur": "Features | Sahabat Kreator",
    "harga": "Pricing | Sahabat Kreator",
    "blog": "Blog | Sahabat Kreator",
    "faq": "FAQ | Sahabat Kreator",
    "karir": "Careers | Sahabat Kreator",
    "kontak": "Contact Us | Sahabat Kreator",
    "kebijakan-privasi": "Privacy Policy | Sahabat Kreator",
    "penghapusan-data": "Data Deletion Policy | Sahabat Kreator",
    "syarat-ketentuan": "Terms & Conditions | Sahabat Kreator",
  };

  const title = titles[path] || `Page | Sahabat Kreator`;

  return {
    title,
    alternates: {
      canonical: `https://sahabatkreator.com${isRoot ? "/en" : `/en/${path}`}`,
      languages: {
        "id-ID": `https://sahabatkreator.com${isRoot ? "/" : `/${path}`}`,
        "en-US": `https://sahabatkreator.com${isRoot ? "/en" : `/en/${path}`}`,
      },
    },
  };
}

export default async function EnglishFallbackPage({ params }: Props) {
  const { slug } = await params;
  const path = slug.join("/");

  // Redirect ke halaman English jika tersedia
  if (!EN_PAGES.has(path)) {
    // Halaman ini belum punya terjemahan - redirect ke versi Indonesia
    // dengan hint bahwa ini tidak tersedia dalam English
    redirect(path === "" ? "/" : `/${path}`);
  }

  // Render halaman English yang sudah tersedia
  // Untuk halaman legal (privacy, terms, etc), kita render dari folder yang sesuai
  const pageComponent = await import(`@/components/en/${path}/page`);
  
  return pageComponent.default();
}
