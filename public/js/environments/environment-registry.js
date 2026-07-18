import { fetchEnvironmentList, deleteEnvironment } from './environment-api.js';

function normalizeMapUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  // Repository paths must be site-root paths so the game works from every
  // page, including nested routes and the static dist build.
  return url.startsWith('/') || /^(https?:|blob:|data:)/i.test(url) ? url : `/${url.replace(/^\.\//, '')}`;
}

export class EnvironmentRegistry {
  constructor() { this.environments = []; }
  async refresh() { this.environments = normalizeEnvironmentList(await fetchEnvironmentList()); return this.environments; }
  all() { return this.environments; }
  find(id) { return this.environments.find((env) => env.id === id || env.aliases?.includes(id)); }
  async delete(id) { await deleteEnvironment(id); return this.refresh(); }
}

export function normalizeEnvironmentList(records) {
  return records.map((record) => {
    const modelUrls = (Array.isArray(record.modelUrls) && record.modelUrls.length ? record.modelUrls : [record.modelUrl])
      .map(normalizeMapUrl)
      .filter(Boolean);
    return {
      ...record,
      modelUrls,
      modelUrl: record.modelUrl || modelUrls[0] || '',
      spawn: { x: 0, y: 1, z: 2, rotationY: 0, ...(record.spawn || {}) },
      rotation: { x: 0, y: 0, z: 0, ...(record.rotation || {}) },
      scale: Number(record.scale) || 1,
      collisionMode: record.collisionMode || 'auto',
      visibility: record.visibility || 'public',
      source: record.source || 'repository'
    };
  });
}
