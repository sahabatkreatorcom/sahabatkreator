import { Metadata } from "next";

export function generateSeoMetadata(
  title: string,
  description: string,
  imagePath = "/og-image.jpg",
  canonical = "https://sahabatkreator.id",
): Metadata {
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${canonical}/blog/${encodeURIComponent(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""))}`,
      images: [{ url: imagePath, width: 1200, height: 630, alt: title }],
      type: "article",
      publishedTime: new Date().toISOString(),
      modifiers: ["og:locale"],
      siteName: "Sahabat Kreator",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imagePath],
    },
    alternates: {
      canonical,
    },
  };
}
