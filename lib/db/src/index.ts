import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool, types } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// postgres-date (used by pg-types OID 1114) parses TIMESTAMP WITHOUT TIME ZONE
// values using the local-time Date constructor — new Date(y, m, d, h, mi, s).
// With TZ=Australia/Sydney the server's "local" is UTC+10, so every timestamp
// is shifted 10 hours behind before the frontend adds them back for display.
// Fix: interpret OID 1114 strings as UTC by appending 'Z' before parsing.
types.setTypeParser(1114 as never, (val: string) => {
  return val === null ? null : new Date(val.replace(" ", "T") + "Z");
});
// Same fix for arrays of timestamp without tz (OID 1115).
types.setTypeParser(1115 as never, (val: string) => {
  if (val === null) return null;
  // Strip the leading/trailing braces and split on commas, then parse each element.
  const inner = val.slice(1, -1);
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) =>
      s === "NULL" ? null : new Date(s.trim().replace(" ", "T") + "Z"),
    );
});

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
