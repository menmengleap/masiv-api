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
  khqrPaymentKeyboard,
  mainMenuKeyboard,
  myPackagesKeyboard,
  packageDetailKeyboard,
  packagesKeyboard,
  paymentMethodKeyboard,
  supportMenuKeyboard,
  usdtSupportKeyboard,
} from './keyboards.js';
import {
  deliveryMessage,
  esc,
  khqrInstructions,
  myTokenLine,
  noPaymentMethodsMessage,
  orderExpiredMessage,
  packageDetail,
  paymentMethodPrompt,
  usdtSupportMessage,
} from './messages.js';
import { getSettings } from '../services/settings.service.js';
import { getPolicies } from '../services/policy.service.js';
import { createOrderForPackage } from '../services/order.service.js';
import { buildOrderKhqrCheckout } from '../services/khqr.service.js';
import { qrPngBuffer } from '../lib/qr.js';
import {
  ensureCustomer,
  getDeliveryInfo,
  getMyTokens,
  getOrderNotifyInfo,
  getStorePackage,
  getStorePackages,
  revealMyKey,
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

/**
 * Which payment methods are currently on offer.
 *
 * KHQR only counts as available when it is both switched on AND actually
 * configured — otherwise the customer taps the button, we reserve stock, and
 * the checkout call fails.
 */
function availableMethods(settings: {
  khqr_enabled: boolean;
  khqr_profile_id: string | null;
  khqr_secret_key: string | null;
  usdt_enabled: boolean;
}) {
  return {
    khqr: Boolean(settings.khqr_enabled && settings.khqr_profile_id && settings.khqr_secret_key),
    usdt: Boolean(settings.usdt_enabled),
  };
}

/** Step 1: after "Buy Now", ask the customer how they want to pay. */
async function showPaymentMethods(ctx: BotContext, packageId: string) {
  const [pkg, settings] = await Promise.all([getStorePackage(packageId), getSettings()]);
  if (pkg.stock_available <= 0) {
    await safeEditOrReply(ctx, '⛔ This package just went out of stock. Please pick another.', backHomeKeyboard());
    return;
  }

  const available = availableMethods(settings);
  if (!available.khqr && !available.usdt) {
    await safeEditOrReply(ctx, noPaymentMethodsMessage(settings.support_username), backHomeKeyboard());
    return;
  }

  await safeEditOrReply(ctx, paymentMethodPrompt(pkg, settings, available), {
    parse_mode: 'MarkdownV2',
    ...paymentMethodKeyboard(packageId, { khqrEnabled: available.khqr, usdtEnabled: available.usdt }),
  });
}

/** Step 2a: KHQR — reserve stock, create the order, and send a QR with a deadline. */
async function startKhqrPurchase(ctx: BotContext, packageId: string) {
  const u = tgUser(ctx);
  const settings = await getSettings();
  if (!availableMethods(settings).khqr) {
    await safeEditOrReply(ctx, '⚠️ KHQR payments are currently unavailable.', backHomeKeyboard());
    return;
  }

  const customerId = await ensureCustomer(u);
  const { order, payment, package: pkg } = await createOrderForPackage(customerId, packageId, 'khqr');

  try {
    const checkout = await buildOrderKhqrCheckout(order);
    const png = await qrPngBuffer(checkout.qrPayload);
    const caption = khqrInstructions({
      orderNumber: order.order_number,
      amount: Number(payment.amount).toFixed(2),
      currency: payment.currency,
      // The invoice deadline is the source of truth for the QR's lifetime —
      // the expiry worker cancels the order at exactly this moment.
      expiresAt: payment.expires_at ? new Date(payment.expires_at) : new Date(),
      timeoutMinutes: settings.payment_timeout_minutes,
    });
    await ctx.replyWithPhoto(
      { source: png },
      { caption, parse_mode: 'MarkdownV2', ...khqrPaymentKeyboard(order.id, checkout.checkoutUrl) },
    );
    logger.info('bot', `KHQR order ${order.order_number} started by @${u.username ?? u.id} for ${pkg.name}`);
  } catch (err) {
    // Building the QR failed (e.g. KHQR not configured) — release the reservation
    // so we don't strand stock, then surface the reason.
    const { cancelOrder } = await import('../services/order.service.js');
    await cancelOrder(order.id).catch(() => undefined);
    throw err;
  }
}

/**
 * Step 2b: USDT/crypto — handled manually, so we hand the customer to Support
 * rather than reserving stock against a payment we can't verify automatically.
 */
async function showUsdtSupport(ctx: BotContext, packageId: string) {
  const [pkg, settings] = await Promise.all([getStorePackage(packageId), getSettings()]);
  if (!settings.usdt_enabled) {
    await safeEditOrReply(ctx, '⚠️ Crypto payments are currently unavailable.', backHomeKeyboard());
    return;
  }

  const rate = Number(settings.usd_to_usdt) || 1;
  await safeEditOrReply(
    ctx,
    usdtSupportMessage({
      supportUsername: settings.support_username,
      packageName: pkg.name,
      amount: (Number(pkg.price) * rate).toFixed(2),
      currency: settings.payment_currency,
      network: settings.payment_network,
    }),
    usdtSupportKeyboard(packageId, settings.support_username),
  );
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
  await safeEditOrReply(ctx, `💬 SUPPORT\n\n${support}`, supportMenuKeyboard(settings.support_username));
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

  // Buy → choose a payment method
  b.action(/^buy:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await showPaymentMethods(ctx, ctx.match[1]);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Could not start purchase';
      await safeEditOrReply(ctx, `⚠️ ${msg}`, backHomeKeyboard());
    }
  });

  // Pay with KHQR → reserve stock + send QR
  b.action(/^paykhqr:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery('Generating your KHQR…');
      await startKhqrPurchase(ctx, ctx.match[1]);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Could not start KHQR payment';
      await safeEditOrReply(ctx, `⚠️ ${msg}`, backHomeKeyboard());
    }
  });

  // Pay with USDT/crypto → route to Support (no reservation)
  b.action(/^payusdt:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await showUsdtSupport(ctx, ctx.match[1]);
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Could not load support details';
      await safeEditOrReply(ctx, `⚠️ ${msg}`, backHomeKeyboard());
    }
  });

  // Cancel order
  b.action(/^cancel:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { cancelOrder } = await import('../services/order.service.js');
      await cancelOrder(ctx.match[1]);
      await safeEditOrReply(ctx, '❌ Your order was cancelled and the reserved API released.', backHomeKeyboard());
    } catch (err) {
      const msg = err instanceof AppError ? err.message : 'Could not cancel order';
      await safeEditOrReply(ctx, `⚠️ ${msg}`, backHomeKeyboard());
    }
  });

  // Reveal / usage
  b.action(/^reveal:(.+)$/, async (ctx) => revealKeyToOwner(ctx, ctx.match[1]));
  b.action(/^usage:(.+)$/, async (ctx) => showUsage(ctx, ctx.match[1]));

  // Any stray text message just returns the customer to the home menu.
  b.on(message('text'), async (ctx) => {
    await showHome(ctx);
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

/**
 * Tell a customer their payment window elapsed and the reservation was
 * released. Called by the expiry worker. Fire-and-forget; never throws.
 */
export async function sendOrderExpired(orderId: string): Promise<void> {
  if (!bot) return;
  try {
    const info = await getOrderNotifyInfo(orderId);
    if (!info || !info.customer_tg) return;
    await bot.telegram.sendMessage(
      info.customer_tg,
      orderExpiredMessage({ orderNumber: info.order_number, packageName: info.package_name }),
      backHomeKeyboard(),
    );
    logger.info('bot', `Notified customer that order ${info.order_number} expired`);
  } catch (err) {
    logger.error('bot', `Expiry notice failed for order ${orderId}: ${(err as Error).message}`);
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
