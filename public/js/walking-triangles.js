// Geometry shared by local and authoritative walking. These helpers only
// describe surfaces; they never move a player out of an overlap.
const EPSILON = 1e-8;
// Float32 model vertices can leave tiny cracks between adjacent floor faces.
const BARYCENTRIC_EPSILON = 1e-7;

export function triangleNormalY(triangle) {
  const {a, b, c} = triangle;
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z);
  return length > EPSILON ? y / length : 0;
}

export function triangleHeightAt(x, z, triangle) {
  const {a, b, c} = triangle;
  const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(denominator) < EPSILON) return null;
  const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
  const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
  if (u < -BARYCENTRIC_EPSILON || v < -BARYCENTRIC_EPSILON || u + v > 1 + BARYCENTRIC_EPSILON) return null;
  return u * a.y + v * b.y + (1 - u - v) * c.y;
}

function clipHeight(points, height, above) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const aInside = above ? a.y >= height : a.y <= height;
    const bInside = above ? b.y >= height : b.y <= height;
    if (aInside) result.push(a);
    if (aInside !== bInside) {
      const amount = (height - a.y) / (b.y - a.y);
      result.push({x: a.x + (b.x - a.x) * amount, y: height, z: a.z + (b.z - a.z) * amount});
    }
  }
  return result;
}

export function triangleWallSegments(triangle, bottom, top, {walkableNormalY = .55} = {}) {
  // Walkable ground and ceilings are handled vertically. Projecting them to a
  // horizontal obstacle would turn every floor seam into an invisible wall.
  if (Math.abs(triangleNormalY(triangle)) >= walkableNormalY || top <= bottom) return [];
  const polygon = clipHeight(clipHeight([triangle.a, triangle.b, triangle.c], bottom, true), top, false);
  const segments = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (Math.hypot(a.x - b.x, a.z - b.z) > EPSILON) segments.push({a: {x: a.x, z: a.z}, b: {x: b.x, z: b.z}});
  }
  return segments;
}

export function boxWallSegments(box, bottom, top) {
  if (box.max.y <= bottom || box.min.y >= top) return [];
  const {min, max} = box;
  const corners = [{x: min.x, z: min.z}, {x: max.x, z: min.z}, {x: max.x, z: max.z}, {x: min.x, z: max.z}];
  return corners.map((a, index) => ({a, b: corners[(index + 1) % corners.length]}));
}
