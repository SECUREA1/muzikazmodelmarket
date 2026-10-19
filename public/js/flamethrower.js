import {MeshContactQueries, meshWorldBounds} from './static-mesh-queries.js';

export const FLAME_CONFIG = Object.freeze({
  tank: 100, fuelPerBurst: 1, interval: .08, range: 12,
  muzzleOffset: .55,
  flashSeconds: .06,
  burnSeconds: 10, fadeSeconds: 1, radius: .42, maxFlames: 160,
});

export const FLAME_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128"><path fill="#ff481d" d="M48 2C68 35 88 44 87 78c0 28-18 48-39 48S9 106 9 78c0-20 12-34 24-47-2 20 5 24 9 30C56 43 59 28 48 2Z"/><path fill="#ffbd32" d="M48 39c8 20 25 27 25 46 0 18-11 33-25 33S23 103 23 85c0-13 11-23 15-30 0 12 4 18 8 23 6-13 10-23 2-39Z"/><path fill="#fff5a3" d="M48 78c9 12 14 18 14 26 0 10-6 17-14 17s-14-7-14-17c0-8 8-15 14-26Z"/></svg>';

export function flamePressure(fuel) {
  const ratio = Math.max(0, Math.min(1, fuel / FLAME_CONFIG.tank));
  return { ratio, range: ratio > 0 ? FLAME_CONFIG.range : 0 };
}

// Each independent flame connection has its own contact clock. Leaving a flame
// clears fractional contact time; re-entering cannot cause a delayed extra hit.
export class FlameContactClock {
  constructor() { this.age = 0; this.contacts = new Map(); }
  update(delta, targets, damage) {
    const activeDelta = Math.max(0, Math.min(delta, FLAME_CONFIG.burnSeconds - this.age));
    this.age += Math.max(0, delta);
    const touching = new Set(targets);
    for (const target of this.contacts.keys()) if (!touching.has(target)) this.contacts.delete(target);
    for (const target of touching) {
      const total = (this.contacts.get(target) || 0) + activeDelta;
      const ticks = Math.floor(total + 1e-9);
      this.contacts.set(target, total - ticks);
      if (ticks) damage(target, ticks);
    }
    return Math.max(0, Math.min(1, (FLAME_CONFIG.burnSeconds - this.age) / FLAME_CONFIG.fadeSeconds));
  }
}

// THREE is injected so the physics and contact logic can be exercised without
// loading browser-only CDN imports. Graphics are actual meshes plus SVG artwork.
export class Flamethrower {
  constructor({ THREE, scene, colliders, damage, impact = null, texture = null, reducedMotion = false }) {
    Object.assign(this, { THREE, scene, colliders, damage, impact, texture, reducedMotion });
    this.fuel = FLAME_CONFIG.tank;
    this.cooldown = 0;
    this.flames = [];
    this.burnPool = [];
    this.flashMesh = null;
    this.geometry = new THREE.IcosahedronGeometry(.16, 1);
    this.queries = new MeshContactQueries();
    this.bounds = new Map();
    this.boundsPool = new WeakMap();
  }

  createHeldModel() {
    const T = this.THREE, root = new T.Group();
    root.name = 'MUZIKAZ_FIRST_PERSON_FLASH_IGNITER';
    const steel = new T.MeshStandardMaterial({ color: 0x363e46, metalness: .7, roughness: .4 });
    const tankMaterial = new T.MeshStandardMaterial({ color: 0xff681b, metalness: .3, roughness: .5 });
    const nozzle = new T.Mesh(new T.CylinderGeometry(.045, .065, .65, 10), steel);
    nozzle.rotation.x = Math.PI / 2;
    const tank = new T.Mesh(new T.CylinderGeometry(.13, .13, .42, 12), tankMaterial);
    tank.position.set(0, -.13, .18);
    const handle = new T.Mesh(new T.BoxGeometry(.09, .2, .1), steel);
    handle.position.set(0, -.16, -.12);
    root.add(nozzle, tank, handle);
    root.position.set(.43, -.36, -.8);
    root.traverse(o => { if (o.isMesh) { o.material.depthTest = false; o.renderOrder = 20; } });
    return root;
  }

  refill(amount = FLAME_CONFIG.tank) { this.fuel = Math.min(FLAME_CONFIG.tank, this.fuel + Math.max(0, amount)); }

  createBurnGraphics(root) {
    const T = this.THREE;
    for (let i = 0; i < 3; i++) {
      const settings = { color: i === 1 ? 0xffee8a : 0xff581b,
        transparent: true, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending };
      const tongue = this.texture
        ? new T.Sprite(new T.SpriteMaterial({ ...settings, map: this.texture }))
        : new T.Mesh(this.geometry, new T.MeshBasicMaterial(settings));
      tongue.userData.burnVisual = { kind: 'tongue', phase: i * 2.1, x: (i - 1) * .13 };
      root.add(tongue);
    }
    for (let i = 0; i < 3; i++) {
      const smoke = i === 0;
      const puff = new T.Mesh(this.geometry, new T.MeshBasicMaterial({
        color: smoke ? 0x39323b : 0xffbf38, transparent: true, depthWrite: false,
        toneMapped: false, blending: smoke ? T.NormalBlending : T.AdditiveBlending,
      }));
      puff.userData.burnVisual = { kind: smoke ? 'smoke' : 'ember', phase: i * 1.7 };
      root.add(puff);
    }
  }

  animateBurnGraphics(root, elapsed, opacity) {
    for (const child of root.children) {
      const visual = child.userData.burnVisual;
      if (!visual) { child.material.opacity = opacity; continue; }
      const phase = this.reducedMotion ? .5 : elapsed * 2 + visual.phase;
      if (visual.kind === 'tongue') {
        const flicker = this.reducedMotion ? 1 : 1 + Math.sin(phase * 6) * .18;
        child.position.set(visual.x, .22, 0);
        child.scale.set(.34 * flicker, .7 * flicker, child.isSprite ? 1 : .35);
        child.material.opacity = opacity * .85;
      } else {
        const rise = this.reducedMotion ? .45 : phase % 1;
        child.position.set(Math.sin(visual.phase) * rise * .25, .2 + rise * .7, Math.cos(visual.phase) * rise * .25);
        child.scale.setScalar(visual.kind === 'smoke' ? .6 + rise * 1.5 : .08);
        child.material.opacity = opacity * (1 - rise) * (visual.kind === 'smoke' ? .35 : .9);
      }
    }
  }

  fire(origin, direction) {
    if (this.cooldown > 0 || this.fuel < FLAME_CONFIG.fuelPerBurst || direction.lengthSq() === 0) return false;
    const T = this.THREE, aim = direction.clone().normalize();
    this.fuel -= FLAME_CONFIG.fuelPerBurst;
    this.cooldown = FLAME_CONFIG.interval;
    if (this.flash) this.removeFlash();
    const flash = this.flashMesh || new T.Mesh(this.geometry, new T.MeshBasicMaterial({
      color: 0xffe29a, transparent: true, opacity: .9, depthWrite: false,
      toneMapped: false, blending: T.AdditiveBlending,
    }));
    this.flashMesh = flash;
    flash.material.opacity = .9;
    flash.name = 'MUZIKAZ_FLASH_IGNITER_MUZZLE_FLASH';
    flash.position.copy(origin).addScaledVector(aim, FLAME_CONFIG.muzzleOffset);
    flash.scale.set(.6, .6, .6);
    this.scene.add(flash);
    this.flash = { root: flash, age: 0 };
    // Resolve the first real surface immediately, without a travelling fire effect.
    const targets = this.colliders().filter(t => t.root?.parent);
    this.refreshBounds(targets);
    const hit = this.sweep(origin, origin.clone().addScaledVector(aim, FLAME_CONFIG.range), targets);
    if (!hit || this.flames.length >= FLAME_CONFIG.maxFlames) return true;
    const root = this.burnPool.pop() || new T.Group();
    root.scale.setScalar(1);
    root.name = 'MUZIKAZ_FLASH_IGNITER_TARGET_FIRE';
    root.position.copy(hit.point).addScaledVector(hit.normal, .025);
    if (!root.children.length) this.createBurnGraphics(root);
    this.scene.add(root);
    const flame = { root, landed: true, anchor: hit.target.root,
      localPoint: hit.target.root.worldToLocal(root.position.clone()), clock: new FlameContactClock() };
    this.flames.push(flame);
    this.animateBurnGraphics(root, 0, 1);
    this.impact?.(hit.target.root, flame);
    return true;
  }

  removeFlash() {
    this.flash.root.removeFromParent();
    this.flash = null;
  }

  meshes(target) {
    if (target.meshes) return target.meshes;
    const meshes = [];
    target.root.traverse(o => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      for (let node = o; node; node = node.parent) {
        if ((!target.includeInvisible && node.visible === false) || node.userData?.collisionDisabled) return;
      }
      meshes.push(o);
    });
    return meshes;
  }

  refreshBounds(targets) {
    if (!this.bounds) this.bounds = new Map();
    else this.bounds.clear();
    for (const target of targets) {
      target.meshes = this.meshes(target);
      for (const mesh of target.meshes) {
        let box = this.boundsPool.get(mesh);
        if (!box) { box = new this.THREE.Box3(); this.boundsPool.set(mesh, box); }
        this.bounds.set(mesh, meshWorldBounds(mesh, box));
      }
    }
  }

  // Bounding boxes only reject distant meshes. Triangle contact decides whether
  // flames really touch floors, irregular GLBs, or animated character surfaces.
  touching(target, point, radius = FLAME_CONFIG.radius) {
    if (target.touches) return target.touches(point);
    for (const mesh of this.meshes(target)) {
      if (this.queries.touching(mesh, point, radius, Boolean(target.surfaceOnly), this.bounds?.get(mesh))) return true;
    }
    return false;
  }

  sweep(start, end, targets) {
    const travel = end.clone().sub(start), distance = travel.length();
    if (!distance) return null;
    const direction = travel.normalize();
    let nearest = null;
    for (const target of targets) {
      if (target.projectiles === false) continue;
      for (const mesh of this.meshes(target)) {
        const hit = this.queries.segment(mesh, start, direction, distance, this.bounds?.get(mesh));
        if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { ...hit, target };
      }

    }
    return nearest;
  }

  update(delta, elapsed) {
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (this.flash) {
      this.flash.age += Math.max(0, delta);
      this.flash.root.material.opacity = .9 * Math.max(0, 1 - this.flash.age / FLAME_CONFIG.flashSeconds);
      if (this.flash.age >= FLAME_CONFIG.flashSeconds) this.removeFlash();
    }
    if (!this.flames.length) return;
    const targets = this.colliders().filter(t => t.root?.parent);
    this.refreshBounds(targets);
    for (const flame of [...this.flames]) {
      const { root } = flame;
      const burnDelta = delta;

      if (flame.landed) {
        if (!flame.anchor.parent) { this.remove(flame); continue; }
        root.position.copy(flame.anchor.localToWorld(flame.localPoint.clone()));
        const contacts = targets.filter(t => t.root === flame.anchor || this.touching(t, root.position)).map(t => t.root);
        const opacity = flame.clock.update(burnDelta, contacts, (target, amount) => this.damage(target, amount, flame));
        if (opacity <= 0) { this.remove(flame); continue; }
        const pulse = this.reducedMotion ? 1 : 1 + Math.sin(elapsed * 12 + root.id) * .12;
        root.scale.set(pulse, pulse * 1.5, pulse);
        this.animateBurnGraphics(root, elapsed, opacity);
      }
    }
  }

  remove(flame) {
    const index = this.flames.indexOf(flame);
    if (index < 0) return;
    flame.root.removeFromParent();
    this.flames.splice(index, 1);
    this.burnPool.push(flame.root);
  }
  clear() { for (const flame of [...this.flames]) this.remove(flame); this.cooldown = 0; if (this.flash) this.removeFlash(); }
  dispose() {
    this.clear();
    for (const root of this.burnPool) root.children.forEach(child => child.material.dispose());
    this.burnPool.length = 0;
    this.flashMesh?.material.dispose();
    this.flashMesh = null;
    this.bounds?.clear();
    this.geometry.dispose();
  }
}
