import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { confirmPaymentSchema, idParamSchema } from '../schemas.js';
import { audit } from '../services/audit.service.js';
import {
  cancelOrder,
  confirmPayment,
  getOrder,
  listOrders,
  listPayments,
} from '../services/order.service.js';
import { manualAdminVerifier } from '../services/payment.service.js';
import { sendOrderDelivery } from '../bot/index.js';
import type { OrderStatus, PaymentStatus } from '../types.js';

export const orderRouter = Router();

orderRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    res.json(
      await listOrders({
        status: q.status as OrderStatus | undefined,
        customerId: q.customer_id,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      }),
    );
  }),
);

orderRouter.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await getOrder(req.params.id));
  }),
);

/**
 * Admin manually confirms a payment (server-side verification path).
 * Activates the reserved token and completes the order in one transaction.
 */
orderRouter.post(
  '/:id/confirm-payment',
  validate(idParamSchema, 'params'),
  validate(confirmPaymentSchema),
  asyncHandler(async (req, res) => {
    const result = await confirmPayment(req.params.id, {
      transactionHash: req.body.transaction_hash ?? null,
      verify: manualAdminVerifier,
      confirmedByAdminId: req.admin!.id,
    });
    await audit({
      adminId: req.admin!.id,
      action: 'order.confirm_payment',
      entityType: 'order',
      entityId: req.params.id,
      metadata: { order_number: result.order.order_number, tx: req.body.transaction_hash ?? null },
    });
    // Deliver credentials to the customer over Telegram (fire-and-forget).
    void sendOrderDelivery(req.params.id);
    res.json(result);
  }),
);

orderRouter.post(
  '/:id/cancel',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const order = await cancelOrder(req.params.id);
    await audit({ adminId: req.admin!.id, action: 'order.cancel', entityType: 'order', entityId: req.params.id });
    res.json(order);
  }),
);

// Payments list lives under its own path but is served from the same module.
export const paymentRouter = Router();

paymentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    res.json(
      await listPayments({
        status: q.status as PaymentStatus | undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      }),
    );
  }),
);
