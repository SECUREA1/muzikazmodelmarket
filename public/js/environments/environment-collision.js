import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';

const COLLISION_RE = /^(COLLIDER|COLLISION|NAVMESH)(_|$)/i;
const EXCLUDE_RE = /(SKY|PARTICLE|VFX|FOLIAGE|LEAF|LEAVES|GRASS|WATER|GLASS|LIGHT|HELPER|DECOR|AVATAR)/i;
const NON_SPAWN_FLOOR_RE = /(CEILING|ROOF|CANOPY|AWNING|SKY|WALL|WINDOW|DOOR|RAIL|FENCE|LIGHT|LAMP)/i;
const FLOOR_NAME_RE = /(FLOOR|GROUND|TERRAIN|PLATFORM|NAVMESH|WALK|STAGE|ROAD|PATH)/i;
const SPAWN_PRIORITY = ['SPAWN_PLAYER', 'SPAWN_DEFAULT'];
export const FLOOR_ENTRY_OFFSET = 0.125;
const WALKABLE_FLOOR_NORMAL_Y = 0.55;

function isWalkableFloorHit(hit) {
  if (!hit?.face) return true;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  return normal.y >= WALKABLE_FLOOR_NORMAL_Y;
}

function isSpawnFloorObject(object) {
  const name = object?.name || '';
  return !NON_SPAWN_FLOOR_RE.test(name);
}

function floorHitScore(hit) {
  const name = hit?.object?.name || '';
  return (FLOOR_NAME_RE.test(name) ? 2 : 1) * Math.max(0.1, hit.face?.normal?.y || 1);
}

function findWalkableFloorHit(meshes, point, bounds, playerHeight = 1.65) {
  const rayOriginY = Number.isFinite(bounds?.max?.y) ? bounds.max.y + playerHeight + 8 : point.y + playerHeight + 8;
  const raycaster = new THREE.Raycaster(new THREE.Vector3(point.x, rayOriginY, point.z), new THREE.Vector3(0, -1, 0));
  return raycaster.intersectObjects(meshes, true).find((item) => item.object.visible !== false && isSpawnFloorObject(item.object) && isWalkableFloorHit(item));
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


function chooseLargestSampledFloor(meshes, bounds, playerHeight = 1.65) {
  if (!meshes?.length || !Number.isFinite(bounds?.min?.x) || !Number.isFinite(bounds?.max?.x) || !Number.isFinite(bounds?.min?.z) || !Number.isFinite(bounds?.max?.z)) return null;
  const width = bounds.max.x - bounds.min.x;
  const depth = bounds.max.z - bounds.min.z;
  if (!(width > 0) || !(depth > 0)) return null;
  const samplesPerAxis = THREE.MathUtils.clamp(Math.ceil(Math.sqrt(meshes.length) * 4), 17, 45);
  const rayOriginY = (Number.isFinite(bounds.max.y) ? bounds.max.y : 0) + playerHeight + 8;
  const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const samples = Array.from({ length: samplesPerAxis }, () => Array(samplesPerAxis).fill(null));
  for (let xi = 0; xi < samplesPerAxis; xi += 1) {
    const x = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, (xi + 0.5) / samplesPerAxis);
    for (let zi = 0; zi < samplesPerAxis; zi += 1) {
      const z = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, (zi + 0.5) / samplesPerAxis);
      raycaster.ray.origin.set(x, rayOriginY, z);
      const hit = raycaster.intersectObjects(meshes, true).find((item) => item.object.visible !== false && isSpawnFloorObject(item.object) && isWalkableFloorHit(item));
      if (hit) samples[xi][zi] = hit.point.clone();
    }
  }
  const visited = Array.from({ length: samplesPerAxis }, () => Array(samplesPerAxis).fill(false));
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let best = null;
  for (let xi = 0; xi < samplesPerAxis; xi += 1) {
    for (let zi = 0; zi < samplesPerAxis; zi += 1) {
      const seed = samples[xi][zi];
      if (!seed || visited[xi][zi]) continue;
      const queue = [[xi, zi]];
      const group = { count: 0, point: new THREE.Vector3(), minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      visited[xi][zi] = true;
      while (queue.length) {
        const [xj, zj] = queue.shift();
        const point = samples[xj][zj];
        group.count += 1;
        group.point.add(point);
        group.minX = Math.min(group.minX, point.x);
        group.maxX = Math.max(group.maxX, point.x);
        group.minZ = Math.min(group.minZ, point.z);
        group.maxZ = Math.max(group.maxZ, point.z);
        neighbors.forEach(([dx, dz]) => {
          const nx = xj + dx;
          const nz = zj + dz;
          const next = samples[nx]?.[nz];
          if (!next || visited[nx][nz] || Math.abs(next.y - point.y) > 0.45) return;
          visited[nx][nz] = true;
          queue.push([nx, nz]);
        });
      }
      const spanArea = Math.max(0, group.maxX - group.minX) * Math.max(0, group.maxZ - group.minZ);
      const centerPoint = group.point.clone().multiplyScalar(1 / group.count);
      const centerHit = findWalkableFloorHit(meshes, centerPoint, bounds, playerHeight) || { point: centerPoint };
      const score = group.count * (spanArea || 1) * floorHitScore(centerHit);
      if (!best || score > best.score) best = { ...group, point: centerPoint, score };
    }
  }
  if (!best) return null;
  return best.point.clone();
}

export function findLargestWalkableFloorPoint(meshes, bounds, playerHeight = 1.65, floorGap = FLOOR_ENTRY_OFFSET) {
  const point = chooseLargestSampledFloor(meshes, bounds, playerHeight);
  return point ? alignPointAboveFloor(point, meshes, bounds, playerHeight, floorGap) : null;
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
  const largestFloorPoint = findLargestWalkableFloorPoint(visibleMeshes, box, playerHeight);
  const raw = largestFloorPoint || (spawnNode ? spawnNode.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(
    Number.isFinite(metadataSpawn.x) ? metadataSpawn.x : center.x,
    Number.isFinite(metadataSpawn.y) ? metadataSpawn.y : center.y,
    Number.isFinite(metadataSpawn.z) ? metadataSpawn.z : center.z
  ));
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
