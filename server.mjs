import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { UserJsonDatabase, cleanWallet } from './user-json-database.mjs';
import { LoadoutCodeStore } from './loadout-code-store.mjs';
import { PaymentOrderStore } from './payment-order-store.mjs';
import { verifyPaymentTransaction } from './payment-verifier.mjs';

const root = process.cwd();
const dataDir = process.env.MUZIKAZ_DATA_DIR || join(root, 'data');
const uploadDir = process.env.MUZIKAZ_AVATAR_UPLOAD_DIR || process.env.MUZIKAZ_UPLOAD_DIR || join(root, 'uploads', 'avatars');
const assetUploadDir = process.env.MUZIKAZ_ASSET_UPLOAD_DIR || join(root, 'uploads', 'assets');
const environmentUploadDir = process.env.MUZIKAZ_ENVIRONMENT_UPLOAD_DIR || join(root, 'uploads', 'environments');
const dataFile = join(dataDir, 'shared-house-avatars.json');
const assetsFile = join(dataDir, 'asset-library.json');
const modelsFile = join(dataDir, 'published-models.json');
const avatarProfilesFile = join(dataDir, 'avatar-profiles.json');
const userDatabaseFile = process.env.MUZIKAZ_USER_DATABASE_FILE || join(dataDir, 'users.json');
const userDatabase = new UserJsonDatabase(userDatabaseFile);
const loadoutCodeStore = new LoadoutCodeStore(process.env.MUZIKAZ_ACCOUNTS_FILE || join(dataDir, 'accounts.json'), { legacyCodesFile: process.env.MUZIKAZ_LOADOUT_CODES_FILE || join(dataDir, 'loadout-codes-rust.json'), legacyUsersFile: userDatabaseFile });
const paymentOrderStore = new PaymentOrderStore(process.env.MUZIKAZ_PAYMENT_ORDERS_FILE || join(dataDir, 'payment-orders.json'), { verifyTransaction: verifyPaymentTransaction });
const publicAvatarManifest = join(root, 'public', 'models', 'avatars.json');
const environmentDataFile = process.env.MUZIKAZ_ENVIRONMENT_DATA_FILE || join(dataDir, 'environments.json');
const repositoryEnvironmentManifest = join(root, 'public', 'models', 'environments', 'environments.json');
const clients = new Set();
const presence = new Map();
const chatMessages = [];
const accountSessions = new Map();
const accessAttempts = new Map();
const supportSockets = new Set();
const supportMessages = [];
const port = Number(process.env.PORT || 4173);
const adminUsername = process.env.MUZIKAZ_ADMIN_USERNAME || 'giraff';
const adminPassword = process.env.MUZIKAZ_ADMIN_PASSWORD || 'boots';
const adminSessionSecret = process.env.MUZIKAZ_ADMIN_SESSION_SECRET || `${adminUsername}\0${adminPassword}\0muzikaz-admin-session`;
const persistentAdminToken = createHmac('sha256', adminSessionSecret).update(`admin:${adminUsername}`).digest('base64url');
const maxUploadBytes = Number(process.env.MUZIKAZ_AVATAR_MAX_BYTES || 3_000_000);
const maxEnvironmentBytes = Number(process.env.MUZIKAZ_ENVIRONMENT_MAX_BYTES || 150 * 1024 * 1024);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.usdz': 'model/vnd.usdz+zip', '.obj': 'text/plain' };
const allowedUploadTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maxHouseUsers = 15;
const presenceTtlMs = 30_000;

function activePresence() {
  const cutoff = Date.now() - presenceTtlMs;
  for (const [id, person] of presence) if (Date.parse(person.lastActiveAt) < cutoff) presence.delete(id);
  return [...presence.values()];
}
function presencePayload() { const users = activePresence(); return { count: users.length, capacity: maxHouseUsers, coordinateSystem: 'right-handed-y-up', users }; }

async function ensureStorage() { await mkdir(dataDir, { recursive: true }); await mkdir(uploadDir, { recursive: true }); await mkdir(assetUploadDir, { recursive: true }); await mkdir(environmentUploadDir, { recursive: true }); for (const file of [dataFile, assetsFile, modelsFile, environmentDataFile, avatarProfilesFile]) { try { await stat(file); } catch { await writeFile(file, '[]'); } } }


async function readRepositoryEnvironments() {
  try {
    const records = JSON.parse(await readFile(repositoryEnvironmentManifest, 'utf8'));
    return records.map((record) => ({ ...record, source: 'repository', canDelete: false, canEdit: false }));
  } catch { return []; }
}
async function readUploadedEnvironments() { await ensureStorage(); return JSON.parse(await readFile(environmentDataFile, 'utf8')); }
async function writeUploadedEnvironments(records) { await ensureStorage(); await writeFile(environmentDataFile, JSON.stringify(records, null, 2)); }
function publicEnvironment(record) { return record.visibility === 'public' || record.source === 'repository'; }
function sanitizeFilename(value) { return String(value || 'environment.glb').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 90); }
function validGlbBuffer(buffer) {
  if (!buffer?.length) throw new Error('Invalid GLB: file is empty.');
  if (buffer.length < 20) throw new Error('Invalid GLB: file is too small.');
  if (buffer.slice(0, 4).toString('utf8') !== 'glTF') throw new Error('Invalid GLB: missing glTF binary magic bytes.');
  const version = buffer.readUInt32LE(4); const length = buffer.readUInt32LE(8);
  if (version !== 2) throw new Error('Unsupported GLB: only glTF 2.0 binary files are accepted.');
  if (length !== buffer.length) throw new Error('Malformed GLB: header length does not match uploaded file size.');
  return true;
}
function environmentRecord(input = {}, extra = {}) {
  const now = new Date().toISOString();
  return { id: cleanText(input.id, randomUUID()), name: cleanText(input.name || input.title, 'Uploaded Environment'), description: cleanText(input.description, ''), modelUrl: String(extra.modelUrl || input.modelUrl || '').replace(/[<>]/g, ''), thumbnailUrl: String(extra.thumbnailUrl || input.thumbnailUrl || '').replace(/[<>]/g, ''), spawn: { x: clampNumber(input.spawnX ?? input.spawn?.x, -10000, 10000, 0), y: clampNumber(input.spawnY ?? input.spawn?.y, -10000, 10000, 1), z: clampNumber(input.spawnZ ?? input.spawn?.z, -10000, 10000, 2), rotationY: clampNumber(input.spawnRotationY ?? input.spawn?.rotationY, -Math.PI * 4, Math.PI * 4, 0) }, scale: clampNumber(input.scale, 0.001, 100, 1), rotation: { x: clampNumber(input.rotationX ?? input.rotation?.x, -Math.PI * 4, Math.PI * 4, 0), y: clampNumber(input.rotationY ?? input.rotation?.y, -Math.PI * 4, Math.PI * 4, 0), z: clampNumber(input.rotationZ ?? input.rotation?.z, -Math.PI * 4, Math.PI * 4, 0) }, collisionMode: ['auto', 'mesh', 'none'].includes(input.collisionMode) ? input.collisionMode : 'auto', visibility: input.visibility === 'private' ? 'private' : 'public', source: 'uploaded', canDelete: true, canEdit: true, originalFilename: cleanText(extra.originalFilename, ''), storedFilename: cleanText(extra.storedFilename, ''), fileSize: Number(extra.fileSize || input.fileSize || 0), mimeType: cleanText(extra.mimeType || input.mimeType, 'model/gltf-binary'), createdAt: input.createdAt || now, updatedAt: now };
}
async function combinedEnvironments() { const [repo, uploaded] = await Promise.all([readRepositoryEnvironments(), readUploadedEnvironments()]); return [...repo, ...uploaded.filter(publicEnvironment)]; }
async function saveEnvironmentUpload(req) {
  const parts = await multipartFields(req, maxEnvironmentBytes + 2_000_000); const fields = {}; parts.filter((p) => !p.filename).forEach((p) => { fields[p.name] = p.data.toString('utf8').trim(); });
  const glb = parts.find((p) => p.name === 'environment' && p.filename); if (!glb) throw new Error('Choose a .glb environment file to upload.');
  const original = sanitizeFilename(glb.filename); if (!/\.glb$/i.test(original)) throw new Error('Environment upload must use a .glb extension.');
  if (glb.contentType && !['model/gltf-binary', 'application/octet-stream'].includes(glb.contentType)) throw new Error('Unsupported environment MIME type. Upload a GLB binary file.');
  if (glb.data.length > maxEnvironmentBytes) throw new Error(`File too large. Maximum environment size is ${Math.round(maxEnvironmentBytes / 1048576)} MB.`);
  validGlbBuffer(glb.data);
  await mkdir(environmentUploadDir, { recursive: true });
  const storedFilename = `${randomUUID()}-${original.replace(/\.glb$/i, '')}.glb`; await writeFile(join(environmentUploadDir, storedFilename), glb.data);
  let thumbnailUrl = ''; const thumb = parts.find((p) => p.name === 'thumbnail' && p.filename && p.data.length);
  if (thumb) { if (!['image/png', 'image/jpeg', 'image/webp'].includes(thumb.contentType)) throw new Error('Thumbnail must be PNG, JPEG, or WebP.'); const thumbName = `${randomUUID()}-${sanitizeFilename(thumb.filename)}`; await writeFile(join(environmentUploadDir, thumbName), thumb.data); thumbnailUrl = '/uploads/environments/' + thumbName; }
  const record = environmentRecord(fields, { modelUrl: '/uploads/environments/' + storedFilename, thumbnailUrl, originalFilename: original, storedFilename, fileSize: glb.data.length, mimeType: glb.contentType || 'model/gltf-binary' });
  const records = await readUploadedEnvironments(); records.unshift(record); await writeUploadedEnvironments(records); return record;
}

async function readAssets() { await ensureStorage(); return JSON.parse(await readFile(assetsFile, 'utf8')); }
async function readModels() { await ensureStorage(); return JSON.parse(await readFile(modelsFile, 'utf8')); }
async function writeModels(records) { await ensureStorage(); await writeFile(modelsFile, JSON.stringify(records, null, 2)); }
async function writeAssets(records) { await ensureStorage(); await writeFile(assetsFile, JSON.stringify(records, null, 2)); }
function user(req) {
  const active = accountSessions.get(cookie(req, 'mzk_session'));
  const sessionWallet = active?.expiresAt > Date.now() ? active.wallet : '';
  return { id: cleanText(req.headers['x-user-id'] || sessionWallet, 'demo-user'), role: 'user', name: cleanText(req.headers['x-user-name'], 'MUZIKAZ Creator') };
}
function requestWallet(req) {
  const active = accountSessions.get(cookie(req, 'mzk_session'));
  const sessionWallet = active?.expiresAt > Date.now() ? active.wallet : '';
  return cleanWallet(req.headers['x-wallet-address'] || req.headers['x-user-id'] || sessionWallet);
}
function matchesAdminToken(value) { const supplied = Buffer.from(String(value || '')); const expected = Buffer.from(persistentAdminToken); return supplied.length === expected.length && timingSafeEqual(supplied, expected); }
function isAdmin(req) { const token = String(req.headers['x-admin-token'] || cookie(req, 'mzk_admin') || ''); return (process.env.ADMIN_PUBLISH_TOKEN && token === process.env.ADMIN_PUBLISH_TOKEN) || matchesAdminToken(token); }
function matchesSecret(candidate, expected) { const supplied = Buffer.from(String(candidate || '')); const configured = Buffer.from(expected); return supplied.length === configured.length && timingSafeEqual(supplied, configured); }
function requireAdmin(req, res) { if (isAdmin(req)) return true; sendJson(res, 403, { success: false, message: 'Admin authorization required' }); return false; }
function cookie(req, name) { return String(req.headers.cookie || '').split(';').map((part) => part.trim().split('=')).find(([key]) => key === name)?.[1] || ''; }
function openAccountSession(res, account) { const token = randomBytes(32).toString('base64url'); const csrfToken = randomBytes(24).toString('base64url'); accountSessions.set(token, { accountId: account.accountId, wallet: account.primaryEthereumWallet, csrfToken, expiresAt: Date.now() + 8 * 60 * 60 * 1000 }); res.setHeader('Set-Cookie', `mzk_session=${token}; Path=/; HttpOnly; SameSite=${process.env.NODE_ENV === 'production' ? 'None' : 'Lax'}; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); return { account, csrfToken, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() }; }
function accountSession(req, res, csrf = false) { const token = cookie(req, 'mzk_session'); const current = accountSessions.get(token); if (!current || current.expiresAt <= Date.now()) { accountSessions.delete(token); sendJson(res, 401, { success: false, message: 'Your account session has expired.' }); return null; } if (csrf) { const supplied = String(req.headers['x-csrf-token'] || ''); const a = Buffer.from(supplied); const b = Buffer.from(current.csrfToken); if (a.length !== b.length || !timingSafeEqual(a, b)) { sendJson(res, 403, { success: false, message: 'Invalid CSRF token.' }); return null; } } return current; }
function throttleAccess(req) { const key = String(req.socket.remoteAddress || 'unknown'); const now = Date.now(); const attempt = accessAttempts.get(key) || { failures: 0, resetAt: now + 15 * 60_000 }; if (attempt.resetAt <= now) { attempt.failures = 0; attempt.resetAt = now + 15 * 60_000; } if (attempt.failures >= 8) throw Object.assign(new Error('Too many failed access attempts. Try again later.'), { statusCode: 429 }); accessAttempts.set(key, attempt); return { success: () => accessAttempts.delete(key), failure: () => { attempt.failures += 1; } }; }
async function requireLandOwnership(req, res) {
  let deeds = [];
  try { deeds = await userDatabase.landDeeds(requestWallet(req)); } catch {}
  if (deeds.length) return deeds[0];
  sendJson(res, 403, { success: false, code: 'LAND_OWNERSHIP_REQUIRED', message: 'Land ownership required: add a MUZIKAZ World land deed to your Drop Backpack before uploading avatars, assets, or games.' });
  return null;
}
function isPublicAsset(asset) { return asset.visibility === 'public' || asset.status === 'published' || asset.status === 'approved'; }
function isGlbAvatar(asset) { const url = asset.publicUrl || asset.modelUrl || ''; const labels = `${asset.category || ''} ${asset.tags || ''} ${asset.intendedUse || ''}`; return /\.glb(?:$|[?#])/i.test(url) && /avatar|character|player/i.test(labels) && !/prop|building|vehicle|weapon|environment/i.test(labels); }
async function readAvatarProfiles() { await ensureStorage(); return JSON.parse(await readFile(avatarProfilesFile, 'utf8')); }
async function writeAvatarProfiles(records) { await ensureStorage(); await writeFile(avatarProfilesFile, JSON.stringify(records, null, 2)); }
async function readPublicAvatars() { try { return JSON.parse(await readFile(publicAvatarManifest, 'utf8')); } catch { return []; } }
async function avatarCatalog(actor) {
  const [assets, models, publicModels] = await Promise.all([readAssets(), readModels(), readPublicAvatars()]);
  const owned = assets.filter((a) => a.ownerId === actor.id && isGlbAvatar(a)).map((a) => ({ id: a.id, name: a.title, creator: a.creator || a.ownerDisplayName, modelUrl: a.publicUrl, source: 'Owned', accessType: 'owned', scale: Number(a.defaultScale) || 1 }));
  const shared = models.filter((m) => (m.status === 'published' || m.visibility === 'public') && /\.glb(?:$|[?#])/i.test(m.modelUrl || '') && !/environment|prop|vehicle|weapon/i.test(`${m.category || ''} ${m.description || ''}`)).map((m) => ({ id: m.id, name: m.name || m.title, creator: m.creatorName || m.owner, modelUrl: m.modelUrl, source: 'Shared', accessType: 'shared', scale: Number(m.scale) || 1, rotation: m.rotation || null }));
  return [...owned, ...shared, ...publicModels.map((m) => ({ ...m, source: 'Public', accessType: 'public' }))];
}
function approvedAvatarUrl(value) { return typeof value === 'string' && (/^\/uploads\/assets\/[a-zA-Z0-9._-]+\.glb$/i.test(value) || /^\/public\/models\/[a-zA-Z0-9 %._-]+\.glb$/i.test(value) || /^https:\/\//i.test(value)); }
async function validatedAvatar(actor, assetId) { const asset = (await avatarCatalog(actor)).find((item) => item.id === assetId); if (!asset || !approvedAvatarUrl(asset.modelUrl)) return null; return asset; }
function assetType(contentType, filename = '') { return /model|gltf|usdz|reality|octet-stream/.test(contentType) || /\.(glb|gltf|usdz|reality)$/i.test(filename) ? 'model' : 'image'; }
async function multipartFields(req, limit = 25_000_000) {
  const type = String(req.headers['content-type'] || '');
  const match = type.match(/boundary=(.+)$/);
  if (!match) throw new Error('Missing multipart boundary');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Upload too large'); chunks.push(chunk); }
  const body = Buffer.concat(chunks);
  const boundary = Buffer.from('--' + match[1]);
  const parts = [];
  for (const raw of body.toString('binary').split(boundary.toString('binary')).slice(1, -1)) {
    const part = Buffer.from(raw.replace(/^\r\n|\r\n$/g, ''), 'binary');
    const marker = Buffer.from('\r\n\r\n'); const start = part.indexOf(marker);
    if (start < 0) continue;
    const header = part.slice(0, start).toString('utf8');
    const data = part.slice(start + marker.length);
    const name = (header.match(/name="([^"]+)"/i) || [])[1];
    const filename = (header.match(/filename="([^"]*)"/i) || [])[1];
    const contentType = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || 'application/octet-stream';
    if (!name) continue;
    parts.push({ name, filename, contentType, data });
  }
  return parts;
}
async function saveAssetUpload(req, forceModel = false) {
  const actor = user(req); const parts = await multipartFields(req);
  const fields = {}; const files = parts.filter((p) => p.filename);
  parts.filter((p) => !p.filename).forEach((p) => { fields[p.name] = p.data.toString('utf8').trim(); });
  if (!files.length) throw new Error('Choose at least one file to upload');
  const records = await readAssets(); const now = new Date().toISOString(); const created = [];
  for (const part of files) {
    const original = cleanText(part.filename, 'upload.bin');
    const ext = extname(original) || (part.contentType.includes('png') ? '.png' : part.contentType.includes('jpeg') ? '.jpg' : part.contentType.includes('svg') ? '.svg' : '.bin');
    const safeName = randomUUID() + '-' + original.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 90);
    await writeFile(join(assetUploadDir, safeName), part.data);
    const fileType = forceModel ? 'model' : assetType(part.contentType, original);
    const record = { id: randomUUID(), title: cleanText(fields.title, original.replace(/\.[^.]+$/, '')), description: cleanText(fields.description, ''), creator: cleanText(fields.creator, actor.name), ownerId: actor.id, ownerDisplayName: actor.name, originalFilename: original, storedFilename: safeName, publicUrl: '/uploads/assets/' + safeName, thumbnailUrl: fileType === 'image' ? '/uploads/assets/' + safeName : '', fileType, fileSize: part.data.length, mimeType: part.contentType, category: cleanText(fields.category, ''), tags: cleanText(fields.tags, ''), status: cleanText(fields.status, 'draft'), visibility: cleanText(fields.visibility, 'private'), intendedUse: cleanText(fields.intendedUse, forceModel ? '3D model' : '3D model texture'), relatedModelId: cleanText(fields.relatedModelId, ''), productAssignment: cleanText(fields.productAssignment, ''), collectionAssignment: cleanText(fields.collectionAssignment, ''), publishLocation: cleanText(fields.publishLocation, ''), createdAt: now, updatedAt: now, approvedAt: '', publishedAt: '', moderatorNote: '' };
    records.unshift(record); created.push(record);
  }
  await writeAssets(records); return created.length === 1 ? created[0] : created;
}
function assetResponse(data) { return { success: true, data }; }
async function readAvatars() { await ensureStorage(); return JSON.parse(await readFile(dataFile, 'utf8')); }
async function writeAvatars(records) { await ensureStorage(); await writeFile(dataFile, JSON.stringify(records, null, 2)); }
function session(req) { return String(req.headers['x-muzikaz-session'] || new URL(req.url, 'http://x').searchParams.get('sessionId') || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) || randomUUID(); }
function cleanText(value, fallback = '') { return String(value || fallback).replace(/[<>]/g, '').slice(0, 140); }
function supportText(value) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, 1000); }
function websocketFrame(data) {
  const body = Buffer.from(JSON.stringify(data));
  const header = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  return Buffer.concat([header, body]);
}
function sendSupport(socket, data) { if (!socket.destroyed && socket.writable) socket.write(websocketFrame(data)); }
function broadcastSupport(record) {
  for (const client of supportSockets) if (client.supportAdmin || client.supportUserId === record.threadId) sendSupport(client, { type: 'message', message: record });
}
function supportHistory(client) {
  const messages = client.supportAdmin ? supportMessages.slice(-250) : supportMessages.filter((item) => item.threadId === client.supportUserId).slice(-100);
  sendSupport(client, { type: 'history', messages, role: client.supportAdmin ? 'admin' : 'user' });
}
function consumeWebsocketFrames(socket, chunk) {
  socket.supportBuffer = Buffer.concat([socket.supportBuffer || Buffer.alloc(0), chunk]);
  while (socket.supportBuffer.length >= 2) {
    const second = socket.supportBuffer[1]; let length = second & 127; let offset = 2;
    if (length === 126) { if (socket.supportBuffer.length < 4) return; length = socket.supportBuffer.readUInt16BE(2); offset = 4; }
    if (length === 127 || length > 4096) return socket.destroy();
    const masked = Boolean(second & 128); if (masked) offset += 4;
    if (socket.supportBuffer.length < offset + length) return;
    const opcode = socket.supportBuffer[0] & 15;
    if (opcode === 8) return socket.end();
    const payload = Buffer.from(socket.supportBuffer.subarray(offset, offset + length));
    if (masked) { const mask = socket.supportBuffer.subarray(offset - 4, offset); for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4]; }
    socket.supportBuffer = socket.supportBuffer.subarray(offset + length);
    if (opcode === 9) continue;
    try {
      const input = JSON.parse(payload.toString('utf8')); const text = supportText(input.message);
      if (!text) continue;
      const threadId = socket.supportAdmin ? cleanText(input.threadId, '') : socket.supportUserId;
      if (!threadId) return sendSupport(socket, { type: 'error', message: 'Choose a customer conversation first.' });
      const record = { id: randomUUID(), threadId, sender: socket.supportAdmin ? 'admin' : 'user', name: socket.supportAdmin ? 'MUZIKAZ Support' : socket.supportName, message: text, createdAt: new Date().toISOString() };
      supportMessages.push(record); if (supportMessages.length > 500) supportMessages.splice(0, supportMessages.length - 500); broadcastSupport(record);
    } catch { sendSupport(socket, { type: 'error', message: 'That support message could not be read.' }); }
  }
}
function clampNumber(value, min, max, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function roomId(position) { if (position.z < 3.2 && position.x < -1.6) return 'front-west'; if (position.z < 3.2) return 'front-hall'; if (position.z < 5.9) return 'middle-gallery'; return position.x < 1.1 ? 'back-lounge' : 'back-east'; }
function sanitizeRecord(input, ownerId) { const position = { x: clampNumber(input?.position?.x, -4.65, 4.65), y: 0, z: clampNumber(input?.position?.z, .35, 8.65, 2.5) }; const scale = clampNumber(input?.scale?.x, .35, 2.4, 1); const avatarUrl = String(input?.avatarUrl || 'logo_symbol_crop_2x_transparent.png'); if (/^(javascript|data:text\/html)/i.test(avatarUrl)) throw new Error('Unsafe avatar URL'); return { id: cleanText(input?.id, randomUUID()), houseId: 'ioncore-house', ownerId, username: cleanText(input?.username, 'Guest'), avatarName: cleanText(input?.avatarName, 'Shared avatar'), avatarType: cleanText(input?.avatarType, 'image-sprite'), avatarUrl, thumbnailUrl: cleanText(input?.thumbnailUrl, ''), message: cleanText(input?.message, ''), position, rotation: { x: 0, y: 0, z: clampNumber(input?.rotation?.z, -Math.PI * 4, Math.PI * 4) }, scale: { x: scale, y: scale, z: scale }, roomId: roomId(position), visibility: 'public', createdAt: input?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; }
function broadcast(type, data) { const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; for (const client of clients) client.write(payload); }
function broadcastTo(sessionId, type, data) { const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; for (const client of clients) if (client.muzikazSessionId === sessionId) client.write(payload); }
function corsHeaders(extra = {}, origin = '') { const allowedOrigin = process.env.MUZIKAZ_CORS_ORIGIN || origin || '*'; return { 'Access-Control-Allow-Origin': allowedOrigin, ...(allowedOrigin === '*' ? {} : { 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }), 'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Wallet-Address, X-MUZIKAZ-Session, X-User-Id, X-User-Role, X-User-Name, X-Admin-Token, X-MUZIKAZ-Land-Asset, X-CSRF-Token', 'Cross-Origin-Resource-Policy': 'cross-origin', ...extra }; }
function sendJson(res, status, data) { res.writeHead(status, corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, res.muzikazRequestOrigin)); res.end(JSON.stringify(data)); }
function isPublicAssetUrl(value) { try { const url = new URL(value, 'http://localhost'); return url.protocol === 'https:' || url.pathname.startsWith('/uploads/') || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)); } catch { return false; } }
function cleanList(value, allowed = null) { const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []; return [...new Set(list.map((item) => cleanText(item, '').trim().toLowerCase()).filter((item) => item && (!allowed || allowed.has(item))))]; }
function cleanTraits(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return {}; return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, score]) => [cleanText(key, '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''), clampNumber(score, 0, 100, 0)]).filter(([key]) => key)); }
function modelRecord(input = {}) {
  const now = new Date().toISOString(); const modelUrl = String(input.assets?.modelUrl || input.modelUrl || input.model_url || input.fileUrl || '').trim();
  if (!isPublicAssetUrl(modelUrl)) throw new Error('A public HTTPS model URL is required');
  const rarity = ['common', 'rare', 'epic', 'legendary'].includes(String(input.rarity).toLowerCase()) ? String(input.rarity).toLowerCase() : 'common';
  const classes = cleanList(input.classes || input.class, new Set(['creator', 'builder', 'explorer', 'fighter', 'companion', 'merchant', 'player']));
  const equipmentSlots = cleanList(input.equipmentSlots, new Set(['head', 'face', 'neck', 'torso', 'hands', 'feet', 'back', 'tool1', 'tool2']));
  const animations = cleanList(input.animations, new Set(['idle', 'walk', 'run', 'jump', 'turn', 'interact', 'dance', 'emote', 'use_tool', 'damage', 'defeat', 'fly', 'hover', 'rap', 'taunt']));
  const worlds = cleanList(input.worldPermissions?.allowedWorlds || input.worlds);
  return { id: cleanText(input.id, randomUUID()), characterId: cleanText(input.characterId, ''), edition: Math.max(1, Math.trunc(Number(input.edition) || 1)), title: cleanText(input.title || input.name || input.avatarName, 'Shared Avatar'), name: cleanText(input.name || input.title || input.avatarName, 'Shared Avatar'), creatorName: cleanText(input.creatorName || input.owner || input.username || input.creator, 'MUZIKAZ Creator'), owner: cleanText(input.owner || input.creatorName || input.username || input.creator, 'MUZIKAZ Creator'), ownerId: cleanText(input.ownerId, ''), description: cleanText(input.description || input.message, ''), category: cleanText(input.category, 'Avatar'), modelType: cleanText(input.modelType || input.format || input.fileType, extname(modelUrl).replace('.', '').toLowerCase()), format: cleanText(input.format || input.modelType || input.fileType, extname(modelUrl).replace('.', '').toLowerCase()), modelUrl, iosModelUrl: cleanText(input.assets?.iosModelUrl || input.iosModelUrl || input.ios_model_url, ''), thumbnailUrl: cleanText(input.assets?.thumbnailUrl || input.thumbnailUrl || input.thumbnail_url || input.previewUrl, ''), rarity, classes: classes.length ? classes : ['player'], traits: cleanTraits(input.traits), abilities: cleanList(input.abilities), rigProfile: cleanText(input.rigProfile, 'muzikaz-biped@1'), equipmentSlots, animationProfile: cleanText(input.animationProfile, 'muzikaz-biped@1'), animations, worldPermissions: { allowedWorlds: worlds, landRoles: cleanList(input.worldPermissions?.landRoles, new Set(['visitor', 'friend', 'builder', 'owner'])) }, metadata: { lore: cleanText(input.metadata?.lore || input.lore, ''), creator: cleanText(input.metadata?.creator || input.creatorName || input.creator, 'MUZIKAZ Creator'), collection: cleanText(input.metadata?.collection || input.collection, ''), tokenId: cleanText(input.metadata?.tokenId || input.tokenId, '') }, tradable: input.tradable !== false, approvalStatus: input.approvalStatus === 'suspended' ? 'suspended' : 'published', schemaVersion: '1.0.0', publishedAt: input.publishedAt || input.published_at || now, updatedAt: now, visibility: 'public', status: input.status === 'private' ? 'private' : 'published', featured: Boolean(input.featured), scale: Number(input.scale) || 1, rotation: input.rotation || null, environment: cleanText(input.environment, '') };
}
async function bodyJson(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
async function uploadFile(req) { const type = String(req.headers['content-type'] || ''); const match = type.match(/boundary=(.+)$/); if (!match) throw new Error('Missing multipart boundary'); const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > maxUploadBytes + 2000) throw new Error('Upload too large'); chunks.push(chunk); } const body = Buffer.concat(chunks); const marker = Buffer.from('\r\n\r\n'); const start = body.indexOf(marker); const endBoundary = Buffer.from('\r\n--' + match[1]); const end = body.lastIndexOf(endBoundary); if (start < 0 || end < 0) throw new Error('Invalid multipart upload'); const header = body.slice(0, start).toString('utf8'); const contentType = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1]; const original = (header.match(/filename="([^"]+)"/i) || [])[1] || 'avatar.png'; if (!allowedUploadTypes.has(contentType)) throw new Error('Unsupported avatar type'); const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' })[contentType]; const safeName = randomUUID() + '-' + original.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80).replace(/\.[^.]+$/, '') + ext; const file = body.slice(start + marker.length, end); if (file.length > maxUploadBytes) throw new Error('Upload too large'); await mkdir(uploadDir, { recursive: true }); await writeFile(join(uploadDir, safeName), file); return { avatarUrl: '/uploads/avatars/' + safeName, thumbnailUrl: '/uploads/avatars/' + safeName };
}

const server = createServer(async (req, res) => {
  res.muzikazRequestOrigin = String(req.headers.origin || '');
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders({}, res.muzikazRequestOrigin)); res.end(); return; }
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      await ensureStorage();
      return sendJson(res, 200, { success: true, service: 'muzikaz-member-market', storage: 'ready', persistentStorageConfigured: dataDir.startsWith('/var/data') });
    }
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      const credentials = await bodyJson(req);
      if (!matchesSecret(credentials.username, adminUsername) || !matchesSecret(credentials.password, adminPassword)) return sendJson(res, 401, { success: false, message: 'Invalid administrator credentials' });
      res.setHeader('Set-Cookie', `mzk_admin=${persistentAdminToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=315360000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
      return sendJson(res, 200, assetResponse({ token: persistentAdminToken, persistent: true }));
    }
    if (url.pathname === '/api/admin/session' && req.method === 'GET') {
      if (!isAdmin(req)) return sendJson(res, 401, { success: false, code: 'ADMIN_SESSION_EXPIRED', message: 'Administrator session is missing or expired.' });
      return sendJson(res, 200, assetResponse({ authenticated: true, persistent: true }));
    }
    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', `mzk_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
      return sendJson(res, 200, assetResponse({ authenticated: false }));
    }
    if (url.pathname === '/api/admin/data' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const [submissions, models, usersData, sales, environments, avatars, avatarProfiles] = await Promise.all([
        readAssets(), readModels(), userDatabase.initialize().then(() => userDatabase.read()), paymentOrderStore.list(),
        readUploadedEnvironments(), readAvatars(), readAvatarProfiles()
      ]);
      const users = Object.entries(usersData.users || {}).map(([walletKey, record]) => ({ walletKey, record }));
      const paidSales = sales.filter((order) => ['PAID', 'FULFILLED'].includes(order.paymentStatus));
      return sendJson(res, 200, assetResponse({
        generatedAt: Math.floor(Date.now() / 1000),
        summary: {
          submissions: submissions.length,
          users: users.length,
          sales: sales.length,
          paidRevenueUsd: paidSales.reduce((total, order) => total + Number(order.basePrice || 0), 0),
          models: models.length,
          environments: environments.length,
          avatars: avatars.length
        },
        submissions, users, sales, models, customizations: [], derivatives: [], environments, avatars, avatarProfiles
      }));
    }
    if ((url.pathname === '/api/admin/access-codes' || url.pathname === '/api/admin/loadout-codes') && req.method === 'POST') { if (!requireAdmin(req, res)) return; return sendJson(res, 201, assetResponse(await loadoutCodeStore.create(await bodyJson(req)))); }
    if ((url.pathname === '/api/admin/access-codes' || url.pathname === '/api/admin/loadout-codes') && req.method === 'GET') { if (!requireAdmin(req, res)) return; return sendJson(res, 200, assetResponse(await loadoutCodeStore.list())); }
    const adminAccessRevoke = url.pathname.match(/^\/api\/admin\/access-codes\/([^/]+)\/revoke$/);
    if (adminAccessRevoke && req.method === 'POST') { if (!requireAdmin(req, res)) return; return sendJson(res, 200, assetResponse(await loadoutCodeStore.adminRevoke(decodeURIComponent(adminAccessRevoke[1])))); }
    if ((url.pathname === '/api/access/activate' || url.pathname === '/api/loadout-codes/redeem') && req.method === 'POST') { const attempt = throttleAccess(req); try { const body = await bodyJson(req); const result = await loadoutCodeStore.activate(body.code, body.wallet, body.username); await userDatabase.ensureAccount(result.account); attempt.success(); return sendJson(res, 200, assetResponse(openAccountSession(res, result.account))); } catch (error) { attempt.failure(); throw error; } }
    if (url.pathname === '/api/access/login' && req.method === 'POST') { const attempt = throttleAccess(req); try { const account = await loadoutCodeStore.authenticate((await bodyJson(req)).code); await userDatabase.ensureAccount(account); attempt.success(); return sendJson(res, 200, assetResponse(openAccountSession(res, account))); } catch (error) { attempt.failure(); throw error; } }
    if (url.pathname === '/api/access/wallet' && req.method === 'POST') { const account = await loadoutCodeStore.findByWallet((await bodyJson(req)).wallet); await userDatabase.ensureAccount(account); return sendJson(res, 200, assetResponse(openAccountSession(res, account))); }
    if (url.pathname === '/api/account/loadout/paid' && req.method === 'POST') { const active = accountSession(req, res, true); if (!active) return; const body = await bodyJson(req); const account = await loadoutCodeStore.getAccount(active.accountId); const granted = await loadoutCodeStore.grantPaidLoadout(account.primaryEthereumWallet, body.paymentId); await userDatabase.ensureAccount(granted); return sendJson(res, 200, assetResponse(granted)); }
    if (url.pathname === '/api/account' && req.method === 'GET') { const active = accountSession(req, res); if (!active) return; const account = await loadoutCodeStore.getAccount(active.accountId); return account ? sendJson(res, 200, assetResponse(account)) : sendJson(res, 404, { success: false, message: 'Account not found.' }); }
    if (url.pathname === '/api/account/wallet' && req.method === 'POST') { const active = accountSession(req, res, true); if (!active) return; const account = await loadoutCodeStore.connectWallet(active.accountId, (await bodyJson(req)).wallet); active.wallet = account.primaryEthereumWallet; await userDatabase.ensureAccount(account); return sendJson(res, 200, assetResponse(account)); }
    if (url.pathname === '/api/account/access-code' && req.method === 'POST') { const active = accountSession(req, res, true); if (!active) return; return sendJson(res, 201, assetResponse(await loadoutCodeStore.ensureAccountCode(active.accountId))); }
    if (url.pathname === '/api/account/access-code/rotate' && req.method === 'POST') { const active = accountSession(req, res, true); if (!active) return; return sendJson(res, 200, assetResponse(await loadoutCodeStore.rotate(active.accountId))); }
    if (url.pathname === '/api/account/access-code/revoke' && req.method === 'POST') { const active = accountSession(req, res, true); if (!active) return; return sendJson(res, 200, assetResponse(await loadoutCodeStore.revoke(active.accountId))); }

    if (url.pathname === '/api/payments/orders' && req.method === 'POST') return sendJson(res, 201, assetResponse(await paymentOrderStore.create(await bodyJson(req))));
    if (url.pathname === '/api/admin/sales' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return sendJson(res, 200, assetResponse(await paymentOrderStore.list())); }
    const paymentOrder = url.pathname.match(/^\/api\/payments\/orders\/([^/]+)$/);
    if (paymentOrder && req.method === 'GET') { const order = await paymentOrderStore.get(paymentOrder[1]); return order ? sendJson(res, 200, assetResponse(order)) : sendJson(res, 404, { success: false, message: 'Payment order not found.' }); }
    const paymentAction = url.pathname.match(/^\/api\/payments\/orders\/([^/]+)\/(submit|verify|fulfill)$/);
    if (paymentAction && req.method === 'POST') { const body = await bodyJson(req).catch(() => ({})); const [, id, action] = paymentAction; if (action === 'fulfill' && !requireAdmin(req, res)) return; const result = action === 'submit' ? await paymentOrderStore.submit(id, body.transactionHash, body.wallet) : action === 'verify' ? await paymentOrderStore.verify(id) : await paymentOrderStore.fulfill(id, body.fulfillment); return sendJson(res, 200, assetResponse(result)); }

    if (url.pathname === '/api/wallet/state' && req.method === 'GET') return sendJson(res, 200, assetResponse(await userDatabase.get(requestWallet(req))));
    if (url.pathname === '/api/wallet/state' && req.method === 'PUT') return sendJson(res, 200, assetResponse(await userDatabase.put(requestWallet(req), await bodyJson(req))));
    if (url.pathname === '/api/land/deeds' && req.method === 'GET') return sendJson(res, 200, assetResponse(await userDatabase.landDeeds(requestWallet(req))));
    if (url.pathname === '/api/land/claims' && req.method === 'POST') { const body = await bodyJson(req); const allowed = new Map([['volt-city', 'Volt City'], ['skyline-deck', 'Skyline Deck'], ['echo-gardens', 'Echo Gardens'], ['crew-plaza', 'Crew Plaza'], ['studio-ridge', 'Studio Ridge'], ['neon-docks', 'Neon Docks'], ['bassline-badlands', 'Bassline Badlands'], ['pixel-peaks', 'Pixel Peaks']]); const worldId = cleanText(body.worldId).toLowerCase(); if (!allowed.has(worldId)) return sendJson(res, 400, { success: false, message: 'Unknown MUZIKAZ world.' }); return sendJson(res, 201, assetResponse(await userDatabase.claimLand({ walletId: requestWallet(req), worldId, name: allowed.get(worldId), priceMzk: 4000, requestId: body.requestId }))); }
    if (url.pathname === '/api/market/members' && req.method === 'GET') return sendJson(res, 200, assetResponse(await userDatabase.members()));
    const marketProfile = url.pathname.match(/^\/api\/market\/members\/([^/]+)$/);
    if (marketProfile && req.method === 'GET') { const profile = await userDatabase.marketProfile(decodeURIComponent(marketProfile[1])); return profile ? sendJson(res, 200, assetResponse(profile)) : sendJson(res, 404, { success: false, message: 'Member not found' }); }
    if (url.pathname === '/api/market/listings' && req.method === 'GET') return sendJson(res, 200, assetResponse(await userDatabase.marketListings()));
    if (url.pathname === '/api/market/listings' && req.method === 'PUT') { const body = await bodyJson(req); return sendJson(res, 200, assetResponse(await userDatabase.listItem(requestWallet(req), cleanText(body.itemId), body.priceMzk, body.active !== false))); }
    if (url.pathname === '/api/market/trades' && req.method === 'POST') { const body = await bodyJson(req); return sendJson(res, 201, assetResponse(await userDatabase.trade({ buyerId: requestWallet(req), sellerId: body.sellerId, itemId: body.itemId, requestId: body.requestId }))); }
    if (url.pathname === '/api/market/messages' && req.method === 'POST') { const body = await bodyJson(req); return sendJson(res, 201, assetResponse(await userDatabase.message({ from: requestWallet(req), to: body.to, text: body.text }))); }
    if (url.pathname === '/api/market/activity' && req.method === 'GET') return sendJson(res, 200, assetResponse(await userDatabase.activity(requestWallet(req), url.searchParams.get('peer') || '')));

    if (url.pathname === '/api/environments' && req.method === 'GET') return sendJson(res, 200, assetResponse(await combinedEnvironments()));
    if (url.pathname === '/api/environments' && req.method === 'POST') { if (!requireAdmin(req, res)) return; const records = await readUploadedEnvironments(); const record = environmentRecord(await bodyJson(req)); if (!record.modelUrl.startsWith('/uploads/environments/')) throw new Error('Uploaded environment records must point to /uploads/environments/.'); records.unshift(record); await writeUploadedEnvironments(records); return sendJson(res, 201, assetResponse(record)); }
    if (url.pathname === '/api/environments/upload' && req.method === 'POST') { if (!await requireLandOwnership(req, res) || !requireAdmin(req, res)) return; return sendJson(res, 201, assetResponse(await saveEnvironmentUpload(req))); }
    const environmentItem = url.pathname.match(/^\/api\/environments\/([^/]+)$/);
    if (environmentItem && req.method === 'GET') { const id = decodeURIComponent(environmentItem[1]); const record = (await combinedEnvironments()).find((env) => env.id === id || env.aliases?.includes(id)); return record ? sendJson(res, 200, assetResponse(record)) : sendJson(res, 404, { success: false, message: 'Environment not found' }); }
    if (environmentItem && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; const id = decodeURIComponent(environmentItem[1]); const records = await readUploadedEnvironments(); const index = records.findIndex((env) => env.id === id); if (index < 0) return sendJson(res, 404, { success: false, message: 'Uploaded environment not found' }); records[index] = { ...records[index], ...environmentRecord({ ...records[index], ...(await bodyJson(req)) }, records[index]), id: records[index].id, modelUrl: records[index].modelUrl, source: 'uploaded', updatedAt: new Date().toISOString() }; await writeUploadedEnvironments(records); return sendJson(res, 200, assetResponse(records[index])); }
    if (environmentItem && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; const id = decodeURIComponent(environmentItem[1]); const records = await readUploadedEnvironments(); const record = records.find((env) => env.id === id); if (!record) return sendJson(res, 404, { success: false, message: 'Uploaded environment not found' }); await writeUploadedEnvironments(records.filter((env) => env.id !== id)); if (record.storedFilename) await unlink(join(environmentUploadDir, record.storedFilename)).catch(() => {}); return sendJson(res, 200, assetResponse({ id })); }

    if ((url.pathname === '/api/models' || url.pathname === '/api/avatars/published') && req.method === 'GET') { const models = (await readModels()).filter((m) => m.status === 'published' || m.visibility === 'public').sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))); return sendJson(res, 200, assetResponse(models)); }
    if (url.pathname === '/api/avatar-options' && req.method === 'GET') return sendJson(res, 200, assetResponse(await avatarCatalog(user(req))));
    if (url.pathname === '/api/profile/avatar' && req.method === 'GET') { const actor = user(req); const profile = (await readAvatarProfiles()).find((item) => item.userId === actor.id); if (!profile) return sendJson(res, 200, assetResponse({ valid: false, reason: 'not-selected', profile: null })); const asset = await validatedAvatar(actor, profile.assetId); return sendJson(res, 200, assetResponse(asset ? { valid: true, profile: { ...profile, modelUrl: asset.modelUrl, displayName: asset.name, accessType: asset.accessType } } : { valid: false, reason: 'removed-or-revoked', profile: null })); }
    if (url.pathname === '/api/profile/avatar' && req.method === 'PUT') { const actor = user(req); const input = await bodyJson(req); const asset = await validatedAvatar(actor, cleanText(input.assetId)); if (!asset) return sendJson(res, 403, { success: false, message: 'Avatar is unavailable or is not approved for this account.' }); const records = await readAvatarProfiles(); const profile = { userId: actor.id, assetId: asset.id, modelUrl: asset.modelUrl, displayName: asset.name, accessType: asset.accessType, selectedAt: new Date().toISOString(), scale: clampNumber(input.scale ?? asset.scale, .1, 4, 1), rotation: { x: 0, y: clampNumber(input.rotation?.y ?? asset.rotation?.y, -Math.PI * 4, Math.PI * 4, 0), z: 0 }, animation: cleanText(input.animation, 'auto'), spawnOffset: { x: 0, y: clampNumber(input.spawnOffset?.y, -2, 2, 0), z: 0 } }; const index = records.findIndex((item) => item.userId === actor.id); if (index < 0) records.push(profile); else records[index] = profile; await writeAvatarProfiles(records); broadcast('player-avatar-changed', { userId: actor.id, username: actor.name, avatarAssetId: asset.id, modelUrl: asset.modelUrl }); return sendJson(res, 200, assetResponse({ valid: true, profile })); }


    if ((url.pathname === '/api/models' || url.pathname === '/api/avatars/published') && req.method === 'POST') { if (!requireAdmin(req, res)) return; const records = await readModels(); const record = modelRecord(await bodyJson(req)); const index = records.findIndex((m) => m.id === record.id); if (index >= 0) records[index] = { ...records[index], ...record }; else records.unshift(record); await writeModels(records); broadcast('avatar:published', record); return sendJson(res, 201, assetResponse(record)); }
    if (url.pathname === '/api/assets/upload' && req.method === 'POST') { if (!await requireLandOwnership(req, res) || !requireAdmin(req, res)) return; return sendJson(res, 201, assetResponse(await saveAssetUpload(req, false))); }
    if (url.pathname === '/api/models/upload' && req.method === 'POST') { if (!await requireLandOwnership(req, res) || !requireAdmin(req, res)) return; return sendJson(res, 201, assetResponse(await saveAssetUpload(req, true))); }
    if (url.pathname === '/api/assets/mine' && req.method === 'GET') { if (!requireAdmin(req, res)) return; return sendJson(res, 200, assetResponse(await readAssets())); }
    if (url.pathname === '/api/assets/public' && req.method === 'GET') { const assets = await readAssets(); return sendJson(res, 200, assetResponse(assets.filter(isPublicAsset))); }
    if (url.pathname === '/api/admin/data' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      await userDatabase.initialize();
      const [assets, orders, models, environments, users, avatars, avatarProfiles] = await Promise.all([readAssets(), paymentOrderStore.list(), readModels(), combinedEnvironments(), userDatabase.read(), readAvatars(), readAvatarProfiles()]);
      const userRows = Object.entries(users.users || {}).map(([walletKey, record]) => ({ walletKey, record }));
      const customizations = assets.filter((asset) => asset.relatedModelId || asset.publishLocation).map((asset) => ({ id: asset.id, assetId: asset.id, modelId: asset.relatedModelId || '', displayType: asset.publishLocation || '', approved: ['approved', 'published'].includes(asset.status), published: asset.status === 'published', updatedAt: asset.updatedAt }));
      const derivatives = assets.flatMap((asset) => (asset.derivatives || []).map((derivative) => ({ assetId: asset.id, ...derivative })));
      const summary = { users: userRows.length, submissions: assets.length, publishedModels: models.length, activeListings: (await userDatabase.marketListings()).length, sales: orders.length, paidRevenueUsd: orders.filter((order) => ['PAID', 'FULFILLED'].includes(order.paymentStatus)).reduce((total, order) => total + Number(order.basePrice || order.usdTotal || 0), 0), environments: environments.length, avatarProfiles: avatarProfiles.length };
      return sendJson(res, 200, assetResponse({ generatedAt: Math.floor(Date.now() / 1000), summary, submissions: assets, users: userRows, sales: orders, models, customizations, derivatives, environments, avatars, avatarProfiles }));
    }
    if (url.pathname === '/api/admin/analytics' && req.method === 'GET') { if (!requireAdmin(req, res)) return; const [assets, orders] = await Promise.all([readAssets(), paymentOrderStore.list()]); return sendJson(res, 200, assetResponse({ totalOrders: orders.length, inventoryUnits: orders.filter((order) => order.paymentStatus === 'FULFILLED').reduce((total, order) => total + (order.fulfillment?.items || []).reduce((sum, item) => sum + item.quantity, 0), 0), conversionRate: orders.length ? `${Math.round(orders.filter((order) => ['PAID', 'FULFILLED'].includes(order.paymentStatus)).length / orders.length * 1000) / 10}%` : '0%', totalUploads: assets.length, pendingApprovals: assets.filter((a) => a.status === 'pending_review').length, storageUsage: assets.reduce((n, a) => n + (a.fileSize || 0), 0) })); }
    const assetAction = url.pathname.match(/^\/api\/assets\/([^/]+)\/([^/]+)$/);
    if (assetAction && req.method === 'POST') { if (!requireAdmin(req, res)) return; const [ , id, action ] = assetAction; const assets = await readAssets(); const asset = assets.find((a) => a.id === id); if (!asset) return sendJson(res, 404, { success: false, message: 'Asset not found' }); const body = await bodyJson(req).catch(() => ({})); const now = new Date().toISOString(); if (action === 'approve') { asset.status = 'approved'; asset.approvedAt = now; } else if (action === 'reject') { asset.status = 'rejected'; asset.moderatorNote = cleanText(body.reason, 'Changes required'); } else if (action === 'publish') { asset.status = 'published'; asset.visibility = 'public'; asset.publishedAt = now; } else if (action === 'unpublish') { asset.visibility = 'private'; } else if (action === 'archive') { asset.status = 'archived'; } else if (action === 'assign-model') { asset.relatedModelId = cleanText(body.modelId, asset.relatedModelId); asset.publishLocation = cleanText(body.displayType, asset.publishLocation); } else { return sendJson(res, 400, { success: false, message: 'Unknown action' }); } asset.updatedAt = now; await writeAssets(assets); return sendJson(res, 200, assetResponse(asset)); }
    const assetItem = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (assetItem && req.method === 'PATCH') { if (!requireAdmin(req, res)) return; const assets = await readAssets(); const asset = assets.find((a) => a.id === assetItem[1]); if (!asset) return sendJson(res, 404, { success: false, message: 'Asset not found' }); Object.assign(asset, await bodyJson(req)); asset.updatedAt = new Date().toISOString(); await writeAssets(assets); return sendJson(res, 200, assetResponse(asset)); }
    if (assetItem && req.method === 'DELETE') { if (!requireAdmin(req, res)) return; const assets = await readAssets(); await writeAssets(assets.filter((a) => a.id !== assetItem[1])); return sendJson(res, 200, assetResponse({ id: assetItem[1] })); }
    if (url.pathname === '/api/uploads/avatar' && req.method === 'POST') { if (!await requireLandOwnership(req, res)) return; return sendJson(res, 201, await uploadFile(req)); }
    if (url.pathname === '/api/houses/ioncore-house/avatars' && req.method === 'GET') return sendJson(res, 200, await readAvatars());
    if (url.pathname === '/api/houses/ioncore-house/avatars' && req.method === 'POST') { const owner = session(req); const record = sanitizeRecord(await bodyJson(req), owner); const records = await readAvatars(); records.push(record); await writeAvatars(records); broadcast('avatar-created', record); return sendJson(res, 201, record); }
    const avatarDelete = url.pathname.match(/^\/api\/houses\/ioncore-house\/avatars\/([^/]+)$/);
    if (avatarDelete && req.method === 'DELETE') { const owner = session(req); const id = decodeURIComponent(avatarDelete[1]); const records = await readAvatars(); const record = records.find((item) => item.id === id); if (!record) return sendJson(res, 404, { error: 'Not found' }); if (record.ownerId !== owner && process.env.MUZIKAZ_ALLOW_MOD_DELETE !== 'true') return sendJson(res, 403, { error: 'Forbidden' }); await writeAvatars(records.filter((item) => item.id !== id)); broadcast('avatar-deleted', { id }); return sendJson(res, 200, { id }); }
    if (url.pathname === '/api/houses/ioncore-house/events' && req.method === 'GET') { res.writeHead(200, corsHeaders({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })); res.muzikazSessionId = session(req); res.write(`event: house-presence-updated\ndata: ${JSON.stringify(presencePayload())}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return; }
    if (url.pathname === '/api/houses/ioncore-house/presence' && req.method === 'POST') { const id = session(req); const actor = user(req); const body = await bodyJson(req).catch(() => ({})); const profile = (await readAvatarProfiles()).find((item) => item.userId === actor.id); const asset = profile && await validatedAvatar(actor, profile.assetId); if (!asset) return sendJson(res, 403, { error: 'Choose a valid designated avatar before entering multiplayer.' }); activePresence(); if (!presence.has(id) && presence.size >= maxHouseUsers) return sendJson(res, 409, { error: 'This Vibe Crib server is full.', ...presencePayload() }); const now = new Date().toISOString(); const previous = presence.get(id) || {}; const position = { x: clampNumber(body.position?.x, -4.65, 4.65, previous.position?.x || 0), y: clampNumber(body.position?.y, 0, 2.4, previous.position?.y || 0), z: clampNumber(body.position?.z, .35, 8.65, previous.position?.z || 2.5) }; const rotation = { x: 0, y: clampNumber(body.rotation?.y, -Math.PI * 4, Math.PI * 4, previous.rotation?.y || 0), z: 0 }; presence.set(id, { sessionId: id, userId: actor.id, username: actor.name, joinedAt: previous.joinedAt || now, lastActiveAt: now, roomId: cleanText(body.roomId, roomId(position)), color: cleanText(body.color, previous.color || '#9cff00'), avatarAssetId: asset.id, modelUrl: asset.modelUrl, avatarName: asset.name, position, rotation, movementState: ['idle','walk','run','jump'].includes(body.movementState) ? body.movementState : 'idle', animationState: cleanText(body.animationState, 'auto'), message: cleanText(body.message, previous.message || '') }); const data = presencePayload(); broadcast('player-state', presence.get(id)); broadcast('house-presence-updated', data); return sendJson(res, 200, data); }
    if (url.pathname === '/api/houses/ioncore-house/presence/leave' && req.method === 'POST') { presence.delete(session(req)); const data = presencePayload(); broadcast('house-presence-updated', data); return sendJson(res, 200, { ok: true, ...data }); }
    if (url.pathname === '/api/houses/ioncore-house/voice/signal' && req.method === 'POST') { const from = session(req); const sender = presence.get(from); if (!sender) return sendJson(res, 401, { error: 'Join the Vibe Crib before using voice.' }); const body = await bodyJson(req); const to = cleanText(body.to, ''); if (!to || to === from || !presence.has(to)) return sendJson(res, 400, { error: 'Voice recipient is unavailable.' }); const kind = ['offer','answer','candidate','hangup'].includes(body.kind) ? body.kind : ''; if (!kind) return sendJson(res, 400, { error: 'Unsupported voice signal.' }); broadcastTo(to, 'house-voice-signal', { from, to, kind, payload: body.payload || null }); return sendJson(res, 202, { ok: true }); }
    if (url.pathname === '/api/houses/ioncore-house/chat' && req.method === 'GET') return sendJson(res, 200, { messages: chatMessages.slice(-50) });
    if (url.pathname === '/api/houses/ioncore-house/chat' && req.method === 'POST') { const id = session(req); const person = presence.get(id); if (!person) return sendJson(res, 401, { error: 'Join the Vibe Crib before chatting.' }); const body = await bodyJson(req); const message = cleanText(body.message, '').trim(); if (!message) return sendJson(res, 400, { error: 'Message cannot be empty.' }); const record = { id: randomUUID(), sessionId: id, username: person.username, message, createdAt: new Date().toISOString() }; person.message = message; person.lastActiveAt = record.createdAt; chatMessages.push(record); broadcast('house-presence-updated', presencePayload()); if (chatMessages.length > 100) chatMessages.splice(0, chatMessages.length - 100); broadcast('house-chat-message', record); return sendJson(res, 201, record); }
    let path = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^[/\\]+/, '');
    if (path.includes('..')) return sendJson(res, 400, { error: 'Bad path' });
    const pathsToTry = [join(root, 'dist', path), join(root, path)];
    if (!extname(path)) pathsToTry.push(join(root, 'dist', path + '.html'), join(root, path + '.html'));
    let filePath = '';
    for (const possiblePath of pathsToTry) {
      try { await stat(possiblePath); filePath = possiblePath; break; } catch {}
    }
    if (!filePath) throw new Error('Not found');
    const extension = extname(filePath).toLowerCase();
    const cacheControl = extension === '.glb' || extension === '.usdz' ? 'public, max-age=31536000, immutable' : extension === '.json' ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, corsHeaders({ 'Content-Type': mimeTypes[extension] || 'application/octet-stream', 'Cache-Control': cacheControl }));
    createReadStream(filePath).pipe(res);
  } catch (error) { if (!res.headersSent) sendJson(res, error.statusCode || (url.pathname.startsWith('/api/') ? 400 : 404), { success: false, message: error.message || 'Not found' }); }
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws/support' || String(req.headers.upgrade).toLowerCase() !== 'websocket') return socket.destroy();
  const key = req.headers['sec-websocket-key']; if (!key) return socket.destroy();
  const token = url.searchParams.get('adminToken') || '';
  socket.supportAdmin = (process.env.ADMIN_PUBLISH_TOKEN && token === process.env.ADMIN_PUBLISH_TOKEN) || matchesAdminToken(token);
  socket.supportUserId = cleanText(url.searchParams.get('userId'), randomUUID());
  socket.supportName = cleanText(url.searchParams.get('name'), 'Guest');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')}`, '\r\n'].join('\r\n'));
  supportSockets.add(socket); supportHistory(socket);
  socket.on('data', (chunk) => consumeWebsocketFrames(socket, chunk));
  socket.on('close', () => supportSockets.delete(socket)); socket.on('error', () => supportSockets.delete(socket));
});
await loadoutCodeStore.migrate();
server.listen(port, () => console.log(`MUZIKAZ shared house server running on http://localhost:${port}`));
