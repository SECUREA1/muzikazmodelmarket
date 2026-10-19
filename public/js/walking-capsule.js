import {sweepWalkingMotion} from './walking-sweep.js';
import {boxWallSegments, triangleHeightAt, triangleNormalY, triangleWallSegments} from './walking-triangles.js';

const EPSILON = 1e-7;
const WALKABLE_NORMAL_Y = .55;

function moveY(capsule, amount) {
  capsule.start.y += amount;
  capsule.end.y += amount;
}

function copyAt(capsule, x, y, z) {
  const result = capsule.clone();
  result.start.x = result.end.x = x;
  result.start.z = result.end.z = z;
  moveY(result, y - (capsule.start.y - capsule.radius));
  return result;
}

function boxCapsuleContact(capsule, box) {
  const x = capsule.start.x, z = capsule.start.z;
  const px = Math.max(box.min.x, Math.min(box.max.x, x));
  const pz = Math.max(box.min.z, Math.min(box.max.z, z));
  const sy = Math.max(capsule.start.y, Math.min(capsule.end.y, box.max.y));
  const py = Math.max(box.min.y, Math.min(box.max.y, sy));
  const dx = x - px, dy = sy - py, dz = z - pz;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= capsule.radius) return null;
  return {depth: capsule.radius - distance, normal: {x: distance ? dx / distance : 0, y: distance ? dy / distance : 0, z: distance ? dz / distance : 0}, point: {x: px, y: py, z: pz}};
}

function contactsAt(capsule, triangles, boxes, octree) {
  const contacts = [];
  if (octree?.triangleCapsuleIntersect) for (const triangle of triangles) {
    const hit = octree.triangleCapsuleIntersect(capsule, triangle);
    if (hit && hit.depth > EPSILON) contacts.push({...hit, surface: triangle});
  }
  for (const box of boxes) {
    const hit = boxCapsuleContact(capsule, box);
    if (hit) contacts.push({...hit, surface: box});
  }
  return contacts;
}

function floorAt(x, z, min, max, triangles, boxes) {
  let height = null;
  for (const triangle of triangles) {
    if (triangleNormalY(triangle) < WALKABLE_NORMAL_Y) continue;
    const y = triangleHeightAt(x, z, triangle);
    if (y !== null && y >= min - EPSILON && y <= max + EPSILON && (height === null || y > height)) height = y;
  }
  for (const box of boxes) if (x >= box.min.x - EPSILON && x <= box.max.x + EPSILON && z >= box.min.z - EPSILON && z <= box.max.z + EPSILON && box.max.y >= min - EPSILON && box.max.y <= max + EPSILON && (height === null || box.max.y > height)) height = box.max.y;
  return height;
}

function wallSegments(triangles, boxes, bottom, top, previous) {
  const segments = [];
  for (const triangle of triangles) segments.push(...triangleWallSegments(triangle, bottom, top));
  for (const box of boxes) {
    // A block can be edited around a standing player. Let their next input
    // leave its interior instead of pinning them between opposing faces.
    if (previous.x > box.min.x && previous.x < box.max.x && previous.z > box.min.z && previous.z < box.max.z && previous.y < box.max.y && top > box.min.y) continue;
    segments.push(...boxWallSegments(box, bottom, top));
  }
  return segments;
}

function gatherTriangles(capsule, xzDistance, verticalDistance, maxStepHeight, octree, extraTriangles, triangleGroups) {
  const triangles = [];
  const broad = capsule.clone();
  broad.radius += xzDistance + .025;
  broad.start.y += Math.min(-maxStepHeight, verticalDistance) - .025;
  broad.end.y += Math.max(maxStepHeight, verticalDistance) + .025;
  octree?.getCapsuleTriangles?.(broad, triangles);
  const bounds = {
    min: {x: broad.start.x - broad.radius, y: broad.start.y - broad.radius, z: broad.start.z - broad.radius},
    max: {x: broad.start.x + broad.radius, y: broad.end.y + broad.radius, z: broad.start.z + broad.radius}
  };
  const overlaps = box => box.min.x <= bounds.max.x && box.max.x >= bounds.min.x && box.min.y <= bounds.max.y && box.max.y >= bounds.min.y && box.min.z <= bounds.max.z && box.max.z >= bounds.min.z;
  const collect = triangle => {
    const {a, b, c} = triangle;
    if (Math.min(a.x, b.x, c.x) <= bounds.max.x && Math.max(a.x, b.x, c.x) >= bounds.min.x && Math.min(a.y, b.y, c.y) <= bounds.max.y && Math.max(a.y, b.y, c.y) >= bounds.min.y && Math.min(a.z, b.z, c.z) <= bounds.max.z && Math.max(a.z, b.z, c.z) >= bounds.min.z) triangles.push(triangle);
  };
  for (const triangle of extraTriangles) collect(triangle);
  for (const group of triangleGroups) if (!group.bounds || overlaps(group.bounds)) for (const triangle of group.triangles) collect(triangle);
  return triangles;
}

// A ceiling clips an upward move. Existing overlaps can be left freely, and
// wall contact never cancels gravity or adds an upward/sideways correction.
function sweepUp(capsule, amount, triangles, boxes, octree, skin) {
  const original = capsule.clone();
  const baseline = new Map(contactsAt(original, triangles, boxes, octree).filter(hit => hit.normal.y < -.05).map(hit => [hit.surface, hit.depth]));
  const blocked = distance => contactsAt(copyAt(original, original.start.x, original.start.y - original.radius + distance, original.start.z), triangles, boxes, octree)
    .some(hit => hit.normal.y < -.05 && hit.depth > (baseline.get(hit.surface) || 0) + EPSILON);
  const count = Math.max(1, Math.ceil(amount / Math.max(.025, capsule.radius * .4)));
  let accepted = 0;
  for (let i = 1; i <= count; i++) {
    const distance = amount * i / count;
    if (!blocked(distance)) { accepted = distance; continue; }
    let low = accepted, high = distance;
    for (let search = 0; search < 10; search++) {
      const middle = (low + high) / 2;
      if (blocked(middle)) high = middle; else low = middle;
    }
    return Math.max(0, low - skin);
  }
  return amount;
}

/**
 * Move a THREE-style upright Capsule by requested controls and gravity.
 * World triangles and optional Box3-style objects share the same sweep. The
 * capsule is changed only by an accepted move, a supported step, or falling;
 * neither idle contact nor an initial overlap depenetrates the player.
 */
export function moveWalkingCapsule(capsule, requested, {
  octree, boxes = [], triangles: extraTriangles = [], triangleGroups = [], grounded = false, verticalVelocity = 0,
  maxStepHeight = .26, floorGap = .02, skin = .002
} = {}) {
  const initial = {x: capsule.start.x, y: capsule.start.y - capsule.radius, z: capsule.start.z};
  const dx = Number(requested?.x) || 0, dz = Number(requested?.z) || 0;
  // Bound query work for a suspended tab or malformed delta. The caller can
  // retain vertical velocity; continuous floor tests still prevent tunnelling.
  const verticalLimit = Math.max(.025, capsule.radius * .4) * 32;
  const dy = Math.max(-verticalLimit, Math.min(verticalLimit, Number(requested?.y) || 0));
  const walking = Math.hypot(dx, dz) > EPSILON;
  const triangles = gatherTriangles(capsule, Math.hypot(dx, dz), dy, maxStepHeight, octree, extraTriangles, triangleGroups);
  const topOffset = capsule.end.y + capsule.radius - initial.y;
  const support = floorAt(initial.x, initial.z, initial.y - floorGap - .04, initial.y + .04, triangles, boxes);
  const resting = grounded && verticalVelocity <= 0 && support !== null;
  const canStep = resting && walking && dy <= 0;
  const desired = {x: initial.x + dx, y: initial.y, z: initial.z + dz};
  const sweep = step => sweepWalkingMotion(initial, desired, wallSegments(triangles, boxes, initial.y + step + skin, initial.y + topOffset - skin, initial), {radius: capsule.radius, skin});
  let next = walking ? sweep(canStep ? maxStepHeight : 0) : {...initial};
  let foot = initial.y, stepped = false;

  if (canStep) {
    const surface = floorAt(next.x, next.z, initial.y - maxStepHeight - floorGap, initial.y + maxStepHeight - floorGap, triangles, boxes);
    const rise = surface === null ? 0 : surface + floorGap - initial.y;
    if (rise > EPSILON) {
      const raised = copyAt(capsule, next.x, initial.y + rise, next.z);
      const headBlocked = contactsAt(raised, triangles, boxes, octree).some(hit => hit.depth > skin && hit.normal.y < -.05);
      if (headBlocked) next = sweep(0);
      else { foot += rise; stepped = true; }
    } else if (rise < -EPSILON) { foot += rise; stepped = true; }
  }

  capsule.start.x = capsule.end.x = next.x;
  capsule.start.z = capsule.end.z = next.z;
  moveY(capsule, foot - initial.y);
  let onGround = false, velocityY = verticalVelocity;
  if (dy > 0) {
    const accepted = sweepUp(capsule, dy, triangles, boxes, octree, skin);
    moveY(capsule, accepted);
    if (accepted < dy - EPSILON) velocityY = 0;
  } else {
    // A floor is selected beneath the final center. Radius overlap with the
    // edge of a bench/brick cannot pull the player onto its top.
    const surface = floorAt(next.x, next.z, foot + dy - floorGap, foot, triangles, boxes);
    const landing = surface === null ? null : Math.min(foot, surface + floorGap);
    if (landing !== null && landing >= foot + dy - EPSILON) {
      // At rest preserve the exact accepted height, including spawn clearance.
      const hold = resting && !walking && Math.abs(foot - surface) <= floorGap + .04;
      moveY(capsule, (hold ? foot : landing) - foot);
      onGround = true;
      velocityY = 0;
    } else if (stepped) {
      onGround = true;
      velocityY = 0;
    } else moveY(capsule, dy);
  }
  return {onGround, velocityY, moved: {x: capsule.start.x - initial.x, y: capsule.start.y - capsule.radius - initial.y, z: capsule.start.z - initial.z}};
}
