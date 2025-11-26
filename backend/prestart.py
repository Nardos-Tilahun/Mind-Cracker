import asyncio
from app.core.database import init_db

async def main():
    print("Running database migrations...")
    try:
        await init_db()
        print("Migrations completed successfully.")
    except Exception as e:
        print(f"Migration error (might be safe to ignore if table exists): {e}")

if __name__ == "__main__":
    asyncio.run(main())