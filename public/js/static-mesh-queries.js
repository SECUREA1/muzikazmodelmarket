import * as THREE from '../vendor/three/three.module.min.js';

// Shared local-space triangle trees survive changes to an object's transform.
// Attribute versions invalidate the tree when a Builder edits its geometry.
// Animated/skinned/instanced geometry keeps Three's original raycaster.
const trees = new WeakMap();
const boundsRevisions = new WeakMap();
const accelerated = new WeakMap();
const MIN_TRIANGLES = 96;
const LEAF_TRIANGLES = 12;

function staticGeometry(mesh) {
  return mesh?.isMesh && !mesh.isSkinnedMesh && !mesh.isInstancedMesh &&
    mesh.geometry?.attributes?.position && !Object.values(mesh.geometry.morphAttributes || {}).some(values => values.length);
}

function positionRevision(geometry) {
  const position = geometry.attributes.position;
  return [position, position.version ?? position.data?.version, position.count];
}

function refreshGeometryBounds(geometry) {
  const revision = positionRevision(geometry), previous = boundsRevisions.get(geometry);
  if (previous && !revision.every((value, index) => previous[index] === value)) {
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  }
  boundsRevisions.set(geometry, revision);
}

function geometryTree(geometry) {
  const position = geometry.attributes.position, index = geometry.index;
  const revision = [position, position.version ?? position.data?.version, index, index?.version, position.count, index?.count];
  let record = trees.get(geometry);
  if (record && revision.every((value, key) => record.revision[key] === value)) return record;
  const count = Math.floor((index?.count ?? position.count) / 3);
  if (count < MIN_TRIANGLES) return null;
  const order = new Uint32Array(count), bounds = new Float64Array(count * 6);
  const vertex = new THREE.Vector3();
  for (let triangle = 0; triangle < count; triangle++) {
    order[triangle] = triangle;
    const offset = triangle * 6;
    bounds[offset] = bounds[offset + 1] = bounds[offset + 2] = Infinity;
    bounds[offset + 3] = bounds[offset + 4] = bounds[offset + 5] = -Infinity;
    for (let corner = 0; corner < 3; corner++) {
      vertex.fromBufferAttribute(position, index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner);
      for (let axis = 0; axis < 3; axis++) {
        const value = vertex.getComponent(axis);
        bounds[offset + axis] = Math.min(bounds[offset + axis], value);
        bounds[offset + axis + 3] = Math.max(bounds[offset + axis + 3], value);
      }
    }
  }
  const center = (triangle, axis) => bounds[triangle * 6 + axis] + bounds[triangle * 6 + axis + 3];
  const select = (start, end, middle, axis) => {
    let left = start, right = end - 1;
    while (left < right) {
      const pivot = center(order[(left + right) >>> 1], axis);
      let a = left, b = right;
      while (a <= b) {
        while (center(order[a], axis) < pivot) a++;
        while (center(order[b], axis) > pivot) b--;
        if (a <= b) { const value = order[a]; order[a++] = order[b]; order[b--] = value; }
      }
      if (middle <= b) right = b;
      else if (middle >= a) left = a;
      else break;
    }
  };
  const build = (start, end) => {
    const box = new THREE.Box3();
    for (let at = start; at < end; at++) {
      const offset = order[at] * 6;
      box.min.x = Math.min(box.min.x, bounds[offset]); box.max.x = Math.max(box.max.x, bounds[offset + 3]);
      box.min.y = Math.min(box.min.y, bounds[offset + 1]); box.max.y = Math.max(box.max.y, bounds[offset + 4]);
      box.min.z = Math.min(box.min.z, bounds[offset + 2]); box.max.z = Math.max(box.max.z, bounds[offset + 5]);
    }
    const node = { box, start, end, left: null, right: null };
    if (end - start > LEAF_TRIANGLES) {
      const size = box.getSize(vertex), axis = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
      const middle = (start + end) >>> 1;
      select(start, end, middle, axis);
      node.left = build(start, middle); node.right = build(middle, end);
    }
    return node;
  };
  record = { revision, order, root: build(0, count), count };
  trees.set(geometry, record);
  return record;
}

function visit(record, overlaps, triangle) {
  const stack = [record.root];
  while (stack.length) {
    const node = stack.pop();
    if (!overlaps(node.box)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let at = node.start; at < node.end; at++) if (triangle(record.order[at]) === true) return true;
  }
  return false;
}

// Keep Three's triangle intersection implementation, including material sides,
// indexed/nonindexed geometry, groups, draw ranges, UVs, normals and face IDs.
// Only its linear triangle scan is replaced. No geometry or material is mutated.
export function accelerateStaticMesh(mesh) {
  if (!staticGeometry(mesh) || accelerated.has(mesh) || typeof mesh._computeIntersections !== 'function') return false;
  if (!geometryTree(mesh.geometry)) return false;
  refreshGeometryBounds(mesh.geometry);
  const original = mesh._computeIntersections, originalRaycast = mesh.raycast;
  const proxy = Object.create(mesh);
  let geometry = null, proxyGeometry = null;
  const range = { start: 0, count: 3 };
  mesh.raycast = function (raycaster, intersections) {
    if (staticGeometry(this)) {
      refreshGeometryBounds(this.geometry);
    }
    return originalRaycast.call(this, raycaster, intersections);
  };
  mesh._computeIntersections = function (raycaster, intersections, ray) {
    const current = this.geometry;
    if (!staticGeometry(this) || current.drawRange.start % 3 || current.groups.some(group => group.start % 3)) return original.call(this, raycaster, intersections, ray);
    const record = geometryTree(current);
    if (!record) return original.call(this, raycaster, intersections, ray);
    if (geometry !== current) {
      geometry = current; proxyGeometry = Object.create(current); proxyGeometry.drawRange = range; proxy.geometry = proxyGeometry;
    }
    const drawStart = current.drawRange.start, drawEnd = drawStart + current.drawRange.count;
    const firstHit = intersections.length;
    visit(record, box => ray.intersectsBox(box), triangle => {
      const offset = triangle * 3;
      if (offset < drawStart || offset >= drawEnd) return;
      range.start = offset;
      original.call(proxy, raycaster, intersections, ray);
    });
    for (let hit = firstHit; hit < intersections.length; hit++) intersections[hit].object = this;
  };
  accelerated.set(mesh, original);
  return true;
}

export function accelerateStaticMeshes(meshes) { for (const mesh of meshes) accelerateStaticMesh(mesh); }

export function meshWorldBounds(mesh, target = new THREE.Box3()) {
  mesh.updateWorldMatrix(true, false);
  if (mesh.isSkinnedMesh || mesh.isInstancedMesh) {
    mesh.computeBoundingBox();
    return target.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
  }
  refreshGeometryBounds(mesh.geometry);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return target.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
}

export class MeshContactQueries {
  constructor() {
    this.inverse = new THREE.Matrix4(); this.localRay = new THREE.Ray(); this.localSphere = new THREE.Sphere();
    this.worldRay = new THREE.Ray(); this.triangle = new THREE.Triangle(); this.point = new THREE.Vector3();
    this.localPoint = new THREE.Vector3(); this.box = new THREE.Box3(); this.insideDirection = new THREE.Vector3(1, .371, .217).normalize();
  }
  triangles(mesh, overlaps, callback) {
    const record = staticGeometry(mesh) ? geometryTree(mesh.geometry) : null;
    const triangle = this.triangle, positions = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const check = number => {
      mesh.getVertexPosition(index ? index.getX(number * 3) : number * 3, triangle.a).applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(index ? index.getX(number * 3 + 1) : number * 3 + 1, triangle.b).applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(index ? index.getX(number * 3 + 2) : number * 3 + 2, triangle.c).applyMatrix4(mesh.matrixWorld);
      return callback(triangle);
    };
    if (record) return visit(record, overlaps, check);
    const count = Math.floor((index?.count ?? positions.count) / 3);
    for (let number = 0; number < count; number++) if (check(number) === true) return true;
    return false;
  }
  segment(mesh, start, direction, distance, bounds = null) {
    if (!bounds) bounds = meshWorldBounds(mesh, this.box);
    this.worldRay.set(start, direction);
    if (!bounds.containsPoint(start) && (!this.worldRay.intersectBox(bounds, this.point) || this.point.distanceToSquared(start) > distance * distance)) return null;
    this.inverse.copy(mesh.matrixWorld).invert();
    this.localRay.copy(this.worldRay).applyMatrix4(this.inverse);
    let nearest = null;
    this.triangles(mesh, box => this.localRay.intersectsBox(box), triangle => {
      const point = this.worldRay.intersectTriangle(triangle.a, triangle.b, triangle.c, false, this.point);
      if (!point) return;
      const hitDistance = point.distanceTo(start);
      if (hitDistance <= distance && (!nearest || hitDistance < nearest.distance)) nearest = {
        point: point.clone(), distance: hitDistance, normal: triangle.getNormal(new THREE.Vector3()),
      };
    });
    return nearest;
  }
  touching(mesh, point, radius, surfaceOnly = false, bounds = null) {
    if (!bounds) bounds = meshWorldBounds(mesh, this.box);
    this.localSphere.set(point, radius);
    if (!bounds.intersectsSphere(this.localSphere)) return false;
    this.inverse.copy(mesh.matrixWorld).invert();
    this.localPoint.copy(point).applyMatrix4(this.inverse);
    // Frobenius norm bounds inverse scale even for sheared/nonuniform parents.
    const m = this.inverse.elements;
    const inverseScale = Math.sqrt(m[0] ** 2 + m[1] ** 2 + m[2] ** 2 + m[4] ** 2 + m[5] ** 2 + m[6] ** 2 + m[8] ** 2 + m[9] ** 2 + m[10] ** 2);
    this.localSphere.set(this.localPoint, radius * inverseScale);
    if (this.triangles(mesh, box => box.intersectsSphere(this.localSphere), triangle => {
      triangle.closestPointToPoint(point, this.point);
      return this.point.distanceToSquared(point) <= radius * radius;
    })) return true;
    if (surfaceOnly || !bounds.containsPoint(point)) return false;
    this.worldRay.set(point, this.insideDirection);
    this.localRay.copy(this.worldRay).applyMatrix4(this.inverse);
    const crossings = new Set();
    this.triangles(mesh, box => this.localRay.intersectsBox(box), triangle => {
      if (this.worldRay.intersectTriangle(triangle.a, triangle.b, triangle.c, false, this.point)) crossings.add(Math.round(point.distanceTo(this.point) * 1e6));
    });
    return crossings.size % 2 === 1;
  }
}
