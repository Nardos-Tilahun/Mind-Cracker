import { betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins";
import { Pool } from "pg";

// --- DEBUG: DATABASE CONNECTION ---
const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const pool = globalForDb.conn ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: process.env.NODE_ENV === "production" ? 10 : 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

// Log database errors explicitly
pool.on('error', (err, client) => {
  console.error('🔥 [DB ERROR] Unexpected error on idle client', err);
});

// Test connection immediately on boot
pool.connect().then(client => {
    console.log("✅ [DB STATUS] Successfully connected to Postgres");
    client.release();
}).catch(err => {
    console.error("❌ [DB STATUS] Failed to connect to Postgres:", err);
});

if (process.env.NODE_ENV !== "production") globalForDb.conn = pool;

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  
  // Trusted Origins
  trustedOrigins: [
    "http://localhost:3000",
    process.env.BETTER_AUTH_URL || ""
  ],

  emailAndPassword: {
    enabled: true
  },
  
  // Fallbacks to prevent build errors
  secret: process.env.BETTER_AUTH_SECRET || "BUILD_TIME_SECRET_PLACEHOLDER",
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder",
    },
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
        enabled: true,
        maxAge: 5 * 60
    }
  },
  
  plugins: [
    openAPI()
  ],

  // --- DEBUG HOOKS ---
  databaseHooks: {
    user: {
        create: {
            before: async (user) => {
                console.log("🧐 [AUTH HOOK] Attempting to insert User into DB:", JSON.stringify(user, null, 2));
                // FIX 1: Wrap the return value in a 'data' object
                return { data: user };
            },
            after: async (user) => {
                console.log("✅ [AUTH HOOK] User inserted successfully:", user.id);
            }
        }
    }
  }
});