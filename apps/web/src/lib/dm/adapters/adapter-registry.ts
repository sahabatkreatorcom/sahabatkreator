import type { Platform } from "@/lib/platforms";
import type { DMAdapter } from "./types";

export class DMAdapterRegistry {
  private adapters: DMAdapter[] = [];

  register(adapter: DMAdapter): void {
    this.adapters.push(adapter);
    this.adapters.sort((a, b) => a.priority - b.priority);
  }

  getAdapter(platform: Platform): DMAdapter | undefined {
    return this.adapters.find(
      (a) => a.supportsPlatform(platform) && a.isConfigured(),
    );
  }

  getFallbackAdapter(platform: Platform): DMAdapter | undefined {
    return this.adapters.find((a) => a.supportsPlatform(platform));
  }

  getAllAdapters(): DMAdapter[] {
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
