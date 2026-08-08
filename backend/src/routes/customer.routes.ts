import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { listCustomers } from '../services/customer.service.js';
import { listOrders } from '../services/order.service.js';

export const customerRouter = Router();

customerRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    res.json(
      await listCustomers({
        search: q.search,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      }),
    );
  }),
);

// Orders for a specific customer.
customerRouter.get(
  '/:id/orders',
  asyncHandler(async (req, res) => {
    res.json(await listOrders({ customerId: req.params.id }));
  }),
);
