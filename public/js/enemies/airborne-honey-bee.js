import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';

// BEEDEERE is the repository's non-BeeDuck bee asset.  Keeping this cache at
// module scope makes React/dev re-entry and level restarts share one download.
export const BEE_GLB_PATH = 'public/models/avatars/BEEDEERE.glb';
export const BEE_CONFIG = Object.freeze({ id:'bee', modelPath:BEE_GLB_PATH, label:'Honey bee', modelSize:1.45, airborne:true, minimumGroundClearance:1.75, hoverSpeed:2.1, hoverAmount:.18, detectionRadius:13, attackRange:7, retreatDistance:2.75, retreatResumeDistance:4.25, attackCooldown:1.25, projectileSpeed:9, projectileLifetime:3, honeyDamage:7, playerDamageCooldown:.7, sprayCount:3, spraySpread:.1, maxHealth:20, gunDamage:1, laserDamage:1, batDamage:1, roamRadius:8 });
export const AAPE_BOSS_CONFIG = Object.freeze({ ...BEE_CONFIG, id:'aape', modelPath:'public/models/avatars/AAPE.glb', label:'AAPE sword boss', modelSize:2.1, airborne:false, attackRange:2.45, retreatDistance:0, attackCooldown:.85, maxHealth:20, swordDamage:12, swordReach:2.4 });
export const BEEDUCK_BOSS_CONFIG = Object.freeze({ ...BEE_CONFIG, id:'beeduck', modelPath:'public/models/avatars/BEEDUCK.glb', label:'BEEDUCK honey boss', modelSize:2.9, maxHealth:20, sprayCount:5, spraySpread:.16, honeyDamage:10 });
const assetPromises = new Map();
function loadBossAsset(path) {
  if (!assetPromises.has(path)) {
    const pending = new GLTFLoader().loadAsync(path);
    assetPromises.set(path, pending);
    // A transient connection failure must not poison all later boss levels.
    pending.catch(() => { if (assetPromises.get(path) === pending) assetPromises.delete(path); });
  }
  return assetPromises.get(path);
}
function disposeObject(root) {
  const geometries = new Set(), materials = new Set();
  root?.traverse(object => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
function cloneBossModel(source) {
  const clone = source.clone(true), originals = new Map(), copies = new Map();
  const parallel = (original, copy) => {
    originals.set(copy, original); copies.set(original, copy);
    for (let i = 0; i < original.children.length; i++) parallel(original.children[i], copy.children[i]);
  };
  parallel(source, clone);
  clone.traverse(object => {
    if (!object.isSkinnedMesh) return;
    const original = originals.get(object);
    object.skeleton = original.skeleton.clone();
    object.bindMatrix.copy(original.bindMatrix);
    object.skeleton.bones = original.skeleton.bones.map(bone => copies.get(bone));
    object.bind(object.skeleton, object.bindMatrix);
  });
  return clone;
}

export class AirborneHoneyBee {
  constructor({ scene, environmentMeshes, getPlayerPosition, damagePlayer, status, onDefeated, spawn, config = BEE_CONFIG }) {
    Object.assign(this, { config, scene, environmentMeshes, getPlayerPosition, damagePlayer, status, onDefeated });
    this.spawn = spawn.clone(); this.destination = spawn.clone();
    this.root = new THREE.Group(); this.root.name = `MUZIKAZ_${config.id.toUpperCase()}_END_BOSS`;
    this.root.userData.beeController = this;
    this.visual = new THREE.Group(); this.root.add(this.visual);
    this.state = 'WANDER'; this.health = config.maxHealth;
    this.projectiles = []; this.puddles = []; this.projectilePool = []; this.puddlePool = [];
    this.raycaster = new THREE.Raycaster(); this.groundCache = new Map();
    this.lastGroundY = spawn.y; this.groundSampleAge = Infinity; this.groundSampleInterval = .12;
    this.destinationAge = 0; this.lastAttack = -Infinity; this.lastPlayerDamage = -Infinity;
    this.defeatAge = 0; this.isDisposed = false; this.ready = true; this.modelBottom = 0; this.mixer = null;
    this.toPlayer = new THREE.Vector3(); this.direction = new THREE.Vector3(); this.home = new THREE.Vector3();
    this.groundOrigin = new THREE.Vector3(); this.groundDirection = new THREE.Vector3(0, -1, 0);
    this.surfaceNormal = new THREE.Vector3(); this.projectileStart = new THREE.Vector3(); this.projectileBase = new THREE.Vector3();
    this.puddleNormal = new THREE.Vector3(); this.puddleForward = new THREE.Vector3(0, 0, 1);
    this.projectileGeometry = new THREE.SphereGeometry(.11, 10, 8);
    this.projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xffcf22, emissive: 0xb87a00, emissiveIntensity: 1 });
    this.puddleGeometry = new THREE.CircleGeometry(.34, 14);
    this.puddleMaterial = new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: .82, side: THREE.DoubleSide });
    // Gameplay must not wait for a model download, decoder, or animation clip.
    this.addFallbackBoss();
    const clearance = config.airborne ? config.minimumGroundClearance : 0;
    this.root.position.set(spawn.x, spawn.y + clearance - this.modelBottom, spawn.z);
    this.scene.add(this.root);
  }

  async load() {
    if (this.loading) return this.loading;
    this.loading = this.loadModel();
    return this.loading;
  }
  async loadModel() {
    try {
      const gltf = await loadBossAsset(this.config.modelPath);
      if (this.isDisposed || this.state === 'DEFEATED') return false;
      const model = cloneBossModel(gltf.scene);
      model.name = `${this.config.label} GLB`; model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
      const largest = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(largest) || largest <= 0) throw new Error('Boss asset has no visible geometry.');
      model.scale.setScalar(this.config.modelSize / largest); model.updateMatrixWorld(true);
      box.setFromObject(model); model.position.sub(box.getCenter(new THREE.Vector3())); model.updateMatrixWorld(true);
      const modelBottom = new THREE.Box3().setFromObject(model).min.y;
      model.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.geometry = mesh.geometry.clone();
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material => material.clone()) : mesh.material.clone();
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.beeController = this;
      });
      // Replace only the visual. Preserve health, attacks, position, and the floor
      // clearance of the fallback that has already been playing locally.
      disposeObject(this.visual); this.visual.clear(); this.wings = null; this.sword = null;
      this.root.position.y += this.modelBottom - modelBottom; this.modelBottom = modelBottom;
      this.visual.add(model);
      if (gltf.animations?.length) {
        this.mixer = new THREE.AnimationMixer(model);
        this.animationRoot = model;
        // Independent full-body clips compete for the same bones. Play the
        // authored idle/flight clip rather than blending every clip at once.
        const clip = gltf.animations.find(clip => /fly|flight|idle|hover/i.test(clip.name)) || gltf.animations[0];
        this.mixer.clipAction(clip).play();
      } else if (this.config.airborne) this.addProceduralWings();
      if (this.config.id === 'aape') this.addSword();
      return true;
    } catch (error) {
      if (this.isDisposed || this.state === 'DEFEATED') return false;
      console.warn(`[RAD-TOX] ${this.config.label} GLB failed to load (${this.config.modelPath}); keeping the active procedural fallback.`, error);
      this.status?.(`${this.config.label} model unavailable — procedural fallback active.`);
      return false;
    }
  }

  addProceduralWings() {
    const material = new THREE.MeshStandardMaterial({ color: 0xffe66d, transparent: true, opacity: .72, side: THREE.DoubleSide });
    const geometry = new THREE.CircleGeometry(.42, 14);
    this.wings = [-1, 1].map(side => {
      const wing = new THREE.Mesh(geometry, material); wing.name = 'Procedural bee wing';
      wing.position.set(side * .32, .25, 0); wing.rotation.y = Math.PI / 2;
      this.visual.add(wing); return wing;
    });
  }
  addSword() {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.09, .78, .045), new THREE.MeshStandardMaterial({ color: 0xdbe8f5, metalness: .8, roughness: .22 }));
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.42, .07, .08), new THREE.MeshStandardMaterial({ color: 0xf5bd36, metalness: .5 }));
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, .32, 8), new THREE.MeshStandardMaterial({ color: 0x30160b }));
    const sword = this.sword = new THREE.Group(); sword.name = 'AAPE sword';
    blade.position.y = .42; guard.position.y = .03; grip.position.y = -.17; sword.add(blade, guard, grip);
    sword.position.set(.72, .15, .1); sword.rotation.z = -.65; this.visual.add(sword);
  }
  addFallbackBoss() {
    const body = new THREE.Mesh(new THREE.SphereGeometry(.46, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf6b817, emissive: 0x704000, emissiveIntensity: .35 }));
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(.35, .055, 8, 16), new THREE.MeshStandardMaterial({ color: 0x241907 }));
    stripe.rotation.x = Math.PI / 2; this.visual.add(body, stripe); this.modelBottom = -.46;
    this.visual.traverse(mesh => { if (mesh.isMesh) mesh.userData.beeController = this; });
    if (this.config.airborne) this.addProceduralWings();
    if (this.config.id === 'aape') this.addSword();
  }

  groundAt(position, referenceY = position.y) {
    // Ground does not change while this local level is active. Nearby samples
    // share a bounded cache; projectile updates never raycast every frame.
    const key = `${Math.floor(position.x * 2)}:${Math.floor(position.z * 2)}:${Math.floor(referenceY * 2)}`;
    if (this.groundCache.has(key)) return this.groundCache.get(key);
    const meshes = this.environmentMeshes();
    if (!meshes.length) return null;
    this.groundOrigin.set(position.x, referenceY + .6, position.z);
    this.raycaster.set(this.groundOrigin, this.groundDirection);
    const hits = this.raycaster.intersectObjects(meshes, true);
    let hit = null;
    for (const candidate of hits) {
      if (!candidate.face || candidate.object.visible === false || /(ceiling|roof|wall)/i.test(candidate.object.name || '')) continue;
      this.surfaceNormal.copy(candidate.face.normal).transformDirection(candidate.object.matrixWorld);
      if (this.surfaceNormal.y > .5) { hit = candidate; break; }
    }
    if (this.groundCache.size >= 128) this.groundCache.delete(this.groundCache.keys().next().value);
    this.groundCache.set(key, hit); return hit;
  }
  setSpawnFromGround() {
    const hit = this.groundAt(this.spawn);
    if (hit) this.lastGroundY = hit.point.y;
    const clearance = this.config.airborne ? this.config.minimumGroundClearance : 0;
    this.root.position.set(this.spawn.x, this.lastGroundY + clearance - this.modelBottom, this.spawn.z);
  }

  update(delta, elapsed) {
    if (this.isDisposed || !this.ready || !Number.isFinite(delta) || delta <= 0) return;
    if (this.state === 'DEFEATED') {
      this.defeatAge += delta; this.root.rotation.z += delta * 8;
      this.root.scale.multiplyScalar(Math.exp(-1.5 * delta));
      if (this.defeatAge > 1) this.dispose();
      return;
    }
    this.mixer?.update(delta);
    if (this.hitFlashUntil && performance.now() > this.hitFlashUntil) { this.root.rotation.z = 0; this.hitFlashUntil = 0; }
    else if (this.hitFlashUntil) this.root.rotation.z = .22;
    this.wings?.forEach((wing, index) => { wing.rotation.z = Math.sin(elapsed * 18 + index * Math.PI) * .7; });
    if (this.sword) this.sword.rotation.z = -.65 + Math.sin(elapsed * 11) * .18;
    const player = this.getPlayerPosition(), toPlayer = this.toPlayer.subVectors(player, this.root.position);
    toPlayer.y = 0; const distance = toPlayer.length();
    if (this.config.retreatDistance && distance < this.config.retreatDistance) this.state = 'RETREAT';
    else if (this.state === 'RETREAT' && distance < this.config.retreatResumeDistance) { /* preserve retreat hysteresis */ }
    else if (distance < this.config.attackRange) this.state = 'ATTACK';
    else if (distance < this.config.detectionRadius) this.state = 'CHASE';
    else this.state = 'WANDER';
    const direction = this.direction;
    if (this.state === 'WANDER') {
      this.destinationAge -= delta;
      const dx = this.root.position.x - this.destination.x, dz = this.root.position.z - this.destination.z;
      if (this.destinationAge <= 0 || dx * dx + dz * dz < .64) {
        const angle = Math.random() * Math.PI * 2, radius = Math.random() * this.config.roamRadius;
        this.destination.set(this.spawn.x + Math.cos(angle) * radius, 0, this.spawn.z + Math.sin(angle) * radius);
        this.destinationAge = 1.4 + Math.random() * 3.6;
      }
      direction.subVectors(this.destination, this.root.position); direction.y = 0;
    } else if (this.state === 'RETREAT') direction.set(-toPlayer.x - toPlayer.z * .35, 0, -toPlayer.z + toPlayer.x * .35);
    else direction.copy(toPlayer);
    if (direction.lengthSq()) {
      direction.normalize();
      const speed = this.state === 'ATTACK' ? 0 : this.state === 'RETREAT' ? 3 : (this.config.airborne ? 2.15 : 1.8);
      this.root.position.addScaledVector(direction, speed * delta);
      const target = Math.atan2(direction.x, direction.z), turn = Math.atan2(Math.sin(target - this.root.rotation.y), Math.cos(target - this.root.rotation.y));
      this.root.rotation.y += turn * (1 - Math.exp(-7 * delta));
    }
    const home = this.home.subVectors(this.spawn, this.root.position); home.y = 0;
    if (home.lengthSq() > (this.config.roamRadius * 1.25) ** 2) this.root.position.addScaledVector(home.normalize(), delta * 3);
    this.groundSampleAge += delta;
    if (this.groundSampleAge >= this.groundSampleInterval) {
      this.groundSampleAge = 0;
      const hit = this.groundAt(this.root.position, this.lastGroundY);
      if (hit) this.lastGroundY = hit.point.y;
    }
    const clearance = this.config.airborne ? this.config.minimumGroundClearance : 0;
    const bob = this.config.airborne ? Math.sin(elapsed * this.config.hoverSpeed) * this.config.hoverAmount : 0;
    const minimumY = this.lastGroundY + clearance - this.modelBottom, targetY = minimumY + bob;
    this.root.position.y = this.config.airborne ? THREE.MathUtils.damp(this.root.position.y, targetY, 5, delta) : targetY;
    this.root.position.y = Math.max(this.root.position.y, minimumY);
    if (this.state === 'ATTACK' && elapsed - this.lastAttack > this.config.attackCooldown) {
      this.lastAttack = elapsed;
      if (this.config.airborne) this.fireHoney(player);
      else if (this.sword) { this.sword.rotation.z = -2.2; this.damagePlayer(this.config.swordDamage, `${this.config.label} sword strike!`); }
    }
    this.updateProjectiles(delta, elapsed, player);
  }

  fireHoney(player) {
    const start = this.projectileStart.copy(this.root.position); start.y += .05;
    const base = this.projectileBase.subVectors(player, start).normalize();
    for (let i = 0; i < this.config.sprayCount; i++) {
      const projectile = this.projectilePool.pop() || { mesh: new THREE.Mesh(this.projectileGeometry, this.projectileMaterial), velocity: new THREE.Vector3() };
      projectile.velocity.copy(base); projectile.velocity.x += (i - (this.config.sprayCount - 1) / 2) * this.config.spraySpread;
      projectile.velocity.normalize().multiplyScalar(this.config.projectileSpeed);
      projectile.mesh.position.copy(start); projectile.age = 0; projectile.groundAge = Infinity; projectile.ground = null;
      this.scene.add(projectile.mesh); this.projectiles.push(projectile);
    }
  }
  updateProjectiles(delta, elapsed, player = this.getPlayerPosition()) {
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const projectile = this.projectiles[index]; projectile.age += delta; projectile.groundAge += delta;
      // Exact constant-acceleration integration keeps honey flight independent
      // of display refresh rate (Euler previously changed trajectory with FPS).
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.position.y -= 1.5 * delta * delta; projectile.velocity.y -= 3 * delta;
      if (projectile.mesh.position.distanceToSquared(player) < .55 ** 2 && elapsed - this.lastPlayerDamage > this.config.playerDamageCooldown) {
        this.lastPlayerDamage = elapsed; this.damagePlayer(this.config.honeyDamage, 'Honey spray hit!');
        this.removeProjectile(projectile, index); continue;
      }
      if (projectile.groundAge >= .15) {
        projectile.groundAge = 0; projectile.ground = this.groundAt(projectile.mesh.position);
      }
      if (projectile.ground && projectile.mesh.position.y <= projectile.ground.point.y + .12) {
        this.createPuddle(projectile.ground, projectile.mesh.position); this.removeProjectile(projectile, index); continue;
      }
      if (projectile.age > this.config.projectileLifetime) this.removeProjectile(projectile, index);
    }
    for (let index = this.puddles.length - 1; index >= 0; index--) {
      const puddle = this.puddles[index]; puddle.age += delta;
      if (puddle.mesh.position.distanceToSquared(player) < .65 ** 2 && elapsed - puddle.lastDamage > this.config.playerDamageCooldown) {
        puddle.lastDamage = elapsed; this.damagePlayer(this.config.honeyDamage, 'Honey puddle!');
      }
      if (puddle.age > 5) { this.scene.remove(puddle.mesh); this.puddles.splice(index, 1); this.puddlePool.push(puddle); }
    }
  }
  createPuddle(hit, position = hit.point) {
    const puddle = this.puddlePool.pop() || { mesh: new THREE.Mesh(this.puddleGeometry, this.puddleMaterial) };
    const normal = this.puddleNormal.set(0, 1, 0);
    if (hit.face) normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
    puddle.mesh.position.copy(hit.point).addScaledVector(normal, .015);
    puddle.mesh.position.x = position.x; puddle.mesh.position.z = position.z;
    puddle.mesh.quaternion.setFromUnitVectors(this.puddleForward, normal);
    puddle.age = 0; puddle.lastDamage = -Infinity;
    this.scene.add(puddle.mesh); this.puddles.push(puddle);
  }
  removeProjectile(projectile, index = this.projectiles.indexOf(projectile)) {
    if (index < 0) return;
    this.scene.remove(projectile.mesh); this.projectiles.splice(index, 1); this.projectilePool.push(projectile);
  }
  takeDamage(amount) {
    if (this.isDisposed || this.state === 'DEFEATED' || !Number.isFinite(amount) || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount); this.hitFlashUntil = performance.now() + 90;
    this.status?.(`${this.config.label} hit — ${this.health}/${this.config.maxHealth} HP.`);
    if (!this.health) {
      this.state = 'DEFEATED';
      for (let index = this.projectiles.length - 1; index >= 0; index--) this.removeProjectile(this.projectiles[index], index);
      this.status?.(`${this.config.label} defeated.`); this.onDefeated?.();
    }
    return true;
  }
  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    for (let index = this.projectiles.length - 1; index >= 0; index--) this.removeProjectile(this.projectiles[index], index);
    for (const puddle of this.puddles) this.scene.remove(puddle.mesh);
    this.puddles = []; this.puddlePool = []; this.projectilePool = []; this.groundCache.clear();
    this.projectileGeometry.dispose(); this.projectileMaterial.dispose(); this.puddleGeometry.dispose(); this.puddleMaterial.dispose();
    this.mixer?.stopAllAction(); if (this.animationRoot) this.mixer?.uncacheRoot(this.animationRoot);
    this.scene.remove(this.root); disposeObject(this.root);
  }
}
