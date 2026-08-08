/**
 * End-to-end check of the public KHQR webhook against a scratch Postgres.
 * Verifies signature rejection, amount validation, idempotency, and that a
 * good callback actually completes the order and activates the API key.
 *
 * DESTRUCTIVE: truncates payments/orders/tokens/packages/customers and
 * overwrites bot_settings. Point DATABASE_URL at a throwaway database and set
 * ALLOW_DESTRUCTIVE_TEST=1.
 */
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { query, closePool } from '../src/db/pool.js';
import { encrypt, fingerprint, last4 } from '../src/lib/crypto.js';
import { createOrderForPackage } from '../src/services/order.service.js';
import { updateSettings } from '../src/services/settings.service.js';

if (process.env.ALLOW_DESTRUCTIVE_TEST !== '1') {
  console.error(
    'Refusing to run: this script deletes all orders/payments/stock.\n' +
      'Set ALLOW_DESTRUCTIVE_TEST=1 and point DATABASE_URL at a scratch database.',
  );
  process.exit(1);
}

const SECRET = 'WEBHOOK-TEST-SECRET';
const PORT = 45999;
const BASE = `http://127.0.0.1:${PORT}/webhooks/khqr`;

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
}

/** Matches verifyKhqrCallback(): sha256(secret + req_time + tx + amount + "SUCCESS"). */
function sign(reqTime: string, tx: string, amount: string) {
  return createHash('sha256').update(SECRET + reqTime + tx + amount + 'SUCCESS').digest('hex');
}

async function post(body: Record<string, string>, form = false) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try { json = await res.json() as Record<string, unknown>; } catch { /* non-json */ }
  return { status: res.status, json };
}

let seedSeq = 0;
async function seedOrder(amount: string) {
  // packages.total_tokens carries a UNIQUE index, so vary it per package.
  const totalTokens = 50_000_000 + ++seedSeq;
  const pkg = await query<{ id: string }>(
    `INSERT INTO packages (name, total_tokens, price, default_valid_days)
     VALUES ($1, $2, $3, 30) RETURNING id`,
    [`WH pkg ${seedSeq}`, totalTokens, amount],
  );
  const packageId = pkg.rows[0].id;
  const key = `sk-wh-${Math.random().toString(36).slice(2)}`;
  await query(
    `INSERT INTO tokens (package_id, base_url, token_value, token_fingerprint, token_last4,
                         total_tokens, valid_days, price, start_mode, status)
     VALUES ($1,'https://api.example.com',$2,$3,$4,$5,30,$6,'on_purchase','stock')`,
    [packageId, encrypt(key), fingerprint(key), last4(key), totalTokens, amount],
  );
  const cust = await query<{ id: string }>(
    `INSERT INTO customers (telegram_user_id) VALUES ($1) RETURNING id`,
    [String(Math.floor(Math.random() * 1e9))],
  );
  return createOrderForPackage(cust.rows[0].id, packageId, 'khqr');
}

async function main() {
  await query('DELETE FROM payments'); await query('DELETE FROM orders');
  await query('DELETE FROM tokens'); await query('DELETE FROM packages');
  await query('DELETE FROM customers');

  await updateSettings({
    khqr_enabled: true,
    khqr_profile_id: 'PROFILE',
    khqr_secret_key: SECRET,
    payment_currency: 'USDT',
  });

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(PORT, '127.0.0.1', () => resolve(s));
  });

  console.log('\n=== rejects malformed / unsigned callbacks ===');
  check('missing fields → 400', (await post({ transaction_id: 'X' })).status === 400);

  const o1 = await seedOrder('12.50');
  const tx1 = o1.order.order_number;
  const reqTime = '20260808120000';

  const bad = await post({ transaction_id: tx1, amount: '12.50', status: 'SUCCESS', req_time: reqTime, hash: 'deadbeef' });
  check('bad signature → 403', bad.status === 403, JSON.stringify(bad));
  check('order still pending after bad signature',
    (await query<{ status: string }>('SELECT status FROM orders WHERE id=$1', [o1.order.id])).rows[0].status === 'pending');

  const nonSuccess = await post({ transaction_id: tx1, amount: '12.50', status: 'FAILED', hash: 'x' });
  check('non-SUCCESS ignored, not confirmed', nonSuccess.json.processed === false, JSON.stringify(nonSuccess));

  console.log('\n=== amount validation ===');
  const short = await post({
    transaction_id: tx1, amount: '1.00', status: 'SUCCESS', req_time: reqTime,
    hash: sign(reqTime, tx1, '1.00'),
  });
  check('underpayment → 400 rejected', short.status === 400, JSON.stringify(short));
  check('underpayment did not complete order',
    (await query<{ status: string }>('SELECT status FROM orders WHERE id=$1', [o1.order.id])).rows[0].status === 'pending');

  console.log('\n=== correct callback completes the order ===');
  const good = await post({
    transaction_id: tx1, amount: '12.50', status: 'SUCCESS', req_time: reqTime,
    hash: sign(reqTime, tx1, '12.50'),
  });
  check('valid callback → processed', good.status === 200 && good.json.processed === true, JSON.stringify(good));
  const done = await query<{ status: string }>('SELECT status FROM orders WHERE id=$1', [o1.order.id]);
  check('order completed', done.rows[0].status === 'completed', done.rows[0].status);
  const pay = await query<{ status: string; method: string; transaction_hash: string }>(
    'SELECT status, method, transaction_hash FROM payments WHERE order_id=$1', [o1.order.id]);
  check('payment confirmed', pay.rows[0].status === 'confirmed', pay.rows[0].status);
  check('method still khqr', pay.rows[0].method === 'khqr');
  check('tx reference recorded', pay.rows[0].transaction_hash === `khqr:${tx1}`, pay.rows[0].transaction_hash);
  const tok = await query<{ status: string }>(
    'SELECT status FROM tokens WHERE id=$1', [o1.order.token_id!]);
  check('API key activated', tok.rows[0].status === 'active', tok.rows[0].status);

  console.log('\n=== replay / idempotency ===');
  const replay = await post({
    transaction_id: tx1, amount: '12.50', status: 'SUCCESS', req_time: reqTime,
    hash: sign(reqTime, tx1, '12.50'),
  });
  check('replay is a no-op (order no longer pending)', replay.json.processed === false, JSON.stringify(replay));

  console.log('\n=== overpayment is accepted ===');
  const o2 = await seedOrder('5.00');
  const tx2 = o2.order.order_number;
  const over = await post({
    transaction_id: tx2, amount: '6.00', status: 'SUCCESS', req_time: reqTime,
    hash: sign(reqTime, tx2, '6.00'),
  });
  check('overpayment processed', over.json.processed === true, JSON.stringify(over));

  console.log('\n=== form-encoded callbacks are parsed ===');
  const o3 = await seedOrder('7.25');
  const tx3 = o3.order.order_number;
  const formPost = await post({
    transaction_id: tx3, amount: '7.25', status: 'SUCCESS', req_time: reqTime,
    hash: sign(reqTime, tx3, '7.25'),
  }, true);
  check('x-www-form-urlencoded processed', formPost.json.processed === true, JSON.stringify(formPost));

  console.log('\n=== unknown order ===');
  const unknown = await post({
    transaction_id: 'MSV-DOES-NOT-EXIST', amount: '1.00', status: 'SUCCESS', req_time: reqTime,
    hash: sign(reqTime, 'MSV-DOES-NOT-EXIST', '1.00'),
  });
  check('unknown order → no-op', unknown.json.processed === false, JSON.stringify(unknown));

  server.close();
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  await closePool();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await closePool();
  process.exit(1);
});
