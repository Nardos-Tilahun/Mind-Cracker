import asyncio
import asyncpg
import urllib.parse
from app.core.config import settings

async def migrate():
    print("Starting database reset & robust migration...")
    try:
        # 1. Get connection URL
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")

        # 2. Clean URL params
        parsed = urllib.parse.urlparse(db_url)
        query_params = urllib.parse.parse_qs(parsed.query)
        
        if 'sslmode' in query_params: del query_params['sslmode']
        if 'channel_binding' in query_params: del query_params['channel_binding']
            
        new_query = urllib.parse.urlencode(query_params, doseq=True)
        clean_url = urllib.parse.urlunparse(parsed._replace(query=new_query))

        print(f"Connecting to database...")
        conn = await asyncpg.connect(clean_url, ssl='require')

        # --- 3. RESET AUTH TABLES ---
        print("⚠️ Dropping existing Auth tables to ensure clean schema...")
        await conn.execute('DROP TABLE IF EXISTS "account";')
        await conn.execute('DROP TABLE IF EXISTS "session";')
        await conn.execute('DROP TABLE IF EXISTS "verification";')
        await conn.execute('DROP TABLE IF EXISTS "user";')

        # --- 4. RE-CREATE TABLES (ROBUST VERSION) ---
        print("Re-creating Auth tables with defaults...")
        
        # USER: Added DEFAULTs for booleans and timestamps to prevent insertion errors
        await conn.execute("""
            CREATE TABLE "user" (
                id TEXT NOT NULL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                "emailVerified" BOOLEAN NOT NULL DEFAULT false,
                image TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
            );
        """)

        # SESSION: Added DEFAULTs
        await conn.execute("""
            CREATE TABLE "session" (
                id TEXT NOT NULL PRIMARY KEY,
                "expiresAt" TIMESTAMP NOT NULL,
                "ipAddress" TEXT,
                "userAgent" TEXT,
                "userId" TEXT NOT NULL REFERENCES "user"(id),
                token TEXT NOT NULL UNIQUE,
                "createdAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
            );
        """)

        # ACCOUNT: Made non-critical fields NULLABLE and added DEFAULTs
        await conn.execute("""
            CREATE TABLE "account" (
                id TEXT NOT NULL PRIMARY KEY,
                "accountId" TEXT NOT NULL,
                "providerId" TEXT NOT NULL,
                "userId" TEXT NOT NULL REFERENCES "user"(id),
                "accessToken" TEXT,
                "refreshToken" TEXT,
                "idToken" TEXT,
                "expiresAt" TIMESTAMP,
                password TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
            );
        """)

        # VERIFICATION
        await conn.execute("""
            CREATE TABLE "verification" (
                id TEXT NOT NULL PRIMARY KEY,
                identifier TEXT NOT NULL,
                value TEXT NOT NULL,
                "expiresAt" TIMESTAMP NOT NULL,
                "createdAt" TIMESTAMP DEFAULT (now() at time zone 'utc'),
                "updatedAt" TIMESTAMP DEFAULT (now() at time zone 'utc')
            );
        """)

        # --- 5. Ensure Goals Table (Preserve data) ---
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
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
            );
        """)

        # Column checks
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='chat_history';")
        if not row: await conn.execute("ALTER TABLE goals ADD COLUMN chat_history JSONB;")
        
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='thinking_process';")
        if not row: await conn.execute("ALTER TABLE goals ADD COLUMN thinking_process TEXT;")

        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='updated_at';")
        if not row: await conn.execute("ALTER TABLE goals ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc');")

        await conn.close()
        print("\nDatabase migration completed successfully!")

    except Exception as e:
        print(f"\n!!! Migration Failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())