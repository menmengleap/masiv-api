import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import type { StorePackage } from '../services/storefront.service.js';
import { formatTokensShort } from '../lib/tokens.js';

type Btn = InlineKeyboardButton;

/** Main menu shown after /start. */
export function mainMenuKeyboard(opts: { docsUrl?: string | null } = {}) {
  const rows: Btn[][] = [
    [Markup.button.callback('🛒 Buy API', 'menu:buy'), Markup.button.callback('📦 Packages', 'menu:packages')],
    [Markup.button.callback('📊 My Packages', 'menu:mypackages')],
    opts.docsUrl
      ? [Markup.button.url('📖 Documentation', opts.docsUrl)]
      : [Markup.button.callback('📖 Documentation', 'menu:docs')],
    [
      Markup.button.callback('📄 Terms', 'menu:terms'),
      Markup.button.callback('🛡 Privacy', 'menu:privacy'),
      Markup.button.callback('⚙️ Service', 'menu:service'),
    ],
    [Markup.button.callback('💬 Support', 'menu:support')],
  ];
  return Markup.inlineKeyboard(rows);
}

/** Dynamic package list — one button per active, in-stock package. */
export function packagesKeyboard(packages: StorePackage[]) {
  const rows: Btn[][] = packages.map((p) => {
    const inStock = p.stock_available > 0;
    const label = `🟠 ${p.name} — $${Number(p.price).toFixed(2)}` + (inStock ? '' : ' (out of stock)');
    return [Markup.button.callback(label, `pkg:${p.id}`)];
  });
  rows.push([Markup.button.callback('⬅️ Back', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}

export function packageDetailKeyboard(pkg: StorePackage) {
  const rows: Btn[][] = [];
  if (pkg.stock_available > 0) {
    rows.push([Markup.button.callback(`🛒 Buy Now — $${Number(pkg.price).toFixed(2)}`, `buy:${pkg.id}`)]);
  }
  rows.push([Markup.button.callback('⬅️ Packages', 'menu:packages')]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Turn an admin-configured support handle into a tappable t.me link.
 * Accepts "@masiv", "masiv", or a full https://t.me/… URL. Returns null when
 * the value isn't something we can safely build a URL from, so the caller can
 * fall back to plain text instead of rendering a broken button.
 */
export function supportUrl(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const raw = handle.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const username = raw.replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(username) ? `https://t.me/${username}` : null;
}

/**
 * Payment method chooser shown after "Buy Now".
 * Each method is gated on its own switch in Settings, so an admin can run
 * KHQR-only, crypto-only, or both.
 */
export function paymentMethodKeyboard(
  packageId: string,
  opts: { khqrEnabled: boolean; usdtEnabled: boolean },
) {
  const rows: Btn[][] = [];
  if (opts.khqrEnabled) {
    rows.push([Markup.button.callback('🇰🇭 Pay with KHQR', `paykhqr:${packageId}`)]);
  }
  if (opts.usdtEnabled) {
    rows.push([Markup.button.callback('💵 Pay with USDT (Crypto)', `payusdt:${packageId}`)]);
  }
  rows.push([Markup.button.callback('⬅️ Back', `pkg:${packageId}`)]);
  return Markup.inlineKeyboard(rows);
}

/** Crypto handoff: give the customer a one-tap way to reach Support. */
export function usdtSupportKeyboard(packageId: string, supportHandle: string | null) {
  const rows: Btn[][] = [];
  const url = supportUrl(supportHandle);
  if (url) rows.push([Markup.button.url('💬 Contact Support', url)]);
  rows.push([Markup.button.callback('⬅️ Back', `buy:${packageId}`)]);
  rows.push([Markup.button.callback('🏠 Home', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}

/** Actions attached to the KHQR QR message. */
export function khqrPaymentKeyboard(orderId: string, checkoutUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('🌐 Open in browser', checkoutUrl)],
    [Markup.button.callback('❌ Cancel order', `cancel:${orderId}`)],
    [Markup.button.callback('🏠 Home', 'menu:home')],
  ]);
}

export function deliveryKeyboard(tokenId: string, docsUrl?: string | null) {
  const rows: Btn[][] = [
    [Markup.button.callback('👁 View API Key', `reveal:${tokenId}`)],
    [Markup.button.callback('📊 Usage', `usage:${tokenId}`)],
  ];
  if (docsUrl) rows.push([Markup.button.url('📖 API Docs', docsUrl)]);
  rows.push([Markup.button.callback('🏠 Home', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}

export function myPackagesKeyboard(tokens: Array<{ id: string; total_tokens: string }>) {
  const rows: Btn[][] = tokens.map((t) => [
    Markup.button.callback(`👁 View ${formatTokensShort(t.total_tokens)} key`, `reveal:${t.id}`),
  ]);
  rows.push([Markup.button.callback('🏠 Home', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}

export function backHomeKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🏠 Home', 'menu:home')]]);
}

/** Support screen — adds a tappable contact button when a handle is configured. */
export function supportMenuKeyboard(supportHandle: string | null) {
  const rows: Btn[][] = [];
  const url = supportUrl(supportHandle);
  if (url) rows.push([Markup.button.url('💬 Contact Support', url)]);
  rows.push([Markup.button.callback('🏠 Home', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}
