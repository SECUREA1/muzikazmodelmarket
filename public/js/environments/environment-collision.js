import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { Octree } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Octree.js/+esm';

const COLLISION_RE = /^(COLLIDER|COLLISION|NAVMESH)(_|$)/i;
const EXCLUDE_RE = /(SKY|PARTICLE|VFX|FOLIAGE|LEAF|LEAVES|GRASS|WATER|GLASS|LIGHT|HELPER|DECOR|AVATAR)/i;
const SPAWN_PRIORITY = ['SPAWN_PLAYER', 'SPAWN_DEFAULT'];

export function findSpawnNode(root) {
  const nodes = [];
  root.traverse((object) => { if (/^SPAWN(_|$)/i.test(object.name || '')) nodes.push(object); });
  return nodes.find((node) => SPAWN_PRIORITY.includes(node.name.toUpperCase())) || nodes[0] || null;
}

export function buildCollision(root, mode = 'auto') {
  const visibleMeshes = [];
  const collisionMeshes = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const name = object.name || '';
    if (COLLISION_RE.test(name)) { object.visible = false; collisionMeshes.push(object); return; }
    visibleMeshes.push(object);
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (mode !== 'none' && !EXCLUDE_RE.test(name) && !material?.transparent && object.visible !== false) collisionMeshes.push(object);
  });
  const source = new THREE.Group();
  collisionMeshes.forEach((mesh) => {
    const clone = mesh.clone(false);
    clone.geometry = mesh.geometry;
    clone.material = mesh.material;
    mesh.updateWorldMatrix(true, false);
    clone.applyMatrix4(mesh.matrixWorld);
    source.add(clone);
  });
  const octree = new Octree();
  octree.fromGraphNode(source);
  return { octree, visibleMeshes, collisionMeshes, dedicatedCollisionCount: collisionMeshes.filter((m) => COLLISION_RE.test(m.name || '')).length };
}

export function resolveSafeSpawn(root, visibleMeshes, metadataSpawn, playerHeight = 1.65) {
  const box = new THREE.Box3().setFromObject(root);
  const spawnNode = findSpawnNode(root);
  const candidate = spawnNode ? spawnNode.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(metadataSpawn.x, metadataSpawn.y, metadataSpawn.z);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(candidate.x, box.max.y + playerHeight + 8, candidate.z), new THREE.Vector3(0, -1, 0));
  const hit = raycaster.intersectObjects(visibleMeshes, true).find((item) => item.object.visible !== false);
  if (hit) candidate.y = hit.point.y + 0.04;
  else candidate.y = Math.max(candidate.y, Number.isFinite(box.min.y) ? box.min.y + 0.08 : 0.08);
  return { position: candidate, rotationY: spawnNode ? spawnNode.rotation.y : Number(metadataSpawn.rotationY || 0), bounds: box };
}
