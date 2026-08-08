import type { Context } from 'telegraf';

/**
 * Per-user conversation state for the purchase flow, kept in memory.
 * Reserved for future use — the KHQR/USDT checkout flow is stateless.
 */
export interface SessionState {
  [key: string]: unknown;
}

export interface BotContext extends Context {
  session: SessionState;
}
