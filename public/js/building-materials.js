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
  { id: 'clay', name: 'Clay', color: 0xc68264, roughness: 1 },
  { id: 'marble', name: 'Marble', color: 0xe1ded5, roughness: .25 },
  { id: 'copper', name: 'Copper', color: 0xb66d42, roughness: .3, metalness: .85 },
  { id: 'ice', name: 'Ice', color: 0x91dcff, roughness: .15, opacity: .65 },
  { id: 'wall', name: 'Fort wall', color: 0xa97743, roughness: .85, shape: 'wall', dimensions: [2.4, 2.4, .2] },
  { id: 'floor', name: 'Floor platform', color: 0x929a9f, roughness: .9, shape: 'floor', dimensions: [2.4, .2, 2.4] },
  { id: 'steps', name: 'Stone steps', color: 0x969b9d, roughness: 1, shape: 'steps', dimensions: [1.8, 1.2, 2.4] },
  { id: 'ramp', name: 'Fort ramp', color: 0xa97743, roughness: .85, shape: 'ramp', dimensions: [2.4, 1.2, 2.4] },
  { id: 'window', name: 'Window wall', color: 0xd6c9b5, roughness: .8, shape: 'window', dimensions: [2.4, 2.4, .2] },
  { id: 'door', name: 'Opening door', color: 0x9b653c, roughness: .8, shape: 'door', dimensions: [1.8, 2.4, .2] },
  { id: 'fence', name: 'Fence', color: 0x957145, roughness: .9, shape: 'fence', dimensions: [2.4, 1.2, .15] },
  { id: 'pillar', name: 'Support pillar', color: 0xc1beb7, roughness: .9, shape: 'pillar', dimensions: [.4, 2.4, .4] },
  { id: 'market', name: 'Market stall', color: 0xc78440, roughness: .8, shape: 'market', dimensions: [2.4, 2.4, 1.8] },
  { id: 'counter', name: 'Shop counter', color: 0x8b633f, roughness: .8, shape: 'counter', dimensions: [2.4, .9, .6] },
  { id: 'bench', name: 'Park bench', color: 0x956132, roughness: .85, shape: 'bench', dimensions: [1.8, 1.2, .6] },
  { id: 'planter', name: 'Planter', color: 0xb55f3d, roughness: .9, shape: 'planter', dimensions: [1.2, .6, .6] },
  { id: 'granite', name: 'Granite', color: 0x8c8581, roughness: .9 },
  { id: 'basalt', name: 'Basalt', color: 0x45464c, roughness: 1 },
  { id: 'mud', name: 'Mud', color: 0x574032, roughness: .9 },
  { id: 'rubber', name: 'Rubber', color: 0x23282a, roughness: .95 },
  { id: 'gold', name: 'Gold', color: 0xe2bb44, roughness: .22, metalness: .95 },
  { id: 'roof', name: 'Roof canopy', color: 0x784d36, roughness: .8, shape: 'roof', dimensions: [2.4, .6, 2.4] },
  { id: 'arch', name: 'Archway', color: 0xc4b89e, roughness: .9, shape: 'arch', dimensions: [2.4, 2.4, .3] },
  { id: 'crate', name: 'Storage crate', color: 0x936b40, roughness: .9, shape: 'crate', dimensions: [1.2, 1.2, 1.2] },
  { id: 'shelf', name: 'Market shelves', color: 0x9d7247, roughness: .8, shape: 'shelf', dimensions: [1.8, 1.8, .5] },
  { id: 'table', name: 'Market table', color: 0xb28757, roughness: .8, shape: 'table', dimensions: [1.8, .9, 1.2] },
].map(material => Object.freeze({ solid: true, metalness: 0, ...material })));

export function buildingMaterial(id) {
  return BUILDING_MATERIALS.find(material => material.id === id) || BUILDING_MATERIALS[0];
}

export function createBuildingBlock(THREE, id, { width = 1.2, height = .4, depth = .6, tint = null } = {}) {
  const profile = buildingMaterial(id), root = new THREE.Group();
  if (profile.shape) return createStructure(THREE, profile, tint);
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

export function buildingDimensions(id) {
  return buildingMaterial(id).dimensions || [1.2, .4, .6];
}

function createStructure(T, profile, tint) {
  const root = new T.Group(), [w, h, d] = profile.dimensions;
  root.userData = { materialId: profile.id, solid: true, structure: true };
  const part = (width, height, depth, x=0, y=0, z=0, color=tint ?? profile.color) => {
    const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), new T.MeshStandardMaterial({color, roughness:profile.roughness}));
    mesh.position.set(x, y-h/2+height/2, z);
    mesh.userData.brickPaintPart='body'; mesh.castShadow=true; mesh.receiveShadow=true;
    root.add(mesh); return mesh;
  };
  switch(profile.shape) {
    case 'roof':
      for(let i=0;i<6;i++)part(w/6,.15,d,-w/2+w*(i+.5)/6,.45-Math.abs(i-2.5)*.12);break;
    case 'arch':
      part(.35,h,d,-w/2+.175);part(.35,h,d,w/2-.175);part(w,.4,d,0,h-.4);break;
    case 'shelf':
      part(.12,h,d,-w/2+.06);part(.12,h,d,w/2-.06);
      for(const y of [0,.55,1.1,1.7])part(w,.1,d,0,y);break;
    case 'table':
      part(w,.12,d,0,h-.12);
      for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])part(.12,h-.12,.12,x,0,z);break;
    case 'steps': case 'ramp': {
      // Small treads keep capsule stepping reliable without a bounding-box slope.
      const count = profile.shape === 'ramp' ? 8 : 4;
      for(let i=0;i<count;i++)part(w,h*(i+1)/count,d/count,0,0,-d/2+d*(i+.5)/count);
      break;
    }
    case 'window':
      part(w,.65,d); part(w,.45,d,0,h-.45);
      part(.35,h-1.1,d,-w/2+.175,.65);part(.35,h-1.1,d,w/2-.175,.65);
      break;
    case 'door': {
      part(.15,h,d,-w/2+.075);part(.15,h,d,w/2-.075);part(w,.15,d,0,h-.15);
      const leaf=part(w-.3,h-.15,.1);leaf.userData.buildDoorLeaf=true;
      root.userData.canToggle=true;root.userData.open=false;break;
    }
    case 'fence':
      for(const x of [-w/2+.08,0,w/2-.08])part(.16,h,d,x);
      for(const y of [.3,.85])part(w,.14,d,0,y);break;
    case 'market':
      for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])part(.12,h,.12,x,0,z);
      part(w,.65,.5,0,0,d/2-.25);
      for(let i=0;i<6;i++)part(w/6,.12,d,-w/2+w*(i+.5)/6,h-.12,0,i%2?0xffefe0:0xcc3e38);
      break;
    case 'bench':
      part(w,.12,d,0,.45);part(w,.7,.1,0,.5,d/2-.05);
      for(const x of [-w/2+.2,w/2-.2])part(.12,.45,d,x);break;
    case 'planter':
      part(w,.45,d);part(w-.1,.05,d-.1,0,.45,0,0x523d28);
      for(const x of [-.3,0,.3])part(.2,.15,.25,x,.45,0,0x57933c);break;
    default: part(w,h,d);
  }
  return root;
}

export function toggleBuildingObject(root) {
  if (!root?.userData.canToggle) return false;
  root.userData.open = !root.userData.open;
  root.traverse(mesh => {
    if (!mesh.userData.buildDoorLeaf) return;
    mesh.visible = !root.userData.open;
    mesh.userData.collisionDisabled = root.userData.open;
  });
  return true;
}
