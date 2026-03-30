/**
 * Database connection export
 * Re-exports drizzle db instance for use across the project
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
export const db = drizzle(client);

// Re-export schema types
export * from "./schema";
