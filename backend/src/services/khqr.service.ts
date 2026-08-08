import { createHash } from 'node:crypto';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getSettings } from './settings.service.js';

const KHQR_GATEWAY = 'https://khqr.cc/api/payment/request';

export interface KhqrCheckoutParams {
  orderNumber: string;
  amount: number;
  successUrl: string;
  remark?: string;
}

export interface KhqrCheckoutResult {
  url: string;
  transactionId: string;
}

/**
 * Build a KHQR checkout URL for the given order.
 *
 * Hash = sha1(secret + transaction_id + amount + success_url + remark)
 */
export async function buildKhqrCheckoutUrl(
  params: KhqrCheckoutParams,
): Promise<KhqrCheckoutResult> {
  const settings = await getSettings();
  if (!settings.khqr_enabled) throw badRequest('KHQR payments are not enabled');
  if (!settings.khqr_profile_id || !settings.khqr_secret_key) {
    throw badRequest('KHQR is not configured — set profile ID and secret key in Settings');
  }

  const { orderNumber, amount, successUrl, remark } = params;
  const transactionId = orderNumber;

  const raw = settings.khqr_secret_key + transactionId + amount + successUrl + (remark ?? '');
  const hash = createHash('sha1').update(raw).digest('hex');

  const qs = new URLSearchParams({
    transaction_id: transactionId,
    amount: String(amount),
    success_url: successUrl,
    hash,
  });
  if (remark) qs.set('remark', remark);

  const url = `${KHQR_GATEWAY}/${settings.khqr_profile_id}?${qs.toString()}`;
  logger.info('khqr', `Checkout URL generated for order ${orderNumber}`);
  return { url, transactionId };
}

/**
 * Verify a KHQR webhook/success callback hash.
 *
 * Webhook hash = sha256(secret + req_time + transaction_id + amount + "SUCCESS")
 * Success URL hash is verified by KHQR directly (we just check status).
 */
export interface KhqrCallbackData {
  transaction_id: string;
  amount: string;
  status: string;
  req_time?: string;
  hash: string;
}

export async function verifyKhqrCallback(cb: KhqrCallbackData): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.khqr_secret_key) return false;

  if (cb.status === 'SUCCESS' && cb.req_time) {
    const raw = settings.khqr_secret_key + cb.req_time + cb.transaction_id + cb.amount + 'SUCCESS';
    const expected = createHash('sha256').update(raw).digest('hex');
    return expected === cb.hash;
  }

  // For non-SUCCESS statuses we don't have a hash formula documented; reject.
  return false;
}
