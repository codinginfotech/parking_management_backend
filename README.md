# Parkline — Backend

REST + realtime backend for **Parkline**, a vehicle parking management platform for Indian parking vendors. Node.js · TypeScript · Express · MongoDB · Socket.IO.

The mobile client lives in a separate repository: `parking-management-mobile`.

## Stack

- **Express 4 + TypeScript (strict)** — modular architecture, one folder per domain module
- **MongoDB + Mongoose 8** — indexed models, a partial unique index prevents duplicate active sessions per vehicle
- **JWT auth** — short-lived access tokens + rotating refresh tokens (stored hashed, SHA-256)
- **Google Sign-In** — one `/auth/google` endpoint verifies the ID token server-side and logs in or auto-creates the account
- **Zod** — request validation on body/query/params
- **Socket.IO** — authenticated realtime events per business (`vehicle:entered`, `vehicle:exited`, `occupancy:updated`, `payment:received`)
- **Redis** — deliberately not used. At this scale MongoDB indexes and Socket.IO's in-memory adapter cover every need; add `@socket.io/redis-adapter` only when you run multiple server instances.

## Getting started

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # tsx watch, http://localhost:4000
```

Requirements: Node 20+, a running MongoDB (local or Atlas).

Health check: `GET /health`. All APIs are under `/api/v1`.

### Google Sign-In setup

1. In Google Cloud Console → Credentials, create OAuth client IDs:
   - **Web** client ID → this is what the backend verifies against (`GOOGLE_CLIENT_ID`).
   - Android / iOS client IDs for the mobile app (see the mobile repo README).
2. Set `GOOGLE_CLIENT_ID` in `.env`. Multiple audiences may be comma-separated (web + iOS) — the mobile app sends the ID token minted for the **web** client ID.
3. The mobile app POSTs `{ idToken }` to `/api/v1/auth/google`. The backend verifies the token, then signs in the existing user or creates an `OWNER` account (name, verified email, profile image, `authProvider: GOOGLE`, no password).

## Module map

```
src/
├── config/            env validation, database connection
├── common/            middleware, errors, utils, constants, shared types
├── modules/
│   ├── auth/          register, login, google, refresh, logout, me
│   ├── users/         profile + business (User & Business models)
│   ├── parking-lots/  lots, capacity, pricing, occupancy
│   ├── parking-sessions/  entry, live list, lookup, exit, cancel + pricing engine
│   ├── vehicles/      vehicle registry, search, history
│   ├── slots/         slot CRUD + bulk creation
│   ├── payments/      payment records, summaries
│   ├── passes/        monthly passes, renewal, expiry detection
│   ├── staff/         staff accounts (OWNER/MANAGER only)
│   ├── shifts/        shift open/close, per-method collections
│   ├── reports/       daily & range reports (IST day boundaries)
│   ├── analytics/     overview, trends, peak hours
│   ├── notifications/ derived operational alerts
│   └── activity/      audit timeline
├── routes/            /api/v1 router
├── socket/            authenticated Socket.IO server + emit helpers
├── app.ts             express app assembly
└── server.ts          bootstrap + graceful shutdown
```

## Roles

| Ability | OWNER | MANAGER | ATTENDANT |
|---|---|---|---|
| Manage business profile | ✅ | — | — |
| Create/edit lots, pricing | ✅ (pricing owner-only) | edit non-pricing | — |
| Staff management | ✅ | attendants only | — |
| Vehicle entry/exit, payments | ✅ | ✅ | ✅ |
| Reports & analytics | ✅ | ✅ | overview only |
| Monthly passes | ✅ | ✅ | view |

`ADMIN` is a platform-level role reserved for internal tooling. All authorization is enforced server-side (`authorize` middleware + business/lot scoping in every query).

## Pricing engine

Charges are computed **only** on the backend (`modules/parking-sessions/pricing.engine.ts`). Per lot, per vehicle type:

- `FLAT` — one price per stay
- `HOURLY` — first hour + every additional hour
- `SLAB` — duration slabs, with an optional overflow hourly rate beyond the last slab
- `dailyMax` — cap applied per 24h window

The active-session list and exit preview return server-computed estimates; the exit endpoint recomputes the final amount at exit time.

## Response contract

```json
{ "success": true,  "message": "Vehicle entry created successfully", "data": { } }
{ "success": false, "message": "Vehicle is already parked",          "errors": [] }
```

## Key flows

- **Entry** `POST /parking-sessions/entry` — validates plate, rejects duplicates (409), checks per-type capacity, auto-detects an active monthly pass, optionally assigns a slot, logs activity, broadcasts realtime events.
- **Exit** `GET /parking-sessions/lookup?vehicleNumber=` → preview with live amount → `POST /parking-sessions/:id/exit` with `{ paymentMethod }` — recomputes the charge, records the payment against the collector's open shift, frees the slot, emits events, returns a receipt.
- **Shifts** `POST /shifts/start` / `POST /shifts/end` — one open shift per staff member (DB-enforced); every collected payment increments the shift's per-method totals.
