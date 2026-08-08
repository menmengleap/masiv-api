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

export function paymentKeyboard(orderId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ I have paid — submit TX hash', `paid:${orderId}`)],
    [Markup.button.callback('❌ Cancel order', `cancel:${orderId}`)],
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
