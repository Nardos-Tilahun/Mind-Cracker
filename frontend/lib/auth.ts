import { betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins"
import { Pool } from "pg";

// --- STRICT SINGLETON POOL SETUP ---
// This prevents "Connection terminated" and "ETIMEDOUT" errors
// by reusing the single active connection during hot-reloads.
const globalForDb = globalThis as unknown as {
  conn: Pool | undefined
}

const pool = globalForDb.conn ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  // NeonDB/Cloud Postgres often requires this SSL configuration
  ssl: { rejectUnauthorized: false },
  // Limit connections in dev to prevent exhaustion (Neon has limits)
  max: process.env.NODE_ENV === "production" ? 10 : 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // Increased timeout
});

if (process.env.NODE_ENV !== "production") globalForDb.conn = pool
// -----------------------------

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    openAPI()
  ]
});