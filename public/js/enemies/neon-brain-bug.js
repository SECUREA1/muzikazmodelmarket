import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';

const BRAIN_BUG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><radialGradient id="brain" cx="35%" cy="28%"><stop stop-color="#fff3fd"/><stop offset=".28" stop-color="#ff91cf"/><stop offset=".7" stop-color="#ff238e"/><stop offset="1" stop-color="#710044"/></radialGradient></defs><path d="M53 159C25 121 41 55 88 50c17-29 61-28 78 2 45 0 63 56 33 87 7 39-38 63-65 43-31 26-78 9-81-23Z" fill="url(#brain)" stroke="#ffd1ed" stroke-width="7"/><g fill="none" stroke="#8d075d" stroke-width="8" stroke-linecap="round"><path d="M74 78q24 15 8 43t20 39M115 60q-16 27 8 45t-3 54M157 70q-22 23-4 43t-11 45M186 92q-25 17-9 39"/></g></svg>`;

function svgTexture() {
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(BRAIN_BUG_SVG)}`);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A neon SVG-textured 3D brain with spider legs and a close-range pink spray attack. */
export class NeonBrainBug {
  constructor({ position, onSpray, mobile = false }) {
    this.root = new THREE.Group();
    this.root.name = 'MUZIKAZ_NEON_BRAIN_BUG';
    this.onSpray = onSpray;
    this.phase = Math.random() * Math.PI * 2;
    this.lastSprayAt = -Infinity;
    this.texture = svgTexture();
    const segments = mobile ? 10 : 16;
    const brainMaterial = new THREE.MeshStandardMaterial({ color: 0xff4cab, emissive: 0xff087c, emissiveIntensity: 1.45, roughness: .34, metalness: .15 });
    const left = new THREE.Mesh(new THREE.SphereGeometry(.42, segments, segments - 3), brainMaterial);
    const right = new THREE.Mesh(new THREE.SphereGeometry(.42, segments, segments - 3), brainMaterial.clone());
    left.scale.set(1.08, .78, .88); right.scale.set(1.08, .78, .88); left.position.x = -.25; right.position.x = .25;
    const detail = new THREE.Mesh(new THREE.PlaneGeometry(1.12, .82), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    detail.position.set(0, .04, .43);
    const aura = new THREE.Mesh(new THREE.SphereGeometry(.72, segments, segments - 3), new THREE.MeshBasicMaterial({ color: 0xff2ca0, transparent: true, opacity: .13, blending: THREE.AdditiveBlending, depthWrite: false }));
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x7a0a57, emissive: 0xff128e, emissiveIntensity: .7, roughness: .28 });
    this.legs = [];
    for (let side of [-1, 1]) for (let index = 0; index < 4; index++) {
      const leg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(.026, .04, .48, 7), legMaterial);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(.018, .03, .42, 7), legMaterial);
      upper.position.y = -.22; upper.rotation.z = side * (.75 + index * .08);
      lower.position.set(side * (.26 + index * .025), -.45, -.05 + index * .08); lower.rotation.z = side * (-.62 - index * .06);
      leg.add(upper, lower); leg.position.set(side * .28, -.13, (index - 1.5) * .17); this.legs.push(leg); this.root.add(leg);
    }
    const light = new THREE.PointLight(0xff3da5, 1.8, 4); light.position.set(0, .2, .35);
    this.root.add(left, right, detail, aura, light);
    this.root.position.copy(position);
    this.root.userData = { toxicBubble: true, brainBug: true, health: 100, hovered: false, actor: this };
  }

  update(delta, elapsed, playerPosition) {
    const toPlayer = playerPosition.clone().sub(this.root.position); toPlayer.y = 0;
    const distance = toPlayer.length();
    if (distance > .01) {
      toPlayer.normalize();
      // Chase hard, then retreat after firing so the bug repeatedly pressures the player.
      const retreating = distance < 2.15 || (elapsed - this.lastSprayAt < .9 && distance < 4.6);
      this.root.position.addScaledVector(toPlayer, (retreating ? -1.95 : 2.65) * delta);
      this.root.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }
    this.root.position.y = Math.max(.28, this.root.position.y + Math.sin(elapsed * 4 + this.phase) * delta * .075);
    this.legs.forEach((leg, index) => { leg.rotation.y = Math.sin(elapsed * 10 + this.phase + index) * .22; });
    this.root.children.find(child => child.isMesh && child.material?.opacity === .13)?.scale.setScalar(1 + Math.sin(elapsed * 5 + this.phase) * .08);
    if (distance < 7.4 && elapsed - this.lastSprayAt > 1.45) { this.lastSprayAt = elapsed; this.onSpray?.(this.root.position.clone().add(new THREE.Vector3(0, .12, 0)), playerPosition.clone()); }
  }

  dispose() { this.root.traverse(object => { object.geometry?.dispose?.(); if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose?.()); }); this.texture.dispose(); }
}
