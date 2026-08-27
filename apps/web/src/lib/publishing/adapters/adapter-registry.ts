import type { Platform } from "@/lib/platforms";
import type { AdapterEntry, PublishingAdapter } from "./types";

class AdapterRegistry {
  private adapters: Map<Platform, AdapterEntry[]> = new Map();
  private initialized = false;

  register(platform: Platform, adapter: PublishingAdapter, priority: number) {
    const existing = this.adapters.get(platform) || [];
    existing.push({ adapter, priority });
    existing.sort((a, b) => a.priority - b.priority);
    this.adapters.set(platform, existing);
  }

  getAdapter(platform: Platform): PublishingAdapter | null {
    const entries = this.adapters.get(platform) || [];
    for (const entry of entries) {
      if (
        entry.adapter.isConfigured() &&
        entry.adapter.supportsPlatform(platform)
      ) {
        return entry.adapter;
      }
    }
    return null;
  }

  getAllAdapters(platform: Platform): AdapterEntry[] {
    return this.adapters.get(platform) || [];
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  setInitialized(value: boolean) {
    this.initialized = value;
  }
}

export const adapterRegistry = new AdapterRegistry();
