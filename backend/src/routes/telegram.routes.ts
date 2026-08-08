import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { audit } from '../services/audit.service.js';
import { getTelegramStats } from '../services/stats.service.js';
import { botController } from '../bot/controller.js';
import { restartExpiryWorker, getWorkerStatus } from '../worker/expiry.worker.js';

export const telegramRouter = Router();

// Bot connection + telemetry for the "Telegram Bot" admin page.
telegramRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const [info, stats] = await Promise.all([botController.getInfo(), getTelegramStats()]);
    res.json({
      ...info,
      stats: { ...stats, messages_today: botController.getMessagesToday() },
      worker: getWorkerStatus(),
    });
  }),
);

// Verify the bot token / connection.
telegramRouter.post(
  '/test',
  asyncHandler(async (req, res) => {
    const result = await botController.test();
    await audit({ adminId: req.admin!.id, action: 'bot.test', metadata: { ok: result.ok } });
    res.json(result);
  }),
);

// "Sync Packages": the bot always reads packages live from the DB, so this is a
// no-op refresh that simply confirms the current catalogue + logs the event.
telegramRouter.post(
  '/sync-packages',
  asyncHandler(async (req, res) => {
    const result = await botController.syncPackages();
    await audit({ adminId: req.admin!.id, action: 'bot.sync_packages', metadata: result });
    res.json(result);
  }),
);

// Restart the background expiry worker from the bot control page.
telegramRouter.post(
  '/restart-worker',
  asyncHandler(async (req, res) => {
    restartExpiryWorker();
    await audit({ adminId: req.admin!.id, action: 'worker.restart', metadata: { from: 'telegram_page' } });
    res.json({ ok: true, worker: getWorkerStatus() });
  }),
);
