import type { Platform } from "@/lib/platforms";
import type { InboxAdapter } from "./types";

export class InboxAdapterRegistry {
  private adapters: InboxAdapter[] = [];

  register(adapter: InboxAdapter): void {
    this.adapters.push(adapter);
    this.adapters.sort((a, b) => a.priority - b.priority);
  }

  getAdapter(platform: Platform): InboxAdapter | undefined {
    return this.adapters.find(
      (a) => a.supportsPlatform(platform) && a.isConfigured(),
    );
  }

  getFallbackAdapter(platform: Platform): InboxAdapter | undefined {
    return this.adapters.find((a) => a.supportsPlatform(platform));
  }

  getAllAdapters(): InboxAdapter[] {
    return [...this.adapters];
  }

  getStats(): {
    totalAdapters: number;
    configuredAdapters: number;
    platformMap: Record<string, string>;
  } {
    const platformMap: Record<string, string> = {};
    const configured = this.adapters.filter((a) => a.isConfigured());

    for (const a of configured) {
      for (const p of [
        "INSTAGRAM",
        "INSTAGRAM_PAGE",
        "FACEBOOK",
        "META",
        "TIKTOK",
        "YOUTUBE",
        "THREADS",
        "LINKEDIN",
      ] as Platform[]) {
        if (a.supportsPlatform(p)) {
          platformMap[p] = a.name;
        }
      }
    }

    return {
      totalAdapters: this.adapters.length,
      configuredAdapters: configured.length,
      platformMap,
    };
  }
}
