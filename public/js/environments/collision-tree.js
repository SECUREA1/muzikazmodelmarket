import {Box3} from '../../vendor/three/three.module.min.js';
import {Octree as ThreeOctree} from '../../vendor/three/addons/math/Octree.js';

// Keep Three's collision/query API, but store each triangle in exactly one
// balanced leaf. Octant subdivision can duplicate a large floor or overlapping
// GLB surfaces through sixteen levels and stall the game before its first frame.
const LEAF_SIZE = 32;
const center = (triangle, axis) => triangle.a[axis] + triangle.b[axis] + triangle.c[axis];

function partition(triangles, first, last, middle, axis) {
  while (first < last) {
    const pivot = center(triangles[(first + last) >>> 1], axis);
    let left = first, right = last;
    while (left <= right) {
      while (center(triangles[left], axis) < pivot) left++;
      while (center(triangles[right], axis) > pivot) right--;
      if (left <= right) {
        [triangles[left], triangles[right]] = [triangles[right], triangles[left]];
        left++; right--;
      }
    }
    if (middle <= right) last = right;
    else if (middle >= left) first = left;
    else return;
  }
}

export class Octree extends ThreeOctree {
  build() {
    const triangles = this.triangles;
    this.triangles = [];
    this.subTrees = [];
    const fill = (node, first, end) => {
      const bounds = new Box3();
      for (let index = first; index < end; index++) {
        const triangle = triangles[index];
        bounds.expandByPoint(triangle.a);
        bounds.expandByPoint(triangle.b);
        bounds.expandByPoint(triangle.c);
      }
      node.bounds.copy(bounds);
      node.box = bounds.clone().expandByScalar(1e-6);
      if (end - first <= LEAF_SIZE) {
        node.triangles = triangles.slice(first, end);
        return;
      }
      const width = bounds.max.x - bounds.min.x, height = bounds.max.y - bounds.min.y, depth = bounds.max.z - bounds.min.z;
      const axis = width >= height && width >= depth ? 'x' : height >= depth ? 'y' : 'z';
      const middle = (first + end) >>> 1;
      partition(triangles, first, end - 1, middle, axis);
      const left = new Octree(), right = new Octree();
      node.subTrees = [left, right];
      fill(left, first, middle);
      fill(right, middle, end);
    };
    fill(this, 0, triangles.length);
    return this;
  }

  // Leaves never share triangles, so queries can append without the quadratic
  // duplicate scans needed by the original overlapping octants.
  getRayTriangles(ray, triangles) {
    if (!this.box || !ray.intersectsBox(this.box)) return triangles;
    for (const triangle of this.triangles) triangles.push(triangle);
    for (const child of this.subTrees) child.getRayTriangles(ray, triangles);
    return triangles;
  }

  getCapsuleTriangles(capsule, triangles) {
    if (!this.box || !capsule.intersectsBox(this.box)) return triangles;
    for (const triangle of this.triangles) triangles.push(triangle);
    for (const child of this.subTrees) child.getCapsuleTriangles(capsule, triangles);
    return triangles;
  }

  getSphereTriangles(sphere, triangles) {
    if (!this.box || !sphere.intersectsBox(this.box)) return triangles;
    for (const triangle of this.triangles) triangles.push(triangle);
    for (const child of this.subTrees) child.getSphereTriangles(sphere, triangles);
    return triangles;
  }
}
