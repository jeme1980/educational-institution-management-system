import crypto from 'node:crypto';
import argon2 from 'argon2';

export const LEGACY_SHA256_LENGTH = 64;

export function legacySha256(password: string): string {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

export function isLegacyPasswordHash(storedHash: unknown): storedHash is string {
  return typeof storedHash === 'string' && /^[a-f0-9]{64}$/i.test(storedHash);
}

export function isArgon2idHash(storedHash: unknown): storedHash is string {
  return typeof storedHash === 'string' && storedHash.startsWith('$argon2id$');
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (isArgon2idHash(storedHash)) {
    try {
      return await argon2.verify(storedHash, password);
    } catch {
      return false;
    }
  }
  if (isLegacyPasswordHash(storedHash)) {
    const expected = Buffer.from(String(storedHash).toLowerCase(), 'utf8');
    const actual = Buffer.from(legacySha256(password), 'utf8');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
  return false;
}
