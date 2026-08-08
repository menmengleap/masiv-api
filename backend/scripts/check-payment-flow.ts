/**
 * Integration check for the KHQR/USDT payment work, run against a scratch
 * Postgres. Exercises the real services (no mocks).
 *
 * DESTRUCTIVE: truncates payments/orders/tokens/packages/customers.
 * Point DATABASE_URL at a throwaway database and set ALLOW_DESTRUCTIVE_TEST=1.
 */
import { query, closePool } from '../src/db/pool.js';
import { encrypt, fingerprint, last4 } from '../src/lib/crypto.js';
import {
  createOrderForPackage,
  confirmPayment,
  expireStaleOrders,
  getOrder,
  listPayments,
} from '../src/services/order.service.js';
import { getSettings, getAdminSettings, updateSettings } from '../src/services/settings.service.js';

if (process.env.ALLOW_DESTRUCTIVE_TEST !== '1') {
  console.error(
    'Refusing to run: this script deletes all orders/payments/stock.\n' +
      'Set ALLOW_DESTRUCTIVE_TEST=1 and point DATABASE_URL at a scratch database.',
  );
  process.exit(1);
}

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
}

async function reset() {
  await query('DELETE FROM payments');
  await query('DELETE FROM orders');
  await query('DELETE FROM tokens');
  await query('DELETE FROM packages');
  await query('DELETE FROM customers');
}

async function seedPackageWithStock(n: number) {
  const pkg = await query<{ id: string }>(
    `INSERT INTO packages (name, total_tokens, price, default_valid_days)
     VALUES ('Test 50M', 50000000, 12.50, 30) RETURNING id`,
  );
  const packageId = pkg.rows[0].id;
  for (let i = 0; i < n; i++) {
    const key = `sk-test-key-${i}-${Date.now()}`;
    await query(
      `INSERT INTO tokens (package_id, base_url, token_value, token_fingerprint, token_last4,
                           total_tokens, valid_days, price, start_mode, status)
       VALUES ($1,'https://api.example.com',$2,$3,$4,50000000,30,12.50,'on_purchase','stock')`,
      [packageId, encrypt(key), fingerprint(key), last4(key)],
    );
  }
  const cust = await query<{ id: string }>(
    `INSERT INTO customers (telegram_user_id, telegram_username) VALUES ('999001','tester') RETURNING id`,
  );
  return { packageId, customerId: cust.rows[0].id };
}

async function main() {
  console.log('\n=== settings: secret redaction ===');
  await updateSettings({
    khqr_profile_id: 'QrBbF2nv5GQBiXDS94ilY4Et2f044HEx',
    khqr_secret_key: 'SUPER-SECRET-KEY',
    khqr_enabled: true,
    usdt_enabled: true,
    support_username: '@masiv_support',
    payment_network: 'TRC20',
    payment_wallet: 'TWalletAddr123',
  });

  const admin = await getAdminSettings();
  check('admin view omits secret', !('khqr_secret_key' in admin), JSON.stringify(Object.keys(admin)));
  check('admin view flags secret present', admin.khqr_secret_key_set === true);
  check('admin view keeps profile id', admin.khqr_profile_id === 'QrBbF2nv5GQBiXDS94ilY4Et2f044HEx');
  check('usdt_enabled surfaced', admin.usdt_enabled === true);

  // Simulate the dashboard saving the form without retyping the secret.
  await updateSettings({ bot_name: 'Masiv API', khqr_secret_key: '' });
  check('empty string preserves stored secret', (await getSettings()).khqr_secret_key === 'SUPER-SECRET-KEY');

  await updateSettings({ khqr_secret_key: 'ROTATED-KEY' });
  check('non-empty string rotates secret', (await getSettings()).khqr_secret_key === 'ROTATED-KEY');

  await updateSettings({ khqr_secret_key: null });
  check('explicit null clears secret', (await getSettings()).khqr_secret_key === null);
  check('cleared secret reflected in flag', (await getAdminSettings()).khqr_secret_key_set === false);
  await updateSettings({ khqr_secret_key: 'SUPER-SECRET-KEY' });

  console.log('\n=== order creation records the payment method ===');
  await reset();
  const { packageId, customerId } = await seedPackageWithStock(3);

  const khqrOrder = await createOrderForPackage(customerId, packageId, 'khqr');
  check('khqr payment method stored', khqrOrder.payment.method === 'khqr', khqrOrder.payment.method);
  check('khqr invoice has no USDT wallet', khqrOrder.payment.wallet_address === null, String(khqrOrder.payment.wallet_address));
  check('khqr invoice has no USDT network', khqrOrder.payment.network === null, String(khqrOrder.payment.network));
  check('khqr invoice has a deadline', khqrOrder.payment.expires_at !== null);

  const usdtOrder = await createOrderForPackage(customerId, packageId, 'usdt');
  check('usdt payment method stored', usdtOrder.payment.method === 'usdt', usdtOrder.payment.method);
  check('usdt invoice carries wallet', usdtOrder.payment.wallet_address === 'TWalletAddr123', String(usdtOrder.payment.wallet_address));
  check('usdt invoice carries network', usdtOrder.payment.network === 'TRC20', String(usdtOrder.payment.network));

  const defaulted = await createOrderForPackage(customerId, packageId);
  check('defaults to khqr', defaulted.payment.method === 'khqr', defaulted.payment.method);

  console.log('\n=== read models expose the method ===');
  const view = await getOrder(khqrOrder.order.id);
  check('getOrder returns payment_method', view.payment_method === 'khqr', String(view.payment_method));
  const payList = await listPayments({ limit: 50 });
  check('listPayments includes method', payList.items.every((p) => !!p.method));
  check('listPayments has all 3', payList.total === 3, String(payList.total));

  console.log('\n=== stock reservation ===');
  const stockLeft = await query<{ c: string }>(
    `SELECT COUNT(*)::text c FROM tokens WHERE package_id=$1 AND status='stock'`, [packageId]);
  check('3 tokens reserved, 0 left', stockLeft.rows[0].c === '0', stockLeft.rows[0].c);
  try {
    await createOrderForPackage(customerId, packageId, 'khqr');
    check('out-of-stock rejected', false, 'no error thrown');
  } catch (e) {
    check('out-of-stock rejected', (e as Error).message.includes('out of stock'), (e as Error).message);
  }

  console.log('\n=== confirmPayment completes + activates ===');
  const delivered = await confirmPayment(khqrOrder.order.id, {
    transactionHash: `khqr:${khqrOrder.order.order_number}`,
    verify: () => true,
  });
  check('order completed', delivered.order.status === 'completed', delivered.order.status);
  check('token activated with expiry', !!delivered.expires_at);
  const paidRow = await query<{ status: string; method: string }>(
    'SELECT status, method FROM payments WHERE order_id=$1', [khqrOrder.order.id]);
  check('payment confirmed', paidRow.rows[0].status === 'confirmed', paidRow.rows[0].status);
  check('method preserved through confirm', paidRow.rows[0].method === 'khqr', paidRow.rows[0].method);

  check('double-confirm rejected', await (async () => {
    try { await confirmPayment(khqrOrder.order.id, { verify: () => true }); return false; }
    catch { return true; }
  })());

  console.log('\n=== QR time limit: expiry sweep ===');
  // Force the remaining pending invoices past their deadline.
  await query(`UPDATE payments SET expires_at = NOW() - interval '1 minute' WHERE status='pending'`);
  const expiredIds = await expireStaleOrders();
  check('returns expired order ids', Array.isArray(expiredIds) && expiredIds.length === 2, JSON.stringify(expiredIds));

  const after = await query<{ status: string }>('SELECT status FROM orders WHERE id=$1', [usdtOrder.order.id]);
  check('expired order marked expired', after.rows[0].status === 'expired', after.rows[0].status);
  const released = await query<{ c: string }>(
    `SELECT COUNT(*)::text c FROM tokens WHERE package_id=$1 AND status='stock'`, [packageId]);
  check('reserved stock released back', released.rows[0].c === '2', released.rows[0].c);
  const expiredPay = await query<{ status: string }>(
    'SELECT status FROM payments WHERE order_id=$1', [usdtOrder.order.id]);
  check('invoice marked expired', expiredPay.rows[0].status === 'expired', expiredPay.rows[0].status);

  check('completed order untouched by sweep',
    (await query<{ status: string }>('SELECT status FROM orders WHERE id=$1', [khqrOrder.order.id])).rows[0].status === 'completed');

  console.log('\n=== method CHECK constraint ===');
  check('rejects unknown method', await (async () => {
    try {
      await query(`INSERT INTO payments (order_id, currency, amount, method, status)
                   VALUES ($1,'USDT',1,'paypal','pending')`, [khqrOrder.order.id]);
      return false;
    } catch { return true; }
  })());

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await closePool();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await closePool();
  process.exit(1);
});
