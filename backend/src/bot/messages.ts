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

/** "14:32 UTC" — a concrete deadline the customer can check against a clock. */
function fmtTimeUtc(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
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

/** Payment method chooser card shown after "Buy Now". */
export function paymentMethodPrompt(
  pkg: StorePackage,
  settings: BotSettingsRow,
  available: { khqr: boolean; usdt: boolean },
): string {
  const rate = Number(settings.usd_to_usdt) || 1;
  const amount = (Number(pkg.price) * rate).toFixed(2);
  const lines = [
    '💳 *CHOOSE PAYMENT METHOD*',
    '',
    `Package: *${esc(pkg.name.toUpperCase())}*`,
    `Amount: *${esc(amount)} ${esc(settings.payment_currency)}*`,
    '',
  ];
  if (available.khqr) {
    lines.push(
      esc('🇰🇭 KHQR — scan to pay with any Cambodian bank app (ABA, Wing, ACLEDA, etc.). Instant delivery.'),
    );
  }
  if (available.usdt) {
    lines.push(esc('💵 USDT (Crypto) — arranged manually with our Support team.'));
  }
  return lines.join('\n');
}

/** Shown when an admin has switched every payment method off. */
export function noPaymentMethodsMessage(supportUsername: string | null): string {
  const contact = supportUsername
    ? `Please contact Support: ${supportUsername}`
    : 'Please check back shortly.';
  return `⚠️ PAYMENTS UNAVAILABLE\n\nNo payment methods are currently enabled.\n\n${contact}`;
}

/** Caption for the KHQR QR photo. */
export function khqrInstructions(params: {
  orderNumber: string;
  amount: string;
  currency: string;
  expiresAt: Date;
  timeoutMinutes: number;
}): string {
  return [
    '🇰🇭 *PAY WITH KHQR*',
    '',
    `Order: \`${esc(params.orderNumber)}\``,
    `Amount: *${esc(params.amount)} ${esc(params.currency)}*`,
    '',
    esc('📱 Scan the QR above with your banking app (ABA, Wing, ACLEDA, etc.) '),
    esc('or tap “Open in browser” to pay.'),
    '',
    `⏳ Expires in *${params.timeoutMinutes} minutes* \\(${esc(fmtTimeUtc(params.expiresAt))}\\)\\.`,
    esc('After that the QR stops working and your reserved API is released.'),
    '',
    esc('Your API is delivered here automatically once payment is confirmed.'),
  ].join('\n');
}

/** Sent when a customer chooses USDT/crypto — routes them to Support. */
export function usdtSupportMessage(params: {
  supportUsername: string | null;
  packageName: string;
  amount: string;
  currency: string;
  network: string | null;
}): string {
  const lines = [
    '💵 USDT / CRYPTO PAYMENT',
    '',
    `Package: ${params.packageName}`,
    `Amount: ${params.amount} ${params.currency}`,
  ];
  if (params.network) lines.push(`Network: ${params.network}`);
  lines.push(
    '',
    'Crypto payments are handled manually by our team.',
    params.supportUsername
      ? `Contact Support to pay by USDT: ${params.supportUsername}`
      : 'Support contact has not been configured yet. Please use KHQR, or check back soon.',
    '',
    'Quote the package name above and our team will confirm your payment and deliver your API key here.',
  );
  return lines.join('\n');
}

/** Sent when a pending order's payment window elapses. */
export function orderExpiredMessage(params: { orderNumber: string; packageName: string }): string {
  return [
    '⏳ PAYMENT WINDOW EXPIRED',
    '',
    `Order: ${params.orderNumber}`,
    `Package: ${params.packageName}`,
    '',
    'Your QR has expired and the reserved API has been released.',
    'No payment was taken. Tap “Buy API” to start a new order.',
  ].join('\n');
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
