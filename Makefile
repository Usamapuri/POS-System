# POS System - Development Makefile
# Usage: make <command>

.PHONY: help dev prod up down build logs clean backup restore create-admin remove-data db-shell db-migrate-counter-pricing test lint format

# Default target
.DEFAULT_GOAL := help

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
BLUE := \033[0;34m
NC := \033[0m # No Color

# Docker compose files
COMPOSE_DEV := docker-compose.dev.yml
COMPOSE_PROD := docker-compose.yml

## Help - Display available commands
help:
	@echo "$(BLUE)POS System - Available Make Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Development Commands:$(NC)"
	@echo "  make dev          - Start development environment with hot reloading"
	@echo "  make prod         - Start production environment"
	@echo "  make up           - Start Docker containers (development mode)"
	@echo "  make down         - Stop and remove Docker containers"
	@echo "  make restart      - Restart all services"
	@echo "  make build        - Build all Docker images"
	@echo "  make rebuild      - Force rebuild all Docker images"
	@echo ""
	@echo "$(GREEN)Database Commands:$(NC)"
	@echo "  make create-demo-users - Create all demo users for testing"
	@echo "  make list-users        - List all existing users in the database"
	@echo "  make create-admin      - Create a custom super admin user"
	@echo "  make remove-data       - Remove all data from database (DESTRUCTIVE)"
	@echo "  make backup            - Backup database and uploads"
	@echo "  make restore           - Restore database from backup"
	@echo "  make db-shell          - Access PostgreSQL shell"
	@echo "  make db-migrate-counter-pricing - Add service_charge_amount & checkout columns (existing DBs)"
	@echo "  make db-reset          - Reset database with fresh schema and seed data"
	@echo ""
	@echo "$(GREEN)Utility Commands:$(NC)"
	@echo "  make logs         - View logs from all services"
	@echo "  make logs-backend - View backend logs only"
	@echo "  make logs-frontend- View frontend logs only"
	@echo "  make logs-db      - View database logs only"
	@echo "  make clean        - Clean up Docker volumes and images"
	@echo "  make status       - Show status of all services"
	@echo ""
	@echo "$(GREEN)Development Tools:$(NC)"
	@echo "  make test         - Run all tests"
	@echo "  make lint         - Run linting checks"
	@echo "  make format       - Format code"
	@echo "  make deps         - Install/update dependencies"
	@echo ""
	@echo "$(YELLOW)Note: Make sure Docker Desktop is running before using these commands$(NC)"

## Development Commands

# Start development environment with hot reloading
dev:
	@echo "$(GREEN)🚀 Starting POS System in Development Mode...$(NC)"
	@if [ ! -f .env ]; then \
		echo "$(YELLOW)📝 Creating .env file...$(NC)"; \
		cp .env.example .env 2>/dev/null || \
		echo "DB_HOST=postgres\nDB_PORT=5432\nDB_USER=postgres\nDB_PASSWORD=postgres123\nDB_NAME=pos_system\nDB_SSLMODE=disable\nPORT=8080\nGIN_MODE=debug\nVITE_API_URL=http://localhost:8080/api/v1\nPOSTGRES_HOST_PORT=5432" > .env; \
	fi
	@docker compose -f $(COMPOSE_DEV) up --build
	@echo "$(GREEN)✅ Development environment started!$(NC)"
	@echo "$(BLUE)📱 Frontend: http://localhost:3000$(NC)"
	@echo "$(BLUE)🔧 Backend API: http://localhost:8080$(NC)"
	@echo "$(BLUE)🗄️  Database: localhost:5432$(NC)"

# Start production environment
prod:
	@echo "$(GREEN)🚀 Starting POS System in Production Mode...$(NC)"
	@if [ ! -f .env ]; then \
		echo "$(RED)❌ .env file not found. Please create one based on .env.example$(NC)"; \
		exit 1; \
	fi
	@docker compose -f $(COMPOSE_PROD) up -d --build
	@echo "$(GREEN)✅ Production environment started!$(NC)"

# Start Docker containers (development mode)
up:
	@echo "$(GREEN)⬆️ Starting Docker containers...$(NC)"
	@docker compose -f $(COMPOSE_DEV) up -d
	@echo "$(GREEN)✅ Containers started in background$(NC)"

# Stop and remove Docker containers
down:
	@echo "$(YELLOW)⬇️ Stopping Docker containers...$(NC)"
	@docker compose -f $(COMPOSE_DEV) down
	@docker compose -f $(COMPOSE_PROD) down 2>/dev/null || true
	@echo "$(GREEN)✅ Containers stopped$(NC)"

# Restart all services
restart: down up

# Build all Docker images
build:
	@echo "$(GREEN)🔨 Building Docker images...$(NC)"
	@docker compose -f $(COMPOSE_DEV) build
	@echo "$(GREEN)✅ Images built successfully$(NC)"

# Force rebuild all Docker images
rebuild:
	@echo "$(GREEN)🔨 Force rebuilding Docker images...$(NC)"
	@docker compose -f $(COMPOSE_DEV) build --no-cache
	@echo "$(GREEN)✅ Images rebuilt successfully$(NC)"

## Database Commands

# Create all demo users for testing
create-demo-users:
	@echo "$(GREEN)👥 Creating all demo users...$(NC)"
	@if [ -z "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "$(RED)❌ Database container is not running. Please run 'make up' first.$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)Creating demo users with default password 'admin123'...$(NC)"
	@./scripts/create-demo-users.sh
	@echo "$(GREEN)✅ Demo users created successfully!$(NC)"
	@echo ""
	@echo "$(BLUE)🎭 Demo Accounts Available:$(NC)"
	@echo "$(YELLOW)👑 Admin:$(NC) admin / admin123"
	@echo "$(YELLOW)📊 Manager:$(NC) manager1 / admin123" 
	@echo "$(YELLOW)🍽️ Servers:$(NC) server1, server2 / admin123"
	@echo "$(YELLOW)💰 Counter:$(NC) counter1, counter2 / admin123"
	@echo "$(YELLOW)👨‍🍳 Kitchen:$(NC) kitchen1 / admin123"
	@echo ""
	@echo "$(GREEN)🌐 Access: http://localhost:3000$(NC)"

# List all existing users in the database
list-users:
	@echo "$(GREEN)👥 Listing all users in database...$(NC)"
	@if [ -z "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "$(RED)❌ Database container is not running. Please run 'make up' first.$(NC)"; \
		exit 1; \
	fi
	@docker exec pos-postgres-dev psql -U postgres pos_system -c "SELECT id, username, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY role, username;" || \
	 docker exec pos-postgres psql -U postgres pos_system -c "SELECT id, username, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY role, username;"

# Create a super admin user
create-admin:
	@echo "$(GREEN)👤 Creating super admin user...$(NC)"
	@if [ -z "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "$(RED)❌ Database container is not running. Please run 'make up' first.$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)📝 Please provide admin details:$(NC)"
	@./scripts/create-admin.sh
	@echo "$(GREEN)✅ Super admin created successfully!$(NC)"

# Remove all data from database (DESTRUCTIVE)
remove-data:
	@echo "$(RED)⚠️  WARNING: This will DELETE ALL DATA in the database!$(NC)"
	@echo "$(YELLOW)Type 'YES' to continue or any other key to cancel:$(NC)"
	@read confirmation; \
	if [ "$$confirmation" = "YES" ]; then \
		echo "$(YELLOW)🗑️  Removing all data...$(NC)"; \
		./scripts/remove-data.sh; \
		echo "$(GREEN)✅ All data removed$(NC)"; \
	else \
		echo "$(BLUE)❌ Operation cancelled$(NC)"; \
	fi

# Backup database and uploads
backup:
	@echo "$(GREEN)💾 Creating backup...$(NC)"
	@if [ -z "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "$(RED)❌ Database container is not running. Please run 'make up' first.$(NC)"; \
		exit 1; \
	fi
	@./scripts/backup.sh
	@echo "$(GREEN)✅ Backup completed successfully!$(NC)"

# Restore database from backup
restore:
	@echo "$(GREEN)📥 Restoring from backup...$(NC)"
	@if [ -z "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "$(RED)❌ Database container is not running. Please run 'make up' first.$(NC)"; \
		exit 1; \
	fi
	@./scripts/restore.sh
	@echo "$(GREEN)✅ Restore completed successfully!$(NC)"

# Access PostgreSQL shell
db-shell:
	@echo "$(GREEN)🐘 Connecting to PostgreSQL shell...$(NC)"
	@if [ -z "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "$(RED)❌ Database container is not running. Please run 'make up' first.$(NC)"; \
		exit 1; \
	fi
	@docker exec -it pos-postgres-dev psql -U postgres pos_system || \
	 docker exec -it pos-postgres psql -U postgres pos_system

# Apply counter/pricing columns on DBs created before service_charge (fixes pq: service_charge_amount does not exist)
db-migrate-counter-pricing:
	@echo "$(GREEN)📦 Applying counter pricing migration...$(NC)"
	@if [ -z "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "$(RED)❌ Database container is not running. Start the stack first (e.g. make dev).$(NC)"; \
		exit 1; \
	fi
	@docker exec -i pos-postgres-dev psql -U postgres -d pos_system < scripts/counter_pricing_migration.sql 2>/dev/null || \
	 docker exec -i pos-postgres psql -U postgres -d pos_system < scripts/counter_pricing_migration.sql
	@echo "$(GREEN)✅ Migration applied. Restart backend if it was caching schema errors.$(NC)"

# Reset database with fresh schema and seed data
db-reset:
	@echo "$(YELLOW)🔄 Resetting database...$(NC)"
	@if [ -z "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "$(RED)❌ Database container is not running. Please run 'make up' first.$(NC)"; \
		exit 1; \
	fi
	@./scripts/db-reset.sh -y
	@echo "$(GREEN)✅ Database reset completed!$(NC)"

## Utility Commands

# View logs from all services
logs:
	@echo "$(GREEN)📋 Viewing logs from all services...$(NC)"
	@docker compose -f $(COMPOSE_DEV) logs -f

# View backend logs only
logs-backend:
	@echo "$(GREEN)📋 Viewing backend logs...$(NC)"
	@docker compose -f $(COMPOSE_DEV) logs -f backend

# View frontend logs only  
logs-frontend:
	@echo "$(GREEN)📋 Viewing frontend logs...$(NC)"
	@docker compose -f $(COMPOSE_DEV) logs -f frontend

# View database logs only
logs-db:
	@echo "$(GREEN)📋 Viewing database logs...$(NC)"
	@docker compose -f $(COMPOSE_DEV) logs -f postgres

# Clean up Docker volumes and images
clean:
	@echo "$(YELLOW)🧹 Cleaning up Docker resources...$(NC)"
	@echo "$(RED)⚠️  This will remove all unused containers, networks, and volumes!$(NC)"
	@echo "$(YELLOW)Type 'YES' to continue or any other key to cancel:$(NC)"
	@read confirmation; \
	if [ "$$confirmation" = "YES" ]; then \
		docker compose -f $(COMPOSE_DEV) down -v; \
		docker compose -f $(COMPOSE_PROD) down -v 2>/dev/null || true; \
		docker system prune -f; \
		docker volume prune -f; \
		echo "$(GREEN)✅ Cleanup completed$(NC)"; \
	else \
		echo "$(BLUE)❌ Operation cancelled$(NC)"; \
	fi

# Show status of all services
status:
	@echo "$(GREEN)📊 Service Status:$(NC)"
	@echo ""
	@echo "$(BLUE)Docker Containers:$(NC)"
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" -f name=pos || echo "No POS containers running"
	@echo ""
	@echo "$(BLUE)Docker Volumes:$(NC)" 
	@docker volume ls -f name=pos || echo "No POS volumes found"
	@echo ""
	@echo "$(BLUE)Network Connectivity:$(NC)"
	@if [ -n "$$(docker ps -q -f name=pos-backend)" ]; then \
		echo "✅ Backend: Available"; \
	else \
		echo "❌ Backend: Not running"; \
	fi
	@if [ -n "$$(docker ps -q -f name=pos-frontend)" ]; then \
		echo "✅ Frontend: Available"; \
	else \
		echo "❌ Frontend: Not running"; \
	fi
	@if [ -n "$$(docker ps -q -f name=pos-postgres)" ]; then \
		echo "✅ Database: Available"; \
	else \
		echo "❌ Database: Not running"; \
	fi

## Development Tools

# Run all tests
test:
	@echo "$(GREEN)🧪 Running tests...$(NC)"
	@echo "$(YELLOW)Backend tests:$(NC)"
	@docker compose -f $(COMPOSE_DEV) exec backend go test ./... || true
	@echo ""
	@echo "$(YELLOW)Frontend tests:$(NC)"
	@docker compose -f $(COMPOSE_DEV) exec frontend npm test || true

# Run linting checks
lint:
	@echo "$(GREEN)🔍 Running linting checks...$(NC)"
	@echo "$(YELLOW)Backend linting (golangci-lint):$(NC)"
	@docker compose -f $(COMPOSE_DEV) exec backend golangci-lint run || echo "golangci-lint not installed"
	@echo ""
	@echo "$(YELLOW)Frontend linting (ESLint):$(NC)"
	@docker compose -f $(COMPOSE_DEV) exec frontend npm run lint || true

# Format code
format:
	@echo "$(GREEN)✨ Formatting code...$(NC)"
	@echo "$(YELLOW)Backend formatting (gofmt):$(NC)"
	@docker compose -f $(COMPOSE_DEV) exec backend gofmt -w . || true
	@echo ""
	@echo "$(YELLOW)Frontend formatting (Prettier):$(NC)"
	@docker compose -f $(COMPOSE_DEV) exec frontend npm run lint:fix || true

# Install/update dependencies
deps:
	@echo "$(GREEN)📦 Installing/updating dependencies...$(NC)"
	@echo "$(YELLOW)Backend dependencies:$(NC)"
	@docker compose -f $(COMPOSE_DEV) exec backend go mod tidy || true
	@echo ""
	@echo "$(YELLOW)Frontend dependencies:$(NC)"
	@docker compose -f $(COMPOSE_DEV) exec frontend npm update || true

## Quick shortcuts
start: up
stop: down
install: deps
