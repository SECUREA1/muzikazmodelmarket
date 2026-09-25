import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const publicRoot = resolve(root, 'public');
const output = resolve(publicRoot, 'models/game-asset-registry.json');
const manifests = ['public/models/backpack-assets.json', 'public/models/glb-models.json', 'public/models/toolkit-assets.json'];
const webPath = path => `/${relative(root, path).split(sep).join('/')}`;
const id = value => String(value).toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}

const kindFor = value => {
  const text = String(value || '').toLowerCase();
  if (/land|terrain|island|world|map/.test(text)) return ['terrain', 'terrain'];
  if (/environment|room/.test(text)) return ['environment', 'environment'];
  if (/vehicle|aircraft|engine|quad/.test(text)) return ['vehicle', 'vehicles'];
  if (/wearable|armor|hat|helmet/.test(text)) return ['wearable', 'wearables'];
  if (/avatar|character/.test(text)) return ['avatar', 'characters'];
  if (/pet|creature|companion/.test(text)) return ['creature', 'creatures'];
  return ['prop', 'props'];
};
const recipeFor = value => {
  const text = String(value).toLowerCase();
  if (/dynamite/.test(text)) return 'dynamite-bundle';
  if (/bottle|potion/.test(text)) return 'bottle';
  if (/carrot/.test(text)) return 'carrot';
  if (/bone/.test(text)) return 'bone';
  if (/fish/.test(text)) return 'fish';
  if (/cheese/.test(text)) return 'cheese';
  if (/map|floor|land|world/.test(text)) return 'terrain-slab';
  return 'extruded-svg';
};
const compatibility = type => ({
  inventoryCompatible: !['terrain', 'environment'].includes(type), wearableCompatible: type === 'wearable',
  vehicleCompatible: type === 'vehicle', mapCompatible: true, environmentCompatible: true,
  runtimeCompatible: true, singlePlayerCompatible: true, multiplayerCompatible: true
});
const metadata = (raw, source, modelPath, thumbnail, generated = false) => {
  const [assetType, category] = kindFor(`${raw.type || raw.assetType || ''} ${raw.name || ''} ${modelPath}`);
  const wearable = assetType === 'wearable';
  return {
    assetId: id(raw.id || raw.assetId || modelPath), name: raw.name || raw.title || id(modelPath).replaceAll('-', ' '),
    category, assetType, source, generated, modelPath: modelPath || '', thumbnail: thumbnail || '',
    generator: generated ? recipeFor(`${raw.name || ''} ${thumbnail}`) : null,
    defaultTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [Number(raw.scale) || 1, Number(raw.scale) || 1, Number(raw.scale) || 1] },
    materials: { editable: generated, color: raw.treatColor || null, preserveOriginal: !generated },
    collision: { enabled: true, shape: 'mesh', interaction: true }, physics: { enabled: /throw|dynamite/i.test(`${raw.name} ${raw.description}`), mass: 1 },
    animations: [], interactions: raw.consumable ? ['hold', 'use', 'throw'] : assetType === 'vehicle' ? ['enter', 'drive', 'exit'] : wearable ? ['equip', 'wear'] : ['place', 'interact'],
    attachment: wearable ? { socket: 'torso', localPosition: [0, 0, 0], localRotation: [0, 0, 0], localScale: [1, 1, 1] } : null,
    ...compatibility(assetType)
  };
};

const files = await walk(publicRoot);
const actual = new Set(files.map(webPath));
const records = new Map();
const warnings = [];
for (const manifest of manifests) {
  const json = JSON.parse(await readFile(resolve(root, manifest), 'utf8'));
  for (const raw of (Array.isArray(json) ? json : json.assets || json.models || [])) {
    if (raw.buildAssetId) continue; // Already registered by the native procedural Builder Pack.
    if (manifest.endsWith('toolkit-assets.json') && /\/builder-pack\/|\/backpack\//i.test(raw.thumbnailUrl || '')) continue; // Artwork for an asset already represented by its native manifest.
    const path = raw.modelUrl || raw.modelPath || '';
    const thumb = raw.thumbnailUrl || raw.thumbnail || '';
    if (path && actual.has(path.startsWith('/') ? path : `/${path}`)) {
      const item = metadata(raw, manifest, path.startsWith('/') ? path : `/${path}`, thumb, false);
      records.set(item.assetId, item);
    } else if (path) warnings.push({ level: 'error', code: 'BROKEN_MODEL_PATH', asset: raw.id || raw.name, path });
    else if (thumb && actual.has(thumb.startsWith('/') ? thumb : `/${thumb}`) && !/ui|logo/i.test(`${raw.type} ${raw.name}`)) {
      const item = metadata(raw, manifest, '', thumb.startsWith('/') ? thumb : `/${thumb}`, true);
      records.set(item.assetId, item);
      warnings.push({ level: 'info', code: 'GENERATED_REPLACEMENT', asset: item.assetId, generator: item.generator });
    }
  }
}
for (const path of files.filter(path => /\.(glb|gltf)$/i.test(path))) {
  const modelPath = webPath(path), assetId = id(relative(publicRoot, path));
  if ([...records.values()].some(item => item.modelPath === modelPath)) continue;
  const item = metadata({ id: assetId, name: path.split(sep).at(-1).replace(/\.(glb|gltf)$/i, '').replaceAll('_', ' ') }, 'project-discovery', modelPath, '', false);
  records.set(item.assetId, item);
}
const registry = { schemaVersion: 1, discoveryRoots: ['/public/models', '/public/images', '/public/assets'], assets: [...records.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)), audit: { assetCount: records.size, generatedCount: [...records.values()].filter(item => item.generated).length, warnings } };
await writeFile(output, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Registered ${registry.audit.assetCount} assets (${registry.audit.generatedCount} generated recipes); ${warnings.filter(item => item.level === 'error').length} broken paths.`);
