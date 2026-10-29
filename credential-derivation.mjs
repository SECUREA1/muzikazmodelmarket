import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';

const deriveAsync = promisify(pbkdf2);
// Crypto and filesystem I/O share libuv workers. Keep a burst of credentials
// out of that pool's queue so cached authentication can still stat its file.
const capacity = Math.max(1, Math.min(2, (Number(process.env.UV_THREADPOOL_SIZE) || 4) - 1));
const waiters = [];
let active = 0;

/** Derive credentials without blocking the event loop or flooding its I/O pool. */
export async function deriveCredential(value, salt, iterations = 210_000, keyLength = 32, digest = 'sha256') {
  if (active >= capacity) await new Promise(resolve => waiters.push(resolve));
  else active++;
  try { return await deriveAsync(value, salt, iterations, keyLength, digest); }
  finally {
    const next = waiters.shift();
    if (next) next(); else active--;
  }
}
