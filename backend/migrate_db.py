import asyncio
import asyncpg
import urllib.parse
from app.core.config import settings

async def migrate():
    print("Starting database SCHEMA REPAIR...")
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

        # --- 2. NUCLEAR RESET OF AUTH TABLES ---
        # We use CASCADE to force deletion of linked tables (user/session/account)
        print("⚠️ Dropping Auth tables with CASCADE...")
        await conn.execute('DROP TABLE IF EXISTS "session" CASCADE;')
        await conn.execute('DROP TABLE IF EXISTS "account" CASCADE;')
        await conn.execute('DROP TABLE IF EXISTS "verification" CASCADE;')
        await conn.execute('DROP TABLE IF EXISTS "user" CASCADE;')

        # --- 3. RE-CREATE WITH PERFECT SCHEMA ---
        print("Re-creating Auth tables with Better-Auth compatible schema...")
        
        # USER TABLE
        # Critical: emailVerified MUST be boolean. 
        # Added DEFAULT false to prevent "null value in column" errors.
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

        # SESSION TABLE
        await conn.execute("""
            CREATE TABLE "session" (
                id TEXT NOT NULL PRIMARY KEY,
                "expiresAt" TIMESTAMP NOT NULL,
                "ipAddress" TEXT,
                "userAgent" TEXT,
                "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                token TEXT NOT NULL UNIQUE,
                "createdAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
            );
        """)

        # ACCOUNT TABLE
        # Made fields nullable where possible to prevent strict insert errors
        await conn.execute("""
            CREATE TABLE "account" (
                id TEXT NOT NULL PRIMARY KEY,
                "accountId" TEXT NOT NULL,
                "providerId" TEXT NOT NULL,
                "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                "accessToken" TEXT,
                "refreshToken" TEXT,
                "idToken" TEXT,
                "expiresAt" TIMESTAMP,
                password TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')
            );
        """)

        # VERIFICATION TABLE
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

        # --- 4. KEEP GOALS TABLE SAFE ---
        print("Ensuring 'goals' table exists (Preserving data)...")
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

        # --- 5. Repair Goals Columns (Just in case) ---
        print("Checking 'goals' schema...")
        # Chat History
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='chat_history';")
        if not row: 
            await conn.execute("ALTER TABLE goals ADD COLUMN chat_history JSONB;")
            print("  - Added chat_history")
        
        # Thinking Process
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='thinking_process';")
        if not row: 
            await conn.execute("ALTER TABLE goals ADD COLUMN thinking_process TEXT;")
            print("  - Added thinking_process")

        # Updated At
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='updated_at';")
        if not row: 
            await conn.execute("ALTER TABLE goals ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc');")
            print("  - Added updated_at")

        await conn.close()
        print("\n✅ Database schema successfully repaired!")

    except Exception as e:
        print(f"\n❌ Migration Failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())