import "@sahabat-kreator/env/web";

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appDir, "../..");
const turbopackRoot = existsSync(join(workspaceRoot, "packages")) ? workspaceRoot : appDir;

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  poweredByHeader: false,
  turbopack: {
    root: turbopackRoot,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "media-src 'self' blob: data: https:",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // Aset Next.js bersifat immutable (di-hash) → cache lama.
        source: "/_next/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/settings', destination: '/dashboard/settings' },
      { source: '/settings/:path*', destination: '/dashboard/settings/:path*' },
      { source: '/calendar', destination: '/dashboard/calendar' },
      { source: '/analytics', destination: '/dashboard/analytics' },
      { source: '/inbox', destination: '/dashboard/inbox' },
      { source: '/media', destination: '/dashboard/media' },
      { source: '/compose', destination: '/dashboard/compose' },
      { source: '/content-tools', destination: '/dashboard/content-tools' },
      { source: '/posts', destination: '/dashboard/posts' },
      { source: '/inbox-automation', destination: '/dashboard/inbox-automation' },
      { source: '/competitors', destination: '/dashboard/competitors' },
      { source: '/seb', destination: '/dashboard/seb' },
      { source: '/team', destination: '/dashboard/team' },
      { source: '/trends', destination: '/dashboard/trends' },
      { source: '/engagement', destination: '/dashboard/engagement' },
      { source: '/activity', destination: '/dashboard/activity' },
    ];
  },
};

export default nextConfig;
