export const FLAME_CONFIG = Object.freeze({
  tank: 100, fuelPerBurst: 1, interval: .12, range: 12, lowFuel: .2,
  burnSeconds: 10, fadeSeconds: 1, radius: .42, maxFlames: 120,
});

export const FLAME_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128"><path fill="#ff481d" d="M48 2C68 35 88 44 87 78c0 28-18 48-39 48S9 106 9 78c0-20 12-34 24-47-2 20 5 24 9 30C56 43 59 28 48 2Z"/><path fill="#ffbd32" d="M48 39c8 20 25 27 25 46 0 18-11 33-25 33S23 103 23 85c0-13 11-23 15-30 0 12 4 18 8 23 6-13 10-23 2-39Z"/><path fill="#fff5a3" d="M48 78c9 12 14 18 14 26 0 10-6 17-14 17s-14-7-14-17c0-8 8-15 14-26Z"/></svg>';

export function flamePressure(fuel) {
  const ratio = Math.max(0, Math.min(1, fuel / FLAME_CONFIG.tank));
  return { ratio, dripping: ratio <= FLAME_CONFIG.lowFuel,
    range: .7 + (FLAME_CONFIG.range - .7) * ratio,
    speed: 1.8 + 22.2 * ratio };
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
    this.ray = new THREE.Raycaster();
    this.geometry = new THREE.IcosahedronGeometry(.16, 1);
    this.sphere = new THREE.Sphere();
    this.box = new THREE.Box3();
    this.triangle = new THREE.Triangle();
    this.closest = new THREE.Vector3();
  }

  createHeldModel() {
    const T = this.THREE, root = new T.Group();
    root.name = 'MUZIKAZ_FIRST_PERSON_FLAMETHROWER';
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
    if (this.cooldown > 0 || this.fuel < FLAME_CONFIG.fuelPerBurst) return false;
    const T = this.THREE, pressure = flamePressure(this.fuel);
    this.fuel -= FLAME_CONFIG.fuelPerBurst;
    this.cooldown = FLAME_CONFIG.interval;
    // Bound GPU work without evicting live ground fires or resetting their clocks.
    if (this.flames.length >= FLAME_CONFIG.maxFlames) return true;
    const material = new T.MeshBasicMaterial({ color: 0xff751f, transparent: true,
      opacity: .95, depthWrite: false, toneMapped: false });
    const root = new T.Group();
    root.name = 'MUZIKAZ_FLAME_CONNECTION';
    const mesh = new T.Mesh(this.geometry, material);
    mesh.scale.set(1, 1.7, 1);
    root.add(mesh);
    if (this.texture) {
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: this.texture, transparent: true,
        depthWrite: false, toneMapped: false }));
      sprite.scale.set(.42, .65, 1);
      root.add(sprite);
    }
    root.position.copy(origin);
    this.scene.add(root);
    this.flames.push({ root, velocity: direction.clone().normalize().multiplyScalar(pressure.speed),
      distance: 0, range: pressure.range, dripping: pressure.dripping, landed: false,
      clock: new FlameContactClock(), flightAge: 0 });
    return true;
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

  // Bounding boxes only reject distant meshes. Triangle contact decides whether
  // flames really touch floors, irregular GLBs, or animated character surfaces.
  touching(target, point, radius = FLAME_CONFIG.radius) {
    if (target.touches) return target.touches(point);
    this.sphere.set(point, radius);
    for (const mesh of this.meshes(target)) {
      mesh.updateWorldMatrix(true, false);
      this.box.copy(this.bounds?.get(mesh) || new this.THREE.Box3().setFromObject(mesh));
      if (!this.box.intersectsSphere(this.sphere)) continue;
      const insideRay = this.box.containsPoint(point)
        ? new this.THREE.Ray(point, new this.THREE.Vector3(1, .371, .217).normalize()) : null;
      const crossings = new Set();
      const positions = mesh.geometry.attributes.position, index = mesh.geometry.index;
      const count = index ? index.count : positions.count;
      for (let i = 0; i + 2 < count; i += 3) {
        for (let j = 0; j < 3; j++) {
          const vertex = [this.triangle.a, this.triangle.b, this.triangle.c][j];
          const vertexIndex = index ? index.getX(i + j) : i + j;
          mesh.getVertexPosition(vertexIndex, vertex);
          vertex.applyMatrix4(mesh.matrixWorld);
        }
        this.triangle.closestPointToPoint(point, this.closest);
        if (this.closest.distanceToSquared(point) <= radius ** 2) return true;
        if (insideRay?.intersectTriangle(this.triangle.a, this.triangle.b, this.triangle.c, false, this.closest)) {
          crossings.add(Math.round(point.distanceTo(this.closest) * 1e6));
        }
      }
      if (crossings.size % 2 === 1) return true;
    }
    return false;
  }

  sweep(start, end, targets) {
    const T = this.THREE, travel = end.clone().sub(start), distance = travel.length();
    if (!distance) return null;
    const direction = travel.normalize();
    let nearest = null;
    for (const target of targets) {
      if (target.projectiles === false) continue;
      for (const mesh of this.meshes(target)) {
        mesh.updateWorldMatrix(true, false);
        this.box.copy(this.bounds?.get(mesh) || new T.Box3().setFromObject(mesh)).expandByScalar(.16);
        this.ray.set(start, direction);
        const entry = this.ray.ray.intersectBox(this.box, this.closest);
        if (!this.box.containsPoint(start) && (!entry || entry.distanceTo(start) > distance)) continue;
        // Test both sides of triangles, including floors approached from below.
        const positions = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const count = index ? index.count : positions.count;
        this.ray.set(start, direction);
        for (let i = 0; i + 2 < count; i += 3) {
          for (let j = 0; j < 3; j++) {
            const vertex = [this.triangle.a, this.triangle.b, this.triangle.c][j];
            mesh.getVertexPosition(index ? index.getX(i + j) : i + j, vertex);
            vertex.applyMatrix4(mesh.matrixWorld);
          }
          const point = this.ray.ray.intersectTriangle(this.triangle.a, this.triangle.b, this.triangle.c, false, new T.Vector3());
          if (!point) continue;
          const hitDistance = point.distanceTo(start);
          if (hitDistance <= distance && (!nearest || hitDistance < nearest.distance)) {
            nearest = { point, distance: hitDistance, target, normal: this.triangle.getNormal(new T.Vector3()) };
          }
        }
      }
      // Radius contact catches edge grazes that a center ray would miss. Sampling
      // at less than the droplet diameter prevents tunneling around thin edges.
      const steps = Math.max(1, Math.ceil(distance / .16));
      for (let i = 0; i <= steps; i++) {
        const traveled = distance * i / steps;
        if (nearest && traveled >= nearest.distance) break;
        const center = start.clone().addScaledVector(direction, traveled);
        if (this.touching(target, center, .16)) {
          nearest = { point: center, distance: traveled, target, normal: direction.clone().negate() };
          break;
        }
      }
    }
    return nearest;
  }

  update(delta, elapsed) {
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (!this.flames.length) return;
    const targets = this.colliders().filter(t => t.root?.parent);
    this.bounds = new Map();
    for (const target of targets) {
      target.meshes = this.meshes(target);
      for (const mesh of target.meshes) {
        mesh.updateWorldMatrix(true, false);
        if (mesh.isSkinnedMesh) mesh.computeBoundingBox();
        this.bounds.set(mesh, new this.THREE.Box3().setFromObject(mesh));
      }
    }
    for (const flame of [...this.flames]) {
      const { root } = flame;
      let burnDelta = delta;
      if (!flame.landed) {
        flame.flightAge += delta;
        const next = root.position.clone().addScaledVector(flame.velocity, delta);
        const hit = this.sweep(root.position, next, targets);
        if (hit) {
          const distance = root.position.distanceTo(next);
          burnDelta = distance ? delta * Math.max(0, 1 - hit.distance / distance) : delta;
          root.position.copy(hit.point).addScaledVector(hit.normal, .025);
          flame.landed = true;
          this.createBurnGraphics(root);
          flame.anchor = hit.target.root;
          flame.localPoint = flame.anchor.worldToLocal(root.position.clone());
          this.impact?.(hit.target.root, flame);
        } else {
          flame.distance += next.distanceTo(root.position);
          root.position.copy(next);
          if (flame.distance >= flame.range) {
            // At the pressure limit the fuel loses forward velocity and drips.
            flame.velocity.x *= Math.exp(-delta * 16);
            flame.velocity.z *= Math.exp(-delta * 16);
          }
          flame.velocity.y -= (flame.dripping ? 12 : 4) * delta;
          if (flame.flightAge > 4) { this.remove(flame); continue; }
        }
      }
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
    flame.root.children.forEach(child => child.material.dispose());
    flame.root.removeFromParent();
    this.flames.splice(this.flames.indexOf(flame), 1);
  }
  clear() { for (const flame of [...this.flames]) this.remove(flame); this.cooldown = 0; }
  dispose() { this.clear(); this.geometry.dispose(); }
}
