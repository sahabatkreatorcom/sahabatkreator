import { env } from "@sahabat-kreator/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index";

export { schema };

export const db = drizzle(env.DATABASE_URL, { schema });
