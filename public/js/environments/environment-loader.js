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
    // Recreate the complete template, not merely its terrain plane. Every mesh
    // is part of the world root, so the standard collision pass automatically
    // makes buildings, trees, rails, cover and set dressing solid in Test Map.
    const add = (size, x, z, color, y = size[1] / 2, rotation = 0) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness:.82, metalness:.08 })); mesh.name = `BUILDER_TEMPLATE_${layout}`; mesh.position.set(x, heightAt(x, z) + y, z); mesh.rotation.y = rotation; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh; };
    if(layout==='vendor-street')[-12,-6,0,6,12].forEach((z,i)=>{add([5,3.2,4],-15,z,i%2?0x9e5845:0x477786);add([5,3.2,4],15,z,i%2?0x7650a1:0xa97a3b)});
    else if(layout==='creator-studios')[-12,-4,4,12].forEach((x,i)=>add([6,3.8,7],x,8,i%2?0x476779:0x6c4e79));
    else if(layout==='market-square')for(let i=0;i<10;i++){const a=i/10*Math.PI*2;add([3,2.1,2.2],Math.cos(a)*13,Math.sin(a)*13,i%2?0xc0783e:0x4c8c69,.95,-a)}
    else if(layout==='mountain-pass')[-16,-12,12,16].forEach((x,i)=>add([3,5+i%2*2,9],x,i%2?8:-8,0x485044,2));
    else if(layout==='crystal-cavern')for(let i=0;i<18;i++){const a=i/18*Math.PI*2,r=8+(i%4)*2,crystal=add([.6,2+(i%3),.6],Math.cos(a)*r,Math.sin(a)*r,i%2?0x54d9ff:0x9a62ff,1);crystal.rotation.z=(i%3-1)*.18}
    else if(layout==='railroad-world'){[-1.15,1.15].forEach(x=>add([.14,.16,38],x,0,0xa8a093));for(let z=-18;z<=18;z+=1.4)add([4,.12,.22],0,z,0x60402a);add([8,.6,16],-9,2,0x6b655b)}
    else if(layout==='skyport'||layout==='desert-airfield'){add([5,.08,38],0,0,0x26333a);for(let z=-16;z<=16;z+=4)add([.18,.04,1.8],0,z,0xe8f5dc);add([12,4,6],-12,7,0x536b72);add([8,2.5,5],12,8,0x3b555f)}
    else if(layout==='dune-sea'){for(let i=-15;i<=15;i+=6)add([4,.18,12],i,0,i%12?0xc69b58:0xd3ad6b,.09,.18)}
    else if(layout==='deep-mine'){add([8,2.8,5],10,10,0x6c4a31);[-10,0,10].forEach(z=>add([1.5,1.4,2.2],-10,z,0xb67835))}
    else if(layout==='sunrise-farm'){[-12,-7,-2,3,8,13].forEach((x,i)=>add([2.5,.12,32],x,0,i%2?0x8f9e3f:0xc29b42));add([7,4.5,6],12,10,0x9c433a);add([4,6,4],-12,11,0xb4a36b)}
    else if(layout==='coastal-cliffs'){add([12,.12,38],14,0,0x237fa0);[-15,-8,0,9].forEach((z,i)=>add([4,1.2+i%2,3],3,z,0x677866))}
    else if(layout==='ancient-forest')for(let i=0;i<22;i++){const a=i*2.4,r=7+(i%5)*2;add([.55,3.8,.55],Math.cos(a)*r,Math.sin(a)*r,0x68452c,1.9);add([2.5,2.2,2.5],Math.cos(a)*r,Math.sin(a)*r,0x28643a,4.2)}
    else if(layout==='neon-wetlands')for(let i=0;i<14;i++){const a=i/14*Math.PI*2,r=7+(i%3)*3;add([2.2,.12,2.2],Math.cos(a)*r,Math.sin(a)*r,i%2?0x62d986:0x42bfc7,.08);add([.12,1.2,.12],Math.cos(a)*r+.7,Math.sin(a)*r,0xb9ff38,.6)}
    else if(layout==='blacksite'){[-14,0,14].forEach(x=>add([5,3.5,7],x,x?9:-2,0x343d39));[-10,10].forEach(z=>add([10,1.5,2],0,z,0x58645d))}
    else if(layout==='cargo-yard')for(let i=0;i<12;i++)add([5,2.5,2.4],-12+(i%3)*12,-13+Math.floor(i/3)*8,i%2?0xb75a36:0x356b81,1.25,i%3?0:Math.PI/2);
    else if(layout==='neon-arena'){[-12,12].forEach(x=>{add([5,2.4,8],x,0,0x263b5c);add([.3,.2,28],x/2,0,x<0?0xff3ba7:0x39e8ff,.1)});add([7,.8,7],0,0,0x7146a6,.4)}
    else if(layout==='desert-outpost'){[[-12,-10],[11,-9],[-10,10],[12,9]].forEach(([x,z],i)=>add([6,2.8,5],x,z,i%2?0x8d7654:0x71624c));add([3,5,3],0,0,0x5a5549)}
    else if(layout==='mega-mall'){[-13,-6,6,13].forEach((x,i)=>add([5,3.2,8],x,10,i%2?0x54707a:0x79566d));add([9,.5,9],0,0,0x8ba8a1,.25)}
    else if(layout==='office-tower'){add([7,5,7],0,0,0x566a73);[-13,13].forEach(x=>add([5,3,10],x,4,0x40525a));add([18,.15,2],0,-10,0x83a0a7)}
    else if(layout==='firing-range'){[-12,-6,0,6,12].forEach(x=>{add([.18,2.2,22],x,3,0x525d50);add([1.4,1.8,.3],x,-11,0xc8a74c,.9)});add([16,2.5,4],0,14,0x3d4940)}
    else if(layout==='movie-studio'){[[-11,-10],[10,-10],[-11,10],[10,10]].forEach(([x,z],i)=>add([8,4,7],x,z,i%2?0x52475a:0x45535b));add([3,.3,16],0,0,0xb65b48,.15)}
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
