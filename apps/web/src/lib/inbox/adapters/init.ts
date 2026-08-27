import { env } from "@sahabat-kreator/env/server";
import { InboxAdapterRegistry } from "./adapter-registry";
import { NativeInboxAdapter } from "./native/adapter";
import { ReplizInboxAdapter } from "./repliz/adapter";

let registry: InboxAdapterRegistry | null = null;

export function initializeInboxAdapters(): InboxAdapterRegistry {
  if (registry) return registry;

  registry = new InboxAdapterRegistry();

  const replizEnabled = env.REPLIZ_ENABLED !== "false";

  if (replizEnabled && env.REPLIZ_ACCESS_KEY && env.REPLIZ_SECRET_KEY) {
    registry.register(
      new ReplizInboxAdapter(
        env.REPLIZ_ACCESS_KEY,
        env.REPLIZ_SECRET_KEY,
        env.REPLIZ_API_URL,
      ),
    );
  }

  registry.register(new NativeInboxAdapter());

  return registry;
}

export function getInboxAdapterRegistry(): InboxAdapterRegistry {
  if (!registry) return initializeInboxAdapters();
  return registry;
}
