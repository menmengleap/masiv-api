import {
  paymentMethodPrompt,
  khqrInstructions,
  usdtSupportMessage,
  noPaymentMethodsMessage,
  orderExpiredMessage,
} from '../src/bot/messages.js';
import { paymentMethodKeyboard, usdtSupportKeyboard, supportUrl } from '../src/bot/keyboards.js';

const pkg = {
  id: 'p1',
  name: 'Starter 50M (v2.1)',
  total_tokens: '50000000',
  price: '12.50',
  default_valid_days: 30,
  description: null,
  stock_available: 3,
} as never;

const settings = {
  usd_to_usdt: '1.0000',
  payment_currency: 'USDT',
  payment_network: 'TRC20',
  support_username: '@masiv_support',
} as never;

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

/**
 * MarkdownV2: outside code spans every reserved char must be backslash-escaped
 * and `*` must pair. Inside a `code span` the text is literal, so we strip
 * those first (and verify the backticks pair).
 */
function markdownV2Problems(s: string): string[] {
  const problems: string[] = [];

  // Strip balanced code spans.
  let ticks = 0;
  let outside = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && !inCode) { outside += s.slice(i, i + 2); i++; continue; }
    if (c === '`') { ticks++; inCode = !inCode; continue; }
    if (!inCode) outside += c;
  }
  if (ticks % 2 !== 0) problems.push(`unbalanced code-span backticks (${ticks})`);

  const reserved = '_[]()~`>#+-=|{}.!';
  let stars = 0;
  for (let i = 0; i < outside.length; i++) {
    const c = outside[i];
    if (c === '\\') { i++; continue; }
    if (c === '*') { stars++; continue; }
    if (reserved.includes(c)) problems.push(`unescaped '${c}' at ${i}`);
  }
  if (stars % 2 !== 0) problems.push(`unbalanced bold markers (${stars})`);
  return problems;
}

console.log('\n== paymentMethodPrompt (both methods) ==');
const both = paymentMethodPrompt(pkg, settings, { khqr: true, usdt: true });
console.log(both);
check('valid MarkdownV2', markdownV2Problems(both).length === 0, markdownV2Problems(both).join(', '));
check('mentions KHQR', both.includes('KHQR'));
check('mentions USDT', both.includes('USDT'));

console.log('\n== paymentMethodPrompt (KHQR off) ==');
const khqrOff = paymentMethodPrompt(pkg, settings, { khqr: false, usdt: true });
check('valid MarkdownV2', markdownV2Problems(khqrOff).length === 0, markdownV2Problems(khqrOff).join(', '));
check('hides KHQR line', !khqrOff.includes('scan to pay'));

console.log('\n== khqrInstructions ==');
const qr = khqrInstructions({
  orderNumber: 'MSV-ABC-123',
  amount: '12.50',
  currency: 'USDT',
  expiresAt: new Date('2026-08-08T14:32:00Z'),
  timeoutMinutes: 30,
});
console.log(qr);
check('valid MarkdownV2', markdownV2Problems(qr).length === 0, markdownV2Problems(qr).join(', '));
check('shows deadline clock', qr.includes('14:32 UTC'));
check('shows timeout minutes', qr.includes('30 minutes'));

console.log('\n== usdtSupportMessage ==');
const usdt = usdtSupportMessage({
  supportUsername: '@masiv_support',
  packageName: 'Starter 50M',
  amount: '12.50',
  currency: 'USDT',
  network: 'TRC20',
});
console.log(usdt);
check('routes to support', usdt.includes('@masiv_support'));
check('states manual handling', usdt.toLowerCase().includes('manually'));

console.log('\n== usdtSupportMessage (no support handle) ==');
const noSupport = usdtSupportMessage({
  supportUsername: null, packageName: 'Starter 50M', amount: '12.50', currency: 'USDT', network: null,
});
check('degrades gracefully', noSupport.includes('not been configured'));

console.log('\n== keyboard gating ==');
type KB = { reply_markup: { inline_keyboard: Array<Array<{ text: string }>> } };
const labels = (k: KB) => k.reply_markup.inline_keyboard.flat().map((b) => b.text);

check('both methods shown', JSON.stringify(labels(paymentMethodKeyboard('p1', { khqrEnabled: true, usdtEnabled: true }) as KB)).includes('KHQR'));
const usdtOnly = labels(paymentMethodKeyboard('p1', { khqrEnabled: false, usdtEnabled: true }) as KB);
check('KHQR hidden when disabled', !usdtOnly.some((l) => l.includes('KHQR')), usdtOnly.join('|'));
const khqrOnly = labels(paymentMethodKeyboard('p1', { khqrEnabled: true, usdtEnabled: false }) as KB);
check('USDT hidden when disabled', !khqrOnly.some((l) => l.includes('USDT')), khqrOnly.join('|'));
const none = labels(paymentMethodKeyboard('p1', { khqrEnabled: false, usdtEnabled: false }) as KB);
check('only Back remains', none.length === 1, none.join('|'));

console.log('\n== supportUrl ==');
check('@handle', supportUrl('@masiv_support') === 'https://t.me/masiv_support');
check('bare handle', supportUrl('masiv_support') === 'https://t.me/masiv_support');
check('full url passthrough', supportUrl('https://t.me/foo') === 'https://t.me/foo');
check('null', supportUrl(null) === null);
check('rejects junk', supportUrl('call me maybe') === null);
check('rejects too-short', supportUrl('@ab') === null);

const kbNoSupport = labels(usdtSupportKeyboard('p1', null) as KB);
check('no broken contact button without handle', !kbNoSupport.some((l) => l.includes('Contact')), kbNoSupport.join('|'));
const kbSupport = labels(usdtSupportKeyboard('p1', '@masiv_support') as KB);
check('contact button with handle', kbSupport.some((l) => l.includes('Contact')));

console.log('\n== misc ==');
console.log(noPaymentMethodsMessage('@masiv_support'));
console.log(orderExpiredMessage({ orderNumber: 'MSV-ABC-123', packageName: 'Starter 50M' }));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
