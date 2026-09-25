// Runtime behavior shared by every object authored in Environment Builder.
// It deliberately uses the small THREE-compatible surface supplied by the game,
// which also makes the gameplay rules independently testable.
export class BuilderGameplayController {
  constructor({ THREE, objects, playerRig, status = () => {}, heal = () => {}, damage = () => {} }) {
    Object.assign(this, { THREE, objects, playerRig, status, heal, damage });
    this.elapsed = 0;
  }

  playable() {
    const behaviors = new Set(['vehicle', 'talk', 'quest', 'hostile', 'patrol', 'pickup', 'door', 'heal', 'interact']);
    return this.objects.children.filter((root) => behaviors.has(root.userData.functionalSettings?.behavior) && root.visible !== false);
  }

  nearest(maxDistance = 3.25) {
    let nearest = null;
    let distance = maxDistance;
    this.playable().forEach((root) => {
      if (root.userData.functionalSettings.behavior === 'vehicle') return;
      const next = root.position.distanceTo(this.playerRig.position);
      if (next < distance) { nearest = root; distance = next; }
    });
    return nearest;
  }

  interact() {
    const root = this.nearest();
    if (!root) { this.status('Move closer to a Builder object, then press E to use it.'); return false; }
    const settings = root.userData.functionalSettings;
    const now = this.elapsed;
    if (now < (root.userData.nextBuilderUse || 0)) return false;
    root.userData.nextBuilderUse = now + Math.max(0, Number(settings.cooldown) || 0);
    root.userData.builderActive = !root.userData.builderActive;
    const label = root.userData.label || root.name || 'Builder object';
    if (settings.behavior === 'pickup') { root.visible = false; this.status(`${label} collected.`); }
    else if (settings.behavior === 'heal') { this.heal(Number(settings.value) || 25); this.status(`${label} restored health.`); }
    else if (settings.behavior === 'door') { root.userData.doorTarget = root.userData.builderActive ? -Math.PI * .62 : 0; this.status(`${label} ${root.userData.builderActive ? 'opened' : 'closed'}.`); }
    else if (settings.behavior === 'hostile') { this.damage(Number(settings.value) || 10); this.status(`${label} attacked.`); }
    else if (settings.behavior === 'quest') this.status(settings.value || `${label}: quest accepted.`);
    else if (settings.behavior === 'talk') this.status(settings.value || `${label}: Welcome to this world.`);
    else this.status(settings.value || `${label} activated.`);
    return true;
  }

  update(delta) {
    this.elapsed += delta;
    this.playable().forEach((root) => {
      const behavior = root.userData.functionalSettings.behavior;
      const origin = root.userData.builderOrigin;
      if (behavior === 'door' && Number.isFinite(root.userData.doorTarget)) {
        root.rotation.y = this.THREE.MathUtils.lerp(root.rotation.y, origin.yaw + root.userData.doorTarget, Math.min(1, delta * 7));
      }
      if ((behavior === 'patrol' || behavior === 'hostile') && origin) {
        const target = behavior === 'hostile' ? this.playerRig.position : null;
        const dx = target ? target.x - root.position.x : origin.x + Math.sin(this.elapsed * .55 + origin.phase) * 2.5 - root.position.x;
        const dz = target ? target.z - root.position.z : origin.z + Math.cos(this.elapsed * .55 + origin.phase) * 2.5 - root.position.z;
        const distance = Math.hypot(dx, dz);
        if (behavior === 'patrol' || distance < 9) {
          const speed = behavior === 'hostile' ? .75 : .45;
          root.position.x += dx / Math.max(distance, 1) * speed * delta;
          root.position.z += dz / Math.max(distance, 1) * speed * delta;
          root.rotation.y = Math.atan2(dx, dz);
        }
      }
      root.userData.gameMixer?.update(delta);
    });
  }
}
