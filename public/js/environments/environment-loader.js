import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js/+esm';
import { KTX2Loader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js/+esm';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js/+esm';
import { Octree } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Octree.js/+esm';
import { applyWorldQuality } from './environment-quality.js';
import { buildCollision, resolveSafeSpawn } from './environment-collision.js';

export class EnvironmentLoader {
  constructor({ scene, renderer, onProgress = () => {} }) {
    this.scene = scene; this.renderer = renderer; this.onProgress = onProgress; this.token = 0; this.world = null; this.mixers = []; this.meshes = []; this.collisionMeshes = []; this.floorMeshes = []; this.supplementalCollisionRoots = []; this.octree = new Octree(); this.bounds = new THREE.Box3(); this.activeEnvironment = null; this.baseScale = 1; this.spaceScale = 1;
    this.loader = new GLTFLoader();
    const draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); this.loader.setDRACOLoader(draco);
    const ktx2 = new KTX2Loader(); ktx2.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/'); ktx2.detectSupport(renderer); this.loader.setKTX2Loader(ktx2);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }
  disposeMaterial(material) { if (!material) return; for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose?.(); }
  unload() { this.mixers.forEach((m) => m.stopAllAction()); this.mixers = []; this.meshes = []; this.collisionMeshes = []; this.floorMeshes = []; this.supplementalCollisionRoots = []; if (this.world) { this.scene.remove(this.world); this.world.traverse((o) => { o.geometry?.dispose?.(); Array.isArray(o.material) ? o.material.forEach((m) => this.disposeMaterial(m)) : this.disposeMaterial(o.material); }); } this.world = null; this.octree = new Octree(); }
  loadOne(url, index, count) { return new Promise((resolve, reject) => this.loader.load(url, resolve, (e) => this.onProgress(((index + (e.total ? e.loaded / e.total : 0.35)) / count) * 100), reject)); }

  createBuilderLand(environment) {
    const built = environment.builderScene || {};
    const layout = built.layout || environment.layout || 'grand-floor';
    const meta = built.layoutMeta || environment.layoutMeta || {};
    const heightAt = (x, z) => {
      const ripple = .28 * Math.sin(x * .31) * Math.cos(z * .27);
      if (['grand-floor','vendor-street','creator-studios','market-square','railroad-world','skyport','desert-airfield','blacksite','cargo-yard','neon-arena','desert-outpost','mega-mall','office-tower','firing-range','movie-studio'].includes(layout)) return layout === 'grand-floor' ? 0 : ripple * .18;
      if (layout === 'loft') return ripple;
      if (layout === 'suite') return .16 * Math.sin(x * .45) + .1 * Math.cos(z * .35);
      if (layout === 'mountain-pass') return 1.2 + Math.sin(x * .18) * 1.5 + Math.cos(z * .22) * 1.1 - 2.2 * Math.exp(-(x * x) / 18);
      if (layout === 'crystal-cavern') return -.6 + Math.abs(Math.sin(x * .25) * Math.cos(z * .2)) * 1.25;
      if (layout === 'deep-mine') return -Math.min(3.2, Math.max(0, Math.floor((20 - Math.max(Math.abs(x), Math.abs(z))) / 4)) * .55) + ripple * .3;
      if (layout === 'sunrise-farm') return .35 * Math.sin(x * .18) + .22 * Math.cos(z * .2);
      if (layout === 'coastal-cliffs') return x > 5 ? -1.5 : 1.1 + Math.sin(z * .16) * .65 - Math.max(0, x + 7) * .055;
      if (layout === 'ancient-forest') return .45 * Math.sin(x * .2) + .4 * Math.cos(z * .17) + 1.25 * Math.exp(-(x * x + z * z) / 120);
      if (layout === 'neon-wetlands') return -.35 + Math.max(0, .7 * Math.sin(x * .22) * Math.cos(z * .25));
      if (layout === 'dune-sea') return .75 * Math.sin(x * .16) + .55 * Math.cos(z * .19) + .25 * Math.sin((x + z) * .3);
      return ripple + 1.1 * Math.exp(-(x * x + z * z) / 85);
    };
    const geometry = new THREE.PlaneGeometry(40, 40, 80, 80);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) positions.setZ(i, heightAt(positions.getX(i), -positions.getY(i)));
    positions.needsUpdate = true; geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: Number(meta.color) || 0x315b32, roughness:.95, metalness:0 }));
    terrain.name = `BUILDER_LAND_${layout}`; terrain.rotation.x = -Math.PI / 2; terrain.receiveShadow = true; terrain.userData.colliderShape = 'mesh';
    const root = new THREE.Group(); root.name = `PROCEDURAL_${environment.id}`; root.add(terrain); root.userData.proceduralLand = true; root.userData.layout = layout;
    return root;
  }

  setSpaceScale(scale) {
    if (!this.world) return null;
    const nextScale = THREE.MathUtils.clamp(Number(scale) || 1, 0.1, 100);
    this.spaceScale = nextScale;
    this.world.scale.setScalar(this.baseScale * this.spaceScale);
    this.world.updateMatrixWorld(true);
    const collision = buildCollision(this.world, this.activeEnvironment?.collisionMode, this.supplementalCollisionRoots);
    this.meshes = collision.visibleMeshes;
    this.collisionMeshes = collision.collisionMeshes;
    this.floorMeshes = collision.floorMeshes;
    this.octree = collision.octree;
    this.bounds = new THREE.Box3().setFromObject(this.world);
    return { scale: this.spaceScale, collision, bounds: this.bounds };
  }
  setSupplementalCollisionRoots(roots = []) {
    this.supplementalCollisionRoots = roots.filter(Boolean);
    if (!this.world) return null;
    const collision = buildCollision(this.world, this.activeEnvironment?.collisionMode, this.supplementalCollisionRoots);
    this.meshes = collision.visibleMeshes; this.collisionMeshes = collision.collisionMeshes; this.floorMeshes = collision.floorMeshes; this.octree = collision.octree;
    return collision;
  }
  async load(environment) {
    const token = ++this.token; const builderLand = Boolean(environment.builderScene || environment.proceduralLand); const urls = builderLand ? [] : (environment.modelUrls?.length ? environment.modelUrls : [environment.modelUrl].filter(Boolean));
    const nextWorld = new THREE.Group(); nextWorld.name = `WORLD_${environment.id}`; this.baseScale = Number(environment.scale) || 1; this.spaceScale = Number(environment.spaceScale) || 1; nextWorld.userData.baseScale = this.baseScale; nextWorld.scale.setScalar(this.baseScale * this.spaceScale); nextWorld.rotation.set(environment.rotation.x || 0, environment.rotation.y || 0, environment.rotation.z || 0);
    const nextMixers = [];
    try {
      if (builderLand) nextWorld.add(this.createBuilderLand(environment));
      else if (!urls.length) throw new Error('This environment has neither a 3D model nor a playable builder land definition.');
      for (let i = 0; i < urls.length; i += 1) {
        const gltf = await this.loadOne(urls[i], i, urls.length); if (token !== this.token) return null;
        gltf.scene.name = `GLB_${environment.id}_${i + 1}`; nextWorld.add(gltf.scene);
        if (gltf.animations?.length) { const mixer = new THREE.AnimationMixer(gltf.scene); gltf.animations.forEach((clip) => mixer.clipAction(clip).play()); nextMixers.push(mixer); }
      }
      nextWorld.updateMatrixWorld(true);
      const authoredBounds = new THREE.Box3().setFromObject(nextWorld);
      const authoredSize = authoredBounds.getSize(new THREE.Vector3());
      const authoredFootprint = Math.max(authoredSize.x, authoredSize.z);
      const playableSize = Number(environment.playableSize);
      if (playableSize > 0 && authoredFootprint > 0) {
        const normalization = THREE.MathUtils.clamp(playableSize / authoredFootprint, 0.01, 100);
        this.spaceScale *= normalization;
        nextWorld.scale.setScalar(this.baseScale * this.spaceScale);
        nextWorld.userData.playableSize = playableSize;
        nextWorld.userData.authoredFootprint = authoredFootprint;
        nextWorld.updateMatrixWorld(true);
      }
      const quality = applyWorldQuality(nextWorld, this.renderer);
      const collision = buildCollision(nextWorld, environment.collisionMode);
      if (!collision.visibleMeshes.length) throw new Error('Missing meshes: the environment loaded, but no renderable world meshes were found.');
      const spawn = resolveSafeSpawn(nextWorld, collision.floorMeshes, environment.spawn);
      this.unload(); this.world = nextWorld; this.activeEnvironment = environment; this.mixers = nextMixers; this.meshes = collision.visibleMeshes; this.collisionMeshes = collision.collisionMeshes; this.floorMeshes = collision.floorMeshes; this.octree = collision.octree; this.bounds = spawn.bounds; this.scene.add(nextWorld); this.onProgress(100);
      return { world: nextWorld, mixers: nextMixers, meshes: collision.visibleMeshes, octree: collision.octree, spawn, quality, collision, scale: this.spaceScale };
    } catch (error) { nextMixers.forEach((m) => m.stopAllAction()); nextWorld.traverse((o) => { o.geometry?.dispose?.(); Array.isArray(o.material) ? o.material.forEach((m) => this.disposeMaterial(m)) : this.disposeMaterial(o.material); }); throw error; }
  }
}
