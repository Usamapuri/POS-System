# 🍽️ Complete POS System - Professional Restaurant Management

> **A modern, enterprise-grade Point of Sale system built for the next generation of restaurants**

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker&logoColor=white)](https://docker.com)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Go](https://img.shields.io/badge/Go-1.21-00ADD8?logo=go&logoColor=white)](https://golang.org)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react&logoColor=black)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.2-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)](https://postgresql.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.13-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![AI Enhanced](https://img.shields.io/badge/AI_Enhanced-Claude_Sonnet_4-9C3AE0?logo=openai&logoColor=white)](https://cursor.sh)

## 🌟 **Built with Modern Technologies**

- **🔧 Backend:** Golang + Gin + PostgreSQL with raw SQL for maximum performance
- **⚡ Frontend:** React + TanStack Start + TypeScript + Tailwind CSS + shadcn/ui
- **🗄️ Database:** PostgreSQL with comprehensive schema and optimized queries
- **🐳 Infrastructure:** Docker containers with Docker Compose orchestration
- **🔐 Security:** JWT authentication with role-based access control (RBAC)
- **🧠 AI-Enhanced Development:** Advanced Cursor AI rules powered by Claude Sonnet 4 thinking

---

## 📸 **Beautiful Professional Interface**

### 🍽️ Server Interface - Intuitive Order Management
![Dashboard Server Interface](gh-image/dashboard-server-interface.png)
*Clean, modern interface designed for speed and efficiency with real-time updates*

### 👨‍🍳 Kitchen Display System (KDS) + KOT
![Dashboard Kitchen Interface](gh-image/dashboard-kitchen-interface.png)
*Dense, same-size ticket grid with live SSE updates, station filters, urgency scale, and a pinned prep queue*

**🎯 KDS Features:**
- **Kitchen Mode toggle** — run the venue in `KDS`, `Hybrid`, or `KOT-only` mode from Admin → Settings → Kitchen. In KOT-only mode every station prints and the digital KDS screen is hidden.
- **Dense ticket grid** — equal-size cards auto-fill the screen; sorted urgent → fresh → at-pass. Up to 3× more tickets above the fold vs lane-based kanban.
- **Urgency scale (not binary)** — tickets progress fresh → warming → urgent → critical (pulsing) → stale, driven by `kitchen.urgency_minutes`.
- **Station filter chips** — show just Grill, Bar, etc. Server-side filter via `/kitchen/orders?station_id=…`.
- **Pinned prep queue** — right rail aggregates `3× Grilled Chicken`, `2× Coffee` across tickets; expand each SKU to see which tickets contribute.
- **Recall strip** — last 5 bumped tickets within `kitchen.recall_window_seconds`; one click un-bumps a mistake.
- **Server-Sent Events** — sub-second updates via `/kitchen/stream`, with polling as a 30s fallback.
- **Kitchen events audit log** — every item mark-prepared, bump, recall, and void writes to `kitchen_events` for prep-time analytics and accountability.
- **Item status allowlist + decayed "NEW" badge** — line-item statuses are validated server-side; add-on items show a 60s "NEW" badge that decays on its own.

**🔕 KOT-only mode (no screen):**
- Every station is treated as a printer; items fire as `ready` immediately and the order auto-moves to `ready`.
- The `/kitchen` screens return 403 `kitchen_display_disabled` and redirect kitchen-role staff to a friendly disabled page.
- Counter/Server fire flow emphasizes the print dialog as the primary success affordance.

### ✨ **Enterprise-Grade Admin Tables**
Our latest update includes **professional data tables** with:
- 📊 **Advanced sorting & filtering** with TanStack Table
- 🎨 **Beautiful visual design** with gradient avatars and color-coded indicators  
- 📱 **Responsive layout** that works perfectly on tablets and desktop
- ⚡ **Real-time search** with debouncing for instant results
- 🔄 **Table/Cards view toggle** for optimal data visualization

---

## 🚀 **Core Features**

### 💼 **Complete POS Functionality**
- **📋 Order Management**: Create, modify, and track customer orders with real-time kitchen updates
- **👨‍🍳 Enhanced Kitchen Workflow**: Professional as-ready service system with individual item tracking, sound notifications, and tablet-optimized interface
- **💳 Payment Processing**: Complete multi-step payment flow with receipt generation and payment history
- **🍕 Product Management**: Full menu and category management with pricing, images, and inventory control
- **🪑 Table Management**: Comprehensive table and seating arrangement system with availability tracking
- **👥 Multi-Role Support**: Role-based access control (Admin, Manager, Server, Counter, Kitchen)

### 🏢 **Advanced Admin Features**
- **📊 Comprehensive Admin Dashboard**: Complete control center with navigation to all system areas
- **🔄 Role-Based Interface Switching**: Admin can access and monitor all role interfaces seamlessly  
- **👤 Staff Management**: Create, manage, and delete user accounts with role assignments and permissions
- **💰 Financial Reporting**: Income reports, sales analytics, and performance metrics with visual charts
- **⚙️ System Settings**: Restaurant configuration, currency settings, tax rates, and operational parameters
- **📋 Menu Management**: Full CRUD operations for categories and products with advanced table views

### 🎯 **Role-Specific Interfaces**
- **🔑 Admin**: Full system access with comprehensive management dashboard and beautiful data tables
- **🍽️ Server**: Streamlined dine-in order creation interface optimized for speed
- **💰 Counter/Checkout**: All order types plus complete payment processing system
- **👨‍🍳 Kitchen**: Order preparation workflow with status updates and timing management

---

## 🧠 **AI-Enhanced Development Experience**

### **🚀 Claude Sonnet 4 Powered Cursor Rules**
This project features **cutting-edge AI development assistance** through advanced Cursor AI rules engineered with Claude Sonnet 4 thinking capabilities:

#### **🎯 Intelligent Code Understanding**
- **🧠 Business Logic Awareness:** AI understands restaurant operations, user journeys, and revenue flows
- **📊 Context-Aware Decisions:** Every code suggestion considers business impact and user experience  
- **🔮 Predictive Insights:** ML-powered recommendations for optimization and issue prevention
- **⚡ Performance-First:** Built-in performance monitoring and automated optimization suggestions

#### **🛡️ Proactive Quality Assurance**
- **🔒 Tech Debt Prevention:** Automated consistency enforcement and code quality gates
- **🧪 Error Prevention:** Comprehensive testing patterns with business boundary validation
- **📈 Performance Monitoring:** Real-time tracking with business intelligence integration
- **🎯 DRY Principle:** Automated duplicate code detection and pattern consolidation

#### **👥 Role-Specific Optimization**
- **🍽️ Server Journey:** <30s order creation with intelligent UI optimization
- **👨‍🍳 Kitchen Workflow:** <5s status updates with real-time queue optimization  
- **💰 Counter Operations:** <10s payment processing with multi-modal support
- **👑 Admin Intelligence:** Business dashboards with predictive analytics

#### **🔄 Continuous Improvement**
- **📊 Automated Code Review:** Business logic validation and architectural consistency
- **🚀 Performance Regression Detection:** Automatic rollback triggers for critical issues
- **🎨 Component Optimization:** ML-powered suggestions for UI/UX improvements
- **📈 Business Impact Analysis:** Every change evaluated for revenue and customer satisfaction impact

> **💡 Development Superpower:** These AI rules transform Cursor into a restaurant domain expert, providing intelligent suggestions, preventing issues before they happen, and ensuring every line of code contributes to business success.

---

## 🔧 **System Architecture**

```
┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│   Frontend (React)      │    │   Backend (Golang)      │    │  Database (PostgreSQL)  │
│                         │    │                         │    │                         │
│ • TanStack Start        │◄──►│ • Gin Web Framework     │◄──►│ • User Management       │
│ • TypeScript            │    │ • Raw SQL Queries       │    │ • Order System          │
│ • TanStack Table        │    │ • JWT Authentication    │    │ • Product Catalog       │
│ • Tailwind CSS          │    │ • Role-based APIs       │    │ • Financial Data        │
│ • shadcn/ui Components  │    │ • RESTful Endpoints     │    │ • Comprehensive Logs    │
│ • Real-time Updates     │    │ • CORS Middleware       │    │ • Optimized Indexes     │
└─────────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
```

---

## ⚡ **Quick Start**

### 🚀 **One Command Startup**
```bash
# Start the entire system (easiest way)
make dev

# Or use Docker Compose directly  
docker-compose -f docker-compose.dev.yml up -d

# Access the applications
Frontend: http://localhost:3000
Backend API: http://localhost:8080/api/v1
Database: localhost:5432
```

### 🎭 **Default seed accounts** (local / `make db-reset`; password `admin123`)

| Role | Username | Access |
|------|----------|--------|
| **Admin** | `admin` | Full dashboard; default void-authorization PIN `1234` on fresh seed |
| **Inventory manager** | `inventory1` | Store inventory only (same admin shell, limited sidebar) |
| **Counter** | `counter1` / `counter2` | Checkout, server floor UI, menu & tables (same admin shell) |
| **Kitchen** | `kitchen1` | KDS + kitchen stations (same admin shell) |

Add real staff in **Admin → Manage Staff** for production; the login page has no demo shortcuts.

### 🎯 **First login**
1. Open http://localhost:3000 and sign in with a staff account (username or email + password).
2. Each role lands in the **same admin-style layout**; the sidebar only shows what that role may open.
3. Use **Manage Staff** (admin) to create additional users.

---

## 🛠️ **Available Make Commands**

```bash
# Development
make help         # Show all available commands  
make dev          # Start development environment with hot reloading
make up           # Start Docker containers
make down         # Stop Docker containers
make restart      # Restart all services

# Database Management
make create-admin # Create a super admin user
make backup       # Backup database and files
make restore      # Restore from backup  
make remove-data  # Remove all data (DESTRUCTIVE)
make db-reset     # Reset database with fresh schema and seed data
make db-shell     # Access PostgreSQL shell

# Utilities
make logs         # View all service logs
make status       # Show service status
make clean        # Clean up Docker resources
make test         # Run tests
make lint         # Run linting
```

---

## 💻 **Technology Stack**

### **🏗️ Backend Stack**
- **⚡ Golang 1.21** - High-performance server runtime
- **🌐 Gin Framework 1.9.1** - Fast HTTP web framework with middleware support
- **🗄️ Raw SQL with PostgreSQL Driver** - Direct database operations for maximum control and performance
- **🔐 JWT Authentication (v5.2.0)** - Secure token-based authentication system
- **🛡️ CORS Middleware** - Cross-origin request handling for development and production

### **🎨 Frontend Stack**
- **⚛️ TanStack Start 1.57.15** - Full-stack React framework with file-based routing
- **⚛️ React 18.3.1** - Latest React with concurrent features and hooks
- **📝 TypeScript 5.6.2** - Type-safe development with comprehensive type definitions
- **📊 TanStack Table 8.21.3** - Powerful data table with sorting, filtering, and pagination
- **🔄 TanStack Query 5.56.2** - Powerful data synchronization and caching
- **🎨 Tailwind CSS 3.4.13** - Utility-first CSS framework for rapid UI development
- **⚡ Vite 5.4.8** - Lightning-fast build tool and dev server
- **🧩 shadcn/ui + Radix UI** - Beautiful, accessible component library

### **🗄️ Database & Infrastructure**
- **🐘 PostgreSQL 15-Alpine** - Robust relational database with advanced features
- **📋 Comprehensive Schema** - Users, orders, products, payments, and audit logs
- **🔒 Role-based Security** - Database-level access control and permissions
- **⚡ Optimized Queries** - Strategically indexed for maximum performance
- **🐳 Docker Compose** - Containerized development and production environments
- **🟢 Node.js 24.3.0** - Modern JavaScript runtime for development tools

### **🧠 AI Development Enhancement**
- **🎯 Claude Sonnet 4 Intelligence** - Advanced reasoning and business logic understanding
- **📜 14 Enhanced Cursor Rules** - Comprehensive development patterns and best practices
- **🔮 Predictive Code Assistance** - Proactive suggestions based on business context
- **🛡️ Automated Quality Gates** - Tech debt prevention and performance monitoring
- **🚀 Performance-First Patterns** - Built-in optimization and monitoring capabilities

---

## 🏆 **Key Achievements**

### ✨ **Latest Features**
- **🧠 AI-Enhanced Development**: Advanced Cursor AI rules powered by Claude Sonnet 4 thinking capabilities
- **🚀 Intelligent Code Assistance**: Business logic awareness, predictive insights, and automated optimization
- **📊 Professional Table Views**: Enterprise-grade data tables with TanStack Table integration
- **🎨 Beautiful UI/UX**: Modern design with gradient avatars, color-coded badges, and smooth animations  
- **📱 Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **⚡ Real-time Search**: Instant filtering with debouncing and visual feedback
- **🔄 View Toggle System**: Switch between table and card views for optimal data visualization

### 🎯 **Development Excellence**
- **🧠 AI-Powered Development** - 14 advanced Cursor AI rules with Claude Sonnet 4 intelligence for business-aware coding
- **📚 Comprehensive Documentation** - Extensive AI-enhanced rules and development guidelines
- **🧪 Type Safety** - Complete TypeScript integration throughout the application
- **🔒 Security First** - JWT authentication, SQL injection prevention, and role-based access
- **⚡ Performance Optimized** - Efficient queries, caching, and optimized bundle sizes with AI monitoring
- **🐳 Docker Ready** - Full containerization with development and production configurations

---

## 🤝 **Support the Project**

### 💝 **Open for Sponsorship & Donations**

This project represents hundreds of hours of development work, creating a modern, professional POS system that's **completely free and open source**. If you find this project valuable:

**🌟 Ways to Support:**
- ⭐ **Star this repository** to show your appreciation
- 🐛 **Report bugs** or suggest features to help improve the system
- 💰 **Sponsor development** to help maintain and add new features
- ☕ **Buy me a coffee** to fuel late-night coding sessions
- 🗣️ **Share the project** with other restaurant owners or developers

**💳 Donation Options:**
- **🌟 GitHub Sponsors** - Support ongoing development
- **💰 PayPal** - Send donations to: `arissetia.m@gmail.com` (one-time or recurring)
- **💎 Cryptocurrency** - Contact for wallet addresses
- **🏢 Commercial Licensing** - Enterprise support and customization available

*Every contribution helps make this project better for everyone! 🙏*

---

## 📋 **Project Structure**

```
pos-full/
├── 🧠 .cursor/rules/           # AI-Enhanced Cursor rules (Claude Sonnet 4 powered)
│   ├── business-logic-patterns.mdc    # POS domain understanding & workflows
│   ├── user-journey-optimization.mdc  # Role-specific performance patterns
│   ├── tech-debt-prevention.mdc       # Code quality & consistency gates
│   ├── testing-patterns.mdc           # QA integration & error prevention
│   └── performance-optimization.mdc   # Performance-first development
├── 🔧 backend/                 # Golang REST API server
│   ├── internal/api/           # Route definitions and handlers
│   ├── internal/handlers/      # Business logic controllers
│   ├── internal/middleware/    # Authentication and CORS
│   ├── internal/models/        # Data models and DTOs
│   └── main.go                 # Application entry point
├── 🎨 frontend/                # TanStack Start React application
│   ├── src/components/         # Reusable UI components
│   ├── src/routes/            # File-based routing system
│   ├── src/api/               # API client and integrations
│   ├── src/types/             # TypeScript type definitions
│   └── src/hooks/             # Custom React hooks
├── 🗄️ database/               # SQL schema and seed data
│   └── init/                  # Database initialization scripts
├── 🐳 docker/                 # Docker configuration files
├── 📚 docs/                   # Project documentation
└── 🛠️ scripts/               # Development and deployment scripts
```

---

## 🚀 **Getting Started**

### **Prerequisites**
- Docker & Docker Compose
- Make (for convenience commands)
- Git (for cloning the repository)

### **Installation**
```bash
# Clone the repository
git clone https://github.com/madebyaris/poinf-of-sales.git
cd poinf-of-sales

# Start everything with one command
make dev

# Open your browser
open http://localhost:3000
```

### **Development**
```bash
# Development mode with hot reloading
make dev

# Individual service startup (for advanced users)
cd backend && go run main.go
cd frontend && npm run dev
```

---

## ☁️ **Deploying to Railway**

The repo ships with per-service Railway config so deploys are deterministic and reviewable in git instead of dashboard checkboxes:

- [`backend/railway.json`](backend/railway.json) — builds the Go service from [`backend/Dockerfile`](backend/Dockerfile), health-checks `/health`, and watches `backend/**`, `database/migrations/**`, and `database/init/**`.
- [`frontend/railway.json`](frontend/railway.json) — builds the React/nginx image from [`frontend/Dockerfile`](frontend/Dockerfile), health-checks `/health`, and watches `frontend/**`.

### **One-time Railway project setup (per restaurant)**

1. **Create two services** in your Railway project pointing at this GitHub repo: one for `backend`, one for `frontend`.
2. For **each service** open *Settings → Source* and set **Root Directory** to either `backend` or `frontend`. This is what makes Railway pick up the per-service `railway.json`.
3. Leave **Watch Paths** in the dashboard *empty* — `railway.json`'s `build.watchPatterns` overrides it and is the single source of truth.
4. Add a **Postgres plugin** to the project; Railway will inject `DATABASE_URL` into the backend service automatically.
5. On the backend service set the required env vars: `JWT_SECRET`, `CORS_ORIGINS` (e.g. `https://your-frontend-domain`), `GIN_MODE=release`.
6. On the frontend service set `BACKEND_URL` to the backend service's internal URL (e.g. `http://backend.railway.internal:8080`).

### **How migrations actually run on every push**

There is no separate "run migrations" step — schema changes are applied automatically on backend boot:

1. **First boot of an empty DB** — [`backend/internal/database/bootstrap.go`](backend/internal/database/bootstrap.go) detects the missing `public.users` table and runs the embedded full schema from [`embedded_railway_init.sql`](backend/internal/database/embedded_railway_init.sql) inside a single transaction.
2. **Every boot** — [`backend/internal/database/schema_patches.go`](backend/internal/database/schema_patches.go) runs idempotent DDL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, etc.) that mirrors every file in [`database/migrations/`](database/migrations/). Re-running on an already-up-to-date DB is a no-op.

So a `git push` to `main` works like this:

```
git push → Railway watchPatterns match → service rebuilds → container restarts
        → BootstrapIfEmpty()        (no-op on existing DB)
        → ApplySchemaPatches()      (runs every new migration block idempotently)
        → backend serves traffic with the new schema
```

Adding a new SQL file under `database/migrations/` is enough to trigger a backend redeploy on the next push, even if no Go code changed.

> **Mirror invariant** — every new `database/migrations/NNN_*.sql` you add MUST also be added as idempotent DDL in `schema_patches.go` in the same PR. The SQL files are a human-readable history; `schema_patches.go` is what production actually executes. See the comment at the top of that file for the rules.

### **Adding a new migration end-to-end**

1. Create `database/migrations/NNN_short_description.sql` with the canonical SQL (uses `IF NOT EXISTS` etc.).
2. Mirror those statements at the bottom of `ApplySchemaPatches()` in [`backend/internal/database/schema_patches.go`](backend/internal/database/schema_patches.go).
3. Run locally with `make dev` and confirm logs show `Applying idempotent schema patches…` followed by `Schema patches finished`.
4. Push. Railway rebuilds the backend (because `database/migrations/**` is in `watchPatterns`). The first request after deploy hits the new schema.

### **Brand-new restaurant deploy (full checklist)**

We run one Railway project per restaurant (CK, COVA, …). Each deployment is fully isolated: its own Postgres, its own `JWT_SECRET`, its own `CORS_ORIGINS`. Re-evaluate the multi-tenant/SaaS migration around 10–15 deployments.

**Automated path** (recommended): run the interactive helper, paste the env block it prints into Railway, and let it seed the two admin accounts once the services are healthy.

```bash
./scripts/provision-restaurant.sh
```

**Manual path**, step by step:

1. **Railway project** — connect this repo to a new project, add the Postgres plugin, create `backend` and `frontend` services (Root Directory = `backend` / `frontend` respectively).
2. **Backend env vars**:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` — **unique per restaurant** (generate with `openssl rand -base64 48`). Reusing this across restaurants lets a CK token validate against COVA.
   - `CORS_ORIGINS=https://<subdomain>.bhookly.com`
   - `APP_URL=https://<subdomain>.bhookly.com` — used to build reset-password links inside emails.
   - `GIN_MODE=release`
   - `RESEND_API_KEY` — **same** value across every deployment (centralized bhookly Resend account). Leave blank in dev to log reset emails to stdout instead of sending.
   - `EMAIL_FROM=CK Restaurant <noreply@bhookly.com>`
   - `TENANT_DISPLAY_NAME=CK Restaurant` — shown in email subject/body.
   - `TENANT_SUPPORT_EMAIL=support@bhookly.com` — optional reply-to.
3. **Frontend env vars**: `BACKEND_URL=http://${{Backend.RAILWAY_PRIVATE_DOMAIN}}:8080`.
4. **DNS**: point `<subdomain>.bhookly.com` at the Railway frontend service. Railway issues a TLS cert automatically.
5. **Seed admin users** (once the deployment is healthy): run [`scripts/create-admin.sh`](scripts/create-admin.sh) twice against the **local** Postgres container OR shell into the Railway DB:
   ```bash
   # Bhookly support account — hidden from the customer's admin UI,
   # protected from update/delete. Store credentials in 1Password.
   ./scripts/create-admin.sh --platform

   # Customer's own first admin user. Hand credentials over to them.
   ./scripts/create-admin.sh
   ```
6. **Smoke test**: login, forgot-password (verify email arrives), change password from the user menu, create a product, run an order end-to-end.

### **Authentication & password flows**

- **Login** — `POST /api/v1/auth/login` issues an HS256 JWT (24h). Token is stored in `localStorage` as `pos_token` and sent as `Authorization: Bearer …` on every request.
- **Forgot password** — `POST /api/v1/auth/forgot-password` with `{email}` sends a single-use reset link valid for 1 hour. Always returns HTTP 200 with a generic message (no enumeration). Rate-limited per-IP and per-email.
- **Reset password** — `POST /api/v1/auth/reset-password` with `{token, new_password}` (min 8 chars). Token is 32 bytes of `crypto/rand`, only `sha256(token)` is stored; compared in constant time.
- **Change password** — `POST /api/v1/auth/change-password` (protected) with `{current_password, new_password}`. UI lives in the top-right user menu.

Known limitation (documented): JWTs are stateless, so changing a password does not invalidate existing tokens. Acceptable at our scale; revisit with a `token_version` claim if needed.

### **Bhookly support access (platform admin)**

Each deployment has a `bhookly_support` user with `users.is_platform_admin=true`. This row is:
- **Hidden** from the customer's `Admin → Staff` page — [`getAdminUsers`](backend/internal/api/routes.go) filters out `is_platform_admin = true`.
- **Protected** from customer-initiated modifications — [`updateUser`](backend/internal/api/routes.go) and [`deleteUser`](backend/internal/api/routes.go) reject any attempt to touch a platform-admin row and respond with 404 to preserve the illusion that it doesn't exist.

When we need to help a customer, we log in at `https://<subdomain>.bhookly.com/login` with the `bhookly_support` credentials from 1Password — same flow customers use, full admin access, auditable. If that ever fails, break-glass is direct Postgres access via Railway.

---

## 🔧 **Troubleshooting**

### **Docker Build Issues**

If you encounter Docker build errors, try these solutions:

#### **Backend Build Errors (go.mod/go.sum issues)**
```bash
# Clean up Go modules and rebuild
cd backend
go mod tidy
go mod download
cd ..
docker-compose down
docker-compose -f docker-compose.dev.yml up -d --build
```

#### **General Docker Issues**
```bash
# Clean rebuild everything
make clean
make dev

# Or manually clean and rebuild
docker system prune -f
docker-compose down --volumes --remove-orphans
docker-compose -f docker-compose.dev.yml up -d --build
```

#### **Permission Issues (Linux/WSL)**
```bash
# Fix file permissions
sudo chown -R $USER:$USER .
chmod -R 755 .
```

### **Common Solutions**
- 🔄 **Restart Docker Desktop** if you're on Windows/Mac
- 🧹 **Clear Docker cache**: `docker system prune -f`
- 📦 **Update dependencies**: Run `go mod tidy` in backend and `npm install` in frontend
- 🐳 **Rebuild containers**: Use `--build` flag with docker-compose commands

> 💡 **Still having issues?** [Open a GitHub issue](https://github.com/madebyaris/poinf-of-sales/issues) with your error logs!

---

## 📱 **Upcoming Mobile Applications**

### 🚀 **React Native Development Roadmap**

We're expanding the POS system with **native mobile applications** to provide even better flexibility for restaurant operations:

#### 📋 **GitHub Milestones Created**
Based on the [project milestones](https://github.com/madebyaris/poinf-of-sales/milestones), we're developing:

**🍳 Kitchen Staff Mobile App (iOS & Android)**
- **Target Devices:** Tablets and TV screens for kitchen display
- **Key Features:** Touch-optimized kitchen interface, real-time order sync, offline support
- **Status:** 📋 Planned - Milestone created
- **Timeline:** 3-4 weeks development

**👨‍💼 Server Group Mobile App (iOS & Android)**  
- **Target Devices:** Smartphones and tablets for server staff
- **Key Features:** Mobile order taking, table management, payment processing
- **Status:** 📋 Planned - Milestone created  
- **Timeline:** 3-4 weeks development

#### 🎯 **Mobile App Benefits**
- **📱 Native Performance** - Smooth, responsive interfaces optimized for mobile devices
- **🔄 Real-time Sync** - Seamless integration with existing web-based POS system
- **📡 Offline Support** - Continue operations during network connectivity issues
- **🎨 Platform-Optimized UI** - Native iOS and Android design patterns
- **📺 Large Screen Support** - Kitchen displays on wall-mounted TVs and tablets

> 🔗 **Track Progress:** Follow development on our [GitHub Milestones](https://github.com/madebyaris/poinf-of-sales/milestones)

---

## 📄 **License**

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License - Free for commercial and personal use
✅ Commercial use    ✅ Modification    ✅ Distribution    ✅ Private use
```

---

## 🙏 **Acknowledgments**

- **🔧 Golang Community** for the amazing ecosystem and performance
- **⚛️ React Team** for the incredible frontend framework
- **🎨 Tailwind CSS** for making beautiful designs accessible
- **📊 TanStack** for the powerful table and query libraries
- **🧩 shadcn/ui** for the beautiful component system
- **🐳 Docker** for making deployment seamless

---

<div align="center">

### **⭐ Star this project if you find it useful! ⭐**

**Built with ❤️ by developers, for developers**

*Ready to transform your restaurant operations? Get started today!*

[🚀 **Get Started**](#-quick-start) • [💝 **Support the Project**](#-support-the-project) • [📚 **Documentation**](docs/) • [🐛 **Report Issues**](issues/)

</div>