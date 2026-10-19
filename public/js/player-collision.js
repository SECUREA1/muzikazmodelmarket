const WALKABLE_NORMAL_Y = 0.55;
const CONTACT_SKIN = 0.002;
const SUPPORT_DISTANCE = 0.045;
export const PLAYER_BODY_HEIGHT = 1.7;
export const PLAYER_BODY_RADIUS = 0.3;
export const PLAYER_EYE_HEIGHT = 1.65;

/** The vertical player capsule against a solid box, including its rounded corners. */
export function capsuleBoxContact(capsule, box) {
  const {start, end, radius} = capsule;
  const x = start.x, z = start.z;
  const dx = x - Math.max(box.min.x, Math.min(box.max.x, x));
  const dz = z - Math.max(box.min.z, Math.min(box.max.z, z));
  const dy = start.y > box.max.y ? start.y - box.max.y : end.y < box.min.y ? end.y - box.min.y : 0;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= radius) return null;
  if (distance > 1e-8) return {normal: start.clone().set(dx / distance, dy / distance, dz / distance), depth: radius - distance};
  // An axis already inside a solid needs the nearest exit, including ceilings.
  const exits = [
    [x - box.min.x + radius, -1, 0, 0], [box.max.x - x + radius, 1, 0, 0],
    [z - box.min.z + radius, 0, 0, -1], [box.max.z - z + radius, 0, 0, 1],
    [box.max.y - start.y + radius, 0, 1, 0], [end.y + radius - box.min.y, 0, -1, 0]
  ];
  const [depth, nx, ny, nz] = exits.reduce((best, exit) => exit[0] < best[0] ? exit : best);
  return {normal: start.clone().set(nx, ny, nz), depth};
}

function eachOctreeContact(octree, capsule, visit) {
  // capsuleIntersect returns an aggregate floor/wall normal. Keep the actual
  // triangle normals so a tiny upward wall component cannot become ground.
  if (octree?.getCapsuleTriangles && octree?.triangleCapsuleIntersect) {
    const triangles = [];
    octree.getCapsuleTriangles(capsule, triangles);
    for (const triangle of triangles) {
      const contact = octree.triangleCapsuleIntersect(capsule, triangle);
      if (contact) visit(contact);
    }
  } else {
    const contact = octree?.capsuleIntersect(capsule);
    if (contact) visit(contact);
  }
}

/** Move, slide and land without treating furniture edges as a floor. */
export function movePlayerCapsule(capsule, {
  movement, velocity, delta, octree, boxes = [], findFloor,
  grounded = false, flying = false, gravity = 18
}) {
  if (!(delta > 0)) return {grounded, ceiling: false};
  const travel = Math.max(Math.hypot(movement.x, movement.z), Math.abs(velocity.y) * delta + gravity * delta * delta);
  const steps = Math.max(1, Math.ceil(travel / Math.max(0.025, capsule.radius * 0.4)));
  const stepTime = delta / steps;
  const shift = capsule.start.clone().set(0, 0, 0);
  let ceiling = false;

  for (let step = 0; step < steps; step++) {
    const previousFootY = capsule.start.y - capsule.radius;
    const wasGrounded = grounded;
    grounded = false;
    // Probe gravity every frame, even on the floor; otherwise grounded and
    // airborne alternate when the capsule has no penetration to resolve.
    if (!flying) velocity.y -= gravity * stepTime;

    function settle() {
      for (let pass = 0; pass < 4; pass++) {
        let corrected = false;
        const apply = contact => {
          const {depth, normal} = contact;
          const length = Math.hypot(normal?.x, normal?.y, normal?.z);
          if (!(depth > 1e-7) || !Number.isFinite(depth) || !(length > 1e-8)) return;
          const nx = normal.x / length, ny = normal.y / length, nz = normal.z / length;
          const distance = depth + CONTACT_SKIN;
          if (Math.abs(ny) < WALKABLE_NORMAL_Y) {
            // Resolve steep surfaces sideways, instead of lifting a player up
            // the rounded edge of a wall or repeatedly pinning them to it.
            const horizontal = nx * nx + nz * nz;
            shift.set(nx * distance / horizontal, 0, nz * distance / horizontal);
          } else shift.set(nx * distance, ny * distance, nz * distance);
          capsule.translate(shift);
          if (ny >= WALKABLE_NORMAL_Y && velocity.y <= 0) { grounded = true; velocity.y = 0; }
          if (ny <= -WALKABLE_NORMAL_Y && velocity.y > 0) { ceiling = true; velocity.y = 0; }
          corrected = true;
        };
        eachOctreeContact(octree, capsule, apply);
        for (const entry of boxes) {
          const box = entry.box || entry;
          const contact = capsuleBoxContact(capsule, box);
          if (!contact) continue;
          const rise = box.max.y - previousFootY;
          if (wasGrounded && velocity.y <= 0 && entry.stepHeight && rise > CONTACT_SKIN && rise <= entry.stepHeight) {
            const raised = capsule.clone();
            const lift = box.max.y + CONTACT_SKIN - (capsule.start.y - capsule.radius);
            raised.translate(shift.set(0, lift, 0));
            let blocked = false;
            eachOctreeContact(octree, raised, hit => { if (hit.depth > CONTACT_SKIN) blocked = true; });
            if (!blocked) blocked = boxes.some(other => other !== entry && (capsuleBoxContact(raised, other.box || other)?.depth || 0) > CONTACT_SKIN);
            if (!blocked) { capsule.translate(shift.set(0, lift, 0)); grounded = true; velocity.y = 0; corrected = true; continue; }
          }
          apply(contact);
        }
        if (!corrected) break;
      }
    }

    // Keep wall sliding independent from falling/jumping and limit each sweep
    // to less than a capsule radius so narrow mesh faces cannot be skipped.
    capsule.translate(shift.set(movement.x / steps, 0, movement.z / steps));
    settle();
    capsule.translate(shift.set(0, velocity.y * stepTime, 0));
    settle();

    if (!flying && velocity.y <= 0) {
      const footY = capsule.start.y - capsule.radius;
      const fromY = Math.max(previousFootY, footY) + CONTACT_SKIN;
      const toY = footY - (wasGrounded || grounded ? SUPPORT_DISTANCE : CONTACT_SKIN);
      let floor = findFloor?.({x: capsule.start.x, z: capsule.start.z, fromY, toY});
      // Placed pieces also need stable support between penetration frames.
      // Only their actual top footprint supports standing, not the expanded
      // square around a box corner that used to catch the player's feet.
      for (const entry of boxes) {
        const box = entry.box || entry;
        if (capsule.start.x >= box.min.x && capsule.start.x <= box.max.x && capsule.start.z >= box.min.z && capsule.start.z <= box.max.z && box.max.y >= toY && box.max.y <= fromY && (!floor || box.max.y > floor.y)) floor = {y: box.max.y, normalY: 1};
      }
      if (floor && floor.normalY >= WALKABLE_NORMAL_Y && floor.y >= toY && floor.y <= fromY) {
        capsule.translate(shift.set(0, floor.y + CONTACT_SKIN - footY, 0));
        velocity.y = 0;
        grounded = true;
      }
    }
  }
  return {grounded, ceiling};
}
