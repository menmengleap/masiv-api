import type { PaymentRow } from '../types.js';

/**
 * Payment verification strategies.
 *
 * The system NEVER marks an order paid based on a Telegram button click. A
 * payment is only confirmed by one of the verifiers below, invoked server-side
 * inside the confirm-payment transaction.
 *
 * 1. Manual admin verification — the admin inspects the on-chain transfer and
 *    confirms from the dashboard. The admin IS the verifier.
 *
 * 2. On-chain verification hook — a stub you can wire to a real provider
 *    (Tronscan/Etherscan/TRON gRPC, etc.). It must check that a transfer of
 *    `payment.amount` in `payment.currency` reached `payment.wallet_address`
 *    on `payment.network` with the given tx hash, and that the hash hasn't
 *    been used before (enforced by the unique index on payments.transaction_hash).
 *
 * Keeping this behind a single interface means swapping in a real integration
 * doesn't touch the order state machine.
 */

export type PaymentVerifier = (payment: PaymentRow) => Promise<boolean> | boolean;

/** Admin manually attests the payment is real. */
export const manualAdminVerifier: PaymentVerifier = () => true;

/**
 * On-chain verifier stub. Requires a transaction hash. Replace the body with a
 * real RPC/explorer lookup. Returns false until implemented, so nothing is ever
 * auto-confirmed by accident.
 */
export const onChainVerifier: PaymentVerifier = async (payment) => {
  if (!payment.transaction_hash) return false;

  // TODO: integrate a real provider. Example shape:
  //
  //   const tx = await explorer.getTransaction(payment.transaction_hash, payment.network);
  //   return (
  //     tx?.to?.toLowerCase() === payment.wallet_address?.toLowerCase() &&
  //     tx?.tokenSymbol === payment.currency &&
  //     Number(tx?.value) >= Number(payment.amount) &&
  //     tx?.confirmations >= MIN_CONFIRMATIONS
  //   );
  //
  return false;
};
