import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';

const FLAT_LAYOUTS = new Set(['grand-floor', 'vendor-street', 'creator-studios', 'market-square', 'railroad-world', 'skyport', 'desert-airfield']);

export function builderTerrainHeight(layout, x, z) {
  const ripple = .28 * Math.sin(x * .31) * Math.cos(z * .27);
  if (FLAT_LAYOUTS.has(layout)) return layout === 'grand-floor' ? 0 : ripple * .18;
  if (layout === 'loft') return ripple;
  if (layout === 'suite') return .16 * Math.sin(x * .45) + .1 * Math.cos(z * .35);
  if (layout === 'mountain-pass') return 1.2 + Math.sin(x * .18) * 1.5 + Math.cos(z * .22) * 1.1 - 2.2 * Math.exp(-(x * x) / 18);
  if (layout === 'crystal-cavern') return -.6 + Math.abs(Math.sin(x * .25) * Math.cos(z * .2)) * 1.25;
  if (layout === 'deep-mine') return -Math.min(3.2, Math.max(0, Math.floor((20 - Math.max(Math.abs(x), Math.abs(z))) / 4)) * .55) + ripple * .3;
  if (layout === 'sunrise-farm') return .35 * Math.sin(x * .18) + .22 * Math.cos(z * .2);
  if (layout === 'coastal-cliffs') return x > 5 ? -1.5 : 1.1 + Math.sin(z * .16) * .65 - Math.max(0, x + 7) * .055;
  if (layout === 'ancient-forest') return .45 * Math.sin(x * .2) + .4 * Math.cos(z * .17) + 1.25 * Math.exp(-(x * x + z * z) / 120);
  if (layout === 'neon-wetlands') return -.35 + Math.max(0, .7 * Math.sin(x * .22) * Math.cos(z * .25));
  if (layout === 'dune-sea') return .75 * Math.sin(x * .16) + .55 * Math.cos(z * .19) + .25 * Math.sin((x + z) * .3);
  return ripple + 1.1 * Math.exp(-(x * x + z * z) / 85);
}

/** Converts the editor template into the actual game world. */
export function createBuilderMapTemplate(builderScene) {
  const layout = builderScene.layout || 'grand-floor';
  const metadata = builderScene.layoutMeta || {};
  const world = new THREE.Group();
  world.name = `BUILDER_MAP_${layout}`;
  const geometry = new THREE.PlaneGeometry(40, 40, 80, 80);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) positions.setZ(index, builderTerrainHeight(layout, positions.getX(index), -positions.getY(index)));
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color:Number(metadata.color) || 0x315b32, roughness:.95 }));
  ground.name = 'Builder_template_ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);
  const rimMaterial = new THREE.MeshStandardMaterial({ color:0x17251c, roughness:.88 });
  [[40, .45, .35, 0, -20], [40, .45, .35, 0, 20], [.35, .45, 40, -20, 0], [.35, .45, 40, 20, 0]].forEach(([width, height, depth, x, z]) => {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), rimMaterial);
    rim.position.set(x, builderTerrainHeight(layout, x, z) + height / 2, z);
    rim.castShadow = rim.receiveShadow = true;
    world.add(rim);
  });
  world.userData.builderTemplate = { layout, name:metadata.name || builderScene.name || 'Builder map' };
  return world;
}
