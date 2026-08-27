import { env } from "@sahabat-kreator/env/server";
import { DMAdapterRegistry } from "./adapter-registry";
import { ReplizDMAdapter } from "./repliz/adapter";

let registry: DMAdapterRegistry | null = null;

export function initializeDMAdapters(): DMAdapterRegistry {
  if (registry) return registry;

  registry = new DMAdapterRegistry();

  const replizEnabled = env.REPLIZ_ENABLED !== "false";

  if (replizEnabled && env.REPLIZ_ACCESS_KEY && env.REPLIZ_SECRET_KEY) {
    registry.register(
      new ReplizDMAdapter(
        env.REPLIZ_ACCESS_KEY,
        env.REPLIZ_SECRET_KEY,
        env.REPLIZ_API_URL,
      ),
    );
  }

  return registry;
}

export function getDMAdapterRegistry(): DMAdapterRegistry {
  if (!registry) return initializeDMAdapters();
  return registry;
}
