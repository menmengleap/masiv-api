# Build Masiv API — Admin Panel + Telegram Store + API Stock System

Build a production-ready API marketplace system called **Masiv API**.

The system has 2 main interfaces:

1. **Admin Web Dashboard** — manage API stock, packages, customers, orders, pricing, expiry, and Telegram Bot settings.
2. **Telegram Store Bot** — customer-facing store for browsing packages, purchasing API access, payment, and receiving API credentials.

Use a shared backend API and PostgreSQL database as the single source of truth.

---

## 1. Core Architecture

```text
Admin Web
    │
    ▼
Backend API
    │
    ├── PostgreSQL
    │
    ├── Token Stock
    ├── Packages
    ├── Orders
    ├── Customers
    ├── Payments
    └── Expiry Worker
    │
    ▼
Telegram Store Bot
```

Never put business logic directly inside the frontend or Telegram Bot.

The Backend must handle:

* authentication
* API stock
* packages
* orders
* customers
* payments
* expiry
* package synchronization
* Telegram synchronization
* API credential delivery
* audit logs

---

# 2. Admin Website

Create a modern dark SaaS dashboard.

### Design

* Black background
* Dark gray cards
* White text
* Orange primary accent
* Green = active
* Yellow = expiring
* Red = expired
* Responsive
* Clean developer/API style
* Sidebar navigation
* Top navigation with admin profile and system status

### Sidebar

```text
Masiv API

Dashboard
API Stock
API Upload
Packages
Orders
Customers
Expiry
Telegram Bot
Payments
Logs
Settings
```

---

# 3. Admin Dashboard

Display:

```text
Total API Stock
Available Stock
Active APIs
Expiring Soon
Expired APIs
Total Packages
Orders Today
Revenue
```

Add API stock table:

```text
Package
API Key
Base URL
Total Tokens
Status
Started
Expires
Days Left
Customer
Actions
```

Mask API keys:

```text
••••••••••8A21
```

Never display full API keys by default.

---

# 4. API Upload System

Create an **API Upload Center**.

Admin must be able to manually enter:

```text
API Key
Base URL
Total Tokens
Validity Days
Price
Start Mode
```

Example:

```text
API Key:
[ Enter API Key ]

Base URL:
[ https://api.example.com ]

Total Tokens:
[ 2000000000 ]

Display Package:
[ 2B Tokens ]

Validity:
[ 30 ] Days

Price:
[ 8.00 ] USD

Start Mode:
( ) When Added To Stock
( ) When Customer Buys

[ Add API To Stock ]
```

Do NOT hardcode package types.

The system must support any token amount:

```text
50M
100M
200M
500M
1B
2B
5B
10B
20B
etc.
```

---

# 5. Automatic Package Creation

When Admin uploads an API:

```text
Total Tokens = 2B
Validity = 30 Days
Price = $8
```

Backend must automatically search for the matching package.

If package does not exist:

```text
CREATE PACKAGE
```

If package exists:

```text
USE EXISTING PACKAGE
```

Do not require developers to modify source code when creating a new package.

Example:

```text
Admin adds 2B API
       ↓
Find 2B Package
       ↓
Not Found
       ↓
Create 2B Package
       ↓
Add API to 2B Stock
       ↓
Telegram Bot automatically shows 2B
```

---

# 6. Package Management

Admin can create/edit:

```text
Package Name
Total Tokens
Price
Default Valid Days
Description
Active/Inactive
Sort Order
```

Example:

```text
50M Tokens
100M Tokens
200M Tokens
1B Tokens
2B Tokens
```

But packages must remain dynamic.

---

# 7. Stock Lifecycle

API stock starts as:

```text
stock
```

If Start Mode is:

### Start When Customer Buys

Before purchase:

```text
status = stock
started_at = NULL
expires_at = NULL
```

After successful purchase:

```text
status = active
started_at = NOW()
expires_at = NOW() + valid_days
```

If Start Mode is:

### Start Immediately

When Admin adds the API:

```text
status = active
started_at = NOW()
expires_at = NOW() + valid_days
```

---

# 8. Expiry System

Do NOT store `days_left` as the source of truth.

Use:

```text
started_at
expires_at
```

Calculate remaining days dynamically.

Example:

```text
30 Days
↓
29 Days
↓
28 Days
↓
...
↓
1 Day
↓
Expired
```

Backend expiry worker must automatically update status:

```text
active
    ↓
expiring
    ↓
expired
```

Recommended:

```text
expiring = <= 7 days remaining
expired = expires_at <= NOW()
```

The worker must continue running automatically.

The website must also calculate the remaining days dynamically, so the UI remains correct even if the worker has not run.

---

# 9. Telegram Store Bot

The Telegram Bot is the customer-facing sales channel.

Do NOT make Telegram Bot the admin panel.

Admin manages everything from the website.

Telegram Bot reads/writes through the Backend API.

---

# 10. Telegram /start

When a user starts the bot, introduce the service first.

Message:

```text
🤖 Welcome to Masiv API

Hello! 👋

I'm the official Masiv API Store Bot.

You can use this bot to:

• 🛒 Buy AI API Token Packages
• 🔑 Receive your API credentials
• 📊 Check your package and expiry
• 📖 Access API Documentation
• 💬 Contact Support

━━━━━━━━━━━━━━━━━━

💱 PAYMENT RATE

$1 USD = 1 USDT

All prices are displayed in USD.
Payment is accepted in USDT.

━━━━━━━━━━━━━━━━━━

💳 PAYMENT

We currently accept:
• USDT Crypto Payment

━━━━━━━━━━━━━━━━━━

📜 IMPORTANT

Please review:

📄 Terms of Service
🛡 Privacy Policy
⚙️ Service Policy

By continuing, you agree to the applicable policies.
```

Buttons:

```text
🛒 Buy API
📦 Packages
📖 Documentation

📄 Terms
🛡 Privacy
⚙️ Service Policy

💬 Support
```

All text must be configurable from Admin Settings.

---

# 11. Telegram Packages

The package list must be loaded dynamically from the database.

Example:

```text
🛒 API PACKAGES

Choose a package:

🟠 50M Tokens
🟠 100M Tokens
🟠 200M Tokens
🟠 1B Tokens
🟠 2B Tokens
```

If Admin creates a new package:

```text
2B Tokens
```

Telegram Bot automatically displays it.

No code deployment should be required.

---

# 12. Telegram Purchase Flow

```text
Start
 ↓
Buy API
 ↓
Packages
 ↓
Select Package
 ↓
Show Package Details
 ↓
Confirm Order
 ↓
Payment
 ↓
Payment Verification
 ↓
Find Available Stock
 ↓
Reserve API
 ↓
Activate API
 ↓
Create Delivery
 ↓
Send Credentials
```

Package details:

```text
🟠 2B TOKEN PACKAGE

Total Tokens: 2B
Price: $X
Validity: 30 Days

✓ API Access
✓ Base URL
✓ API Key
✓ Instant Delivery

[ 🛒 Buy Now ]
```

---

# 13. Payment

Support USDT crypto payment.

Admin Settings must allow:

```text
Payment Currency = USDT
Exchange Rate = 1 USD = 1 USDT
Wallet Address
Network
Payment Timeout
```

Never hardcode payment wallet addresses.

Payment status:

```text
pending
paid
failed
expired
refunded
```

Do not mark an order as paid based only on the Telegram button click.

Payment must be verified by the backend/payment verification system.

---

# 14. API Delivery

After successful payment:

```text
Order
 ↓
Reserve Stock
 ↓
Activate Token
 ↓
started_at = NOW()
expires_at = NOW() + valid_days
 ↓
Assign Customer
 ↓
Deliver credentials
```

Telegram message:

```text
✅ PAYMENT SUCCESS

Your API is ready!

📦 Package: 2B Tokens
📅 Validity: 30 Days
⏳ Expires: 2026-09-07

🔗 Base URL:
https://example.com

🔑 API Key:
••••••••••8A21

[ 👁 View API Key ]
[ 📖 API Docs ]
[ 📊 Usage ]
```

Only reveal the full API key after the user explicitly requests it.

---

# 15. Database

Use PostgreSQL.

Enable UUID generation.

Create these tables:

```text
admins
customers
packages
tokens
orders
payments
telegram_users
bot_settings
service_policies
audit_logs
```

---

# 16. PostgreSQL Schema

Use this as the starting schema.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL UNIQUE,
    total_tokens BIGINT NOT NULL,

    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    default_valid_days INTEGER NOT NULL DEFAULT 30,

    description TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,

    base_url TEXT NOT NULL,

    token_value TEXT NOT NULL UNIQUE,

    total_tokens BIGINT NOT NULL,
    valid_days INTEGER NOT NULL,

    start_mode TEXT NOT NULL DEFAULT 'on_purchase'
        CHECK (start_mode IN ('on_purchase', 'immediate')),

    status TEXT NOT NULL DEFAULT 'stock'
        CHECK (
            status IN (
                'stock',
                'reserved',
                'active',
                'expiring',
                'expired',
                'disabled'
            )
        ),

    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    is_used BOOLEAN NOT NULL DEFAULT FALSE,

    used_by BIGINT,
    assigned_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
    id BIGSERIAL PRIMARY KEY,

    telegram_user_id BIGINT UNIQUE,
    telegram_username TEXT,

    first_name TEXT,
    last_name TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_number TEXT NOT NULL UNIQUE,

    customer_id BIGINT NOT NULL REFERENCES customers(id),

    package_id UUID NOT NULL REFERENCES packages(id),

    token_id UUID REFERENCES tokens(id),

    amount NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USDT',

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'paid',
                'processing',
                'completed',
                'cancelled',
                'expired',
                'refunded'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

    currency TEXT NOT NULL DEFAULT 'USDT',
    amount NUMERIC(12,2) NOT NULL,

    network TEXT,
    wallet_address TEXT,
    transaction_hash TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'confirmed',
                'failed',
                'expired',
                'refunded'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE TABLE telegram_users (
    id BIGSERIAL PRIMARY KEY,

    telegram_user_id BIGINT NOT NULL UNIQUE,

    username TEXT,
    first_name TEXT,
    last_name TEXT,

    language_code TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bot_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    bot_name TEXT NOT NULL DEFAULT 'Masiv API',

    usd_to_usdt NUMERIC(12,4) NOT NULL DEFAULT 1.0,

    payment_currency TEXT NOT NULL DEFAULT 'USDT',

    payment_wallet TEXT,
    payment_network TEXT,

    welcome_message TEXT,
    support_username TEXT,
    documentation_url TEXT,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    terms_of_service TEXT NOT NULL DEFAULT '',
    privacy_policy TEXT NOT NULL DEFAULT '',
    service_policy TEXT NOT NULL DEFAULT '',

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,

    admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,

    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 17. Required Indexes

Create indexes:

```sql
CREATE INDEX idx_tokens_status
ON tokens(status);

CREATE INDEX idx_tokens_package
ON tokens(package_id);

CREATE INDEX idx_tokens_expires_at
ON tokens(expires_at);

CREATE INDEX idx_orders_customer
ON orders(customer_id);

CREATE INDEX idx_orders_status
ON orders(status);

CREATE INDEX idx_payments_status
ON payments(status);

CREATE INDEX idx_telegram_users_id
ON telegram_users(telegram_user_id);
```

---

# 18. Auto Expiry Worker

Create a backend worker/cron job.

Every few minutes:

```text
Find active tokens
        ↓
expires_at <= NOW()
        ↓
status = expired
```

Then:

```text
Find active tokens
        ↓
expires_at <= NOW() + 7 days
        ↓
status = expiring
```

Never modify `expires_at` during this process.

`expires_at` remains the source of truth.

---

# 19. Automatic Package Sync

When an Admin uploads an API:

```text
API Key
Base URL
Total Tokens
Valid Days
Price
```

Backend must:

1. Validate input.
2. Normalize token amount.
3. Find package by `total_tokens`.
4. Create package if missing.
5. Insert token stock.
6. Link token to package.
7. Return updated stock count.
8. Telegram Bot automatically reads the updated packages.

Example:

```text
Admin enters:

Total Tokens = 2,000,000,000
Valid Days = 30
Price = 10

↓

Create 2B Tokens package if missing

↓

Add API to 2B stock

↓

Telegram automatically shows:

🟠 2B Tokens
```

---

# 20. Important Security Requirements

* Encrypt API keys at rest.
* Never log full API keys.
* Never expose API keys in frontend source code.
* Mask API keys in Admin tables.
* Use secure Admin authentication.
* Use HTTP-only secure cookies or secure JWT strategy.
* Validate all API inputs.
* Rate-limit Telegram Bot actions.
* Prevent duplicate token insertion.
* Use database transactions for purchases.
* Reserve stock before delivery.
* Never sell the same API key twice.
* Payment confirmation must be server-side verified.
* Add audit logs for Admin actions.
* Never store Telegram Bot token in frontend.
* Store all secrets in environment variables.

---

# 21. Transaction-Safe Purchase

When a customer buys a package, use a database transaction:

```text
BEGIN

Find available token
FOR UPDATE SKIP LOCKED

Reserve token

Create order

Verify payment

Mark payment confirmed

Activate token

Set:
started_at = NOW()
expires_at = NOW() + valid_days

Assign customer

Commit
```

If anything fails:

```text
ROLLBACK
```

This prevents two customers from receiving the same API key.

---

# 22. Admin API Upload Result

After successful upload show:

```text
✅ API ADDED

Package: 2B Tokens
Total Tokens: 2,000,000,000
Validity: 30 Days
Price: $10.00

Status: STOCK

Available Stock:
12

Telegram:
✓ Package synchronized
```

---

# 23. Admin Telegram Bot Control

Admin Website should have:

```text
Telegram Bot

🟢 Connected

Bot Username
Bot Status
Total Users
Orders Today
Messages Today

[ Test Bot ]
[ Sync Packages ]
[ Restart Worker ]
```

Also show Bot Logs:

```text
05:10:01 Package sync completed
05:10:03 2B package detected
05:10:04 Telegram menu updated
05:11:22 Order #10291 paid
05:11:23 Token assigned
```

---

# 24. Final Requirements

Build the entire system as a real working application, not a static mockup.

Implement:

* Admin authentication
* Admin dashboard
* API upload
* Dynamic packages
* Automatic package creation
* API stock management
* Token expiry
* Expiry worker
* Customers
* Orders
* USDT payment architecture
* Telegram Store Bot
* Dynamic Telegram package menu
* Purchase flow
* Automatic API assignment
* API delivery
* Terms
* Privacy Policy
* Service Policy
* Bot settings
* Audit logs
* PostgreSQL migrations
* Environment variables
* API documentation
* Error handling
* Loading states
* Empty states
* Responsive UI

Use the database as the single source of truth.

Do not hardcode package sizes.

Do not hardcode expiry days.

Do not hardcode prices.

Do not hardcode Telegram package menus.

Everything must be configurable from the Admin Website.

The final system must support adding a completely new package such as **750M, 2B, 5B, or 20B tokens** from the Admin Website without changing source code or redeploying the Telegram Bot.
