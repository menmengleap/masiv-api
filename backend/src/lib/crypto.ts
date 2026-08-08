import crypto from 'node:crypto';
import { config } from '../config/index.js';

/**
 * Symmetric encryption for API keys at rest.
 *
 * - AES-256-GCM (authenticated encryption).
 * - Stored format: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`.
 * - Because GCM uses a random IV, the same plaintext encrypts to different
 *   ciphertext each time — so we CANNOT rely on a UNIQUE index over the
 *   ciphertext to prevent duplicates. Duplicate detection uses a separate
 *   deterministic keyed hash (see `fingerprint`).
 */

const KEY = loadKey(config.encryptionKey);

function loadKey(raw: string): Buffer {
  // Accept 64-char hex or base64 that decodes to 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const b = Buffer.from(raw, 'base64');
  if (b.length === 32) return b;
  throw new Error(
    'ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64). ' +
      'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid ciphertext format');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * Deterministic keyed fingerprint (HMAC-SHA256) of a plaintext API key.
 * Used to enforce "never insert the same key twice" without storing plaintext.
 */
export function fingerprint(plaintext: string): string {
  return crypto.createHmac('sha256', KEY).update(plaintext.trim()).digest('hex');
}

/** Mask an API key for display, e.g. `••••••••••8A21`. Never returns full key. */
export function maskKey(plaintext: string): string {
  const trimmed = plaintext.trim();
  const last4 = trimmed.slice(-4) || '****';
  return '•'.repeat(10) + last4;
}

/** Last 4 chars, stored alongside ciphertext so masking never needs decryption. */
export function last4(plaintext: string): string {
  return plaintext.trim().slice(-4);
}

/** Build the masked string from just the stored last-4. */
export function maskFromLast4(l4: string | null | undefined): string {
  return '•'.repeat(10) + (l4 ?? '****');
}
