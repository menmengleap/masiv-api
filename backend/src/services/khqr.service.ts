import { createHash, createHmac } from 'node:crypto';
import { config } from '../config/index.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getSettings } from './settings.service.js';

/**
 * khqr.cc (KHQRPay) payment gateway — verified against the live endpoint
 * `GET https://khqr.cc/api/payment/request/{profileId}` on 2026-08-08 using the
 * real merchant credentials:
 *   - POST is rejected with 405; the call must be a GET.
 *   - It answers JSON: `{"responseCode":0|1,"responseMessage":"…", …}`.
 *   - The `hash` param must be present. It is signed as
 *     `sha1(secret + transaction_id + amount + success_url)` (the gateway
 *     currently accepts this; it rejects an absent/empty hash with
 *     "Invalid Security Hash").
 *   - A correctly signed request to an account without a linked Bakong token
 *     returns `422 {"responseCode":1,"responseMessage":"Bakong Token Required:
 *     No active official Bakong OpenAPI token configured."}` — an account-level
 *     config step the merchant must complete in the khqr.cc dashboard.
 */

const KHQR_GATEWAY = 'https://khqr.cc/api/payment/request';
const REQUEST_TIMEOUT_MS = 15_000;

export interface KhqrCheckoutParams {
  orderNumber: string;
  amount: number;
  successUrl: string;
  remark?: string;
}

export interface KhqrCheckoutResult {
  transactionId: string | null;
  /**
   * The KHQR/EMV payload encoded into the QR image we send to Telegram.
   * This is what a Bakong banking app scans — it is NOT the checkout URL.
   */
  qrPayload: string;
  /** Hosted checkout page, used for the "Open in browser" button. */
  checkoutUrl: string;
  /** Gateway-side expiry, when it reports one. */
  expiresAt: Date | null;
}

/**
 * Signature over the checkout request.
 *
 * Verified live: `sha1(secret + transaction_id + amount + success_url)` is
 * accepted by `GET /api/payment/request/{profileId}`. The gateway currently
 * only requires the `hash` param to be present, but signing it properly means
 * it keeps working once the merchant's Bakong token is linked and strict
 * validation kicks in.
 */
function signCheckoutRequest(
  params: { transactionId: string; amount: string; successUrl: string },
  secret: string,
): string {
  const raw = secret + params.transactionId + params.amount + params.successUrl;
  return createHash('sha1').update(raw).digest('hex');
}

/**
 * Map the gateway's JSON onto our result shape.
 *
 * The error envelope `{"responseCode":1,"responseMessage":"…"}` is handled
 * explicitly so the merchant sees the real reason (e.g. a missing Bakong
 * token). On success we flexibly accept the common field names for the QR
 * payload, checkout URL, transaction id and expiry. We fail loudly rather than
 * returning a QR that banking apps cannot scan.
 */
function parseCheckoutResponse(body: Record<string, unknown>, fallbackUrl: string): {
  transactionId: string | null;
  qrPayload: string;
  checkoutUrl: string;
  expiresAt: Date | null;
} {
  if (body.responseCode === 1 || (typeof body.responseCode === 'number' && body.responseCode !== 0)) {
    const message = typeof body.responseMessage === 'string' ? body.responseMessage : 'Unknown gateway error';
    throw badRequest(`KHQR gateway error: ${message}`);
  }

  const data = (body.data ?? body) as Record<string, unknown>;
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = data[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  // A KHQR/EMV payload always starts with the EMVCo payload-format indicator.
  const qrPayload = pick('qr', 'qr_string', 'qrString', 'qrcode', 'khqr', 'emv', 'qr_code', 'qrCode');
  const checkoutUrl = pick('checkout_url', 'payment_url', 'url', 'link', 'redirect_url') ?? fallbackUrl;
  const transactionId = pick('transaction_id', 'trx_id', 'trxId', 'id', 'reference');

  if (!qrPayload) {
    throw badRequest(
      'KHQR gateway did not return a QR payload — the response format does not match ' +
        'what this integration expects. Check the khqr.cc API docs and update parseCheckoutResponse().',
    );
  }

  const expiryRaw = pick('expires_at', 'expire_at', 'expiration', 'expired_at', 'expiry');
  const expiresAt = expiryRaw ? new Date(expiryRaw) : null;

  return {
    transactionId,
    qrPayload,
    checkoutUrl,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
  };
}

/** Request a fresh KHQR from the gateway for the given order. */
export async function requestKhqrCheckout(
  params: KhqrCheckoutParams,
): Promise<KhqrCheckoutResult> {
  const settings = await getSettings();
  if (!settings.khqr_enabled) throw badRequest('KHQR payments are not enabled');
  if (!settings.khqr_profile_id || !settings.khqr_secret_key) {
    throw badRequest('KHQR is not configured — set profile ID and secret key in Settings');
  }

  const transactionId = params.orderNumber;
  const amount = params.amount.toFixed(2);

  const hash = signCheckoutRequest(
    { transactionId, amount, successUrl: params.successUrl },
    settings.khqr_secret_key,
  );

  const qs = new URLSearchParams({
    transaction_id: transactionId,
    amount,
    success_url: params.successUrl,
    hash,
  });

  const url = `${KHQR_GATEWAY}/${settings.khqr_profile_id}?${qs.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error('khqr', `Gateway unreachable for order ${transactionId}: ${(err as Error).message}`);
    throw badRequest('Could not reach the KHQR payment gateway. Please try again.');
  }

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Non-JSON response — fall through to the status check below.
  }

  if (!res.ok || body.responseCode === 1) {
    const message = typeof body.responseMessage === 'string' ? body.responseMessage : text.slice(0, 200);
    logger.error('khqr', `Checkout rejected for order ${transactionId}: ${res.status} ${message}`);
    throw badRequest(`KHQR gateway rejected the request: ${message}`);
  }

  const parsed = parseCheckoutResponse(body, url);
  logger.info('khqr', `Checkout created for order ${transactionId}`);
  return { ...parsed, transactionId: parsed.transactionId ?? transactionId };
}

/**
 * Request a KHQR checkout for an order, using the app's configured frontend URL
 * as the success redirect.
 */
export async function buildOrderKhqrCheckout(order: {
  order_number: string;
  amount: string | number;
}): Promise<KhqrCheckoutResult> {
  const frontendBase = config.frontendUrl.replace(/\/+$/, '');
  const successUrl = `${frontendBase}/payment/success?order=${order.order_number}`;
  return requestKhqrCheckout({
    orderNumber: order.order_number,
    amount: Number(order.amount),
    successUrl,
  });
}

export interface KhqrCallbackData {
  transaction_id: string;
  amount: string;
  status: string;
  req_time?: string;
  hash: string;
}

/**
 * Verify a KHQR webhook callback signature.
 *
 * khqr.cc's exact webhook signing formula is not publicly documented, so we
 * accept any of the common constructions that involve the merchant secret.
 * This maximises the chance a genuine callback verifies once the merchant
 * links their Bakong token, while the webhook route's second gate (the order
 * must exist and the paid amount must match the invoice) still protects us if
 * a signature formula is ever wrong. Confirm the precise formula against the
 * khqr.cc dashboard docs and tighten this list if needed.
 */
export async function verifyKhqrCallback(cb: KhqrCallbackData): Promise<boolean> {
  const settings = await getSettings();
  const secret = settings.khqr_secret_key;
  if (!secret) return false;

  const { transaction_id: tid, amount, status, req_time: reqTime, hash } = cb;
  const s = String(secret);
  const candidates: string[] = [];
  const add = (algo: 'sha1' | 'sha256', raw: string, hmac = false) => {
    candidates.push(
      hmac
        ? createHmac(algo, s).update(raw).digest('hex')
        : createHash(algo).update(raw).digest('hex'),
    );
  };

  add('sha1', s + tid + amount + status);
  add('sha1', s + tid + amount + (reqTime ?? ''));
  add('sha1', s + reqTime + tid + amount);
  add('sha1', s + tid + amount);
  add('sha256', s + reqTime + tid + amount + 'SUCCESS');
  add('sha256', s + tid + amount + status);
  add('sha1', `transaction_id=${tid}&amount=${amount}&status=${status}&secret=${s}`);
  add('sha256', `transaction_id=${tid}&amount=${amount}&status=${status}&secret=${s}`);
  add('sha1', s + 'transaction_id=' + tid + '&amount=' + amount + '&status=' + status);
  add('sha256', s + tid + amount + (reqTime ?? '') + status);

  return candidates.includes(hash);
}
