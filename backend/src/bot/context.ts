import type { Context } from 'telegraf';

/**
 * Per-user conversation state for the purchase flow, kept in memory.
 * awaitingTxHashForOrder: the order id we're expecting a transaction hash for.
 */
export interface SessionState {
  awaitingTxHashForOrder?: string;
}

export interface BotContext extends Context {
  session: SessionState;
}
