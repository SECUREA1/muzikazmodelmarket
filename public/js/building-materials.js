export const BUILDING_MATERIALS = Object.freeze([
  { id: 'studs', name: 'Studded block', color: 0x9cff00, roughness: .72 },
  { id: 'brick', name: 'Masonry brick', color: 0xb65438, roughness: .9, detail: 'mortar' },
  { id: 'cement', name: 'Cement', color: 0x969b9d, roughness: .95 },
  { id: 'rock', name: 'Rock', color: 0x70777d, roughness: 1, detail: 'rock' },
  { id: 'dirt', name: 'Dirt', color: 0x795334, roughness: 1 },
  { id: 'grass', name: 'Grass', color: 0x795334, roughness: 1, detail: 'grass' },
  { id: 'sand', name: 'Sand', color: 0xdcc286, roughness: 1 },
  { id: 'wood', name: 'Wood planks', color: 0xa97743, roughness: .8, detail: 'planks' },
  { id: 'metal', name: 'Metal', color: 0xa7b3bd, roughness: .3, metalness: .85 },
  { id: 'glass', name: 'Glass', color: 0xb3e8ed, roughness: .12, opacity: .35 },
  { id: 'water', name: 'Water', color: 0x249fe0, roughness: .18, opacity: .55, solid: false },
  { id: 'asphalt', name: 'Asphalt', color: 0x30343a, roughness: 1 },
  { id: 'snow', name: 'Snow', color: 0xf0f6ff, roughness: 1 },
].map(material => Object.freeze({ solid: true, metalness: 0, ...material })));

export function buildingMaterial(id) {
  return BUILDING_MATERIALS.find(material => material.id === id) || BUILDING_MATERIALS[0];
}

export function createBuildingBlock(THREE, id, { width = 1.2, height = .4, depth = .6, tint = null } = {}) {
  const profile = buildingMaterial(id), root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: tint ?? profile.color,
    roughness: profile.roughness, metalness: profile.metalness,
    transparent: profile.opacity !== undefined, opacity: profile.opacity ?? 1,
    depthWrite: profile.opacity === undefined });
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  body.userData.brickPaintPart = 'body';
  root.add(body);
  root.userData = { materialId: profile.id, solid: profile.solid };
  const addDetail = (geometry, color, x, y, z, paintable = false) => {
    const part = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .8 }));
    part.position.set(x, y, z);
    if (paintable) part.userData.brickPaintPart = 'stud';
    root.add(part);
  };
  if (profile.id === 'studs') {
    for (const x of [-.42, -.14, .14, .42]) for (const z of [-.16, .16]) {
      addDetail(new THREE.CylinderGeometry(.09, .09, .07, 12), tint ?? profile.color, x, height / 2 + .035, z, true);
    }
  } else if (profile.detail === 'grass') {
    addDetail(new THREE.BoxGeometry(width, .025, depth), 0x5c993c, 0, height / 2, 0);
  } else if (profile.detail === 'mortar' || profile.detail === 'planks') {
    const color = profile.detail === 'mortar' ? 0xd1c5b6 : 0x62442a;
    for (const x of [-width / 6, width / 6]) {
      addDetail(new THREE.BoxGeometry(.018, height, depth + .004), color, x, 0, 0);
    }
    if (profile.detail === 'mortar') addDetail(new THREE.BoxGeometry(width + .004, .018, depth + .004), color, 0, 0, 0);
  } else if (profile.detail === 'rock') {
    body.material.flatShading = true;
    addDetail(new THREE.IcosahedronGeometry(.14, 0), 0x8a9196, .15, .12, 0);
  }
  root.traverse(object => { if (object.isMesh) { object.castShadow = profile.solid; object.receiveShadow = true; } });
  return root;
}
