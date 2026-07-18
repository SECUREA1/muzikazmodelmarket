import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js/+esm';
import { KTX2Loader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js/+esm';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js/+esm';
import { Octree } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Octree.js/+esm';
import { applyWorldQuality } from './environment-quality.js';
import { buildCollision, resolveSafeSpawn } from './environment-collision.js';

const gltfCache = new Map();

export function warmEnvironmentModels(environments = [], limit = 2) {
  environments.slice(0, limit).flatMap((env) => env.modelUrls?.length ? env.modelUrls : [env.modelUrl]).filter(Boolean).forEach((url) => {
    if (gltfCache.has(url)) return;
    fetch(url, { cache: 'force-cache' }).catch(() => {});
  });
}

export class EnvironmentLoader {
  constructor({ scene, renderer, onProgress = () => {} }) {
    this.scene = scene; this.renderer = renderer; this.onProgress = onProgress; this.token = 0; this.world = null; this.mixers = []; this.meshes = []; this.octree = new Octree(); this.bounds = new THREE.Box3(); this.activeEnvironment = null; this.baseScale = 1; this.spaceScale = 1;
    this.loader = new GLTFLoader();
    const draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); this.loader.setDRACOLoader(draco);
    const ktx2 = new KTX2Loader(); ktx2.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/'); ktx2.detectSupport(renderer); this.loader.setKTX2Loader(ktx2);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }
  disposeMaterial(material) { if (!material) return; for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose?.(); }
  unload() { this.mixers.forEach((m) => m.stopAllAction()); this.mixers = []; this.meshes = []; if (this.world) { this.scene.remove(this.world); this.world.traverse((o) => { o.geometry?.dispose?.(); Array.isArray(o.material) ? o.material.forEach((m) => this.disposeMaterial(m)) : this.disposeMaterial(o.material); }); } this.world = null; this.octree = new Octree(); }
  loadOne(url, index, count) {
    if (!gltfCache.has(url)) gltfCache.set(url, new Promise((resolve, reject) => this.loader.load(url, resolve, (e) => this.onProgress(((index + (e.total ? e.loaded / e.total : 0.35)) / count) * 100), reject)));
    return gltfCache.get(url);
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
      for (let i = 0; i < urls.length; i += 1) {
        const gltf = await this.loadOne(urls[i], i, urls.length); if (token !== this.token) return null;
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
