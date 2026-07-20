import { fetchEnvironmentList, deleteEnvironment } from './environment-api.js';

export class EnvironmentRegistry {
  constructor() { this.environments = []; }
  async refresh() { this.environments = normalizeEnvironmentList(await fetchEnvironmentList()); return this.environments; }
  all() { return this.environments; }
  find(id) { return this.environments.find((env) => env.id === id || env.aliases?.includes(id)); }
  async delete(id) { await deleteEnvironment(id); return this.refresh(); }
}

export function normalizeEnvironmentList(records) {
  return records.map((record) => {
    const modelUrls = Array.isArray(record.modelUrls) && record.modelUrls.length ? record.modelUrls : [record.modelUrl].filter(Boolean);
    return {
      ...record,
      modelUrls,
      modelUrl: record.modelUrl || modelUrls[0] || '',
      spawn: { x: 0, y: 1, z: 2, rotationY: 0, ...(record.spawn || {}) },
      rotation: { x: 0, y: 0, z: 0, ...(record.rotation || {}) },
      scale: Number(record.scale) || 1,
      // Worlds are authored at very different unit sizes. Keep a map's intended
      // walkable scale with its metadata instead of carrying the previous map's
      // scale into it (the Sheep Base is authored as a one-unit asset).
      spaceScale: Math.min(100, Math.max(0.1, Number(record.spaceScale) || 1)),
      collisionMode: record.collisionMode || 'auto',
      visibility: record.visibility || 'public',
      source: record.source || 'repository'
    };
  });
}
