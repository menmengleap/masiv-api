import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config/index.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { BotContext, SessionState } from './context.js';
import { botController } from './controller.js';
import {
  backHomeKeyboard,
  deliveryKeyboard,
  mainMenuKeyboard,
  myPackagesKeyboard,
  packageDetailKeyboard,
  packagesKeyboard,
  paymentKeyboard,
} from './keyboards.js';
import { deliveryMessage, esc, myTokenLine, packageDetail, paymentInstructions } from './messages.js';
import { getSettings } from '../services/settings.service.js';
import { getPolicies } from '../services/policy.service.js';
import { createOrderForPackage } from '../services/order.service.js';
import {
  ensureCustomer,
  getDeliveryInfo,
  getMyTokens,
  getStorePackage,
  getStorePackages,
  revealMyKey,
  submitTransactionHash,
  trackTelegramUser,
} from '../services/storefront.service.js';

let bot: Telegraf<BotContext> | null = null;

// ── Simple in-memory session + rate limiter ────────────────────
const sessions = new Map<number, SessionState>();
const lastAction = new Map<number, number[]>(); // uid -> recent action timestamps
const RATE_WINDOW_MS = 3000;
const RATE_MAX = 6;

function getSession(uid: number): SessionState {
  let s = sessions.get(uid);
  if (!s) {
    s = {};
    sessions.set(uid, s);
  }
  return s;
}

function rateLimited(uid: number): boolean {
  const now = Date.now();
  const arr = (lastAction.get(uid) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  lastAction.set(uid, arr);
  return arr.length > RATE_MAX;
}

// ── Reply helpers ──────────────────────────────────────────────
async function safeEditOrReply(ctx: BotContext, text: string, extra: object) {
  try {
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      await ctx.editMessageText(text, extra as never);
      return;
    }
  } catch {
    // fall through to reply (e.g. message too old / identical content)
  }
  await ctx.reply(text, extra as never);
}

function tgUser(ctx: BotContext) {
  const u = ctx.from!;
  return {
    id: u.id,
    username: u.username,
    first_name: u.first_name,
    last_name: u.last_name,
    language_code: u.language_code,
  };
}

// ── Handlers ───────────────────────────────────────────────────
async function showHome(ctx: BotContext, edit = false) {
  const settings = await getSettings();
  const text = settings.welcome_message?.trim() || `Welcome to ${settings.bot_name}`;
  const kb = mainMenuKeyboard({ docsUrl: settings.documentation_url });
  // Welcome text is admin-authored plain text → send without markdown parsing.
  if (edit) await safeEditOrReply(ctx, text, kb);
  else await ctx.reply(text, kb);
}

async function showPackages(ctx: BotContext) {
  const pkgs = await getStorePackages();
  if (pkgs.length === 0) {
    await safeEditOrReply(ctx, '📦 No packages are available right now. Please check back soon.', backHomeKeyboard());
    return;
  }
  const header = '🛒 API PACKAGES\n\nChoose a package:';
  await safeEditOrReply(ctx, header, packagesKeyboard(pkgs));
}

async function showPackageDetail(ctx: BotContext, id: string) {
  const [pkg, settings] = await Promise.all([getStorePackage(id), getSettings()]);
  await safeEditOrReply(ctx, packageDetail(pkg, settings), {
    parse_mode: 'MarkdownV2',
    ...packageDetailKeyboard(pkg),
  });
}

async function startPurchase(ctx: BotContext, packageId: string) {
  const u = tgUser(ctx);
  const customerId = await ensureCustomer(u);
  const settings = await getSettings();

  const { order, payment, package: pkg } = await createOrderForPackage(customerId, packageId);

  const text = paymentInstructions({
    orderNumber: order.order_number,
    amount: Number(payment.amount).toFixed(2),
    currency: payment.currency,
    wallet: payment.wallet_address,
    network: payment.network,
    timeoutMinutes: settings.payment_timeout_minutes,
  });
  logger.info('bot', `Order ${order.order_number} started by @${u.username ?? u.id} for ${pkg.name}`);
  await safeEditOrReply(ctx, text, { parse_mode: 'MarkdownV2', ...paymentKeyboard(order.id) });
}

async function showMyPackages(ctx: BotContext) {
  const tokens = await getMyTokens(ctx.from!.id);
  if (tokens.length === 0) {
    await safeEditOrReply(ctx, '📊 You have no API packages yet.\n\nTap “Buy API” to get started.', backHomeKeyboard());
    return;
  }
  const body = tokens.map(myTokenLine).join('\n\n');
  await safeEditOrReply(ctx, `📊 *YOUR PACKAGES*\n\n${body}`, {
    parse_mode: 'MarkdownV2',
    ...myPackagesKeyboard(tokens),
  });
}

async function showPolicy(ctx: BotContext, kind: 'terms' | 'privacy' | 'service') {
  const policies = await getPolicies();
  const map = {
    terms: policies.terms_of_service,
    privacy: policies.privacy_policy,
    service: policies.service_policy,
  } as const;
  const title = { terms: '📄 Terms of Service', privacy: '🛡 Privacy Policy', service: '⚙️ Service Policy' }[kind];
  const text = `${title}\n\n${map[kind] || 'Not available yet.'}`;
  await safeEditOrReply(ctx, text, backHomeKeyboard());
}

async function showSupport(ctx: BotContext) {
  const settings = await getSettings();
  const support = settings.support_username
    ? `Contact us: ${settings.support_username}`
    : 'Support contact has not been configured yet.';
  await safeEditOrReply(ctx, `💬 SUPPORT\n\n${support}`, backHomeKeyboard());
}

async function showDocs(ctx: BotContext) {
  const settings = await getSettings();
  const text = settings.documentation_url
    ? `📖 API Documentation:\n${settings.documentation_url}`
    : '📖 Documentation is not available yet.';
  await safeEditOrReply(ctx, text, backHomeKeyboard());
}

async function revealKeyToOwner(ctx: BotContext, tokenId: string) {
  try {
    const key = await revealMyKey(tokenId, ctx.from!.id);
    // Send as a separate, plain (monospace) message so it's easy to copy.
    await ctx.reply(`🔑 Your API Key:\n\`${esc(key)}\`\n\n⚠️ Keep it secret.`, { parse_mode: 'MarkdownV2' });
    await ctx.answerCbQuery('Key revealed');
  } catch (err) {
    await ctx.answerCbQuery(err instanceof AppError ? err.message : 'Unable to reveal key', { show_alert: true });
  }
}

async function showUsage(ctx: BotContext, tokenId: string) {
  const tokens = await getMyTokens(ctx.from!.id);
  const t = tokens.find((x) => x.id === tokenId);
  if (!t) {
    await ctx.answerCbQuery('Not found', { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();
  await safeEditOrReply(ctx, `📊 *USAGE*\n\n${myTokenLine(t)}`, {
    parse_mode: 'MarkdownV2',
    ...backHomeKeyboard(),
  });
}

// ── Bot wiring ─────────────────────────────────────────────────
export function buildBot(): Telegraf<BotContext> | null {
  if (!config.telegramBotToken) {
    logger.warn('bot', 'TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
    return null;
  }

  const b = new Telegraf<BotContext>(config.telegramBotToken);

  // Session + rate-limit + telemetry middleware.
  b.use(async (ctx, next) => {
    if (ctx.from) {
      ctx.session = getSession(ctx.from.id);
      botController.countMessage();
      if (rateLimited(ctx.from.id)) {
        if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ Slow down a moment…', { show_alert: false });
        return;
      }
    }
    await next();
  });

  b.start(async (ctx) => {
    await trackTelegramUser(tgUser(ctx));
    await ensureCustomer(tgUser(ctx));
    logger.info('bot', `/start from @${ctx.from.username ?? ctx.from.id}`);
    await showHome(ctx);
  });

  b.command('packages', showPackages);
  b.command('mypackages', showMyPackages);
  b.command('support', showSupport);

  // Menu callbacks
  b.action('menu:home', async (ctx) => {
    await ctx.answerCbQuery();
    await showHome(ctx, true);
  });
  b.action(['menu:buy', 'menu:packages'], async (ctx) => {
    await ctx.answerCbQuery();
    await showPackages(ctx);
  });
  b.action('menu:mypackages', async (ctx) => {
    await ctx.answerCbQuery();
    await showMyPackages(ctx);
  });
  b.action('menu:docs', async (ctx) => {
    await ctx.answerCbQuery();
    await showDocs(ctx);
  });
  b.action('menu:support', async (ctx) => {
    await ctx.answerCbQuery();
    await showSupport(ctx);
  });
  b.action('menu:terms', async (ctx) => {
    await ctx.answerCbQuery();
    await showPolicy(ctx, 'terms');
  });
  b.action('menu:privacy', async (ctx) => {
    await ctx.answerCbQuery();
    await showPolicy(ctx, 'privacy');
  });
  b.action('menu:service', async (ctx) => {
    await ctx.answerCbQuery();
    await showPolicy(ctx, 'service');
  });

  // Package detail
  b.action(/^pkg:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await showPackageDetail(ctx, ctx.match[1]);
  });

  // Buy → create order
  b.action(/^buy:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery('Reserving your API…');
      await startPurchase(ctx, ctx.match[1]);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Could not start purchase';
      await safeEditOrReply(ctx, `⚠️ ${msg}`, backHomeKeyboard());
    }
  });

  // "I have paid" → ask for TX hash
  b.action(/^paid:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.awaitingTxHashForOrder = ctx.match[1];
    await ctx.reply(
      '🧾 Please send your *transaction hash* now as a message.\n\n' +
        'Your order will be verified and your API delivered automatically once payment is confirmed.',
      { parse_mode: 'MarkdownV2' },
    );
  });

  // Cancel order
  b.action(/^cancel:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { cancelOrder } = await import('../services/order.service.js');
      await cancelOrder(ctx.match[1]);
      ctx.session.awaitingTxHashForOrder = undefined;
      await safeEditOrReply(ctx, '❌ Your order was cancelled and the reserved API released.', backHomeKeyboard());
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Could not cancel order';
      await safeEditOrReply(ctx, `⚠️ ${msg}`, backHomeKeyboard());
    }
  });

  // Reveal / usage
  b.action(/^reveal:(.+)$/, async (ctx) => revealKeyToOwner(ctx, ctx.match[1]));
  b.action(/^usage:(.+)$/, async (ctx) => showUsage(ctx, ctx.match[1]));

  // Text messages — used to capture the TX hash.
  b.on(message('text'), async (ctx) => {
    const orderId = ctx.session.awaitingTxHashForOrder;
    const text = ctx.message.text.trim();
    if (!orderId) {
      await showHome(ctx);
      return;
    }
    if (text.length < 6) {
      await ctx.reply('That does not look like a valid transaction hash. Please try again.');
      return;
    }
    try {
      await submitTransactionHash(orderId, ctx.from.id, text);
      ctx.session.awaitingTxHashForOrder = undefined;
      logger.info('bot', `TX hash submitted for order by @${ctx.from.username ?? ctx.from.id}`);
      await ctx.reply(
        '✅ Thank you! Your payment is being verified.\n\n' +
          'You will receive your API credentials here automatically once it is confirmed.',
        backHomeKeyboard(),
      );
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Could not record your transaction';
      await ctx.reply(`⚠️ ${msg}`);
    }
  });

  b.catch((err, ctx) => {
    logger.error('bot', `Handler error on update ${ctx.updateType}: ${(err as Error).message}`);
  });

  bot = b;
  return b;
}

/**
 * Push the delivery message to the customer for a completed order.
 * Called after an admin confirms payment. Fire-and-forget; never throws.
 */
export async function sendOrderDelivery(orderId: string): Promise<void> {
  if (!bot) return;
  try {
    const info = await getDeliveryInfo(orderId);
    if (!info || !info.customer_tg) return;
    const settings = await getSettings();
    const text = deliveryMessage({
      packageName: info.package_name,
      validDays: info.valid_days,
      expiresAt: info.expires_at,
      baseUrl: info.base_url,
      maskedKey: info.masked_key,
    });
    await bot.telegram.sendMessage(info.customer_tg, text, {
      parse_mode: 'MarkdownV2',
      ...deliveryKeyboard(info.token_id, settings.documentation_url),
    });
    logger.info('bot', `Delivered credentials for order ${info.order_number}`);
  } catch (err) {
    logger.error('bot', `Delivery failed for order ${orderId}: ${(err as Error).message}`);
  }
}

export async function startBot(): Promise<void> {
  const b = buildBot();
  if (!b) return;
  try {
    const me = await b.telegram.getMe();
    botController.register(b, me.username ?? 'unknown');
    // Launch in the background (long polling). Do not await — launch() resolves
    // only when the bot stops.
    void b.launch(() => {
      logger.info('bot', `Bot @${me.username} started (long polling)`);
    });
  } catch (err) {
    logger.error('bot', `Failed to start bot: ${(err as Error).message}`);
    botController.markDisconnected();
  }
}

export function stopBot(reason: string): void {
  if (bot) {
    bot.stop(reason);
    botController.markDisconnected();
  }
}
