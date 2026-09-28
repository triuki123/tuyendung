#!/usr/bin/env python3
import psycopg2
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("❌ Missing Supabase credentials")
    exit(1)

# Extract database connection details from Supabase URL
# Format: https://projectid.supabase.co
project_id = SUPABASE_URL.split('//')[1].split('.')[0]
db_host = f"db.{project_id}.supabase.co"

migration_files = [
    '015_create_job_titles_table.sql',
    '016_create_tags_table.sql',
    '017_create_user_tags_table.sql',
    '018_add_job_title_to_users.sql'
]

def run_migrations():
    print("🔄 Starting migrations...\n")

    try:
        print(f"Connecting to {db_host}...")

        # Connect to Supabase
        conn = psycopg2.connect(
            host=db_host,
            port=5432,
            database='postgres',
            user='postgres',
            password=SERVICE_ROLE_KEY,
            sslmode='require'
        )

        cursor = conn.cursor()
        print("✅ Connected to Supabase database\n")

        for migration_file in migration_files:
            try:
                migration_path = Path('migrations') / migration_file

                if not migration_path.exists():
                    print(f"❌ Migration file not found: {migration_path}")
                    exit(1)

                with open(migration_path, 'r') as f:
                    sql = f.read()

                print(f"⏳ Running {migration_file}...")
                cursor.execute(sql)
                conn.commit()
                print(f"✅ {migration_file} completed\n")

            except Exception as e:
                print(f"\n❌ Migration failed: {migration_file}")
                print(f"Error: {str(e)}")
                conn.rollback()
                cursor.close()
                conn.close()
                exit(1)

        cursor.close()
        conn.close()
        print("✅ All migrations completed successfully!")

    except psycopg2.OperationalError as e:
        print(f"❌ Connection failed: {str(e)}")
        print("\n📝 Please execute migrations manually:")
        print("1. Go to https://app.supabase.com/projects")
        print("2. Select your project")
        print("3. Click SQL Editor -> New Query")
        print("4. Copy and paste SQL from MIGRATION_INSTRUCTIONS.md")
        exit(1)
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        exit(1)

if __name__ == '__main__':
    run_migrations()
