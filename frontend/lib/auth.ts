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

pool.on('error', (err) => {
  console.error('🔥 [DB FATAL ERROR] Unexpected error on idle client', err);
});

if (process.env.NODE_ENV !== "production") globalForDb.conn = pool;

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  
  trustedOrigins: [
    "http://localhost:3000",
    process.env.BETTER_AUTH_URL || ""
  ],

  emailAndPassword: {
    enabled: true
  },
  
  secret: process.env.BETTER_AUTH_SECRET || "BUILD_TIME_SECRET",
  
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder",
    },
  },

  // --- SCHEMA MAPPING (Snake Case) ---
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    modelName: "session",
    fields: {
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  user: {
    modelName: "user", 
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  account: {
    modelName: "account",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      // FIXED: 'accessTokenExpiresAt' is the correct key for mapping expiration
      accessTokenExpiresAt: "expires_at", 
      password: "password",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  verification: {
    modelName: "verification",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  
  plugins: [
    openAPI()
  ],

  // --- EXTREME DEBUG HOOKS ---
  databaseHooks: {
    user: {
        create: {
            before: async (user) => {
                console.log("🟢 [1. START USER CREATE]", JSON.stringify(user));
                return { data: user };
            },
            after: async (user) => {
                console.log("✅ [1. END USER CREATE] Success:", user.id);
            }
        }
    },
    account: {
        create: {
            before: async (account) => {
                console.log("🟢 [2. START ACCOUNT LINK]", JSON.stringify(account));
                return { data: account };
            },
            after: async (account) => {
                console.log("✅ [2. END ACCOUNT LINK] Success:", account.id);
            }
        }
    },
    session: {
        create: {
            before: async (session) => {
                console.log("🟢 [3. START SESSION CREATE]", JSON.stringify(session));
                return { data: session };
            },
            after: async (session) => {
                console.log("✅ [3. END SESSION CREATE] Success. Token:", session.token.slice(0, 10) + "...");
            }
        }
    }
  }
});