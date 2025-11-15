"""
Apply quota migration and set owner account to unlimited.

This script:
1. Applies the quota migration (adds columns to users table)
2. Sets uditkashyap29@gmail.com to unlimited quota
3. Verifies the changes

Usage:
    python server/apply_quota_migration.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from server.database_postgresql import PostgreSQLConnection

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
    print(f"Loaded environment from {env_path}")
else:
    print(f"No .env file found at {env_path}")


async def apply_migration():
    """Apply the quota migration."""
    
    print("\n" + "="*60)
    print("QUOTA MIGRATION - STARTING")
    print("="*60 + "\n")
    
    db = PostgreSQLConnection()
    
    try:
        # Connect to database
        print("Connecting to PostgreSQL...")
        await db.connect()
        print("Connected to PostgreSQL\n")
        
        # Read migration file
        migration_file = Path(__file__).parent.parent / "migrations" / "postgresql" / "0004_add_user_quota_fields.sql"
        
        if not migration_file.exists():
            print(f"Migration file not found: {migration_file}")
            return False
        
        print(f"Reading migration file: {migration_file.name}")
        migration_sql = migration_file.read_text()
        
        # Split into individual statements
        statements = [s.strip() for s in migration_sql.split(';') if s.strip() and not s.strip().startswith('--')]
        
        print(f"Found {len(statements)} SQL statements to execute\n")
        
        # Execute each statement
        for i, statement in enumerate(statements, 1):
            # Skip comments
            if statement.strip().startswith('COMMENT'):
                print(f"  [{i}/{len(statements)}] Adding comment...")
            elif 'ALTER TABLE' in statement:
                column_name = statement.split('ADD COLUMN')[-1].split()[0] if 'ADD COLUMN' in statement else 'unknown'
                print(f"  [{i}/{len(statements)}] Adding column {column_name}...")
            elif 'UPDATE' in statement:
                print(f"  [{i}/{len(statements)}] Setting owner account to unlimited...")
            elif 'CREATE INDEX' in statement:
                print(f"  [{i}/{len(statements)}] Creating index...")
            else:
                print(f"  [{i}/{len(statements)}] Executing statement...")
            
            try:
                await db.execute(statement + ';')
                print(f"     Success")
            except Exception as e:
                error_msg = str(e)
                if "already exists" in error_msg or "duplicate" in error_msg.lower():
                    print(f"     Already exists (skipping)")
                else:
                    print(f"     Error: {error_msg}")
                    raise
        
        print("\n" + "="*60)
        print("VERIFICATION")
        print("="*60 + "\n")
        
        # Verify owner account
        print("Checking owner account (uditkashyap29@gmail.com)...")
        owner = await db.fetchone("""
            SELECT id, email, is_unlimited, remaining_quota, 
                   (api_key_hash IS NOT NULL) as has_api_key
            FROM users
            WHERE email = $1
        """, "uditkashyap29@gmail.com")
        
        if owner:
            print(f"Owner account found:")
            print(f"   • User ID: {owner['id']}")
            print(f"   • Email: {owner['email']}")
            print(f"   • Unlimited: {owner['is_unlimited']}")
            print(f"   • Remaining Quota: {owner['remaining_quota']}")
            print(f"   • Has API Key: {owner['has_api_key']}")
            
            if owner['is_unlimited']:
                print("\nOwner account has UNLIMITED quota")
            else:
                print("\nOwner account does NOT have unlimited quota")
                print("   Running manual update...")
                await db.execute("""
                    UPDATE users 
                    SET is_unlimited = TRUE, remaining_quota = NULL
                    WHERE email = 'uditkashyap29@gmail.com'
                """)
                print("   Owner account updated to unlimited")
        else:
            print("Owner account not found in database")
            print("   This is normal if you haven't logged in yet")
            print("   The migration will apply automatically when you first log in")
        
        # Show all users and their quota status
        print("\n" + "="*60)
        print("ALL USERS QUOTA STATUS")
        print("="*60 + "\n")
        
        all_users = await db.fetchall("""
            SELECT id, email, is_unlimited, remaining_quota
            FROM users
            ORDER BY created_at DESC
            LIMIT 10
        """)
        
        if all_users:
            print(f"{'Email':<40} {'Unlimited':<12} {'Remaining':<12}")
            print("-" * 64)
            for user in all_users:
                email = user['email'][:37] + '...' if len(user['email']) > 40 else user['email']
                unlimited = "YES" if user['is_unlimited'] else "NO"
                remaining = "∞" if user['remaining_quota'] is None else str(user['remaining_quota'])
                print(f"{email:<40} {unlimited:<12} {remaining:<12}")
        else:
            print("No users found in database")
        
        print("\n" + "="*60)
        print("MIGRATION COMPLETED SUCCESSFULLY")
        print("="*60 + "\n")
        
        return True
    
    except Exception as e:
        print(f"\nMigration failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        await db.close()
        print("Database connection closed")


if __name__ == "__main__":
    print("\nStarting quota migration...\n")
    
    success = asyncio.run(apply_migration())
    
    if success:
        print("Migration applied successfully!")
        sys.exit(0)
    else:
        print("Migration failed!")
        sys.exit(1)
