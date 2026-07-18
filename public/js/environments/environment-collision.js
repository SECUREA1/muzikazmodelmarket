import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { Octree } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Octree.js/+esm';

const COLLISION_RE = /^(COLLIDER|COLLISION|NAVMESH)(_|$)/i;
const EXCLUDE_RE = /(SKY|PARTICLE|VFX|FOLIAGE|LEAF|LEAVES|GRASS|WATER|GLASS|LIGHT|HELPER|DECOR|AVATAR)/i;
const SPAWN_PRIORITY = ['SPAWN_PLAYER', 'SPAWN_DEFAULT'];
export const FLOOR_ENTRY_OFFSET = 0.125;
const WALKABLE_FLOOR_NORMAL_Y = 0.55;

function isWalkableFloorHit(hit) {
  if (!hit?.face) return true;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  return normal.y >= WALKABLE_FLOOR_NORMAL_Y;
}

function findWalkableFloorHit(meshes, point, bounds, playerHeight = 1.65) {
  const rayOriginY = Number.isFinite(bounds?.max?.y) ? bounds.max.y + playerHeight + 8 : point.y + playerHeight + 8;
  const raycaster = new THREE.Raycaster(new THREE.Vector3(point.x, rayOriginY, point.z), new THREE.Vector3(0, -1, 0));
  return raycaster.intersectObjects(meshes, true).find((item) => item.object.visible !== false && isWalkableFloorHit(item));
}

export function alignPointAboveFloor(point, meshes, bounds, playerHeight = 1.65, floorGap = FLOOR_ENTRY_OFFSET) {
  const aligned = point.clone();
  const hit = findWalkableFloorHit(meshes, aligned, bounds, playerHeight);
  if (hit) {
    aligned.x = hit.point.x;
    aligned.y = hit.point.y + floorGap;
    aligned.z = hit.point.z;
  } else if (Number.isFinite(bounds?.min?.y)) {
    aligned.y = Math.max(aligned.y, bounds.min.y + floorGap);
  } else {
    aligned.y = Math.max(aligned.y, floorGap);
  }
  return aligned;
}

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

export function resolveSafeSpawn(root, visibleMeshes, metadataSpawn = {}, playerHeight = 1.65) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const spawnNode = findSpawnNode(root);
  const raw = spawnNode ? spawnNode.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(
    Number.isFinite(metadataSpawn.x) ? metadataSpawn.x : center.x,
    Number.isFinite(metadataSpawn.y) ? metadataSpawn.y : center.y,
    Number.isFinite(metadataSpawn.z) ? metadataSpawn.z : center.z
  );
  const margin = 0.35;
  const candidate = new THREE.Vector3(
    THREE.MathUtils.clamp(raw.x, box.min.x + margin, box.max.x - margin),
    raw.y,
    THREE.MathUtils.clamp(raw.z, box.min.z + margin, box.max.z - margin)
  );
  const hit = findWalkableFloorHit(visibleMeshes, candidate, box, playerHeight) || findWalkableFloorHit(visibleMeshes, center, box, playerHeight);
  if (hit) { candidate.x = hit.point.x; candidate.y = hit.point.y + FLOOR_ENTRY_OFFSET; candidate.z = hit.point.z; }
  else candidate.copy(alignPointAboveFloor(candidate, visibleMeshes, box, playerHeight));
  return { position: candidate, rotationY: spawnNode ? spawnNode.rotation.y : Number(metadataSpawn.rotationY || 0), bounds: box };
}
