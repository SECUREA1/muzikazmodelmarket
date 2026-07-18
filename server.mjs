import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = process.cwd();
const dataDir = process.env.MUZIKAZ_DATA_DIR || join(root, 'data');
const uploadDir = process.env.MUZIKAZ_UPLOAD_DIR || join(root, 'uploads', 'avatars');
const assetUploadDir = process.env.MUZIKAZ_ASSET_UPLOAD_DIR || join(root, 'uploads', 'assets');
const environmentUploadDir = process.env.MUZIKAZ_ENVIRONMENT_UPLOAD_DIR || join(root, 'uploads', 'environments');
const dataFile = join(dataDir, 'shared-house-avatars.json');
const assetsFile = join(dataDir, 'asset-library.json');
const modelsFile = join(dataDir, 'published-models.json');
const environmentDataFile = process.env.MUZIKAZ_ENVIRONMENT_DATA_FILE || join(dataDir, 'environments.json');
const ordersFile = process.env.MUZIKAZ_ORDERS_FILE || join(dataDir, 'orders.json');
const repositoryEnvironmentManifest = join(root, 'public', 'models', 'environments', 'environments.json');
const clients = new Set();
const presence = new Map();
const port = Number(process.env.PORT || 4173);
const maxUploadBytes = Number(process.env.MUZIKAZ_AVATAR_MAX_BYTES || 3_000_000);
const maxEnvironmentBytes = Number(process.env.MUZIKAZ_ENVIRONMENT_MAX_BYTES || 150 * 1024 * 1024);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.usdz': 'model/vnd.usdz+zip', '.obj': 'text/plain' };
const allowedUploadTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function ensureStorage() { await mkdir(dataDir, { recursive: true }); await mkdir(uploadDir, { recursive: true }); await mkdir(assetUploadDir, { recursive: true }); await mkdir(environmentUploadDir, { recursive: true }); try { await stat(dataFile); } catch { await writeFile(dataFile, '[]'); } try { await stat(assetsFile); } catch { await writeFile(assetsFile, '[]'); } try { await stat(modelsFile); } catch { await writeFile(modelsFile, '[]'); } try { await stat(environmentDataFile); } catch { await writeFile(environmentDataFile, '[]'); } try { await stat(ordersFile); } catch { await writeFile(ordersFile, '[]'); } }


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


async function readOrders() { await ensureStorage(); return JSON.parse(await readFile(ordersFile, 'utf8')); }
async function writeOrders(records) { await ensureStorage(); await writeFile(ordersFile, JSON.stringify(records, null, 2)); }
function paypalBaseUrl() { return process.env.PAYPAL_ENVIRONMENT === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }
function paypalConfigured() { return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET); }
function moneyValue(value) { return Number(Number(value || 0).toFixed(2)); }
function orderAmounts(items = []) {
  const normalizedItems = Array.isArray(items) ? items.map((item) => ({ name: cleanText(item.name, 'MUZIKAZ item'), sku: cleanText(item.sku || item.key, ''), quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)), unit_amount: moneyValue(item.price) })).filter((item) => item.unit_amount > 0) : [];
  if (!normalizedItems.length) throw new Error('Add at least one paid item before creating a PayPal order.');
  const subtotal = moneyValue(normalizedItems.reduce((total, item) => total + item.unit_amount * item.quantity, 0));
  const shipping = moneyValue(subtotal > 0 && subtotal < 75 ? 8.95 : 0);
  const tax = moneyValue(subtotal * 0.0825);
  const total = moneyValue(subtotal + shipping + tax);
  return { items: normalizedItems, subtotal, shipping, tax, total, currency: 'USD' };
}
async function paypalAccessToken() {
  if (!paypalConfigured()) throw new Error('PayPal credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.');
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.message || 'Unable to authenticate with PayPal.');
  return data.access_token;
}
async function createPaypalOrder(input = {}, req) {
  const amounts = orderAmounts(input.items);
  const token = await paypalAccessToken();
  const payload = { intent: 'CAPTURE', purchase_units: [{ reference_id: cleanText(input.referenceId, `muzikaz-${Date.now()}`), description: 'MUZIKAZ marketplace checkout', amount: { currency_code: amounts.currency, value: amounts.total.toFixed(2), breakdown: { item_total: { currency_code: amounts.currency, value: amounts.subtotal.toFixed(2) }, shipping: { currency_code: amounts.currency, value: amounts.shipping.toFixed(2) }, tax_total: { currency_code: amounts.currency, value: amounts.tax.toFixed(2) } } }, items: amounts.items.map((item) => ({ name: item.name, sku: item.sku || undefined, quantity: String(item.quantity), unit_amount: { currency_code: amounts.currency, value: item.unit_amount.toFixed(2) } })) }] };
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Unable to create PayPal order.');
  const records = await readOrders();
  const record = { id: data.id, provider: 'paypal', status: data.status, intent: data.intent, payerEmail: cleanText(input.email, ''), customerName: cleanText(input.name, ''), ownerId: user(req).id, amounts, paypal: data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  records.unshift(record); await writeOrders(records); return record;
}
async function capturePaypalOrder(orderId, req) {
  if (!orderId) throw new Error('PayPal order id is required.');
  const token = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Unable to capture PayPal order.');
  const records = await readOrders();
  const index = records.findIndex((order) => order.id === orderId);
  const now = new Date().toISOString();
  const record = { ...(index >= 0 ? records[index] : { id: orderId, provider: 'paypal', ownerId: user(req).id, createdAt: now }), status: data.status, paypal: data, capturedAt: now, updatedAt: now };
  if (index >= 0) records[index] = record; else records.unshift(record);
  await writeOrders(records); return record;
}

async function readAssets() { await ensureStorage(); return JSON.parse(await readFile(assetsFile, 'utf8')); }
async function readModels() { await ensureStorage(); return JSON.parse(await readFile(modelsFile, 'utf8')); }
async function writeModels(records) { await ensureStorage(); await writeFile(modelsFile, JSON.stringify(records, null, 2)); }
async function writeAssets(records) { await ensureStorage(); await writeFile(assetsFile, JSON.stringify(records, null, 2)); }
function user(req) { return { id: cleanText(req.headers['x-user-id'], 'demo-user'), role: cleanText(req.headers['x-user-role'], 'user'), name: cleanText(req.headers['x-user-name'], 'MUZIKAZ Creator') }; }
function isPublicAsset(asset) { return asset.visibility === 'public' || asset.status === 'published' || asset.status === 'approved'; }
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
function clampNumber(value, min, max, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function roomId(position) { if (position.z < 3.2 && position.x < -1.6) return 'front-west'; if (position.z < 3.2) return 'front-hall'; if (position.z < 5.9) return 'middle-gallery'; return position.x < 1.1 ? 'back-lounge' : 'back-east'; }
function sanitizeRecord(input, ownerId) { const position = { x: clampNumber(input?.position?.x, -4.65, 4.65), y: clampNumber(input?.position?.y, -.6, 2, 0), z: clampNumber(input?.position?.z, .35, 8.65, 2.5) }; const scale = clampNumber(input?.scale?.x, .35, 2.4, 1); const avatarUrl = String(input?.avatarUrl || 'logo_symbol_crop_2x_transparent.png'); if (/^(javascript|data:text\/html)/i.test(avatarUrl)) throw new Error('Unsafe avatar URL'); return { id: cleanText(input?.id, randomUUID()), houseId: 'ioncore-house', ownerId, username: cleanText(input?.username, 'Guest'), avatarName: cleanText(input?.avatarName, 'Shared avatar'), avatarType: cleanText(input?.avatarType, 'image-sprite'), avatarUrl, thumbnailUrl: cleanText(input?.thumbnailUrl, ''), message: cleanText(input?.message, ''), position, rotation: { x: 0, y: 0, z: clampNumber(input?.rotation?.z, -Math.PI * 4, Math.PI * 4) }, scale: { x: scale, y: scale, z: scale }, roomId: roomId(position), visibility: 'public', createdAt: input?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; }
function broadcast(type, data) { const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; for (const client of clients) client.write(payload); }
function corsHeaders(extra = {}) { return { 'Access-Control-Allow-Origin': process.env.MUZIKAZ_CORS_ORIGIN || 'https://muzikazmodelmarket.onrender.com', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MUZIKAZ-Session, X-User-Id, X-User-Role, X-User-Name', 'Cross-Origin-Resource-Policy': 'cross-origin', ...extra }; }
function sendJson(res, status, data) { res.writeHead(status, corsHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })); res.end(JSON.stringify(data)); }
function isPublicAssetUrl(value) { try { const url = new URL(value, 'http://localhost'); return url.protocol === 'https:' || url.pathname.startsWith('/uploads/') || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)); } catch { return false; } }
function modelRecord(input = {}) { const now = new Date().toISOString(); const modelUrl = String(input.modelUrl || input.model_url || input.fileUrl || '').trim(); if (!isPublicAssetUrl(modelUrl)) throw new Error('A public HTTPS model URL is required'); return { id: cleanText(input.id, randomUUID()), title: cleanText(input.title || input.name || input.avatarName, 'Shared Avatar'), name: cleanText(input.name || input.title || input.avatarName, 'Shared Avatar'), creatorName: cleanText(input.creatorName || input.owner || input.username || input.creator, 'MUZIKAZ Creator'), owner: cleanText(input.owner || input.creatorName || input.username || input.creator, 'MUZIKAZ Creator'), description: cleanText(input.description || input.message, ''), category: cleanText(input.category, 'Published'), modelType: cleanText(input.modelType || input.format || input.fileType, extname(modelUrl).replace('.', '').toLowerCase()), format: cleanText(input.format || input.modelType || input.fileType, extname(modelUrl).replace('.', '').toLowerCase()), modelUrl, iosModelUrl: cleanText(input.iosModelUrl || input.ios_model_url, ''), thumbnailUrl: cleanText(input.thumbnailUrl || input.thumbnail_url || input.previewUrl, ''), publishedAt: input.publishedAt || input.published_at || now, updatedAt: now, visibility: 'public', status: input.status === 'private' ? 'private' : 'published', featured: Boolean(input.featured), scale: Number(input.scale) || 1, rotation: input.rotation || null, environment: cleanText(input.environment, '') }; }
async function bodyJson(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
async function uploadFile(req) { const type = String(req.headers['content-type'] || ''); const match = type.match(/boundary=(.+)$/); if (!match) throw new Error('Missing multipart boundary'); const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > maxUploadBytes + 2000) throw new Error('Upload too large'); chunks.push(chunk); } const body = Buffer.concat(chunks); const marker = Buffer.from('\r\n\r\n'); const start = body.indexOf(marker); const endBoundary = Buffer.from('\r\n--' + match[1]); const end = body.lastIndexOf(endBoundary); if (start < 0 || end < 0) throw new Error('Invalid multipart upload'); const header = body.slice(0, start).toString('utf8'); const contentType = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1]; const original = (header.match(/filename="([^"]+)"/i) || [])[1] || 'avatar.png'; if (!allowedUploadTypes.has(contentType)) throw new Error('Unsupported avatar type'); const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' })[contentType]; const safeName = randomUUID() + '-' + original.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80).replace(/\.[^.]+$/, '') + ext; const file = body.slice(start + marker.length, end); if (file.length > maxUploadBytes) throw new Error('Upload too large'); await mkdir(uploadDir, { recursive: true }); await writeFile(join(uploadDir, safeName), file); return { avatarUrl: '/uploads/avatars/' + safeName, thumbnailUrl: '/uploads/avatars/' + safeName };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders()); res.end(); return; }
  try {



    if (url.pathname === '/api/paypal/config' && req.method === 'GET') return sendJson(res, 200, assetResponse({ clientId: process.env.PAYPAL_CLIENT_ID || '', environment: process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox', currency: 'USD', configured: paypalConfigured() }));
    if (url.pathname === '/api/paypal/orders' && req.method === 'GET') { const actor = user(req); const orders = await readOrders(); return sendJson(res, 200, assetResponse(actor.role === 'admin' ? orders : orders.filter((order) => order.ownerId === actor.id))); }
    if (url.pathname === '/api/paypal/orders' && req.method === 'POST') return sendJson(res, 201, assetResponse(await createPaypalOrder(await bodyJson(req), req)));
    const paypalCapture = url.pathname.match(/^\/api\/paypal\/orders\/([^/]+)\/capture$/);
    if (paypalCapture && req.method === 'POST') return sendJson(res, 200, assetResponse(await capturePaypalOrder(decodeURIComponent(paypalCapture[1]), req)));

    if (url.pathname === '/api/environments' && req.method === 'GET') return sendJson(res, 200, assetResponse(await combinedEnvironments()));
    if (url.pathname === '/api/environments' && req.method === 'POST') { const records = await readUploadedEnvironments(); const record = environmentRecord(await bodyJson(req)); if (!record.modelUrl.startsWith('/uploads/environments/')) throw new Error('Uploaded environment records must point to /uploads/environments/.'); records.unshift(record); await writeUploadedEnvironments(records); return sendJson(res, 201, assetResponse(record)); }
    if (url.pathname === '/api/environments/upload' && req.method === 'POST') return sendJson(res, 201, assetResponse(await saveEnvironmentUpload(req)));
    const environmentItem = url.pathname.match(/^\/api\/environments\/([^/]+)$/);
    if (environmentItem && req.method === 'GET') { const id = decodeURIComponent(environmentItem[1]); const record = (await combinedEnvironments()).find((env) => env.id === id || env.aliases?.includes(id)); return record ? sendJson(res, 200, assetResponse(record)) : sendJson(res, 404, { success: false, message: 'Environment not found' }); }
    if (environmentItem && req.method === 'PATCH') { const id = decodeURIComponent(environmentItem[1]); const records = await readUploadedEnvironments(); const index = records.findIndex((env) => env.id === id); if (index < 0) return sendJson(res, 404, { success: false, message: 'Uploaded environment not found' }); records[index] = { ...records[index], ...environmentRecord({ ...records[index], ...(await bodyJson(req)) }, records[index]), id: records[index].id, modelUrl: records[index].modelUrl, source: 'uploaded', updatedAt: new Date().toISOString() }; await writeUploadedEnvironments(records); return sendJson(res, 200, assetResponse(records[index])); }
    if (environmentItem && req.method === 'DELETE') { const id = decodeURIComponent(environmentItem[1]); const records = await readUploadedEnvironments(); const record = records.find((env) => env.id === id); if (!record) return sendJson(res, 404, { success: false, message: 'Uploaded environment not found' }); await writeUploadedEnvironments(records.filter((env) => env.id !== id)); if (record.storedFilename) await unlink(join(environmentUploadDir, record.storedFilename)).catch(() => {}); return sendJson(res, 200, assetResponse({ id })); }

    if ((url.pathname === '/api/models' || url.pathname === '/api/avatars/published') && req.method === 'GET') { const models = (await readModels()).filter((m) => m.status === 'published' || m.visibility === 'public').sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))); return sendJson(res, 200, assetResponse(models)); }


    if ((url.pathname === '/api/models' || url.pathname === '/api/avatars/published') && req.method === 'POST') { const records = await readModels(); const record = modelRecord(await bodyJson(req)); const index = records.findIndex((m) => m.id === record.id); if (index >= 0) records[index] = { ...records[index], ...record }; else records.unshift(record); await writeModels(records); broadcast('avatar:published', record); return sendJson(res, 201, assetResponse(record)); }
    if (url.pathname === '/api/assets/upload' && req.method === 'POST') return sendJson(res, 201, assetResponse(await saveAssetUpload(req, false)));
    if (url.pathname === '/api/models/upload' && req.method === 'POST') return sendJson(res, 201, assetResponse(await saveAssetUpload(req, true)));
    if (url.pathname === '/api/assets/mine' && req.method === 'GET') { const actor = user(req); const assets = await readAssets(); return sendJson(res, 200, assetResponse(actor.role === 'admin' ? assets : assets.filter((a) => a.ownerId === actor.id || isPublicAsset(a)))); }
    if (url.pathname === '/api/assets/public' && req.method === 'GET') { const assets = await readAssets(); return sendJson(res, 200, assetResponse(assets.filter(isPublicAsset))); }
    if (url.pathname === '/api/admin/analytics' && req.method === 'GET') { const assets = await readAssets(); return sendJson(res, 200, assetResponse({ totalOrders: 128, inventoryUnits: 842, conversionRate: '7.4%', totalUploads: assets.length, pendingApprovals: assets.filter((a) => a.status === 'pending_review').length, storageUsage: assets.reduce((n, a) => n + (a.fileSize || 0), 0) })); }
    const assetAction = url.pathname.match(/^\/api\/assets\/([^/]+)\/([^/]+)$/);
    if (assetAction && req.method === 'POST') { const [ , id, action ] = assetAction; const assets = await readAssets(); const asset = assets.find((a) => a.id === id); if (!asset) return sendJson(res, 404, { success: false, message: 'Asset not found' }); const body = await bodyJson(req).catch(() => ({})); const now = new Date().toISOString(); if (action === 'approve') { asset.status = 'approved'; asset.approvedAt = now; } else if (action === 'reject') { asset.status = 'rejected'; asset.moderatorNote = cleanText(body.reason, 'Changes required'); } else if (action === 'publish') { asset.status = 'published'; asset.visibility = 'public'; asset.publishedAt = now; } else if (action === 'unpublish') { asset.visibility = 'private'; } else if (action === 'archive') { asset.status = 'archived'; } else if (action === 'assign-model') { asset.relatedModelId = cleanText(body.modelId, asset.relatedModelId); asset.publishLocation = cleanText(body.displayType, asset.publishLocation); } else { return sendJson(res, 400, { success: false, message: 'Unknown action' }); } asset.updatedAt = now; await writeAssets(assets); return sendJson(res, 200, assetResponse(asset)); }
    const assetItem = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (assetItem && req.method === 'PATCH') { const assets = await readAssets(); const asset = assets.find((a) => a.id === assetItem[1]); if (!asset) return sendJson(res, 404, { success: false, message: 'Asset not found' }); Object.assign(asset, await bodyJson(req)); asset.updatedAt = new Date().toISOString(); await writeAssets(assets); return sendJson(res, 200, assetResponse(asset)); }
    if (assetItem && req.method === 'DELETE') { const assets = await readAssets(); await writeAssets(assets.filter((a) => a.id !== assetItem[1])); return sendJson(res, 200, assetResponse({ id: assetItem[1] })); }
    if (url.pathname === '/api/uploads/avatar' && req.method === 'POST') return sendJson(res, 201, await uploadFile(req));
    if (url.pathname === '/api/houses/ioncore-house/avatars' && req.method === 'GET') return sendJson(res, 200, await readAvatars());
    if (url.pathname === '/api/houses/ioncore-house/avatars' && req.method === 'POST') { const owner = session(req); const record = sanitizeRecord(await bodyJson(req), owner); const records = await readAvatars(); records.push(record); await writeAvatars(records); broadcast('avatar-created', record); return sendJson(res, 201, record); }
    const avatarItem = url.pathname.match(/^\/api\/houses\/ioncore-house\/avatars\/([^/]+)$/);
    if (avatarItem && req.method === 'PATCH') { const owner = session(req); const id = decodeURIComponent(avatarItem[1]); const records = await readAvatars(); const index = records.findIndex((item) => item.id === id); if (index < 0) return sendJson(res, 404, { error: 'Not found' }); if (records[index].ownerId !== owner && process.env.MUZIKAZ_ALLOW_MOD_DELETE !== 'true') return sendJson(res, 403, { error: 'Forbidden' }); const record = sanitizeRecord({ ...records[index], ...(await bodyJson(req)), id: records[index].id, avatarUrl: records[index].avatarUrl, createdAt: records[index].createdAt }, owner); records[index] = record; await writeAvatars(records); broadcast('avatar-updated', record); return sendJson(res, 200, record); }
    if (avatarItem && req.method === 'DELETE') { const owner = session(req); const id = decodeURIComponent(avatarItem[1]); const records = await readAvatars(); const record = records.find((item) => item.id === id); if (!record) return sendJson(res, 404, { error: 'Not found' }); if (record.ownerId !== owner && process.env.MUZIKAZ_ALLOW_MOD_DELETE !== 'true') return sendJson(res, 403, { error: 'Forbidden' }); await writeAvatars(records.filter((item) => item.id !== id)); broadcast('avatar-deleted', { id }); return sendJson(res, 200, { id }); }
    if (url.pathname === '/api/houses/ioncore-house/events' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.write('\n'); clients.add(res); req.on('close', () => clients.delete(res)); return; }
    if (url.pathname === '/api/houses/ioncore-house/presence' && req.method === 'POST') { const id = session(req); const body = await bodyJson(req).catch(() => ({})); presence.set(id, { sessionId: id, joinedAt: presence.get(id)?.joinedAt || new Date().toISOString(), lastActiveAt: new Date().toISOString(), roomId: cleanText(body.roomId, 'unknown') }); const data = { count: presence.size, users: [...presence.values()] }; broadcast('house-presence-updated', data); return sendJson(res, 200, data); }
    if (url.pathname === '/api/houses/ioncore-house/presence/leave' && req.method === 'POST') { presence.delete(session(req)); broadcast('house-presence-updated', { count: presence.size }); return sendJson(res, 200, { ok: true }); }
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
  } catch (error) { if (!res.headersSent) sendJson(res, url.pathname.startsWith('/api/') ? 400 : 404, { error: error.message || 'Not found' }); }
}).listen(port, () => console.log(`MUZIKAZ shared house server running on http://localhost:${port}`));
