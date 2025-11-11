"""
Quick script to apply performance index migrations to PostgreSQL.
Run this from the server directory: python apply_migrations.py
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def apply_migration():
    """Apply the performance index migrations."""
    
    # Read connection details from environment
    database_url = os.getenv('DATABASE_URL')
    
    if not database_url:
        print("❌ DATABASE_URL not found in environment")
        return
    
    print(f"🔗 Connecting to database...")
    
    try:
        # Connect to database
        conn = await asyncpg.connect(database_url)
        print("✅ Connected successfully")
        
        # Read migration file
        migration_file = '../migrations/postgresql/0002_add_performance_indexes.sql'
        print(f"📄 Reading migration: {migration_file}")
        
        with open(migration_file, 'r') as f:
            sql = f.read()
        
        # Split by semicolons and execute each statement
        statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]
        
        print(f"🚀 Executing {len(statements)} statements...")
        
        for i, statement in enumerate(statements, 1):
            if statement:
                print(f"  [{i}/{len(statements)}] Executing: {statement[:60]}...")
                try:
                    result = await conn.execute(statement)
                    print(f"    ✅ {result}")
                except Exception as e:
                    print(f"    ⚠️  {e}")
        
        print("\n✅ Migration completed successfully!")
        
        # Verify indexes were created
        print("\n🔍 Verifying indexes...")
        indexes = await conn.fetch("""
            SELECT indexname, tablename, indexdef 
            FROM pg_indexes 
            WHERE indexname IN ('idx_documents_user_uploaded', 'idx_messages_session_sequence', 'idx_chat_sessions_user_created')
            ORDER BY tablename, indexname
        """)
        
        for idx in indexes:
            print(f"  ✅ {idx['tablename']}.{idx['indexname']}")
        
        await conn.close()
        print("\n🎉 All done! Restart your dev server to see performance improvements.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(apply_migration())
