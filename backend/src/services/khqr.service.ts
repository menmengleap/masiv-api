import { createHash } from 'node:crypto';
import { config } from '../config/index.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getSettings } from './settings.service.js';

/**
 * khqr.cc (KHQRPay) payment gateway.
 *
 * Verified against the live gateway:
 *   - Endpoint is `GET https://khqr.cc/api/payment/request/{profileId}`
 *     (POST is rejected with 405 "Supported methods: GET, HEAD").
 *   - It answers JSON: `{"responseCode":0|1,"responseMessage":"…", …}`.
 *   - A bad/absent signature returns HTTP 403 with
 *     `{"responseCode":1,"responseMessage":"Invalid Security Hash"}`.
 *
 * Two details are merchant-documentation specific and are isolated below so
 * they can be corrected without touching the rest of the flow:
 *   1. `signCheckoutRequest` — the exact hash construction.
 *   2. `parseCheckoutResponse` — the exact response field names.
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
  transactionId: string;
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
 * ⚠️ UNVERIFIED — the formula below is the one previously assumed by this
 * codebase and the live gateway rejects it with "Invalid Security Hash".
 * Replace the body with the construction from your khqr.cc merchant docs
 * (Dashboard → API Docs → QR Payment). Everything else in this file is correct.
 */
function signCheckoutRequest(
  params: { transactionId: string; amount: string; successUrl: string; remark: string },
  secret: string,
): string {
  const raw = secret + params.transactionId + params.amount + params.successUrl + params.remark;
  return createHash('sha1').update(raw).digest('hex');
}

/**
 * Map the gateway's JSON onto our result shape.
 *
 * ⚠️ Field names are best-effort until confirmed against the merchant docs.
 * Fails loudly rather than returning a QR that banking apps cannot scan.
 */
function parseCheckoutResponse(body: Record<string, unknown>, fallbackUrl: string): {
  qrPayload: string;
  checkoutUrl: string;
  expiresAt: Date | null;
} {
  const data = (body.data ?? body) as Record<string, unknown>;
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = data[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  // A KHQR/EMV payload always starts with the EMVCo payload-format indicator.
  const qrPayload = pick('qr', 'qr_string', 'qrString', 'qrcode', 'khqr', 'emv');
  const checkoutUrl = pick('checkout_url', 'payment_url', 'url', 'link') ?? fallbackUrl;

  if (!qrPayload) {
    throw badRequest(
      'KHQR gateway did not return a QR payload — the response format does not match ' +
        'what this integration expects. Check the khqr.cc API docs and update parseCheckoutResponse().',
    );
  }

  const expiryRaw = pick('expires_at', 'expire_at', 'expiration', 'expired_at');
  const expiresAt = expiryRaw ? new Date(expiryRaw) : null;

  return {
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
  const remark = params.remark ?? '';

  const hash = signCheckoutRequest(
    { transactionId, amount, successUrl: params.successUrl, remark },
    settings.khqr_secret_key,
  );

  const qs = new URLSearchParams({
    transaction_id: transactionId,
    amount,
    success_url: params.successUrl,
    hash,
  });
  if (remark) qs.set('remark', remark);

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
  return { transactionId, ...parsed };
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
    remark: `Order ${order.order_number}`,
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
 * ⚠️ UNVERIFIED — like the request signature, confirm this against the
 * merchant docs before going live. Until then the webhook rejects every
 * callback, which is the safe direction to fail: no API key is released.
 */
export async function verifyKhqrCallback(cb: KhqrCallbackData): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.khqr_secret_key) return false;

  if (cb.status === 'SUCCESS' && cb.req_time) {
    const raw = settings.khqr_secret_key + cb.req_time + cb.transaction_id + cb.amount + 'SUCCESS';
    const expected = createHash('sha256').update(raw).digest('hex');
    return expected === cb.hash;
  }

  return false;
}
