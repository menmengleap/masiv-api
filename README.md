# Masiv API — Marketplace System

A production-ready API marketplace with:

- **Admin Web Dashboard** — dark SaaS UI to manage API stock, packages, customers, orders, pricing, expiry, payments, audit logs and Telegram bot settings.
- **Telegram Store Bot** — customer-facing store: browse packages, buy API access, pay in USDT, receive API credentials.
- **Shared Backend API + PostgreSQL** — single source of truth. All business logic lives here.

```text
Admin Web ──▶ Backend API ──▶ PostgreSQL
                   │
                   ├── Token Stock / Packages / Orders / Customers / Payments
                   └── Expiry Worker
                   ▲
Telegram Store Bot ┘
```

---

## Repository layout

```text
Masiv-Bot/
├── backend/          Express API + Telegram bot + expiry worker (TypeScript)
│   ├── src/
│   │   ├── config/         env + constants
│   │   ├── db/             pool, migrations, migration runner
│   │   ├── lib/            crypto, tokens (normalization), logger, errors
│   │   ├── services/       business logic (packages, tokens, orders, payments…)
│   │   ├── routes/         REST endpoints
│   │   ├── middleware/     auth, validation, rate-limit, errors
│   │   ├── bot/            Telegram store bot (Telegraf)
│   │   ├── worker/         expiry worker
│   │   ├── app.ts          Express app
│   │   └── index.ts        entrypoint (API + bot + worker)
│   ├── API.md              full REST endpoint reference
│   ├── Dockerfile          multi-stage production image
│   ├── .env.example
│   └── package.json
├── frontend/         React + Vite + Tailwind admin dashboard
│   ├── src/
│   ├── Dockerfile          build + nginx (serves SPA, proxies /api)
│   ├── nginx.conf
│   ├── .env.example
│   └── package.json
├── docker-compose.yml    Postgres (default) + full stack via `--profile full`
├── .env.example          root env for the full-stack Docker path
└── README.md
```

---

## Quick start

Two ways to run it: **Option A** (local dev — Postgres in Docker, apps via npm, hot reload)
or **Option B** (whole stack in Docker).

### Option A — Local development

#### 1. Start PostgreSQL

```bash
docker compose up -d
```

This starts Postgres 16 on `localhost:5432` (db `masiv`, user `masiv`, password `masiv`).
Without a profile, compose starts **only** Postgres.

> Already have Postgres? Skip this and point `DATABASE_URL` at your instance.

#### 2. Backend

```bash
cd backend
cp .env.example .env          # then edit values (see below)
npm install
npm run migrate               # creates tables + indexes + seeds admin/settings
npm run dev                   # API on http://localhost:4000  (+ bot + worker)
```

The migrate step seeds a default admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`
(defaults: `admin` / `admin123` — **change these**).

#### 3. Frontend

```bash
cd frontend
cp .env.example .env          # VITE_API_URL empty in dev — the Vite proxy forwards /api
npm install
npm run dev                   # dashboard on http://localhost:5173
```

Log in with the admin credentials you set above.

### Option B — Full stack in Docker

Builds and runs Postgres + backend (API/bot/worker) + frontend (nginx) together. The
backend container runs migrations automatically on start.

```bash
cp .env.example .env          # root env — set JWT_SECRET, ENCRYPTION_KEY, ADMIN_PASSWORD…
docker compose --profile full up -d --build
```

- Dashboard → <http://localhost:8080>  (nginx serves the SPA and proxies `/api` to the backend)
- API (direct) → <http://localhost:4000>

nginx keeps the API same-origin, so the session cookie stays first-party and
`VITE_API_URL` is left empty in the image. Tear down with
`docker compose --profile full down` (add `-v` to also drop the database volume).

> Docker/compose files are provided but were **not** built in this dev environment
> (no Docker daemon here). The npm build paths — `backend` (`tsc` + migration copy)
> and `frontend` (`tsc` + `vite build`) — are verified to compile cleanly.

---

## Environment variables (backend/.env)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `development` / `production` |
| `JWT_SECRET` | Signs admin session JWTs — **must be strong** |
| `ENCRYPTION_KEY` | 32-byte hex/base64 key used to encrypt API keys at rest (AES-256-GCM) |
| `COOKIE_SECURE` | `true` in production (HTTPS) |
| `CORS_ORIGIN` | Frontend origin, e.g. `http://localhost:5173` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Seeded on first migrate |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather (bot disabled if empty) |
| `EXPIRY_WORKER_INTERVAL_MS` | How often the expiry worker runs (default 60000) |
| `EXPIRING_THRESHOLD_DAYS` | Days-left threshold for "expiring" (default 7) |
| `PAYMENT_TIMEOUT_MINUTES` | How long a payment invoice stays valid (default 30) |

Generate secrets:

```bash
# JWT secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Encryption key (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Key design guarantees

- **Nothing is hardcoded.** Package sizes, prices, validity days, wallet, exchange rate, all bot text, and policies live in the database and are editable from the admin site. Adding a *750M / 2B / 5B / 20B* package is just an upload — the bot menu updates automatically.
- **Auto package sync.** Uploading an API finds the matching package by normalized token amount and creates it if missing.
- **`expires_at` is the source of truth.** `days_left` is always computed, never stored. Both the worker and the UI compute remaining days, so the UI is correct even if the worker hasn't run.
- **Transaction-safe purchases.** Stock is claimed with `SELECT … FOR UPDATE SKIP LOCKED` inside a DB transaction, so the same API key can never be sold twice.
- **Server-verified payments.** Orders are only completed after the backend confirms payment (manual admin confirm or tx-hash verification hook) — never on a Telegram button click alone.
- **Security.** API keys are encrypted at rest (AES-256-GCM), masked in all list responses, and only revealed through an explicit, audited reveal endpoint. Admin auth uses bcrypt + JWT in an HTTP-only cookie. All admin mutations are audit-logged.

See [`backend/API.md`](backend/API.md) for full endpoint documentation.
