# RPNGC Custody Management System — SaaS Platform

A full-featured, offline-capable custody management system built for the Royal Papua New Guinea Constabulary, designed as a multi-tenant SaaS platform.

---

## 🏗️ Architecture

```
custody-saas/
├── backend/          # Node.js + Express + Prisma ORM
│   ├── routes/       # API routes
│   ├── middleware/   # Auth, subscription guards
│   ├── lib/          # Utilities (custody numbers, audit, sync)
│   ├── prisma/       # PostgreSQL schema
│   ├── server.js     # Entry point
│   └── seed.js       # Demo data seeder
├── frontend/         # React + Vite PWA
│   └── src/
│       ├── pages/    # Route pages
│       ├── admin/    # Super admin pages
│       ├── components/  # Shared components
│       ├── lib/      # API client, IndexedDB, sync
│       └── store/    # Zustand auth store
├── docker-compose.yml
└── nginx.conf
```

**Stack:**
- **Frontend:** React 18, Vite PWA (offline-first via Service Worker + IndexedDB)
- **Backend:** Node.js, Express 5, Prisma ORM
- **Database:** PostgreSQL 16
- **Auth:** JWT (8h expiry), role-based access control
- **Offline Sync:** IndexedDB local storage + Background sync endpoint

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- Docker (optional, recommended)

### Option A: Docker Compose (Recommended)
```bash
git clone <repo>
cd custody-saas

# Set environment
cp backend/.env.example backend/.env
# Edit JWT_SECRET in backend/.env

# Build frontend first
cd frontend && npm install && npm run build && cd ..

# Launch everything
docker-compose up -d

# App is at http://localhost
# API is at http://localhost/api
```

### Option B: Manual Setup

**Database:**
```bash
createdb custody_saas
```

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

npx prisma migrate dev --name init
node seed.js
npm start
# API running at http://localhost:4000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# Dev server at http://localhost:5173
```

---

## 🔐 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@custody.gov.pg | admin123 |
| Station Admin | admin@boroko.police.gov.pg | boroko123 |
| Officer | officer@boroko.police.gov.pg | officer123 |

---

## 👥 User Roles

| Role | Access |
|------|--------|
| **SUPER_ADMIN** | Full platform access, manage all stations, subscriptions, plans |
| **STATION_ADMIN** | Manage their station's users, settings, subscription info |
| **DUTY_SERGEANT** | Create/update detainees, release, welfare checks, audit log |
| **OFFICER** | Create bookings, view detainees, welfare checks |

---

## 💳 SaaS Plans

| Plan | Users | Detainees/mo | Price (PGK) | Features |
|------|-------|------------|-------------|---------|
| Basic | 5 | 500 | 99/mo | Register, Reports |
| Standard | 15 | 2,000 | 249/mo | + Audit, Cells, Welfare |
| Premium | 50 | 10,000 | 499/mo | + API, Analytics |

- **30-day free trial** for all new stations
- Super Admin can manage subscriptions per station
- Suspended/cancelled stations lose access immediately

---

## 📱 Offline Capability

The app works fully offline (PWA):
1. Service Worker caches the full app shell on first load
2. IndexedDB stores detainee records locally
3. When you create a booking offline, it saves to IndexedDB with `_syncStatus: 'pending'`
4. When internet reconnects, the app auto-syncs via `POST /api/sync/push`
5. Server assigns custody numbers and confirms sync
6. `GET /api/sync/pull` pulls server changes since last sync

The sidebar shows a ⚠️ offline banner and a count of pending records.

---

## 🗃️ API Reference

### Auth
- `POST /api/auth/login` — Login, returns JWT
- `GET /api/auth/me` — Current user info
- `POST /api/auth/change-password` — Change password

### Detainees
- `GET /api/detainees` — List with filters (status, search, date range, pagination)
- `GET /api/detainees/stats` — Dashboard stats
- `GET /api/detainees/:id` — Full detail with reviews
- `POST /api/detainees` — New booking (auto-generates custody number)
- `PUT /api/detainees/:id` — Update
- `POST /api/detainees/:id/release` — Release detainee
- `POST /api/detainees/:id/reviews` — Add welfare check

### Cells
- `GET /api/cells` — All cells with occupancy
- `POST /api/cells` — Create cell
- `PUT /api/cells/:id` — Update cell

### Sync
- `POST /api/sync/push` — Upload offline-created records
- `GET /api/sync/pull?since=<ISO>` — Fetch changes since date

### Admin (SUPER_ADMIN only)
- `GET /api/admin/stats` — Platform-wide stats
- `GET /api/admin/stations` — All stations
- `POST /api/admin/stations` — Create station (+ admin user)
- `PATCH /api/admin/stations/:id/subscription` — Update subscription
- `GET /api/admin/users` — All platform users

### Plans
- `GET /api/plans` — Public list
- `POST /api/plans` — Create plan (SUPER_ADMIN)
- `PUT /api/plans/:id` — Update plan

---

## 🔒 Security
- JWT authentication on all routes
- Subscription guard blocks access for suspended/cancelled stations
- Trial expiry check
- Rate limiting (500 req/15min general, 20 req/15min for login)
- Helmet.js security headers
- Multi-tenant isolation — stations only see their own data
- Full audit log for all custody actions

---

## 🖨️ Printing
Click the 🖨️ Print button on the Reports page or a Detainee Detail page. Sidebar and buttons are hidden in print mode via CSS (`@media print`).

---

## 📋 Custody Number Format
Auto-generated: `{STATION_CODE}-{YEAR}-{SEQUENCE}`
Example: `BKO-2026-0001`

Resets sequence annually, per station.
