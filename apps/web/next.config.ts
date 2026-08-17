import "@sahabat-kreator/env/web";

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appDir, "../..");
const turbopackRoot = existsSync(join(workspaceRoot, "packages")) ? workspaceRoot : appDir;

const nextConfig: NextConfig = {
  allowedDevOrigins: ['kreator.englishbooster.id'],
  typedRoutes: true,
  reactCompiler: true,
  turbopack: {
    root: turbopackRoot,
  },
  async rewrites() {
    return [
      { source: '/', destination: '/dashboard' },
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
