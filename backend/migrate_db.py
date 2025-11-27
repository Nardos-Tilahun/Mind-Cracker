import asyncio
import asyncpg
import urllib.parse
from app.core.config import settings

async def migrate():
    print("Starting database migration...")
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
        # Pass ssl='require' to ensure secure connection on Render/Neon
        conn = await asyncpg.connect(clean_url, ssl='require')

        # 2. Add 'chat_history' column if missing
        print("Checking for 'chat_history' column...")
        row = await conn.fetchrow("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='goals' AND column_name='chat_history';
        """)

        if not row:
            print("  - Column 'chat_history' not found. Adding it now...")
            await conn.execute("ALTER TABLE goals ADD COLUMN chat_history JSONB;")
            print("  - 'chat_history' added successfully.")
        else:
            print("  - 'chat_history' column already exists.")

        # 3. Add 'thinking_process' column if missing
        print("Checking for 'thinking_process' column...")
        row = await conn.fetchrow("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='goals' AND column_name='thinking_process';
        """)

        if not row:
            print("  - Column 'thinking_process' not found. Adding it now...")
            await conn.execute("ALTER TABLE goals ADD COLUMN thinking_process TEXT;")
            print("  - 'thinking_process' added successfully.")
        else:
            print("  - 'thinking_process' column already exists.")

        # 4. Add 'updated_at' column if missing
        print("Checking for 'updated_at' column...")
        row = await conn.fetchrow("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='goals' AND column_name='updated_at';
        """)

        if not row:
            print("  - Column 'updated_at' not found. Adding it now...")
            await conn.execute("ALTER TABLE goals ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc');")
            print("  - 'updated_at' added successfully.")
        else:
            print("  - 'updated_at' column already exists.")

        await conn.close()
        print("\nMigration completed successfully! Restart your backend server.")

    except Exception as e:
        print(f"\n!!! Migration Failed: {e}")
        print("Tip: Check your DATABASE_URL in .env")

if __name__ == "__main__":
    asyncio.run(migrate())