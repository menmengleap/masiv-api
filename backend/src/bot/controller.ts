import type { Telegraf } from 'telegraf';
import { logger } from '../lib/logger.js';
import { getStorePackages } from '../services/storefront.service.js';
import type { BotContext } from './context.js';

/**
 * Singleton that holds the live bot handle + lightweight runtime telemetry, and
 * exposes control operations for the admin "Telegram Bot" page (test, sync,
 * status, message counter). The bot process registers itself here at startup.
 */
class BotController {
  private bot: Telegraf<BotContext> | null = null;
  private botUsername: string | null = null;
  private connected = false;
  private messageCount = 0;
  private messageCountDay = new Date().toISOString().slice(0, 10);

  register(bot: Telegraf<BotContext>, username: string): void {
    this.bot = bot;
    this.botUsername = username;
    this.connected = true;
  }

  markDisconnected(): void {
    this.connected = false;
  }

  get instance(): Telegraf<BotContext> | null {
    return this.bot;
  }

  countMessage(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.messageCountDay) {
      this.messageCountDay = today;
      this.messageCount = 0;
    }
    this.messageCount++;
  }

  getMessagesToday(): number {
    const today = new Date().toISOString().slice(0, 10);
    return today === this.messageCountDay ? this.messageCount : 0;
  }

  async getInfo(): Promise<{
    connected: boolean;
    configured: boolean;
    bot_username: string | null;
    status: string;
  }> {
    return {
      connected: this.connected,
      configured: this.bot !== null,
      bot_username: this.botUsername,
      status: this.connected ? 'Connected' : this.bot ? 'Disconnected' : 'Not configured',
    };
  }

  async test(): Promise<{ ok: boolean; bot_username?: string; message: string }> {
    if (!this.bot) return { ok: false, message: 'Bot token not configured' };
    try {
      const me = await this.bot.telegram.getMe();
      this.botUsername = me.username ?? null;
      this.connected = true;
      logger.info('bot', `Test OK — @${me.username}`);
      return { ok: true, bot_username: me.username, message: `Connected as @${me.username}` };
    } catch (err) {
      this.connected = false;
      const message = (err as Error).message;
      logger.error('bot', `Test failed: ${message}`);
      return { ok: false, message };
    }
  }

  /**
   * The bot reads packages live from the DB on every request, so there's no
   * cached menu to rebuild. This confirms the current catalogue and logs it,
   * which is what the admin "Sync Packages" button expects to see.
   */
  async syncPackages(): Promise<{ ok: boolean; packages: number; names: string[] }> {
    const pkgs = await getStorePackages();
    logger.info('bot', `Package sync — ${pkgs.length} active package(s) live`);
    for (const p of pkgs) {
      logger.info('bot', `Package available: ${p.name} (stock ${p.stock_available})`);
    }
    logger.info('bot', 'Telegram menu is served live from DB — no redeploy needed');
    return { ok: true, packages: pkgs.length, names: pkgs.map((p) => p.name) };
  }
}

export const botController = new BotController();
