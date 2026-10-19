import {accelerateStaticMesh} from './public/js/static-mesh-queries.js';

// Browser combat and authoritative floor/clearance rays share one geometry
// accelerator. It preserves Three's hit data and reuses identical geometry
// instead of allocating and sorting a second tree for every placed instance.
export function accelerateStaticRaycast(mesh) {
  return accelerateStaticMesh(mesh);
}
