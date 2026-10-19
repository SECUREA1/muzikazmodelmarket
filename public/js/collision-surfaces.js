const COLLIDER_NAME = /(^|[_ .-])(COLLIDER|COLLISION|NAVMESH)([_ .-]|$)/i;
const EFFECT_NAME = /(SKY|PARTICLE|VFX|GRASS_BLADE|WATER|HELPER)/i;

export function collisionIsDisabled(object) {
  for (let node = object; node; node = node.parent) {
    const data = node.userData;
    if (data?.collisionDisabled === true || data?.collider === false || data?.collision === false || data?.solid === false) return true;
  }
  return false;
}

export function isDedicatedCollider(object) {
  for (let node = object; node; node = node.parent) {
    const data = node.userData;
    if (COLLIDER_NAME.test(node.name || '') || data?.collider === true || data?.collision === true || data?.colliderShape === 'mesh') return true;
  }
  return false;
}

export function isSolidSurface(object, {includeInvisible = false} = {}) {
  if (!object?.isMesh || !object.geometry?.attributes?.position || collisionIsDisabled(object)) return false;
  if (isDedicatedCollider(object)) return true;
  for (let node = object; node; node = node.parent) {
    if (!includeInvisible && node.visible === false) return false;
    if (node === object && EFFECT_NAME.test(node.name || '')) return false;
  }
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return includeInvisible || materials.some(material => material && material.visible !== false);
}

// Rendering often uses FrontSide GLB materials, but a physical wall blocks both
// directions. A lightweight mesh/material proxy lets Three's own raycast retain
// skinned/instanced geometry, groups, draw ranges and near/far bounds without
// changing a live material or replacing the wall with a bounding box.
export function raycastSolidSurfaces(raycaster, roots, recursive = true, options = {}) {
  const hits = [], seen = new Set();
  const visit = object => {
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (isSolidSurface(object, options) && raycaster.layers.test(object.layers)) {
      object.updateWorldMatrix(true, false);
      const proxy = Object.create(object);
      const doubleSided = material => {
        if (!material) return material;
        const copy = Object.create(material);
        copy.side = 2; // THREE.DoubleSide; avoids a browser-only Three import.
        return copy;
      };
      proxy.material = Array.isArray(object.material) ? object.material.map(doubleSided) : doubleSided(object.material);
      const intersections = [];
      object.raycast.call(proxy, raycaster, intersections);
      for (const hit of intersections) {
        hit.object = object;
        if (hit.face) {
          const transform = object.matrixWorld.clone();
          if (object.isInstancedMesh && Number.isInteger(hit.instanceId)) {
            const instance = transform.clone().identity();
            object.getMatrixAt(hit.instanceId, instance);
            transform.multiply(instance);
          }
          // Inverse transpose keeps normals correct under GLB nonuniform scale
          // and per-instance rotations. Keep Three's authored face untouched.
          const inverse = transform.invert().elements, normal = hit.face.normal.clone();
          const {x, y, z} = normal;
          normal.set(inverse[0] * x + inverse[1] * y + inverse[2] * z,
            inverse[4] * x + inverse[5] * y + inverse[6] * z,
            inverse[8] * x + inverse[9] * y + inverse[10] * z).normalize();
          if (normal.dot(raycaster.ray.direction) > 0) normal.negate();
          hit.solidNormal = normal;
        }
        hits.push(hit);
      }
    }
    if (recursive) for (const child of object.children || []) visit(child);
  };
  for (const root of Array.isArray(roots) ? roots : [roots]) visit(root);
  return hits.sort((a, b) => a.distance - b.distance);
}
