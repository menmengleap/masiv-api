// Domain row types (as returned from PostgreSQL; bigint/numeric are strings).

export type TokenStatus =
  | 'stock'
  | 'reserved'
  | 'active'
  | 'expiring'
  | 'expired'
  | 'disabled';

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

/**
 * How a payment is collected.
 *  - khqr:   automated via the khqr.cc gateway (scan-to-pay, webhook-confirmed)
 *  - usdt:   crypto, arranged manually with Support and confirmed by an admin
 *  - manual: any other off-platform arrangement confirmed by an admin
 */
export type PaymentMethod = 'khqr' | 'usdt' | 'manual';

export interface PackageRow {
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
}

export interface TokenRow {
  id: string;
  package_id: string | null;
  base_url: string;
  token_value: string; // ciphertext — never send to client
  token_fingerprint: string;
  token_last4: string;
  total_tokens: string;
  valid_days: number;
  price: string;
  start_mode: StartMode;
  status: TokenStatus;
  started_at: string | null;
  expires_at: string | null;
  is_used: boolean;
  used_by: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  telegram_user_id: string | null;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
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
}

export interface PaymentRow {
  id: string;
  order_id: string;
  currency: string;
  amount: string;
  method: PaymentMethod;
  network: string | null;
  wallet_address: string | null;
  transaction_hash: string | null;
  status: PaymentStatus;
  expires_at: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface BotSettingsRow {
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
  usdt_enabled: boolean;
  updated_at: string;
}

export interface ServicePoliciesRow {
  id: string;
  terms_of_service: string;
  privacy_policy: string;
  service_policy: string;
  updated_at: string;
}

export interface AdminRow {
  id: string;
  username: string;
  password_hash: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
