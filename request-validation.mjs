const invalid = (message, statusCode = 400) => Object.assign(new Error(message), {statusCode, code:'INVALID_INPUT'});
export function validateJsonInput(value, depth = 0) {
  if (depth > 32) throw invalid('Request nesting is too deep.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw invalid('Numbers must be finite.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__','prototype','constructor'].includes(key)) throw invalid('Reserved object keys are not accepted.');
    validateJsonInput(child, depth + 1);
  }
}
export async function readJsonInput(req, maxBytes = 1_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > maxBytes) throw invalid('Request body is too large.',413); chunks.push(bytes); }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw invalid('Request body must be valid JSON.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Request body must be a JSON object.');
  validateJsonInput(input); return input;
}
export function memberWalletPatch(input, normalizeSettings) {
  const denied = () => { throw Object.assign(new Error('Balances, items, account data, telemetry and rewards are maintained by server transactions.'),{statusCode:403,code:'SERVER_BALANCE_REQUIRED'}); };
  if (Object.keys(input).some(key=>key!=='memory' && key!=='requestId')) denied();
  const memory = input.memory ?? {};
  if (typeof memory !== 'object' || Array.isArray(memory) || Object.keys(memory).some(key=>!['profile','playerSettings'].includes(key))) denied();
  const patch = {};
  if (Object.hasOwn(memory,'profile')) {
    const profile = memory.profile;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile) || Object.keys(profile).some(key=>key!=='displayName') || typeof profile.displayName !== 'string' || profile.displayName.length > 80) denied();
    patch.profile = {displayName:profile.displayName.trim()};
  }
  if (Object.hasOwn(memory,'playerSettings')) patch.playerSettings = normalizeSettings(memory.playerSettings);
  return {memory:patch};
}
