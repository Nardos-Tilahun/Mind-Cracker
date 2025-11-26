import asyncio
import asyncpg
import os
from app.core.config import settings

async def migrate():
    print("Starting database migration...")
    try:
        # 1. Get clean connection URL (remove +asyncpg if present for raw connection)
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")
        
        print(f"Connecting to database...")
        conn = await asyncpg.connect(db_url)

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