import asyncio
from app.core.database import init_db
from app.models.goal import Goal

async def main():
    print("Running database initialization...")
    try:
        await init_db()
        print("Database tables checked/created successfully.")
    except Exception as e:
        print(f"Initialization error: {e}")

if __name__ == "__main__":
    asyncio.run(main())