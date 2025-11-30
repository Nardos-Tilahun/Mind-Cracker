import asyncio
import asyncpg
import urllib.parse
from app.core.config import settings

async def migrate():
    print("🔄 Starting database SCHEMA CHECK & REPAIR...")
    try:
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")
        parsed = urllib.parse.urlparse(db_url)
        query_params = urllib.parse.parse_qs(parsed.query)

        if 'sslmode' in query_params: del query_params['sslmode']
        if 'channel_binding' in query_params: del query_params['channel_binding']

        new_query = urllib.parse.urlencode(query_params, doseq=True)
        clean_url = urllib.parse.urlunparse(parsed._replace(query=new_query))

        print(f"🔌 Connecting to database...")
        conn = await asyncpg.connect(clean_url, ssl='require')

        print("🛠️  Checking Auth tables...")

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

        try:
            await conn.execute('ALTER TABLE "account" ADD COLUMN IF NOT EXISTS scope TEXT;')
        except Exception:
            pass

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

        print("🛠️  Checking 'goals' table...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS goals (
                id SERIAL PRIMARY KEY,
                public_id VARCHAR UNIQUE,
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

        await conn.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS chat_history JSONB;")
        await conn.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS thinking_process TEXT;")
        await conn.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();")
        
        await conn.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS public_id VARCHAR UNIQUE;")
        
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_goals_public_id ON goals(public_id);")

        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";")
            await conn.execute("UPDATE goals SET public_id = gen_random_uuid()::text WHERE public_id IS NULL;")
        except Exception:
            print("⚠️ 'pgcrypto' extension not available. Using MD5 fallback for existing IDs.")
            await conn.execute("UPDATE goals SET public_id = md5(random()::text || clock_timestamp()::text) WHERE public_id IS NULL;")

        await conn.close()
        print("\n✅ Database schema is up to date!")

    except Exception as e:
        print(f"\n❌ Migration Failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())