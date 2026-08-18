import { seo } from "@/lib/seo";

export default function Page() {
  return (
    <html lang="id">
      <head>
        <meta name="robots" content="index, follow" />
        <meta property="og:locale" content="id_ID" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta property="og:url" content={seo.url} />
        <meta property="og:image" content={seo.image} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <meta name="twitter:image" content={seo.image} />
        <meta name="theme-color" content="#D4A574" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Sahabat Kreator" />
        <meta name="msapplication-TileColor" content="#D4A574" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon/favicon.png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/favicon/apple-touch-icon.png" />
        <link rel="alternate" type="application/rss+xml" title="Sahabat Kreator" href="/rss.xml" />
      </head>
      <body />
    </html>
  );
}
