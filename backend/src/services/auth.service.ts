import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';
import { unauthorized } from '../lib/errors.js';
import type { AdminRow } from '../types.js';

export interface AuthedAdmin {
  id: string;
  username: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<AuthedAdmin> {
  const { rows } = await query<AdminRow>(
    'SELECT * FROM admins WHERE username = $1 AND is_active = TRUE',
    [username],
  );
  const admin = rows[0];
  // Always run a compare to reduce timing leakage on unknown usernames.
  const hash = admin?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);
  if (!admin || !ok) throw unauthorized('Invalid username or password');
  return { id: admin.id, username: admin.username };
}

export function issueToken(admin: AuthedAdmin): string {
  const payload: JwtPayload = { sub: admin.id, username: admin.username };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token: string): AuthedAdmin {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    return { id: decoded.sub, username: decoded.username };
  } catch {
    throw unauthorized('Session expired or invalid');
  }
}

export async function getAdminById(id: string): Promise<AuthedAdmin | null> {
  const { rows } = await query<AdminRow>(
    'SELECT * FROM admins WHERE id = $1 AND is_active = TRUE',
    [id],
  );
  const a = rows[0];
  return a ? { id: a.id, username: a.username } : null;
}

export async function changePassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { rows } = await query<AdminRow>('SELECT * FROM admins WHERE id = $1', [adminId]);
  const admin = rows[0];
  if (!admin) throw unauthorized();
  const ok = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!ok) throw unauthorized('Current password is incorrect');
  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hash, adminId]);
}
