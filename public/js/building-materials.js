import {applyMaterialDesignFinish} from './material-design-finish.js';

// Metre-scaled native pieces use the same placement, paint and ownership path
// as the original blocks. Their artwork is projected from their actual meshes.
export const EXPANDED_BUILDING_PIECES = Object.freeze([
  {id:'timber-pitched-roof',name:'Timber pitched roof',shape:'pitched-roof',dimensions:[4.8,1.2,3.6],type:'fort',color:0x8a5738,description:'Two sloping timber roof panels with a ridge beam.',keywords:['house','gable','roofing']},
  {id:'metal-pitched-roof',name:'Metal pitched roof',shape:'pitched-roof',dimensions:[4.8,1.8,4.8],type:'fort',color:0x708495,metalness:.7,roughness:.4,description:'Wide metal gable roof for workshops and warehouses.',keywords:['industrial','warehouse','roofing']},
  {id:'storey-staircase',name:'Full-storey staircase',shape:'staircase',dimensions:[2.4,3.7,4.8],type:'access',color:0x9b9c97,description:'Walkable 2.8 metre stair rise with open side handrails.',keywords:['stairs','floor','handrail','building']},
  {id:'service-staircase',name:'Narrow service staircase',shape:'staircase',dimensions:[1.2,3.3,3.6],type:'access',color:0x758394,metalness:.7,description:'Compact 2.4 metre stair rise with safety handrails.',keywords:['stairs','industrial','maintenance']},
  {id:'garden-staircase',name:'Garden staircase',shape:'staircase',dimensions:[2.4,1.7,2.4],type:'access',color:0xa7a18e,description:'Low garden steps with handrails and an 0.8 metre rise.',keywords:['stairs','landscape','terrace']},
  {id:'covered-walkway',name:'Covered pedestrian walkway',shape:'covered-walkway',dimensions:[2.4,2.8,4.8],type:'access',color:0x6c8c7c,description:'Raised deck, open railings and a shelter roof.',keywords:['path','bridge','covered','pedestrian']},
  {id:'railed-walkway',name:'Railed pedestrian walkway',shape:'walkway',dimensions:[2.4,1.2,4.8],type:'access',color:0x9a947f,description:'Long deck with open handrails along both sides.',keywords:['path','bridge','pedestrian','safety']},
  {id:'warehouse-loading-ramp',name:'Warehouse loading ramp',shape:'ramp',dimensions:[3.6,1.2,4.8],type:'access',color:0x8d9294,description:'Broad stepped ramp connecting a loading yard to a raised floor.',keywords:['industrial','loading','access','warehouse']},
  {id:'factory-service-platform',name:'Factory service platform',shape:'platform-rails',dimensions:[4.8,1.4,3.6],type:'fort',color:0x70889b,metalness:.7,description:'Raised industrial deck with three open-railed sides and one access edge.',keywords:['industrial','maintenance','safety','catwalk']},
  {id:'railed-balcony-deck',name:'Railed balcony deck',shape:'platform-rails',dimensions:[3.6,1.2,2.4],type:'fort',color:0xa08b6a,description:'Balcony floor with open railings and an unobstructed entrance.',keywords:['house','terrace','railing']},
  {id:'framed-window-grid',name:'Framed window grid',shape:'glazing',dimensions:[2.4,2.4,.2],type:'access',color:0xd3d6cd,description:'Framed glazed wall with transparent panes and crossbars.',keywords:['glass','window','house','facade']},
  {id:'shopfront-glazing',name:'Shopfront glazing',shape:'glazing',dimensions:[4.8,2.8,.25],type:'access',color:0x4e646b,metalness:.5,description:'Wide transparent storefront divided into framed glass panes.',keywords:['glass','window','shop','facade']},
  {id:'double-entry-doors',name:'Opening double entry doors',shape:'double-door',dimensions:[2.4,2.8,.25],type:'access',color:0x9a6a45,description:'Paired doors in a rigid frame. Toggle to open both leaves.',keywords:['door','entrance','opening','house']},
  {id:'warehouse-loading-gate',name:'Opening warehouse loading gate',shape:'double-door',dimensions:[3.6,3.2,.3],type:'access',color:0x6a808a,metalness:.7,description:'Wide paired loading doors that open to leave a clear passage.',keywords:['door','industrial','opening','warehouse']},
  {id:'garden-arbor',name:'Garden arbor',shape:'arbor',dimensions:[2.4,2.8,1.2],type:'props',color:0x9c7c4f,description:'Four posts and a slatted timber roof frame an open garden entrance.',keywords:['garden','plants','entrance','landscape']},
  {id:'timber-pergola',name:'Timber pergola',shape:'arbor',dimensions:[3.6,2.8,3.6],type:'props',color:0xa1875a,description:'Large open-sided garden shelter with individual roof slats.',keywords:['garden','shelter','landscape','shade']},
  {id:'raised-garden-bed',name:'Raised garden bed',shape:'garden-bed',dimensions:[2.4,.6,1.2],type:'props',color:0x9c754c,description:'Timber planting box with recessed soil and green plant clusters.',keywords:['garden','plants','flowers','landscape']},
  {id:'corner-garden-bed',name:'Corner garden bed',shape:'corner-garden-bed',dimensions:[2.4,.9,2.4],type:'props',color:0x9b6850,description:'L-shaped planting bed that leaves its inside corner open.',keywords:['garden','plants','flowers','landscape']},
  {id:'warehouse-pallet-rack',name:'Warehouse pallet rack',shape:'pallet-rack',dimensions:[3.6,3.2,1.2],type:'market',color:0x5185a4,metalness:.6,description:'Four upright posts and four open storage tiers for a warehouse.',keywords:['industrial','warehouse','storage','shelves']},
  {id:'workshop-bench',name:'Workshop workbench',shape:'workbench',dimensions:[2.4,1.2,.9],type:'market',color:0x7b8d93,metalness:.5,description:'Solid worktop, open knee space and a lower tool shelf.',keywords:['industrial','table','craft','workshop']},
  {id:'packing-station',name:'Packing station',shape:'packing-station',dimensions:[3.6,2.4,1.2],type:'market',color:0x859b9c,metalness:.5,description:'Packing worktop with a lower shelf and an overhead supply rack.',keywords:['industrial','warehouse','table','storage']},
  {id:'locker-bank',name:'Workshop locker bank',shape:'lockers',dimensions:[2.4,1.8,.6],type:'market',color:0x6c8790,metalness:.6,description:'Four individual locker faces with raised vents and handles.',keywords:['industrial','storage','cabinet','workshop']},
  {id:'safety-bollard-row',name:'Safety bollard row',shape:'bollards',dimensions:[3.6,1.2,.4],type:'access',color:0xe6b74c,metalness:.5,description:'Four separate safety posts with open gaps between them.',keywords:['street','industrial','safety','parking']},
  {id:'street-bus-shelter',name:'Street bus shelter',shape:'shelter',dimensions:[3.6,2.8,1.8],type:'props',color:0x5d7d85,metalness:.5,description:'Roofed street shelter with glazed side panels and a bench.',keywords:['street','transport','shelter','city']},
  {id:'industrial-pipe-rack',name:'Industrial pipe rack',shape:'pipe-rack',dimensions:[2.4,1.8,1.2],type:'props',color:0x7b999c,metalness:.75,description:'Three horizontal pipes carried by a four-post support rack.',keywords:['industrial','utility','pipes','factory']},
  {id:'utility-gantry',name:'Utility service gantry',shape:'gantry',dimensions:[3.6,2.8,.6],type:'fort',color:0xd7ab4a,metalness:.6,description:'Twin upright supports and crossbeams leave an open passage below.',keywords:['industrial','frame','factory','support']},
  {id:'park-picnic-table',name:'Park picnic table',shape:'picnic-table',dimensions:[2.4,1.1,1.8],type:'props',color:0xa48256,description:'A raised tabletop and two separate long benches.',keywords:['garden','park','table','landscape']},
  {id:'terraced-spectator-stand',name:'Terraced spectator stand',shape:'grandstand',dimensions:[4.8,1.8,3.6],type:'entertainment',color:0x6c8c9d,description:'Six walkable spectator tiers with safety rails along the sides.',keywords:['sports','event','seating','stadium']},
].map(piece=>Object.freeze({roughness:.8,...piece})));

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
  {"id": "gravel", "name": "Gravel", "color": 10393478, "roughness": 0.8, "metalness": 0, "type": "blocks"},
  {"id": "cobble", "name": "Cobblestone", "color": 8750722, "roughness": 0.8, "metalness": 0, "type": "blocks"},
  {"id": "terracotta", "name": "Terracotta", "color": 12413002, "roughness": 0.8, "metalness": 0, "type": "blocks"},
  {"id": "plaster", "name": "Plaster", "color": 15065043, "roughness": 0.8, "metalness": 0, "type": "blocks"},
  {"id": "ceramic", "name": "Ceramic tile", "color": 12570067, "roughness": 0.8, "metalness": 0, "type": "blocks"},
  {"id": "slate", "name": "Slate", "color": 5464427, "roughness": 0.8, "metalness": 0, "type": "blocks"},
  {"id": "steel", "name": "Steel plate", "color": 8885925, "roughness": 0.8, "metalness": 0.8, "type": "blocks"},
  {"id": "aluminum", "name": "Aluminum", "color": 13095126, "roughness": 0.8, "metalness": 0.8, "type": "blocks"},
  {"id": "moss", "name": "Mossy stone", "color": 6518361, "roughness": 0.8, "metalness": 0, "type": "blocks"},
  {"id": "limestone", "name": "Limestone", "color": 14010530, "roughness": 0.8, "metalness": 0, "type": "blocks"},
  {"id": "half-wall", "name": "Half wall", "color": 10254676, "roughness": 0.85, "shape": "wall", "dimensions": [2.4, 1.2, 0.2], "type": "fort"},
  {"id": "low-wall", "name": "Low cover wall", "color": 10254676, "roughness": 0.85, "shape": "wall", "dimensions": [2.4, 0.6, 0.3], "type": "fort"},
  {"id": "double-window", "name": "Wide window wall", "color": 10254676, "roughness": 0.85, "shape": "window", "dimensions": [3.6, 2.4, 0.2], "type": "access"},
  {"id": "narrow-door", "name": "Narrow opening door", "color": 10254676, "roughness": 0.85, "shape": "door", "dimensions": [1.2, 2.4, 0.2], "type": "access"},
  {"id": "gate", "name": "Opening garden gate", "color": 10254676, "roughness": 0.85, "shape": "door", "dimensions": [2.4, 1.2, 0.2], "type": "access"},
  {"id": "railing", "name": "Safety railing", "color": 10254676, "roughness": 0.85, "shape": "fence", "dimensions": [2.4, 0.9, 0.15], "type": "access"},
  {"id": "bridge", "name": "Footbridge", "color": 10254676, "roughness": 0.85, "shape": "bridge", "dimensions": [2.4, 0.5, 3.6], "type": "access"},
  {"id": "balcony", "name": "Balcony platform", "color": 10254676, "roughness": 0.85, "shape": "balcony", "dimensions": [2.4, 1.2, 2.4], "type": "fort"},
  {"id": "watchtower", "name": "Watchtower frame", "color": 10254676, "roughness": 0.85, "shape": "tower", "dimensions": [2.4, 3.6, 2.4], "type": "fort"},
  {"id": "bunker", "name": "Cover bunker", "color": 10254676, "roughness": 0.85, "shape": "bunker", "dimensions": [2.4, 1.8, 2.4], "type": "fort"},
  {"id": "frame", "name": "Building frame", "color": 10254676, "roughness": 0.85, "shape": "frame", "dimensions": [2.4, 2.4, 2.4], "type": "fort"},
  {"id": "wide-ramp", "name": "Wide assault ramp", "color": 10254676, "roughness": 0.85, "shape": "ramp", "dimensions": [3.6, 1.2, 2.4], "type": "fort"},
  {"id": "narrow-steps", "name": "Narrow steps", "color": 10254676, "roughness": 0.85, "shape": "steps", "dimensions": [1.2, 1.2, 2.4], "type": "access"},
  {"id": "long-steps", "name": "Long stair run", "color": 10254676, "roughness": 0.85, "shape": "ramp", "dimensions": [1.8, 1.8, 3.6], "type": "access"},
  {"id": "small-platform", "name": "Small platform", "color": 10254676, "roughness": 0.85, "shape": "floor", "dimensions": [1.2, 0.2, 1.2], "type": "fort"},
  {"id": "corner-wall", "name": "Corner wall", "color": 10254676, "roughness": 0.85, "shape": "corner", "dimensions": [2.4, 2.4, 2.4], "type": "fort"},
  {"id": "door-frame", "name": "Open doorway", "color": 10254676, "roughness": 0.85, "shape": "arch", "dimensions": [1.8, 2.4, 0.2], "type": "access"},
  {"id": "sign", "name": "Market signboard", "color": 10254676, "roughness": 0.85, "shape": "sign", "dimensions": [1.2, 1.8, 0.2], "type": "market"},
  {"id": "lamp-post", "name": "Lamp post", "color": 10254676, "roughness": 0.85, "shape": "lamp", "dimensions": [0.6, 2.4, 0.6], "type": "props"},
  {"id": "street-lamp", "name": "Street lamp", "color": 10254676, "roughness": 0.85, "shape": "lamp", "dimensions": [0.6, 3.6, 0.6], "type": "props"},
  {"id": "barrel", "name": "Storage barrel", "color": 10254676, "roughness": 0.85, "shape": "barrel", "dimensions": [0.8, 1.2, 0.8], "type": "props"},
  {"id": "cabinet", "name": "Open storage cabinet", "color": 10254676, "roughness": 0.85, "shape": "cabinet", "dimensions": [1.2, 1.8, 0.6], "type": "market"},
  {"id": "canopy", "name": "Shade canopy", "color": 10254676, "roughness": 0.85, "shape": "canopy", "dimensions": [2.4, 2.4, 2.4], "type": "market"},
  {"id": "kiosk", "name": "Market kiosk", "color": 10254676, "roughness": 0.85, "shape": "kiosk", "dimensions": [2.4, 2.4, 1.8], "type": "market"},
  {"id": "barrier", "name": "Road barrier", "color": 10254676, "roughness": 0.85, "shape": "barrier", "dimensions": [2.4, 0.9, 0.6], "type": "fort"},
  {"id": "smooth-plastic", "name": "Smooth plastic", "color": 14870505, "roughness": 0.35, "type": "blocks"},
  {"id": "neon", "name": "Neon glow block", "color": 8453952, "roughness": 0.3, "type": "blocks", "emissive": 8453952, "emissiveIntensity": 0.75},
  {"id": "rubber-tile", "name": "Rubber safety tile", "color": 3492944, "roughness": 0.8, "type": "blocks", "shape": "floor", "dimensions": [1.2, 0.1, 1.2]},
  {"id": "baseplate", "name": "Large baseplate", "color": 6321002, "roughness": 0.8, "type": "fort", "shape": "floor", "dimensions": [4.8, 0.2, 4.8]},
  {"id": "half-brick", "name": "Half brick", "color": 11951427, "roughness": 0.8, "type": "blocks", "shape": "box", "dimensions": [0.6, 0.4, 0.6]},
  {"id": "long-brick", "name": "Long brick", "color": 11951427, "roughness": 0.8, "type": "blocks", "shape": "box", "dimensions": [2.4, 0.4, 0.6]},
  {"id": "cube", "name": "Building cube", "color": 12109775, "roughness": 0.8, "type": "blocks", "shape": "box", "dimensions": [1.2, 1.2, 1.2]},
  {"id": "thin-plate", "name": "Thin building plate", "color": 9411750, "roughness": 0.8, "type": "blocks", "shape": "floor", "dimensions": [1.2, 0.1, 0.6]},
  {"id": "support-beam", "name": "Structural support beam", "color": 8097180, "roughness": 0.4, "type": "fort", "shape": "box", "dimensions": [3.6, 0.2, 0.2], "metalness": 0.75},
  {"id": "round-column", "name": "Round support column", "color": 12893352, "roughness": 0.8, "type": "fort", "shape": "cylinder", "dimensions": [0.6, 2.4, 0.6]},
  {"id": "round-plate", "name": "Round building plate", "color": 9214882, "roughness": 0.8, "type": "blocks", "shape": "cylinder", "dimensions": [1.2, 0.2, 1.2]},
  {"id": "sphere", "name": "Building sphere", "color": 6266314, "roughness": 0.8, "type": "blocks", "shape": "sphere", "dimensions": [1.2, 1.2, 1.2]},
  {"id": "dome", "name": "Roof dome", "color": 7447725, "roughness": 0.8, "type": "fort", "shape": "dome", "dimensions": [1.2, 0.6, 1.2]},
  {"id": "wedge", "name": "Smooth wedge", "color": 11371860, "roughness": 0.8, "type": "fort", "shape": "wedge", "dimensions": [1.2, 0.6, 1.2]},
  {"id": "corner-wedge", "name": "Corner wedge", "color": 11371860, "roughness": 0.8, "type": "fort", "shape": "corner-wedge", "dimensions": [1.2, 0.6, 1.2]},
  {"id": "glass-wall", "name": "Clear glass wall", "color": 11001061, "roughness": 0.12, "type": "access", "shape": "box", "dimensions": [2.4, 2.4, 0.15], "opacity": 0.3},
  {"id": "wood-log", "name": "Timber log", "color": 9857853, "roughness": 0.8, "type": "props", "shape": "log", "dimensions": [2.4, 0.6, 0.6]},
  {"id": "paving-tile", "name": "Stone paving tile", "color": 11842988, "roughness": 0.8, "type": "blocks", "shape": "floor", "dimensions": [1.2, 0.2, 1.2]},
  {"id": "metal-truss", "name": "Metal truss frame", "color": 8557989, "roughness": 0.4, "type": "fort", "shape": "frame", "dimensions": [2.4, 2.4, 0.4], "metalness": 0.75},
  {"id": "stage-platform", "name": "Wide stage platform", "color": 4016212, "roughness": 0.65, "type": "entertainment", "shape": "floor", "dimensions": [4.8, 0.4, 2.4]},
  {"id": "stage-steps", "name": "Stage access steps", "color": 7833235, "roughness": 0.65, "type": "entertainment", "shape": "steps", "dimensions": [2.4, 0.8, 1.8]},
  {"id": "crowd-barrier", "name": "Crowd safety barrier", "color": 10004911, "roughness": 0.4, "type": "entertainment", "shape": "fence", "dimensions": [2.4, 1.2, 0.2], "metalness": 0.75},
  {"id": "stage-canopy", "name": "Festival stage canopy", "color": 6192025, "roughness": 0.65, "type": "entertainment", "shape": "canopy", "dimensions": [4.8, 3.6, 2.4]},
  {"id": "dance-floor", "name": "Checker dance floor", "color": 14543335, "roughness": 0.65, "type": "entertainment", "shape": "checker", "dimensions": [2.4, 0.2, 2.4]},
  {"id": "neon-wall", "name": "Neon light panel", "color": 6863871, "roughness": 0.3, "type": "entertainment", "shape": "box", "dimensions": [2.4, 1.2, 0.15], "emissive": 6863871, "emissiveIntensity": 0.75},
  {"id": "display-plinth", "name": "Round display plinth", "color": 13748666, "roughness": 0.8, "type": "market", "shape": "cylinder", "dimensions": [1.2, 0.6, 1.2]},
  {"id": "tiered-seating", "name": "Tiered spectator seating", "color": 7046309, "roughness": 0.65, "type": "entertainment", "shape": "steps", "dimensions": [3.6, 1.2, 2.4]},
  {"id": "race-curb", "name": "Racing track curb", "color": 13193033, "roughness": 0.65, "type": "entertainment", "shape": "curb", "dimensions": [2.4, 0.2, 0.4]},
  ...EXPANDED_BUILDING_PIECES,
].map(material => Object.freeze({ solid: true, metalness: 0, ...material })));

export function buildingMaterial(id) {
  return BUILDING_MATERIALS.find(material => material.id === id) || BUILDING_MATERIALS[0];
}

export function createBuildingBlock(THREE, id, { width = 1.2, height = .4, depth = .6, tint = null } = {}) {
  const profile = buildingMaterial(id), root = new THREE.Group();
  if (profile.shape) return applyMaterialDesignFinish(THREE,createStructure(THREE, profile, tint),profile);
  const material = new THREE.MeshStandardMaterial({ color: tint ?? profile.color,
    roughness: profile.roughness, metalness: profile.metalness, emissive: profile.emissive ?? 0, emissiveIntensity: profile.emissiveIntensity ?? 0,
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
  return applyMaterialDesignFinish(THREE,root,profile);
}

export function buildingDimensions(id) {
  return buildingMaterial(id).dimensions || [1.2, .4, .6];
}

function createStructure(T, profile, tint) {
  const root = new T.Group(), [w, h, d] = profile.dimensions;
  root.userData = { materialId: profile.id, solid: profile.solid, structure: true };
  const part = (width, height, depth, x=0, y=0, z=0, color=tint ?? profile.color) => {
    const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), new T.MeshStandardMaterial({color,roughness:profile.roughness,metalness:profile.metalness,emissive:profile.emissive??0,emissiveIntensity:profile.emissiveIntensity??0,transparent:profile.opacity!==undefined,opacity:profile.opacity??1,depthWrite:profile.opacity===undefined}));
    mesh.position.set(x, y-h/2+height/2, z);
    mesh.userData.brickPaintPart='body'; mesh.castShadow=true; mesh.receiveShadow=true;
    root.add(mesh); return mesh;
  };
  const shaped=geometry=>{const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:tint??profile.color,roughness:profile.roughness,metalness:profile.metalness,emissive:profile.emissive??0,emissiveIntensity:profile.emissiveIntensity??0}));mesh.userData.brickPaintPart='body';mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;};
  const glass=mesh=>{mesh.material.color.setHex(0x9ed8df);mesh.material.transparent=true;mesh.material.opacity=.28;mesh.material.depthWrite=false;mesh.material.roughness=.12;return mesh;};
  const railing=(axis,fixed,length,bottom=0,height=.9)=>{
    const count=Math.max(1,Math.ceil(length/1.2));
    for(let i=0;i<=count;i++){const offset=-length/2+length*i/count;part(.08,height,.08,axis==='x'?offset:fixed,bottom,axis==='x'?fixed:offset);}
    for(const y of [height*.45,height-.08])part(axis==='x'?length:.08,.08,axis==='x'?.08:length,axis==='x'?0:fixed,bottom+y,axis==='x'?fixed:0);
  };
  switch(profile.shape) {
    case 'pitched-roof': {
      const run=(w-.12)/2,rise=h-.18,slope=Math.hypot(run,rise),angle=Math.atan2(rise,run);
      for(const side of [-1,1]){const panel=shaped(new T.BoxGeometry(slope,.12,d));panel.rotation.z=-side*angle;panel.position.set(side*run/2,-h/2+.08+rise/2,0);}
      part(.12,.12,d,0,h-.12);break;
    }
    case 'staircase': case 'grandstand': {
      const railHeight=profile.shape==='grandstand'?.65:.85,rise=h-railHeight-.05,count=profile.shape==='grandstand'?6:Math.max(4,Math.ceil(rise/.22)),tread=d/count;
      for(let i=0;i<count;i++)part(w,rise*(i+1)/count,tread,0,0,-d/2+tread*(i+.5));
      for(const x of [-w/2+.06,w/2-.06]){
        for(let i=0;i<count;i+=2)part(.08,railHeight,.08,x,rise*(i+1)/count,-d/2+tread*(i+.5));
        part(.08,railHeight,.08,x,rise,d/2-tread/2);
        const length=d-tread,climb=rise-rise/count,rail=shaped(new T.BoxGeometry(.08,.08,Math.hypot(length,climb)));
        rail.rotation.x=-Math.atan2(climb,length);rail.position.set(x,-h/2+rise*(1+1/count)/2+railHeight,0);
      }
      break;
    }
    case 'walkway': case 'covered-walkway': case 'platform-rails': {
      const covered=profile.shape==='covered-walkway',deck=.2,railHeight=covered?.9:Math.min(1,h-deck);
      part(w,deck,d);
      for(const x of [-w/2+.06,w/2-.06])railing('z',x,d-.12,deck,railHeight);
      if(profile.shape==='platform-rails')railing('x',d/2-.06,w-.12,deck,railHeight);
      if(covered){for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])part(.14,h-.14,.14,x,0,z);part(w,.14,d,0,h-.14);}
      break;
    }
    case 'glazing': {
      const frame=.12;glass(part(w-frame*2,h-frame*2,.04,0,frame));
      for(const x of [-w/2+frame/2,w/2-frame/2])part(frame,h,d,x);
      for(const y of [0,h/2-frame/2,h-frame])part(w,frame,d,0,y);
      const columns=Math.max(2,Math.round(w/1.2));for(let i=1;i<columns;i++)part(.07,h,d,-w/2+w*i/columns);
      break;
    }
    case 'double-door': {
      const frame=.15,leafWidth=(w-frame*2)/2;
      for(const x of [-w/2+frame/2,w/2-frame/2])part(frame,h,d,x);
      part(w,frame,d,0,h-frame);
      for(const side of [-1,1]){
        const leaf=part(leafWidth-.025,h-frame-.025,.1,side*leafWidth/2,.0125);leaf.userData.buildDoorLeaf=true;
        const handle=part(.055,.22,.07,side*.15,h*.45,-d/2+.05,0xd3bb76);handle.userData.buildDoorLeaf=true;
      }
      root.userData.canToggle=true;root.userData.open=false;break;
    }
    case 'arbor': {
      for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])part(.16,h-.14,.16,x,0,z);
      for(const x of [-w/2+.1,w/2-.1])part(.18,.18,d,x,h-.28);
      const slats=Math.max(4,Math.round(d/.4));for(let i=0;i<slats;i++)part(w,.12,.14,0,h-.12,-d/2+.07+(d-.14)*i/(slats-1));break;
    }
    case 'garden-bed': case 'corner-garden-bed': {
      const bed=(width,depth,x,z)=>{
        const wall=.1,boxHeight=h*.7;
        for(const side of [-1,1]){part(wall,boxHeight,depth,x+side*(width-wall)/2,0,z);part(width,boxHeight,wall,x,0,z+side*(depth-wall)/2);}
        part(width-wall*2,.08,depth-wall*2,x,h*.52,z,0x59442e);
        const count=Math.max(2,Math.round(width/.55));for(let i=0;i<count;i++)part(.24,h*.36,Math.min(.35,depth-.24),x-width/2+(i+.5)*width/count,h*.64,z,0x5c8d45);
      };
      if(profile.shape==='corner-garden-bed'){bed(w,.72,0,d/2-.36);bed(.72,d-.72,-w/2+.36,-.36);}
      else bed(w,d,0,0);break;
    }
    case 'pallet-rack': {
      for(const x of [-w/2+.07,w/2-.07])for(const z of [-d/2+.07,d/2-.07])part(.14,h,.14,x,0,z);
      for(const y of [.12,h/3,h*2/3,h-.1]){part(w,.1,d,0,y,0,0xbf9565);for(const z of [-d/2+.06,d/2-.06])part(w,.13,.12,0,y-.03,z,0xd48f43);}
      break;
    }
    case 'workbench': case 'packing-station': {
      const workHeight=profile.shape==='packing-station'?h*.45:h,top=.12;
      part(w,top,d,0,workHeight-top,0,0xb49b6d);
      for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])part(.14,workHeight-top,.14,x,0,z);
      part(w-.2,.1,d-.2,0,.15);
      if(profile.shape==='packing-station'){for(const x of [-w/2+.1,w/2-.1])part(.14,h,.14,x,0,d/2-.1);part(w,.12,d*.45,0,h-.12,d*.25);}
      break;
    }
    case 'lockers': {
      part(w,.08,d);part(w,.08,d,0,h-.08);part(w,h,.06,0,0,-d/2+.03);
      const count=4,bay=w/count;
      for(let i=0;i<=count;i++)part(.05,h,d,-w/2+.025+(w-.05)*i/count);
      for(let i=0;i<count;i++){
        const x=-w/2+bay*(i+.5);part(bay-.06,h-.12,.04,x,.06,d/2-.05);
        for(let row=0;row<3;row++)part(bay*.5,.025,.015,x,h*.73+row*.075,d/2-.0125,0x223b42);
        part(.04,.16,.04,x+bay*.25,h*.45,d/2-.02,0xd2d6cc);
      }
      break;
    }
    case 'bollards': {
      const count=4;for(let i=0;i<count;i++){
        const x=-w/2+d/2+(w-d)*i/(count-1);part(d,.08,d,x);
        const post=shaped(new T.CylinderGeometry(d*.22,d*.22,h-.08,12));post.position.set(x,.04,0);
        part(d*.5,.13,d*.5,x,h*.68,0,0x26383c);
      }break;
    }
    case 'shelter': {
      part(w,.12,d);part(w,.14,d,0,h-.14);
      for(const x of [-w/2+.08,w/2-.08])for(const z of [-d/2+.08,d/2-.08])part(.12,h,.12,x,0,z);
      glass(part(w-.24,h-.4,.04,0,.15,d/2-.08));for(const x of [-w/2+.08,w/2-.08])glass(part(.04,h-.4,d-.24,x,.15));
      part(w-.6,.12,.45,0,.5,d*.22);for(const x of [-w/2+.6,w/2-.6])part(.1,.5,.4,x,0,d*.22);part(w-.6,.5,.08,0,.6,d*.22+.2);
      break;
    }
    case 'pipe-rack': {
      for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])part(.14,h,.14,x,0,z);
      for(const x of [-w/2+.1,w/2-.1])for(const y of [.25,h*.65])part(.16,.12,d,x,y);
      for(const z of [-d*.3,0,d*.3]){const pipe=shaped(new T.CylinderGeometry(.1,.1,w-.12,12));pipe.rotation.z=Math.PI/2;pipe.position.set(0,-h/2+h*.8,z);}
      break;
    }
    case 'gantry':
      for(const x of [-w/2+.1,w/2-.1])part(.2,h,d,x);
      part(w,.2,d,0,h-.2);part(w,.12,d,0,h*.72);break;
    case 'picnic-table':
      part(w,.12,d*.48,0,h-.12);
      for(const side of [-1,1]){part(w,.1,d*.2,0,h*.44,side*d*.4);for(const x of [-w/2+.3,w/2-.3])part(.12,h*.44,d*.2,x,0,side*d*.4);}
      for(const x of [-w/2+.3,w/2-.3]){part(.16,h-.12,.16,x);part(.16,.1,d,x,.15);}
      break;
    case 'cylinder': shaped(new T.CylinderGeometry(w/2,w/2,h,16)).scale.z=d/w;break;
    case 'sphere': shaped(new T.SphereGeometry(.5,16,10)).scale.set(w,h,d);break;
    case 'dome': {const mesh=shaped(new T.SphereGeometry(.5,16,8,0,Math.PI*2,0,Math.PI/2));mesh.scale.set(w,h*2,d);mesh.position.y=-h/2;break;}
    case 'log': {const mesh=shaped(new T.CylinderGeometry(h/2,h/2,w,16));mesh.rotation.z=Math.PI/2;mesh.scale.z=d/h;break;}
    case 'wedge': {const shape=new T.Shape();shape.moveTo(-d/2,-h/2);shape.lineTo(d/2,-h/2);shape.lineTo(d/2,h/2);shape.closePath();const geometry=new T.ExtrudeGeometry(shape,{depth:w,bevelEnabled:false,steps:1});geometry.rotateY(-Math.PI/2);geometry.translate(w/2,0,0);shaped(geometry);break;}
    case 'corner-wedge': {const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([-w/2,-h/2,-d/2,w/2,-h/2,-d/2,w/2,-h/2,d/2,-w/2,-h/2,d/2,w/2,h/2,d/2],3));geometry.setIndex([0,1,2,0,2,3,0,4,1,1,4,2,2,4,3,3,4,0]);geometry.computeVertexNormals();shaped(geometry);break;}
    case 'checker': for(let x=0;x<4;x++)for(let z=0;z<4;z++)part(w/4,h,d/4,-w/2+w*(x+.5)/4,0,-d/2+d*(z+.5)/4,(x+z)%2?0x263237:(tint??profile.color));break;
    case 'curb': for(let x=0;x<8;x++)part(w/8,h,d,-w/2+w*(x+.5)/8,0,0,x%2?0xf1eee6:(tint??profile.color));break;
    case 'bridge':
      part(w,.2,d);for(const x of [-w/2+.1,w/2-.1])part(.12,.3,d,x,.2);break;
    case 'balcony':
      part(w,.2,d);for(const x of [-w/2+.08,w/2-.08])part(.16,h-.2,d,x,.2);part(w,h-.2,.16,0,.2,d/2-.08);break;
    case 'frame': case 'tower':
      for(const x of [-w/2+.1,w/2-.1])for(const z of [-d/2+.1,d/2-.1])part(.2,h,.2,x,0,z);
      part(w,.15,d,0,h-.15);if(profile.shape==='tower')part(w,.15,d,0,h*.5);break;
    case 'bunker':
      part(.2,h,d,-w/2+.1);part(.2,h,d,w/2-.1);part(w,h,.2,0,0,d/2-.1);part(w,.2,d,0,h-.2);break;
    case 'corner':
      part(w,h,.2,0,0,d/2-.1);part(.2,h,d,-w/2+.1);break;
    case 'sign':
      part(.12,h*.6,d);part(w,h*.4,d,0,h*.6,0,0x283f38);break;
    case 'lamp': {
      part(w*.3,h-.4,d*.3);part(w,.15,d);const head=part(w,.4,d,0,h-.4,0,0xffe8a2);head.material.emissive.setHex(0xffbd4c);head.material.emissiveIntensity=.8;break;
    }
    case 'barrel': {
      const barrel=new T.Mesh(new T.CylinderGeometry(w*.45,w*.45,h,16),new T.MeshStandardMaterial({color:tint??profile.color,roughness:.8}));barrel.userData.brickPaintPart='body';root.add(barrel);break;
    }
    case 'cabinet':
      part(.1,h,d,-w/2+.05);part(.1,h,d,w/2-.05);part(w,h,.08,0,0,d/2-.04);for(const y of [0,h*.5,h-.1])part(w,.1,d,0,y);break;
    case 'canopy': case 'kiosk':
      for(const x of [-w/2+.08,w/2-.08])for(const z of [-d/2+.08,d/2-.08])part(.16,h,.16,x,0,z);
      part(w,.15,d,0,h-.15,0,0x6e9e75);if(profile.shape==='kiosk'){part(w,.8,.5,0,0,d/2-.25);part(w,.3,.1,0,h-.45,-d/2+.05,0xe9d4a0);}break;
    case 'barrier':
      part(w,.45,.25,0,.35,0,0xe3a447);for(const x of [-w/2+.3,w/2-.3])part(.3,.35,d,x);break;
    case 'wall':
      part(w,h,d);for(let i=0;i<6;i++)part(.06,h,.03,-w/2+.2+i*.4,0,d/2-.03);break;
    case 'crate':
      part(w,h,d);for(const y of [.08,h-.14])part(w,.06,.04,0,y,d/2-.04,0x554330);break;
    case 'pillar':
      part(w*.75,h,d*.75);part(w,.12,d);part(w,.12,d,0,h-.12);break;
    case 'counter':
      part(w,h-.08,d);part(w,.08,d,0,h-.08,0,0xd5b885);break;
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
      const handle=part(.06,.06,.08,w/2-.3,h*.5,d/2-.08,0xd5b34d);handle.userData.buildDoorLeaf=true;
      root.userData.canToggle=true;root.userData.open=false;break;
    }
    case 'fence':
      for(const x of [-w/2+.08,0,w/2-.08])part(.16,h,d,x);
      for(const y of [h*.25,h*.7])part(w,.14,d,0,y);break;
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

// Catalog artwork is projected from the actual model, so each SVG matches its mesh.
export function buildingIcon(T,id) {
  const root=createBuildingBlock(T,id),camera=new T.OrthographicCamera(-2.2,2.2,2.2,-2.2,.01,30);
  const bounds=new T.Box3().setFromObject(root),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()).length();
  root.scale.setScalar(2.7/Math.max(size,.5));root.position.copy(center).multiplyScalar(-2.7/Math.max(size,.5));root.updateMatrixWorld(true);
  camera.position.set(5,4,6);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const faces=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?index.count:p.count;
    for(let i=0;i<count;i+=3){
      mesh.getVertexPosition(index?index.getX(i):i,a);a.applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(index?index.getX(i+1):i+1,b);b.applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(index?index.getX(i+2):i+2,c);c.applyMatrix4(mesh.matrixWorld);
      const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();if(normal.dot(camera.position.clone().sub(a))<=0)continue;
      const color=mesh.material.color.clone().multiplyScalar(.65+.35*Math.max(0,normal.dot(new T.Vector3(.4,.8,.5).normalize())));
      const vertices=[a.clone().project(camera),b.clone().project(camera),c.clone().project(camera)];
      faces.push({z:vertices.reduce((sum,v)=>sum+v.z,0)/3,path:vertices.map((v,i)=>(i?'L':'M')+(64+v.x*64).toFixed(1)+' '+(64-v.y*64).toFixed(1)).join(' ')+'Z',color:color.getHexString(),opacity:mesh.material.opacity});
    }
  });
  root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});
  return `<svg viewBox="0 0 128 128" class="building-item-art" aria-hidden="true"><ellipse cx="64" cy="106" rx="42" ry="8" fill="#000" opacity=".25"/>${faces.sort((a,b)=>b.z-a.z).map(f=>`<path d="${f.path}" fill="#${f.color}" opacity="${f.opacity}"/>`).join('')}</svg>`;
}

export const BUILDING_TYPES = Object.freeze([
  {id:'all',name:'All items'}, {id:'blocks',name:'Materials & blocks'},
  {id:'fort',name:'Fort walls & platforms'}, {id:'access',name:'Steps, doors & windows'},
  {id:'entertainment',name:'Stages, events & play spaces'},
  {id:'market',name:'Markets & storage'}, {id:'props',name:'Furniture & scenery'},
]);
export function buildingType(material) {
  if(material.type)return material.type;
  if(!material.shape)return 'blocks';
  if(['wall','floor','ramp','roof','pillar'].includes(material.shape))return 'fort';
  if(['steps','door','window','arch','fence'].includes(material.shape))return 'access';
  if(['market','counter','shelf','table','crate'].includes(material.shape))return 'market';
  return 'props';
}
export function matchesBuildingItem(material,type='all',query='') {
  const text=[material.name,material.description,...(material.keywords||[])].filter(Boolean).join(' ').toLowerCase();
  return (type==='all'||buildingType(material)===type) && query.trim().toLowerCase().split(/\s+/).every(word=>text.includes(word));
}
