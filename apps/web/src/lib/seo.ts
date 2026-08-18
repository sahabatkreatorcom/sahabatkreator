/**
 * SEO Metadata Generator
 * Provides standard SEO metadata for all pages
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Sahabat Kreator — Platform Manajemen Media Sosial AI",
    template: "%s | Sahabat Kreator",
  },
  description:
    "Sahabat Kreator adalah platform manajemen media sosial AI-powered. Kelola semua akun sosial media Anda dalam satu dashboard, buat konten lebih cepat dengan AI, dan analisis performa secara real-time.",
  keywords: [
    "media sosial",
    "social media management",
    "AI content",
    "scheduling",
    "analytics",
    "Instagram",
    "TikTok",
    "Facebook",
    "LinkedIn",
    "YouTube",
    "content calendar",
    "brand management",
    "sosmed manager",
  ],
  authors: [{ name: "Sahabat Kreator" }],
  creator: "Sahabat Kreator",
  publisher: "Sahabat Kreator",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "https://sahabatkreator.id",
    siteName: "Sahabat Kreator",
    title: "Sahabat Kreator — Platform Manajemen Media Sosial AI",
    description:
      "Platform manajemen media sosial AI-powered. Kelola semua akun sosial media dalam satu dashboard.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Sahabat Kreator Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sahabat Kreator — Platform Manajemen Media Sosial AI",
    description:
      "Platform manajemen media sosial AI-powered. Kelola semua akun sosial media dalam satu dashboard.",
    images: ["/og-image.jpg"],
    creator: "@sahabatkreator",
  },
  alternates: {
    canonical: "https://sahabatkreator.id",
  },
  category: "social media management",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sahabat Kreator",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/icons/icon-192.png" },
      { url: "/icons/icon-512.png" },
    ],
  },
  manifest: "/manifest.json",
  appLinks: {
    web: {
      url: "https://sahabatkreator.id/dashboard",
      should_fallback: false,
    },
  },
};

export const seo = {
  title: "Sahabat Kreator — Platform Manajemen Media Sosial AI",
  description:
    "Platform manajemen media sosial AI-powered. Kelola semua akun sosial media dalam satu dashboard.",
  url: "https://sahabatkreator.id",
  image: "/og-image.jpg",
};
