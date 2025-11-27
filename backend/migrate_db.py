import asyncio
import asyncpg
import urllib.parse
from app.core.config import settings

async def migrate():
    print("Starting manual database check/migration...")
    try:
        # 1. Get raw connection URL (remove +asyncpg if present)
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")

        # 2. Robustly clean URL for asyncpg (remove sslmode and channel_binding)
        parsed = urllib.parse.urlparse(db_url)
        query_params = urllib.parse.parse_qs(parsed.query)
        
        params_to_remove = ['sslmode', 'channel_binding']
        for param in params_to_remove:
            if param in query_params:
                del query_params[param]
            
        new_query = urllib.parse.urlencode(query_params, doseq=True)
        clean_url = urllib.parse.urlunparse(parsed._replace(query=new_query))

        print(f"Connecting to database...")
        conn = await asyncpg.connect(clean_url, ssl='require')

        # 3. CREATE TABLE IF NOT EXISTS (The Fix for your DBeaver issue)
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
        print("  - Table 'goals' checked/created.")

        # 4. Add columns if missing (Backwards compatibility)
        # Check chat_history
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='chat_history';")
        if not row:
            await conn.execute("ALTER TABLE goals ADD COLUMN chat_history JSONB;")
            print("  - Added missing column: chat_history")

        # Check thinking_process
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='thinking_process';")
        if not row:
            await conn.execute("ALTER TABLE goals ADD COLUMN thinking_process TEXT;")
            print("  - Added missing column: thinking_process")

        # Check updated_at
        row = await conn.fetchrow("SELECT column_name FROM information_schema.columns WHERE table_name='goals' AND column_name='updated_at';")
        if not row:
            await conn.execute("ALTER TABLE goals ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc');")
            print("  - Added missing column: updated_at")

        await conn.close()
        print("\nMigration script finished successfully!")

    except Exception as e:
        print(f"\n!!! Migration Failed: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())