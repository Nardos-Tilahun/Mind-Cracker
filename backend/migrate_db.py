import asyncio
import asyncpg
import urllib.parse
from app.core.config import settings

async def migrate():
    print("🔄 Starting database SCHEMA CHECK & REPAIR...")
    try:
        # 1. Get connection URL & Clean it
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")
        parsed = urllib.parse.urlparse(db_url)
        query_params = urllib.parse.parse_qs(parsed.query)

        if 'sslmode' in query_params: del query_params['sslmode']
        if 'channel_binding' in query_params: del query_params['channel_binding']

        new_query = urllib.parse.urlencode(query_params, doseq=True)
        clean_url = urllib.parse.urlunparse(parsed._replace(query=new_query))

        print(f"🔌 Connecting to database...")
        conn = await asyncpg.connect(clean_url, ssl='require')

        # --- 2. AUTH TABLES (SAFE CREATION) ---
        print("🛠️  Checking Auth tables...")

        # USER
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS "user" (
                id TEXT NOT NULL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                email_verified BOOLEAN NOT NULL DEFAULT false,
                image TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # SESSION
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS "session" (
                id TEXT NOT NULL PRIMARY KEY,
                expires_at TIMESTAMPTZ NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                token TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # ACCOUNT
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS "account" (
                id TEXT NOT NULL PRIMARY KEY,
                account_id TEXT NOT NULL,
                provider_id TEXT NOT NULL,
                user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                access_token TEXT,
                refresh_token TEXT,
                id_token TEXT,
                expires_at TIMESTAMPTZ,
                password TEXT,
                scope TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        
        # Check for 'scope' column in account table specifically (migration patch)
        try:
            await conn.execute('ALTER TABLE "account" ADD COLUMN IF NOT EXISTS scope TEXT;')
        except Exception:
            pass

        # VERIFICATION
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS "verification" (
                id TEXT NOT NULL PRIMARY KEY,
                identifier TEXT NOT NULL,
                value TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # --- 3. GOALS TABLE ---
        print("🛠️  Checking 'goals' table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS goals (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR,
                original_goal TEXT,
                model_used VARCHAR,
                breakdown JSONB,
                thinking_process TEXT,
                chat_history JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # Column checks using IF NOT EXISTS logic via ALTER
        await conn.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS chat_history JSONB;")
        await conn.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS thinking_process TEXT;")
        await conn.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();")

        await conn.close()
        print("\n✅ Database schema is up to date!")

    except Exception as e:
        print(f"\n❌ Migration Failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())