/** Shared browser/server eligibility for authored physical surfaces. */
export const COLLISION_RE = /(^|[_ .-])(COLLIDER|COLLISION|NAVMESH)([_ .-]|$)/i;
export const EXCLUDE_RE = /(SKY|PARTICLE|VFX|GRASS_BLADE|WATER|HELPER|AVATAR)/i;

export function isDedicatedCollider(object) {
  return COLLISION_RE.test(object?.name || '') || object?.userData?.collider === true || object?.userData?.collision === true || object?.userData?.colliderShape === 'mesh';
}

export function isRenderedMesh(object) {
  for (let current = object; current; current = current.parent) if (current.visible === false) return false;
  const materials = Array.isArray(object?.material) ? object.material : [object?.material];
  return materials.some(material => material?.visible !== false && material?.opacity !== 0);
}

export function collisionIsDisabled(object) {
  for (let current = object; current; current = current.parent) {
    if (current.userData?.collisionDisabled === true || current.userData?.collider === false || current.userData?.collision === false) return true;
  }
  return false;
}

export function isCollisionMesh(object) {
  return !collisionIsDisabled(object) && (isDedicatedCollider(object) || isRenderedMesh(object) && !EXCLUDE_RE.test(object?.name || ''));
}
