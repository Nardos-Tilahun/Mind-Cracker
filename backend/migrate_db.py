import asyncio
import asyncpg
import urllib.parse
from app.core.config import settings

async def migrate():
    print("Starting database SCHEMA REPAIR (Adding 'scope' column)...")
    try:
        # 1. Get connection URL & Clean it
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")
        parsed = urllib.parse.urlparse(db_url)
        query_params = urllib.parse.parse_qs(parsed.query)
        
        if 'sslmode' in query_params: del query_params['sslmode']
        if 'channel_binding' in query_params: del query_params['channel_binding']
            
        new_query = urllib.parse.urlencode(query_params, doseq=True)
        clean_url = urllib.parse.urlunparse(parsed._replace(query=new_query))

        print(f"Connecting to database...")
        conn = await asyncpg.connect(clean_url, ssl='require')

        # --- 2. RESET AUTH TABLES ---
        # We drop with CASCADE to ensure we can recreate the Account table correctly
        print("⚠️ Dropping Auth tables to apply new schema...")
        await conn.execute('DROP TABLE IF EXISTS "session" CASCADE;')
        await conn.execute('DROP TABLE IF EXISTS "account" CASCADE;')
        await conn.execute('DROP TABLE IF EXISTS "verification" CASCADE;')
        await conn.execute('DROP TABLE IF EXISTS "user" CASCADE;')

        # --- 3. RE-CREATE TABLES (With 'scope') ---
        print("Re-creating Auth tables...")
        
        # USER
        await conn.execute("""
            CREATE TABLE "user" (
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
            CREATE TABLE "session" (
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

        # ACCOUNT (Fixed: Added 'scope')
        await conn.execute("""
            CREATE TABLE "account" (
                id TEXT NOT NULL PRIMARY KEY,
                account_id TEXT NOT NULL,
                provider_id TEXT NOT NULL,
                user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                access_token TEXT,
                refresh_token TEXT,
                id_token TEXT,
                expires_at TIMESTAMPTZ,
                password TEXT,
                scope TEXT,  -- <--- FIXED: Added missing column
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # VERIFICATION
        await conn.execute("""
            CREATE TABLE "verification" (
                id TEXT NOT NULL PRIMARY KEY,
                identifier TEXT NOT NULL,
                value TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # --- 4. GOALS TABLE ---
        print("Ensuring 'goals' table exists...")
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

        # Column checks
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='chat_history';")
        if not row: await conn.execute("ALTER TABLE goals ADD COLUMN chat_history JSONB;")
        
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='thinking_process';")
        if not row: await conn.execute("ALTER TABLE goals ADD COLUMN thinking_process TEXT;")

        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='updated_at';")
        if not row: await conn.execute("ALTER TABLE goals ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();")

        await conn.close()
        print("\n✅ Database repaired! 'scope' column added.")

    except Exception as e:
        print(f"\n❌ Migration Failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())