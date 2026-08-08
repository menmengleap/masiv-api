import { z } from 'zod';

// Reusable primitives
const tokenAmount = z.union([z.string().min(1), z.number().positive()]);
const money = z.coerce.number().min(0).max(1_000_000);
const validDays = z.coerce.number().int().min(1).max(3650);

export const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

export const uploadTokenSchema = z.object({
  api_key: z.string().min(4, 'API key too short').max(4000),
  base_url: z.string().url('Base URL must be a valid URL').max(500),
  total_tokens: tokenAmount,
  valid_days: validDays,
  price: money,
  start_mode: z.enum(['on_purchase', 'immediate']),
  package_name: z.string().max(120).optional(),
  description: z.string().max(2000).nullish(),
});

export const createPackageSchema = z.object({
  name: z.string().min(1).max(120),
  total_tokens: tokenAmount,
  price: money,
  default_valid_days: validDays,
  description: z.string().max(2000).nullish(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
});

export const updatePackageSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  price: money.optional(),
  default_valid_days: validDays.optional(),
  description: z.string().max(2000).nullish(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
});

export const updateSettingsSchema = z.object({
  bot_name: z.string().min(1).max(120).optional(),
  usd_to_usdt: z.coerce.number().positive().max(1_000_000).optional(),
  payment_currency: z.string().min(1).max(20).optional(),
  payment_wallet: z.string().max(200).nullish(),
  payment_network: z.string().max(60).nullish(),
  payment_timeout_minutes: z.coerce.number().int().min(1).max(1440).optional(),
  welcome_message: z.string().max(8000).nullish(),
  support_username: z.string().max(120).nullish(),
  documentation_url: z.string().max(500).nullish(),
  khqr_profile_id: z.string().max(200).nullish(),
  khqr_secret_key: z.string().max(200).nullish(),
  khqr_enabled: z.boolean().optional(),
});

export const updatePoliciesSchema = z.object({
  terms_of_service: z.string().max(20000).optional(),
  privacy_policy: z.string().max(20000).optional(),
  service_policy: z.string().max(20000).optional(),
});

export const confirmPaymentSchema = z.object({
  transaction_hash: z.string().max(200).nullish(),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid id'),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.string().max(30).optional(),
  package_id: z.string().uuid().optional(),
  search: z.string().max(120).optional(),
});
