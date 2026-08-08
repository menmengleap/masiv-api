import { config } from './config/index.js';
import { createApp } from './app.js';
import { closePool, pool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { startBot, stopBot } from './bot/index.js';
import { startExpiryWorker, stopExpiryWorker } from './worker/expiry.worker.js';

async function main() {
  // Fail fast if the DB is unreachable.
  try {
    await pool.query('SELECT 1');
    logger.info('system', 'Database connection OK');
  } catch (err) {
    logger.error('system', `Cannot connect to database: ${(err as Error).message}`);
    logger.error('system', 'Did you run `npm run migrate` and is PostgreSQL running?');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info('api', `Masiv API listening on http://localhost:${config.port}`);
  });

  // Background workers + bot.
  startExpiryWorker();
  await startBot();

  const shutdown = (signal: string) => {
    logger.info('system', `Received ${signal} — shutting down…`);
    stopExpiryWorker();
    stopBot(signal);
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
    // Hard exit if graceful shutdown stalls.
    setTimeout(() => process.exit(0), 8000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('system', `Fatal startup error: ${(err as Error).message}`);
  process.exit(1);
});
