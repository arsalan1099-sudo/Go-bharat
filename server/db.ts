import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const IS_PRODUCTION = process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: IS_PRODUCTION ? 5 : 10,
  min: 1,
  idleTimeoutMillis: 25_000,
  connectionTimeoutMillis: 15_000,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Database pool connection error (non-fatal, pool will reconnect):", err.message);
});

pool.on("connect", () => {
  // Set statement timeout to avoid slow queries blocking the pool
  // 30s for production, 60s for dev
  const timeout = IS_PRODUCTION ? 30000 : 60000;
  pool.query(`SET statement_timeout = ${timeout}`).catch(() => {});
});

export const db = drizzle(pool, { schema });

export async function getPoolHealth() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}
