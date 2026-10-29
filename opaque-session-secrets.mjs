import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {deriveCredential} from './credential-derivation.mjs';

export const LEGACY_SESSION_HASH = 'pbkdf2-sha256-v1';
export const OPAQUE_SESSION_HASH = 'sha256-opaque-v2';
const domain = Buffer.from('muzikaz/session-secret/sha256-opaque-v2\0');
const contextValid = (kind, purpose) => ['account', 'game'].includes(kind) && ['bearer', 'csrf'].includes(purpose);

/** Missing metadata is the historical, fixed 210k PBKDF scheme, never v2. */
export function sessionHashAlgorithm(value) {
  if (value === undefined || value === LEGACY_SESSION_HASH) return LEGACY_SESSION_HASH;
  return value === OPAQUE_SESSION_HASH ? OPAQUE_SESSION_HASH : null;
}

function canonical(value, length) {
  if (typeof value !== 'string' || value.length !== Math.ceil(length * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === length && decoded.toString('base64url') === value ? decoded : null;
}

export function sessionSecretMetadataSupported(hash, salt, algorithm) {
  const resolved = sessionHashAlgorithm(algorithm);
  if (!resolved || typeof hash !== 'string' || typeof salt !== 'string' || hash.length > 128 || salt.length > 256 || !salt.length) return false;
  if (resolved === OPAQUE_SESSION_HASH) return Boolean(canonical(hash, 32) && canonical(salt, 16));
  // Keep the existing base64url-tolerant PBKDF reader for historical records.
  return Buffer.from(hash, 'base64url').length === 32 && Buffer.from(salt, 'base64url').length > 0;
}

function valid(secret, hash, salt, algorithm, kind, purpose) {
  return Boolean(secret && contextValid(kind, purpose) && sessionSecretMetadataSupported(hash, salt, algorithm)
    && (sessionHashAlgorithm(algorithm) !== OPAQUE_SESSION_HASH || canonical(secret, 32)));
}

function opaqueDigest(secret, salt, kind, purpose) {
  return createHash('sha256').update(domain).update(kind).update('\0').update(purpose).update('\0')
    .update(canonical(salt, 16)).update(canonical(secret, 32)).digest();
}

/** Only for newly CSPRNG-generated session secrets, never human credentials. */
export async function createSessionSecret(secret, {algorithm = OPAQUE_SESSION_HASH, kind, purpose} = {}) {
  const resolved = sessionHashAlgorithm(algorithm);
  if (!resolved || !contextValid(kind, purpose) || !secret || resolved === OPAQUE_SESSION_HASH && !canonical(secret, 32)) {
    throw new TypeError('Invalid opaque session secret or hash configuration.');
  }
  const salt = randomBytes(16).toString('base64url');
  const hash = resolved === OPAQUE_SESSION_HASH
    ? opaqueDigest(secret, salt, kind, purpose)
    : await deriveCredential(String(secret), Buffer.from(salt, 'base64url'), 210_000, 32, 'sha256');
  return {algorithm: resolved, hash: hash.toString('base64url'), salt};
}

/** Resolve and validate format before a caller consults a positive cache. */
export function sessionSecretCacheKey(secret, hash, salt, {algorithm, kind, purpose} = {}) {
  if (!valid(secret, hash, salt, algorithm, kind, purpose)) return null;
  return createHash('sha256').update(JSON.stringify([
    sessionHashAlgorithm(algorithm), kind, purpose, String(secret), hash, salt
  ])).digest('hex');
}

export async function verifySessionSecret(secret, hash, salt, {algorithm, kind, purpose} = {}) {
  if (!valid(secret, hash, salt, algorithm, kind, purpose)) return false;
  const actual = sessionHashAlgorithm(algorithm) === OPAQUE_SESSION_HASH
    ? opaqueDigest(secret, salt, kind, purpose)
    : await deriveCredential(String(secret), Buffer.from(salt, 'base64url'), 210_000, 32, 'sha256');
  return timingSafeEqual(actual, Buffer.from(hash, 'base64url'));
}
