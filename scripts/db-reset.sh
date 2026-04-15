#!/bin/bash

# Database Reset Script
# This script resets the database with fresh schema and seed data

set -e  # Exit on any error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 POS System - Database Reset${NC}"
echo "================================="
echo ""

# Check if database container is running
CONTAINER_NAME="pos-postgres-dev"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    CONTAINER_NAME="pos-postgres"
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}❌ Database container is not running!${NC}"
        echo -e "${YELLOW}Please run 'make up' or 'make dev' first.${NC}"
        exit 1
    fi
fi

# Check if schema files exist
SCHEMA_FILE="database/init/01_schema.sql"
SEED_FILE="database/init/02_seed_data.sql"

if [[ ! -f "$SCHEMA_FILE" ]]; then
    echo -e "${RED}❌ Schema file not found: $SCHEMA_FILE${NC}"
    exit 1
fi

if [[ ! -f "$SEED_FILE" ]]; then
    echo -e "${RED}❌ Seed data file not found: $SEED_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}This will:${NC}"
echo "1. 🗑️  Drop all existing tables and data"
echo "2. 🏗️  Recreate database schema"
echo "3. 🌱 Load fresh seed data"
echo "4. ✅ Reset the database to initial state"
echo ""

# Show current database contents
echo -e "${YELLOW}Current database contents:${NC}"
docker exec $CONTAINER_NAME psql -U postgres -d pos_system -c "
SELECT 
    'Users' as table_name, COUNT(*) as records FROM users
UNION ALL SELECT 
    'Orders' as table_name, COUNT(*) as records FROM orders
UNION ALL SELECT 
    'Products' as table_name, COUNT(*) as records FROM products
UNION ALL SELECT 
    'Categories' as table_name, COUNT(*) as records FROM categories
UNION ALL SELECT 
    'Tables' as table_name, COUNT(*) as records FROM dining_tables
UNION ALL SELECT 
    'Payments' as table_name, COUNT(*) as records FROM payments
ORDER BY table_name;
" 2>/dev/null || echo "Database may be empty or corrupted"

echo ""
if [[ "${1:-}" == "-y" ]] || [[ "${1:-}" == "--yes" ]]; then
    echo -e "${GREEN}Non-interactive mode (-y): proceeding with reset.${NC}"
else
    echo -e "${YELLOW}Continue with database reset? (y/N):${NC}"
    read -p "> " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}❌ Operation cancelled${NC}"
        exit 0
    fi
fi

# Create backup before reset
BACKUP_DIR="backups"
mkdir -p $BACKUP_DIR
BACKUP_FILE="$BACKUP_DIR/pre_reset_backup_$(date +%Y%m%d_%H%M%S).sql"

echo -e "${YELLOW}💾 Creating backup before reset: $BACKUP_FILE${NC}"
docker exec $CONTAINER_NAME pg_dump -U postgres pos_system > $BACKUP_FILE 2>/dev/null || echo "Could not create backup (database may be empty)"

echo -e "${YELLOW}🗑️  Dropping existing database and recreating...${NC}"

# Drop and recreate database (separate commands to avoid transaction issues)
echo "  - Terminating open connections to pos_system (stop API/backend first if this fails)..."
docker exec $CONTAINER_NAME psql -U postgres -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'pos_system' AND pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true

echo "  - Dropping existing database..."
docker exec $CONTAINER_NAME psql -U postgres -c "DROP DATABASE IF EXISTS pos_system;"

if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Failed to drop database!${NC}"
    exit 1
fi

echo "  - Creating new database..."
docker exec $CONTAINER_NAME psql -U postgres -c "CREATE DATABASE pos_system;"

if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Failed to recreate database!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Database recreated${NC}"

echo -e "${YELLOW}🏗️  Loading database schema...${NC}"

# Load schema
docker exec -i $CONTAINER_NAME psql -U postgres -d pos_system < $SCHEMA_FILE

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ Schema loaded successfully${NC}"
else
    echo -e "${RED}❌ Failed to load schema!${NC}"
    exit 1
fi

echo -e "${YELLOW}🌱 Loading seed data...${NC}"

# Load seed data
docker exec -i $CONTAINER_NAME psql -U postgres -d pos_system < $SEED_FILE

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ Seed data loaded successfully${NC}"
else
    echo -e "${RED}❌ Failed to load seed data!${NC}"
    exit 1
fi

# Verify the reset
echo ""
echo -e "${BLUE}📊 Database reset verification:${NC}"

# Check table structure
echo -e "${YELLOW}Tables created:${NC}"
docker exec $CONTAINER_NAME psql -U postgres -d pos_system -c "\dt"

echo ""
echo -e "${YELLOW}Data loaded:${NC}"
docker exec $CONTAINER_NAME psql -U postgres -d pos_system -c "
SELECT 
    'Users' as table_name, COUNT(*) as records FROM users
UNION ALL SELECT 
    'Categories' as table_name, COUNT(*) as records FROM categories
UNION ALL SELECT 
    'Products' as table_name, COUNT(*) as records FROM products
UNION ALL SELECT 
    'Tables' as table_name, COUNT(*) as records FROM dining_tables
UNION ALL SELECT 
    'Orders' as table_name, COUNT(*) as records FROM orders
UNION ALL SELECT 
    'Order Items' as table_name, COUNT(*) as records FROM order_items
UNION ALL SELECT 
    'Payments' as table_name, COUNT(*) as records FROM payments
UNION ALL SELECT 
    'Inventory' as table_name, COUNT(*) as records FROM inventory
UNION ALL SELECT 
    'Stock Categories' as table_name, COUNT(*) as records FROM stock_categories
UNION ALL SELECT 
    'Stock Items' as table_name, COUNT(*) as records FROM stock_items
UNION ALL SELECT 
    'Stock Movements' as table_name, COUNT(*) as records FROM stock_movements
UNION ALL SELECT 
    'Expenses' as table_name, COUNT(*) as records FROM expenses
UNION ALL SELECT 
    'Daily Closings' as table_name, COUNT(*) as records FROM daily_closings
UNION ALL SELECT 
    'Kitchen Stations' as table_name, COUNT(*) as records FROM kitchen_stations
UNION ALL SELECT 
    'Void Log' as table_name, COUNT(*) as records FROM void_log
ORDER BY table_name;
"

echo ""
echo -e "${GREEN}🎉 Database reset completed successfully!${NC}"
echo ""
echo -e "${BLUE}Default users available:${NC}"

# Show default users
docker exec $CONTAINER_NAME psql -U postgres -d pos_system -c "
SELECT username, email, role, is_active 
FROM users 
ORDER BY role, username;
"

echo ""
echo -e "${YELLOW}💡 Default login credentials:${NC}"
echo "  Username: admin    | Password: admin123    | Role: admin"
echo "  Username: manager1 | Password: admin123    | Role: manager"
echo "  Username: server1  | Password: admin123    | Role: server"
echo "  Username: server2  | Password: admin123    | Role: server"
echo "  Username: counter1 | Password: admin123    | Role: counter"
echo "  Username: counter2 | Password: admin123    | Role: counter"
echo "  Username: kitchen1 | Password: admin123    | Role: kitchen"
echo ""
echo -e "${YELLOW}💾 Pre-reset backup saved to: $BACKUP_FILE${NC}"
echo -e "${BLUE}🚀 The system is now ready for development!${NC}"
