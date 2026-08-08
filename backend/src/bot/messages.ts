import { formatTokensFull, formatTokensShort } from '../lib/tokens.js';
import type { StorePackage } from '../services/storefront.service.js';
import type { BotSettingsRow } from '../types.js';

/** Escape user/DB-provided text for Telegram MarkdownV2. */
export function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (m) => `\\${m}`);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

/** Package details card shown before Buy Now. */
export function packageDetail(pkg: StorePackage, settings: BotSettingsRow): string {
  const rate = Number(settings.usd_to_usdt) || 1;
  const usdt = (Number(pkg.price) * rate).toFixed(2);
  const stockLine =
    pkg.stock_available > 0
      ? `✅ In stock: ${pkg.stock_available}`
      : '⛔ Currently out of stock';

  const lines = [
    `🟠 *${esc(pkg.name.toUpperCase())}*`,
    '',
    `Total Tokens: *${esc(formatTokensFull(pkg.total_tokens))}* \\(${esc(formatTokensShort(pkg.total_tokens))}\\)`,
    `Price: *$${esc(Number(pkg.price).toFixed(2))}* \\= *${esc(usdt)} ${esc(settings.payment_currency)}*`,
    `Validity: *${pkg.default_valid_days} Days*`,
    '',
    '✓ API Access',
    '✓ Base URL',
    '✓ API Key',
    '✓ Instant Delivery',
    '',
    stockLine,
  ];
  if (pkg.description) {
    lines.push('', esc(pkg.description));
  }
  return lines.join('\n');
}

/** Payment instructions after an order is created. */
export function paymentInstructions(params: {
  orderNumber: string;
  amount: string;
  currency: string;
  wallet: string | null;
  network: string | null;
  timeoutMinutes: number;
}): string {
  const walletLine = params.wallet
    ? `\`${esc(params.wallet)}\``
    : esc('⚠️ No wallet configured — please contact support');
  return [
    '💳 *PAYMENT*',
    '',
    `Order: \`${esc(params.orderNumber)}\``,
    `Amount: *${esc(params.amount)} ${esc(params.currency)}*`,
    params.network ? `Network: *${esc(params.network)}*` : '',
    '',
    '📤 Send the exact amount to:',
    walletLine,
    '',
    `⏳ This invoice expires in *${params.timeoutMinutes} minutes*\\.`,
    '',
    esc('After sending, tap “I have paid” and submit your transaction hash. '),
    esc('Your API is delivered automatically once payment is verified.'),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Successful delivery receipt. */
export function deliveryMessage(params: {
  packageName: string;
  validDays: number;
  expiresAt: string | null;
  baseUrl: string;
  maskedKey: string;
}): string {
  return [
    '✅ *PAYMENT SUCCESS*',
    '',
    'Your API is ready\\!',
    '',
    `📦 Package: *${esc(params.packageName)}*`,
    `📅 Validity: *${params.validDays} Days*`,
    `⏳ Expires: *${esc(fmtDate(params.expiresAt))}*`,
    '',
    '🔗 Base URL:',
    `\`${esc(params.baseUrl)}\``,
    '',
    '🔑 API Key:',
    `\`${esc(params.maskedKey)}\``,
    '',
    esc('Tap “View API Key” to reveal your full key.'),
  ].join('\n');
}

export function myTokenLine(t: {
  package_name: string | null;
  status: string;
  days_left: number | null;
  expires_at: string | null;
  masked_key: string;
}): string {
  const statusIcon =
    t.status === 'active' ? '🟢' : t.status === 'expiring' ? '🟡' : t.status === 'expired' ? '🔴' : '⚪';
  const daysLeft = t.days_left === null ? '' : ` • ${t.days_left}d left`;
  return [
    `${statusIcon} *${esc(t.package_name ?? 'API')}*${esc(daysLeft)}`,
    `🔑 \`${esc(t.masked_key)}\``,
    `⏳ Expires: ${esc(fmtDate(t.expires_at))}`,
  ].join('\n');
}
