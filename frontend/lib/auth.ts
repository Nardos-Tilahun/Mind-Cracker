import { betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins"
import { Pool } from "pg";

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined
}

const pool = globalForDb.conn ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: process.env.NODE_ENV === "production" ? 10 : 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

if (process.env.NODE_ENV !== "production") globalForDb.conn = pool

export const auth = betterAuth({
  database: pool,
  // Explicitly set baseURL from environment to prevent mismatches
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true
  },
  secret: process.env.BETTER_AUTH_SECRET || "BUILD_TIME_SECRET_PLACEHOLDER",
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
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