/**
 * API response shapes — mirrors the backend view/service return types exactly.
 *
 * IDs are UUID strings. BIGINT and NUMERIC values (token counts, money) arrive
 * as strings — the backend serializes them that way to avoid precision loss.
 */

// Stored status. Note the backend uses 'stock' for available inventory.
export type TokenStatus = 'stock' | 'reserved' | 'active' | 'expiring' | 'expired' | 'disabled';
export type StartMode = 'on_purchase' | 'immediate';
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'refunded';
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'expired' | 'refunded';

export interface Admin {
  id: string;
  username: string;
}

// GET /packages  (PackageView extends PackageRow)
export interface PackageView {
  id: string;
  name: string;
  total_tokens: string;
  price: string;
  default_valid_days: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  stock_available: number;
  stock_total: number;
}

// GET /stock  → { items: TokenView[]; total: number }
export interface TokenView {
  id: string;
  package_id: string | null;
  package_name: string | null;
  base_url: string;
  masked_key: string;
  total_tokens: string;
  valid_days: number;
  price: string;
  start_mode: StartMode;
  status: TokenStatus;
  effective_status: TokenStatus;
  started_at: string | null;
  expires_at: string | null;
  days_left: number | null;
  is_used: boolean;
  customer_id: string | null;
  customer_label: string | null;
  assigned_at: string | null;
  created_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

// POST /stock/upload
export interface UploadResult {
  token: TokenView;
  package: { id: string; name: string; total_tokens: string; created: boolean };
  stock_available: number;
}

// GET /orders  (OrderView extends OrderRow)
export interface OrderView {
  id: string;
  order_number: string;
  customer_id: string;
  package_id: string;
  token_id: string | null;
  amount: string;
  currency: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  customer_label: string | null;
  telegram_user_id: string | null;
  package_name: string;
  payment_status: PaymentStatus | null;
  transaction_hash: string | null;
}

// GET /payments  (PaymentRow + order_number)
export interface PaymentView {
  id: string;
  order_id: string;
  order_number: string;
  currency: string;
  amount: string;
  network: string | null;
  wallet_address: string | null;
  transaction_hash: string | null;
  status: PaymentStatus;
  expires_at: string | null;
  created_at: string;
  confirmed_at: string | null;
}

// GET /customers  (CustomerView extends CustomerRow)
export interface CustomerView {
  id: string;
  telegram_user_id: string | null;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  orders_count: number;
  active_tokens: number;
  total_spent: string;
}

// GET /dashboard/stats
export interface DashboardStats {
  total_stock: number;
  available_stock: number;
  active_apis: number;
  expiring_soon: number;
  expired_apis: number;
  reserved: number;
  total_packages: number;
  orders_today: number;
  revenue_today: string;
  revenue_total: string;
  total_customers: number;
}

// GET /settings
export interface BotSettings {
  id: string;
  bot_name: string;
  usd_to_usdt: string;
  payment_currency: string;
  payment_wallet: string | null;
  payment_network: string | null;
  payment_timeout_minutes: number;
  welcome_message: string | null;
  support_username: string | null;
  documentation_url: string | null;
  khqr_profile_id: string | null;
  khqr_secret_key: string | null;
  khqr_enabled: boolean;
  updated_at: string;
}

// GET /policies
export interface ServicePolicies {
  id: string;
  terms_of_service: string;
  privacy_policy: string;
  service_policy: string;
  updated_at: string;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogSource = 'api' | 'bot' | 'worker' | 'db' | 'system';

// GET /logs/system  → { items: LogEntry[] }
export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: LogSource;
  message: string;
}

// GET /logs/audit  → { items: AuditLogView[] }
export interface AuditLogView {
  id: string;
  admin_id: string | null;
  admin_username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkerStatus {
  running: boolean;
  interval_ms: number;
  last_run_at: string | null;
  last_run_summary: string;
}

// GET /telegram/status
export interface TelegramStatus {
  connected: boolean;
  configured: boolean;
  bot_username: string | null;
  status: string;
  stats: {
    total_users: number;
    orders_today: number;
    messages_today: number;
  };
  worker: WorkerStatus;
}

// GET /expiry
export interface ExpiryOverview {
  worker: WorkerStatus;
  expiring: TokenView[];
  expired: TokenView[];
  active: TokenView[];
}
