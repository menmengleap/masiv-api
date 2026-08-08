import { Router } from 'express';
import { query } from '../db/pool.js';
import { asyncHandler } from '../middleware/error.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { buildOrderKhqrCheckout, verifyKhqrCallback } from '../services/khqr.service.js';
import { getOrder, confirmPayment } from '../services/order.service.js';
import { sendOrderDelivery } from '../bot/index.js';
import type { OrderRow } from '../types.js';

/**
 * Authenticated KHQR routes — mounted under /api/khqr.
 */
export const khqrRouter = Router();

/**
 * POST /api/khqr/checkout/:orderId
 *
 * Generate a KHQR checkout URL for a pending order. Returns the redirect URL
 * that the customer (or bot) should visit to pay.
 */
khqrRouter.post(
  '/checkout/:orderId',
  asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const order = await getOrder(orderId);
    if (order.status !== 'pending') {
      throw badRequest(`Order is "${order.status}" — only pending orders can be paid`);
    }

    const result = await buildOrderKhqrCheckout(order);

    res.json({
      checkout_url: result.checkoutUrl,
      qr_payload: result.qrPayload,
      transaction_id: result.transactionId,
      expires_at: result.expiresAt,
    });
  }),
);

// ── Public routes (no auth) ───────────────────────────────────────

/**
 * Public router for KHQR webhooks + success redirects.
 * Mounted at /webhooks/khqr in app.ts (outside /api).
 */
export const khqrWebhookRouter = Router();

/**
 * POST /webhooks/khqr
 *
 * KHQR sends a signed POST here after a successful payment.
 * We verify the hash, confirm the payment, and deliver the API key via Telegram.
 */
khqrWebhookRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { transaction_id, amount, status, req_time, hash } = req.body;

    if (!transaction_id || !status || !hash) {
      logger.warn('khqr', 'Webhook missing required fields');
      res.status(400).json({ error: 'Missing fields' });
      return;
    }

    logger.info('khqr', `Webhook received: order=${transaction_id} status=${status}`);

    // Only process SUCCESS payments.
    if (status !== 'SUCCESS') {
      logger.info('khqr', `Ignoring non-SUCCESS webhook: ${status}`);
      res.json({ ok: true, processed: false });
      return;
    }

    // Verify the callback hash.
    const valid = await verifyKhqrCallback({ transaction_id, amount, status, req_time, hash });
    if (!valid) {
      logger.warn('khqr', `Invalid webhook hash for order ${transaction_id}`);
      res.status(403).json({ error: 'Invalid hash' });
      return;
    }

    // Find the order by order_number.
    const { rows: orderRows } = await query<OrderRow>(
      "SELECT * FROM orders WHERE order_number = $1 AND status = 'pending'",
      [transaction_id],
    );
    const order = orderRows[0];
    if (!order) {
      logger.info('khqr', `Order ${transaction_id} not found or not pending — skipping`);
      res.json({ ok: true, processed: false });
      return;
    }

    // The signature proves the callback came from KHQR, not that it paid the
    // right amount. Compare against what we invoiced before releasing an API
    // key, so a valid callback for a smaller sum can't complete the order.
    const { rows: payRows } = await query<{ amount: string }>(
      "SELECT amount FROM payments WHERE order_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [order.id],
    );
    const expected = Number(payRows[0]?.amount ?? order.amount);
    const paid = Number(amount);
    if (!Number.isFinite(paid) || paid + 0.001 < expected) {
      logger.warn(
        'khqr',
        `Amount mismatch for ${transaction_id}: paid ${amount}, expected ${expected} — not confirming`,
      );
      res.status(400).json({ error: 'Amount mismatch' });
      return;
    }

    try {
      // Confirm the payment (activates token + completes order).
      await confirmPayment(order.id, {
        transactionHash: `khqr:${transaction_id}`,
        verify: () => true,
      });

      // Deliver API key to customer via Telegram.
      void sendOrderDelivery(order.id);

      logger.info('khqr', `Order ${transaction_id} confirmed via KHQR webhook`);
      res.json({ ok: true, processed: true });
    } catch (err) {
      logger.error('khqr', `Failed to confirm order ${transaction_id}: ${(err as Error).message}`);
      res.status(500).json({ error: 'Confirmation failed' });
    }
  }),
);
