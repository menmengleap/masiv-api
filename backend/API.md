# Masiv API — Backend Reference

REST API for the admin dashboard. All business logic lives here; the admin web app
and the Telegram bot are thin clients over this surface.

- **Base URL (dev):** `http://localhost:4000`
- **Content type:** `application/json`
- **Body limit:** 256 KB

## Authentication

Admin auth uses **bcrypt + JWT** delivered in an **HTTP-only cookie** (`masiv_session`,
`SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`). The browser sends it automatically;
clients must use `credentials: 'include'`. `POST /api/auth/login` also returns the token in
the body for non-browser clients, which may instead send `Authorization: Bearer <token>`.

Every route under `/api` except `/api/auth/login` requires a valid session. Missing or
invalid sessions get `401`.

## Error shape

All errors use a single nested envelope:

```json
{ "error": { "code": "validation_error", "message": "Human readable", "details": { } } }
```

| Status | Meaning |
| --- | --- |
| `400` | Validation error (Zod) — `details` lists field issues |
| `401` | Not authenticated / session invalid |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate token, package in use) |
| `429` | Rate limited |
| `500` | Unexpected server error |

Money and token counts are returned as **strings** (`NUMERIC`/`BIGINT`) to avoid precision
loss. All IDs are **UUID strings**. Timestamps are ISO-8601 strings.

## Conventions

- List endpoints return `{ "items": [...], "total": <number> }` and accept `limit`
  (default varies, max 200) + `offset`.
- `days_left` is **never stored** — it is computed from `expires_at` on read, so it is
  correct even between expiry-worker runs.

---

## Health

### `GET /health`
Unauthenticated liveness probe.
```json
{ "ok": true, "service": "masiv-api", "env": "development" }
```

---

## Auth — `/api/auth`

### `POST /login`  *(rate-limited)*
Body: `{ "username": string, "password": string }`
→ `200 { "admin": { "id", "username" }, "token": string }` and sets the session cookie.
Invalid credentials → `401`. Too many attempts → `429`.

### `POST /logout`
Clears the session cookie. → `{ "ok": true }`

### `GET /me`
→ `{ "admin": { "id", "username" } }` for the current session, else `401`.

### `POST /change-password`
Body: `{ "current_password": string, "new_password": string }` (new min 8 chars).
→ `{ "ok": true }`. Audited as `admin.change_password`.

---

## Dashboard — `/api/dashboard`

### `GET /stats`
→ `DashboardStats`:
```jsonc
{
  "total_stock": 0, "available_stock": 0, "active_apis": 0,
  "expiring_soon": 0, "expired_apis": 0, "reserved": 0,
  "total_packages": 0, "orders_today": 0,
  "revenue_today": "0", "revenue_total": "0", "total_customers": 0
}
```

---

## API Stock — `/api/stock`

Full API keys are **encrypted at rest** and **never** returned in lists — only
`masked_key` (e.g. `••••••••••8A21`). The plaintext key is available only via the
explicit, audited reveal endpoint.

### `GET /`
Query: `status`, `package_id` (uuid), `search`, `limit`, `offset`.
`status` ∈ `stock | reserved | active | expiring | expired | disabled`.
→ `{ "items": TokenView[], "total": number }`

### `POST /upload`
Uploads a key and **auto-finds-or-creates** the matching package by normalized token
amount (no redeploy to add a new package tier).
Body:
```jsonc
{
  "api_key": "sk-...",          // required, encrypted at rest
  "base_url": "https://...",    // required, valid URL
  "total_tokens": "2000000000", // string or number
  "valid_days": 30,             // 1..3650
  "price": 25,                  // >= 0
  "start_mode": "on_purchase",  // "on_purchase" | "immediate"
  "package_name": "2B Plan",    // optional; only used when creating a package
  "description": "..."          // optional
}
```
→ `201 { "token": TokenView, "package": { "id", "name", "total_tokens", "created" }, "stock_available": number }`.
Duplicate key → `409`. Audited as `token.upload`.

### `POST /:id/reveal`
→ `{ "api_key": "<plaintext>" }`. Audited as `token.reveal`. Never logged.

### `POST /:id/disable` · `POST /:id/enable`
Toggle a token between `disabled` and `stock`. → updated `TokenView`. Audited.

### `DELETE /:id`
→ `{ "ok": true }`. Audited as `token.delete`.

---

## Packages — `/api/packages`

### `GET /`
Query: `active=true` to return only active packages.
→ `PackageView[]` (includes computed `stock_available` / `stock_total`).

### `GET /:id`
→ `PackageView`.

### `POST /`
Body:
```jsonc
{
  "name": "2B Plan", "total_tokens": "2000000000", "price": 25,
  "default_valid_days": 30, "description": "...",
  "is_active": true, "sort_order": 0
}
```
→ `201 PackageView`. Audited as `package.create`.

### `PATCH /:id`
Body: any of `name`, `price`, `default_valid_days`, `description`, `is_active`,
`sort_order`. **`total_tokens` is immutable** (identity) and cannot be changed.
→ `PackageView`. Audited as `package.update`.

### `DELETE /:id`
→ `{ "ok": true }`. A package still referenced by stock/orders → `409`. Audited.

---

## Orders — `/api/orders`

### `GET /`
Query: `status`, `customer_id`, `limit`, `offset`.
`status` ∈ `pending | paid | processing | completed | cancelled | expired | refunded`.
→ `{ "items": OrderView[], "total": number }`

### `GET /:id`
→ `OrderView`.

### `POST /:id/confirm-payment`  *(server-verified)*
Body: `{ "transaction_hash": string | null }`.
Runs the server-side verifier, then in **one transaction** activates the reserved token,
starts its expiry clock, and completes the order — then delivers credentials to the
customer over Telegram. Never completes on a bot button click alone.
→ delivered-credentials result. Audited as `order.confirm_payment`.

### `POST /:id/cancel`
Cancels a pending order and releases its reserved stock. Audited as `order.cancel`.

---

## Payments — `/api/payments`

### `GET /`
Query: `status`, `limit`, `offset`.
`status` ∈ `pending | confirmed | failed | expired | refunded`.
→ `{ "items": PaymentView[], "total": number }`

---

## Customers — `/api/customers`

### `GET /`
Query: `search` (name / username / Telegram ID), `limit`, `offset`.
→ `{ "items": CustomerView[], "total": number }` (each with `orders_count`,
`active_tokens`, `total_spent`).

### `GET /:id/orders`
→ `{ "items": OrderView[], "total": number }` for that customer.

---

## Settings — `/api/settings`

Database-driven bot configuration. Nothing here is hardcoded.

### `GET /`
→ `BotSettings`.

### `PUT /`
Body (all fields optional; only sent fields change):
```jsonc
{
  "bot_name": "Masiv Store",
  "usd_to_usdt": 1,                 // > 0
  "payment_currency": "USDT",
  "payment_wallet": "T...",         // nullable
  "payment_network": "TRC20",       // nullable
  "payment_timeout_minutes": 30,    // 1..1440
  "welcome_message": "...",         // nullable
  "support_username": "@support",   // nullable
  "documentation_url": "https://..."// nullable
}
```
→ `BotSettings`. Audited as `settings.update` (records **which** fields changed, never
their secret values).

---

## Policies — `/api/policies`

### `GET /`
→ `ServicePolicies`.

### `PUT /`
Body: any of `terms_of_service`, `privacy_policy`, `service_policy` (each ≤ 20000 chars).
→ `ServicePolicies`. Audited as `policies.update`.

---

## Expiry — `/api/expiry`

### `GET /`
→ `{ "worker": WorkerStatus, "expiring": TokenView[], "expired": TokenView[], "active": TokenView[] }`.
Query: `limit` (default 200) caps each group.

### `POST /run`
Forces an immediate expiry pass.
→ `{ "ok": true, "result": { "expired", "expiring", "reactivated", "orders_expired" }, "worker": WorkerStatus }`.
Audited as `worker.run_expiry`.

### `POST /restart-worker`
Restarts the background loop. → `{ "ok": true, "worker": WorkerStatus }`. Audited.

---

## Telegram — `/api/telegram`

The bot reads packages **live** from the DB, so adding a package never needs a redeploy.
The bot token is server-side only and is never exposed to the frontend.

### `GET /status`
→ `TelegramStatus`:
```jsonc
{
  "connected": true, "configured": true,
  "bot_username": "masiv_store_bot", "status": "Connected",
  "stats": { "total_users": 0, "orders_today": 0, "messages_today": 0 },
  "worker": WorkerStatus
}
```

### `POST /test`
Verifies the bot token / connection.
→ `{ "ok": boolean, "bot_username"?: string, "message": string }`. Audited as `bot.test`.

### `POST /sync-packages`
Confirms the live catalogue (bot always reads from DB; this logs + returns current set).
→ `{ "ok": true, "packages": number, "names": string[] }`. Audited as `bot.sync_packages`.

### `POST /restart-worker`
→ `{ "ok": true, "worker": WorkerStatus }`. Audited as `worker.restart`.

---

## Logs — `/api/logs`

### `GET /system`
In-memory ring buffer of runtime logs (oldest→newest).
Query: `limit` (max 500, default 200), `source` ∈ `api | bot | worker | db | system`.
→ `{ "items": [{ "ts", "level", "source", "message" }] }`

### `GET /audit`
Persistent admin audit trail (newest first).
Query: `limit` (max 200, default 100), `offset`.
→ `{ "items": [{ "id", "admin_id", "admin_username", "action", "entity_type", "entity_id", "metadata", "created_at" }] }`

---

## Audited admin actions

Every mutating admin action is written to `audit_logs`:

`admin.login`, `admin.change_password`, `token.upload`, `token.reveal`, `token.disable`,
`token.enable`, `token.delete`, `package.create`, `package.update`, `package.delete`,
`order.confirm_payment`, `order.cancel`, `settings.update`, `policies.update`,
`bot.test`, `bot.sync_packages`, `worker.run_expiry`, `worker.restart`.


