import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { Octree } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Octree.js/+esm';
import { applyWorldQuality } from './environment-quality.js';
import { buildCollision, resolveSafeSpawn } from './environment-collision.js';

const WORLD_LOAD_TIMEOUT_MS = 120_000;

// Fetch bundled worlds as soon as their manifest is available. This fills the
// browser cache while the WebGL scene is being created, so opening the game
// does not wait on each GLB download in sequence.
// Loading is deliberately demand-driven. Fetching both 9–12 MB floors on a
// phone competes with the startup world and used to make the game appear stuck.
export function warmEnvironmentModels() {}

async function fetchGlb(url, onProgress) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), WORLD_LOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
    const contentType = response.headers.get('content-type') || 'unknown';
    if (!response.ok) throw new Error(`Environment request failed: ${url} (HTTP ${response.status}, ${contentType})`);
    if (/text\/html/i.test(contentType)) throw new Error(`Environment response is HTML: ${url} (HTTP ${response.status}, ${contentType})`);
    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body?.getReader(); let loaded = 0; const chunks = [];
    if (reader) { for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); loaded += value.byteLength; onProgress(loaded, total); } }
    else { const value = new Uint8Array(await response.arrayBuffer()); chunks.push(value); loaded = value.byteLength; onProgress(loaded, total); }
    const bytes = new Uint8Array(loaded); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 80)));
    if (!bytes.length) throw new Error(`Environment payload is empty: ${url} (HTTP ${response.status}, ${contentType})`);
    if (/^version https:\/\/git-lfs/i.test(prefix)) throw new Error(`Environment is a Git LFS pointer, not a GLB: ${url}`);
    if (prefix.trimStart().startsWith('<')) throw new Error(`Environment payload appears to be HTML: ${url} (HTTP ${response.status}, ${contentType})`);
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'glTF') throw new Error(`Environment is not a binary GLB: ${url} (HTTP ${response.status}, ${contentType})`);
    return bytes.buffer;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Environment timed out after ${WORLD_LOAD_TIMEOUT_MS / 1000}s: ${url}`);
    throw error;
  } finally { window.clearTimeout(timer); }
}

export class EnvironmentLoader {
  constructor({ scene, renderer, onProgress = () => {} }) {
    this.scene = scene; this.renderer = renderer; this.onProgress = onProgress; this.token = 0; this.world = null; this.mixers = []; this.meshes = []; this.octree = new Octree(); this.bounds = new THREE.Box3(); this.activeEnvironment = null; this.baseScale = 1; this.spaceScale = 1;
    this.loader = new GLTFLoader();
    // Decoders are optional. Do not make ordinary, uncompressed bundled GLBs
    // depend on remote DRACO/KTX2 resources.
  }
  disposeMaterial(material) { if (!material) return; for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose?.(); }
  unload() { this.mixers.forEach((m) => m.stopAllAction()); this.mixers = []; this.meshes = []; if (this.world) { this.scene.remove(this.world); this.world.traverse((o) => { o.geometry?.dispose?.(); Array.isArray(o.material) ? o.material.forEach((m) => this.disposeMaterial(m)) : this.disposeMaterial(o.material); }); } this.world = null; this.octree = new Octree(); }
  loadOne(url, index, count) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        callback(value);
      };
      const timeout = window.setTimeout(() => finish(reject, new Error(`Timed out loading environment file: ${url}`)), WORLD_LOAD_TIMEOUT_MS + 1000);
      fetchGlb(url, (loaded, total) => this.onProgress(((index + (total ? loaded / total : 0)) / count) * 100))
        .then((buffer) => this.loader.parse(buffer, '', (gltf) => finish(resolve, gltf), (error) => finish(reject, error)))
        .catch((error) => finish(reject, error));
    });
  }

  setSpaceScale(scale) {
    if (!this.world) return null;
    const nextScale = THREE.MathUtils.clamp(Number(scale) || 1, 0.1, 10);
    this.spaceScale = nextScale;
    this.world.scale.setScalar(this.baseScale * this.spaceScale);
    this.world.updateMatrixWorld(true);
    const collision = buildCollision(this.world, this.activeEnvironment?.collisionMode);
    this.meshes = collision.visibleMeshes;
    this.octree = collision.octree;
    this.bounds = new THREE.Box3().setFromObject(this.world);
    return { scale: this.spaceScale, collision, bounds: this.bounds };
  }
  async load(environment) {
    const token = ++this.token; const urls = environment.modelUrls?.length ? environment.modelUrls : [environment.modelUrl];
    const nextWorld = new THREE.Group(); nextWorld.name = `WORLD_${environment.id}`; this.baseScale = Number(environment.scale) || 1; this.spaceScale = Number(environment.spaceScale) || 1; nextWorld.userData.baseScale = this.baseScale; nextWorld.scale.setScalar(this.baseScale * this.spaceScale); nextWorld.rotation.set(environment.rotation.x || 0, environment.rotation.y || 0, environment.rotation.z || 0);
    const nextMixers = [];
    try {
      // Independent GLBs in a composite map load concurrently, making the full
      // house ready at the speed of its slowest asset instead of their total.
      const gltfs = await Promise.all(urls.map((url, index) => this.loadOne(url, index, urls.length)));
      if (token !== this.token) return null;
      for (let i = 0; i < gltfs.length; i += 1) {
        const gltf = gltfs[i];
        gltf.scene.name = `GLB_${environment.id}_${i + 1}`; nextWorld.add(gltf.scene);
        if (gltf.animations?.length) { const mixer = new THREE.AnimationMixer(gltf.scene); gltf.animations.forEach((clip) => mixer.clipAction(clip).play()); nextMixers.push(mixer); }
      }
      nextWorld.updateMatrixWorld(true);
      const quality = applyWorldQuality(nextWorld, this.renderer);
      const collision = buildCollision(nextWorld, environment.collisionMode);
      if (!collision.visibleMeshes.length) throw new Error('Missing meshes: the GLB loaded, but no renderable world meshes were found.');
      const spawn = resolveSafeSpawn(nextWorld, collision.visibleMeshes, environment.spawn);
      this.unload(); this.world = nextWorld; this.activeEnvironment = environment; this.mixers = nextMixers; this.meshes = collision.visibleMeshes; this.octree = collision.octree; this.bounds = spawn.bounds; this.scene.add(nextWorld); this.onProgress(100);
      return { world: nextWorld, mixers: nextMixers, meshes: collision.visibleMeshes, octree: collision.octree, spawn, quality, collision };
    } catch (error) { nextMixers.forEach((m) => m.stopAllAction()); nextWorld.traverse((o) => { o.geometry?.dispose?.(); Array.isArray(o.material) ? o.material.forEach((m) => this.disposeMaterial(m)) : this.disposeMaterial(o.material); }); throw error; }
  }
}
