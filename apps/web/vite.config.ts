import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// ============================================================
// Build-time staging guard (pola deploy-lama) via env VITE_*:
//   - PROD:    VITE_INDEXABLE=true → robots.txt + sitemap.xml normal (index Google)
//   - STAGING: VITE_INDEXABLE kosong → override robots.txt jadi Disallow /,
//              hapus sitemap.xml statis, inject <meta robots noindex> ke index.html
// VITE_SERVER_URL = origin API (prod: sahabatkreator.com, staging: app.sahabatkreator.com)
// VITE_WEB_URL    = canonical SEO (SELALU https://sahabatkreator.com — dipakai seo.ts
//                   untuk canonical/og:url, jadi staging tidak membuat URL kanonik palsu)
// ============================================================
const INDEXABLE = process.env.VITE_INDEXABLE === "true" || process.env.INDEXABLE === "true";
// __dirname ESM-safe (vite.config.ts dimuat sebagai ESM)
const __dirname = fileURLToPath(new URL(".", import.meta.url));

function stagingSeoGuardPlugin(): Plugin {
  return {
    name: "sahabatkreator:staging-seo-guard",
    apply: "build",
    closeBundle() {
      if (INDEXABLE) return; // Prod pakai robots.txt + sitemap.xml di public/
      const outDir = path.resolve(__dirname, "dist");
      if (!existsSync(outDir)) return;
      // Override robots.txt → Disallow all
      writeFileSync(
        path.join(outDir, "robots.txt"),
        "User-agent: *\nDisallow: /\n# STAGING — jangan index apapun\n",
      );
      // Hapus sitemap statis biar tidak terbaca crawler
      const smFile = path.join(outDir, "sitemap.xml");
      if (existsSync(smFile)) unlinkSync(smFile);
      // Inject <meta name=robots content=noindex> ke awal <head> index.html
      const idx = path.join(outDir, "index.html");
      if (existsSync(idx)) {
        let html = readFileSync(idx, "utf8");
        if (!html.includes("noindex")) {
          html = html.replace(
            "<head>",
            `<head>\n    <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, notranslate, noimageindex">\n    <meta name="googlebot" content="noindex, nofollow">`,
          );
          writeFileSync(idx, html);
        }
      }
      console.log("\n✅ Staging SEO guard diterapkan: robots Disallow + index.html meta noindex");
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    stagingSeoGuardPlugin(),
    VitePWA({
      // injectManifest: pakai custom SW src/sw.ts (punya push handler) —
      // Workbox precache di-inject saat build, event push tetap milik SW custom.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon-16.png",
        "favicon-32.png",
        "apple-touch-icon.png",
        "og-default.png",
        "offline.html",
      ],
      manifest: {
        name: "Sahabat Kreator",
        short_name: "SahabatKreator",
        lang: "id",
        description:
          "Kelola semua konten social media Anda dari satu tempat — jadwal posting, analitik, dan kolaborasi tim.",
        theme_color: "#0C1627",
        background_color: "#FAF8F6",
        display: "standalone",
        start_url: "/dashboard",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Buat Konten",
            url: "/compose",
          },
          {
            name: "Kalender",
            url: "/calendar",
          },
          {
            name: "Inbox DM",
            url: "/inbox",
          },
        ],
        share_target: {
          action: "/compose",
          method: "GET",
          // enctype wajib eksplisit untuk menghilangkan warning parser manifest
          // Chrome ("Manifest: Enctype should be set to either..."); untuk GET
          // nilainya diabaikan, jadi aman.
          enctype: "application/x-www-form-urlencoded",
          params: { title: "title", text: "text", url: "url" },
        },
        // "Buka dengan Sahabat Kreator" dari file manager (PWA ter-install) —
        // file diterima di halaman compose via window.launchQueue
        file_handlers: [
          {
            action: "/compose",
            accept: {
              "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"],
              "video/*": [".mp4", ".mov", ".webm"],
            },
          },
        ],
      },
      buildBase: true,
      pwaAssets: { disabled: true },
      // Dev SW: injectManifest tidak didukung devOptions type module secara stabil —
      // dev-sw.js gagal eval "import outside module". Solusi: matikan SW di dev,
      // precache + push hanya aktif di build produksi (punya sw.ts custom).
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Pisahkan vendor berat ke chunk sendiri agar cache browser lebih
        // efektif (app code berubah lebih sering daripada vendor).
        // Hanya dependency yang benar-benar dipakai apps/web:
        // recharts (+ dep d3-*, victory-vendor), react-router, @tanstack/react-query,
        // @hello-pangea/dnd, dan grup workspace (@sahabatkreator/*).
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) {
              return "charts";
            }
            if (id.includes("react-router")) return "router";
            if (id.includes("@tanstack")) return "query";
            if (id.includes("@hello-pangea")) return "dnd";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    // Proxy API ke server dev — semua request same-origin sehingga
    // cookie auth selalu terkirim (menghindari masalah SameSite cross-origin).
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/sitemap-blog.xml": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
