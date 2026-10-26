import {HOCKEY_ITEMS} from './hockey-models.js';
import {ARCADE_PARTS} from './arcade-rules.js';
import {BUILDER_MODEL_INFO} from './builder-models-3d.js';
import {ENTERABLE_BUILDINGS} from './building-districts.js';
import {INTERACTIVE_DEVICES} from './interactive-devices.js';
import {BUILDING_MATERIALS,buildingDimensions} from './building-materials.js';
import {ROAD_VEHICLES} from './road-vehicles.js';
import {LAYOUT_SCENES} from './builder-layout-scenes.js';
import {nativeItemGameplay} from './editable-map-import.js';
import {FISHING_GEAR} from './fishing-config.js';

// Shared authored metadata for the editor, authoritative economy and owned-item
// placement. Rendering factories stay in their existing native runtime modules.
export const BUILTIN_BUILDER_ITEMS=[
  ['canopy-tree','Canopy Tree','landscape',100],['pine-tree','Pine Tree','landscape',90],['flower-bed','Flower Bed','landscape',75],['hedge-corner','Hedge Corner','landscape',105],['garden-rocks','Garden Rocks','landscape',80],['pond','Reflecting Pond','landscape',125],['path-tile','Path Tile','landscape',90],['hill','Soft Hill','landscape',135],['lamp-post','Lamp Post','landscape',62],['planter','Tall Planter','landscape',60],['pillow-ring','Pillow Ring Seat','interior',82],['sofa','Cloud Sofa','interior',100],['armchair','Accent Chair','interior',72],['coffee-table','Coffee Table','interior',70],['bookshelf','Bookshelf','interior',92],['floor-lamp','Floor Lamp','interior',58],['room-divider','Room Divider','interior',105],['kitchen-island','Kitchen Island','interior',110],['spiral-stairs','Spiral Stairs','interior',118],['archway','Archway','interior',100],['art-wall','Art Wall','interior',92],['studio-desk','Producer Studio Desk','interior',110],['recording-booth','Recording Booth','interior',125],['modular-wall','Modular Building Wall','interior',120],['glass-door','Glass Entry Door','interior',105],['loft-bed','Loft Bed','interior',120],['wardrobe','Walk-in Wardrobe','interior',105],['bathroom-vanity','Bathroom Vanity','interior',100],['dining-set','Dining Set','interior',120],['fireplace','Modern Fireplace','interior',110],['elevator','Working Elevator','interior',130]
].map(([id,name,type,size])=>({id,name,type,size,image:`public/images/builder-pack/${id}.svg`,behavior:['pillow-ring','sofa','armchair'].includes(id)?'seat':'decor',procedural:true,assetKind:'premade'}));
export const GAMEPLAY_BUILDER_ITEMS=[
 ...FISHING_GEAR.map(item=>({...item,image:'public/images/fishing/'+item.id+'.svg',type:'interactive',category:'tools',buildAssetId:item.id,behavior:'interact',action:'fishing',procedural:true,size:70,function_data:{behavior:'interact',action:'fishing',fishingGear:item.id,damage:0,prompt:'Equip '+item.name}})),
 {id:'basketball',name:'Basketball',type:'interactive',category:'interactive',size:58,image:'public/images/backpack/basketball.svg',buildAssetId:'basketball',behavior:'pickup',color:'#ec822f',scale:'24 cm regulation ball',procedural:true,basic:true,priceMzk:0,function_data:{prompt:'Basketball · E catch · T pass · R shoot',damage:0}},
 {id:'basketball-hoop',name:'Basketball Hoop & Net',type:'interior',category:'props',size:82,image:'public/images/backpack/basketball-hoop.svg',buildAssetId:'basketball-hoop',behavior:'decor',color:'#20c8f1',scale:'3.05 m regulation rim',procedural:true,basic:true,priceMzk:0},
 {id:'basketball-jersey-home',name:'Home Basketball Jersey',type:'wearable',category:'wearables',size:66,image:'public/images/backpack/basketball-jersey-home.svg',buildAssetId:'basketball-jersey-home',basketballTeam:'home',attachment:{socket:'torso',fit:'avatar',slot:'basketball-jersey'},behavior:'interact',color:'#087f8c',procedural:true,basic:true,priceMzk:0,function_data:{prompt:'Equip Home basketball jersey',damage:0}},
 {id:'basketball-jersey-away',name:'Away Basketball Jersey',type:'wearable',category:'wearables',size:66,image:'public/images/backpack/basketball-jersey-away.svg',buildAssetId:'basketball-jersey-away',basketballTeam:'away',attachment:{socket:'torso',fit:'avatar',slot:'basketball-jersey'},behavior:'interact',color:'#b73550',procedural:true,basic:true,priceMzk:0,function_data:{prompt:'Equip Away basketball jersey',damage:0}},

 ...HOCKEY_ITEMS,
 ...ARCADE_PARTS.map(part=>({id:`arcade-part-${part.id}`,name:`Neon Junction · ${part.name}`,type:part.attraction?'interactive':'landscape',category:'arcade',size:80,image:'public/images/arcade.svg',behavior:part.attraction?'interact':'decor',action:part.attraction?'arcade':'none',color:part.color,description:part.description,procedural:true,function_data:part.attraction?{action:'arcade',value:part.id}:undefined})),

 {id:'corsair-aircraft',name:'Blackwing Corsair',type:'vehicle',category:'vehicles',size:96,image:'public/images/builder-pack/corsair-aircraft.svg',behavior:'vehicle',action:'fly',animation:'propeller',color:'#15181b',scale:'10.5 m wingspan',procedural:true},
 {id:'tower-crane',name:'Titan 78 Tower Crane',type:'vehicle',category:'vehicles',size:94,image:'public/images/construction/tower-crane.svg',behavior:'vehicle',action:'construction',animation:'hydraulics',color:'#e9ae35',procedural:true},
 {id:'site-dumptruck',name:'Terra 40 Articulated Dump Truck',type:'vehicle',category:'vehicles',size:94,image:'public/images/construction/site-dumptruck.svg',behavior:'vehicle',action:'construction',animation:'hydraulics',color:'#e9ae35',procedural:true},
 {id:'site-bulldozer',name:'D9 Crawler Bulldozer',type:'vehicle',category:'vehicles',size:94,image:'public/images/construction/site-bulldozer.svg',behavior:'vehicle',action:'construction',animation:'hydraulics',color:'#e9ae35',procedural:true},
 {id:'site-excavator',name:'HX350 Hydraulic Excavator',type:'vehicle',category:'vehicles',size:94,image:'public/images/construction/site-excavator.svg',behavior:'vehicle',action:'construction',animation:'hydraulics',color:'#e9ae35',procedural:true},
 {id:'construction-steel-beam',name:'Structural Steel I-Beam',type:'interior',category:'props',size:94,image:'public/images/construction/construction-steel-beam.svg',behavior:'decor',action:'construction',animation:'hydraulics',color:'#e9ae35',procedural:true},
 {id:'alpine-quad',name:'Atlas Trail Quad',type:'vehicle',category:'vehicles',size:88,image:'public/images/vehicles/alpine-quad.svg',behavior:'vehicle',action:'drive',animation:'wheels',color:'#e6ad45',scale:'1.35 × 1.6 × 2.2 m',procedural:true},
 {id:'grand-tourer',name:'Aurelia Grand Tourer',type:'vehicle',category:'vehicles',size:88,image:'public/images/vehicles/grand-tourer.svg',behavior:'vehicle',action:'drive',animation:'wheels',color:'#408ba6',scale:'1.9 × 1.7 × 4.5 m',procedural:true},
 {id:'touring-motorcycle',name:'Veloce Touring Motorcycle',type:'vehicle',category:'vehicles',size:88,image:'public/images/vehicles/touring-motorcycle.svg',behavior:'vehicle',action:'drive',animation:'wheels',color:'#cf554e',scale:'0.85 × 1.6 × 2.3 m',procedural:true},
 {id:'dune-quad',name:'Nightcrawler Dune Quad',type:'vehicle',category:'vehicles',size:88,image:'public/images/builder-pack/dune-quad.svg',behavior:'vehicle',action:'drive',animation:'wheels',color:'#111315',scale:'2.7 × 1.6 × 1.35 m',procedural:true},
 {id:'hero-spawn',name:'Hero Spawn',type:'avatar',size:68,image:'public/images/backpack/dax-avatar.svg',behavior:'talk',color:'#63eaff',modelUrl:'public/models/avatars/DAX.glb',targetHeight:1.8},
 {id:'scout-avatar',name:'AAPE Scout',type:'avatar',size:68,image:'public/images/backpack/aape-avatar.svg',behavior:'quest',color:'#ffcc3d',modelUrl:'public/models/avatars/AAPE.glb',targetHeight:1.8},
 {id:'wolf-guardian',name:'Volt Guardian',type:'avatar',size:74,image:'public/images/backpack/volt-wolf-armor.svg',behavior:'patrol',color:'#a78bfa',modelUrl:'public/models/avatars/VOLTWOLF.glb',targetHeight:1.9},
 {id:'rad-tox',name:'RAD-TOX Mutant',type:'enemy',size:76,icon:'🧟',behavior:'hostile',color:'#b9ff38',modelUrl:'public/models/avatars/YUCKY_INMATE.glb',targetHeight:1.9},
 {id:'void-wolf',name:'Void Wolf',type:'enemy',size:72,icon:'🐺',behavior:'patrol',color:'#a78bfa',modelUrl:'public/models/avatars/wolfie.glb',targetHeight:1.2},
 {id:'ember-dragon',name:'Ember Dragon',type:'enemy',size:96,icon:'🐉',behavior:'hostile',color:'#ff6847',modelUrl:'public/models/avatars/SHARKO.glb',targetHeight:2.4},
 {id:'rogue-bot',name:'Rogue Bot',type:'enemy',size:70,icon:'🤖',behavior:'hostile',color:'#63eaff',modelUrl:'public/models/avatars/ROBOCOP.glb',targetHeight:1.85},
 {id:'quest-scroll',name:'Quest Scroll',type:'interactive',size:54,icon:'📜',behavior:'quest',color:'#ffcc3d'},
 {id:'treasure-crystal',name:'Energy Crystal',type:'interactive',size:55,icon:'💎',behavior:'pickup',color:'#63eaff'},
 {id:'healing-potion',name:'Healing Potion',type:'interactive',size:48,icon:'🧪',behavior:'heal',color:'#ff5ba7'},
 {id:'portal-door',name:'Portal Door',type:'interactive',size:82,icon:'🚪',behavior:'door',color:'#a78bfa'},
 {id:'campfire',name:'Campfire',type:'interactive',size:62,icon:'🔥',behavior:'talk',color:'#ff6847',procedural:true,buildAssetId:'campfire'},
 {id:'friendly-ghost',name:'Friendly Ghost',type:'interactive',size:62,icon:'👻',behavior:'quest',color:'#d9f7ff'},
 {id:'green-bubbles',name:'Green Bubble Field',type:'interactive',size:66,icon:'🟢',behavior:'heal',color:'#b9ff38'}
].map(model=>({...model,assetKind:'premade'}));
// A broad, metre-scaled deployment library. `type` keeps gameplay behavior while
// `category` gives builders the vocabulary they expect when browsing assets.
export const EXPANDED_BUILDER_ITEMS=[
 ['terrain-cliff','Weathered Cliff','terrain','⛰️','#657064','4.8 × 3.2 × 3.5 m','decor',''],['terrain-river','River Bend','terrain','🌊','#3e9fc4','6 × 0.2 × 3 m','decor','water'],['terrain-crater','Impact Crater','terrain','◉','#67594c','5 × 0.8 × 5 m','decor',''],['terrain-snowbank','Snow Bank','terrain','❄️','#d9edf2','4 × 1.2 × 2.4 m','decor',''],
 ['ancient-oak','Ancient Oak','plants','🌳','#4c8a42','4.5 × 6 × 4.5 m','decor','sway'],['palm-cluster','Palm Cluster','plants','🌴','#3d9b59','3.5 × 5 × 3.5 m','decor','sway'],['giant-mushrooms','Giant Mushrooms','plants','🍄','#c85e91','2.4 × 2.2 × 2 m','decor','pulse'],['desert-cactus','Desert Cactus','plants','🌵','#4f9561','1.5 × 3 × 1.2 m','decor',''],
 ['timber-cabin','Timber Cabin','buildings','🏠','#8b603d','6 × 3.6 × 5 m','door',''],['stone-tower','Stone Watchtower','buildings','🏰','#777b78','4 × 7 × 4 m','door',''],['market-stall','Market Stall','buildings','⛺','#d77846','3 × 2.8 × 2.2 m','talk',''],['sci-fi-bunker','Sci-fi Bunker','buildings','⬡','#547382','7 × 3 × 5 m','door',''],
 ['supply-crate','Supply Crate','props','📦','#9a6539','1.1 × 1 × 1.1 m','pickup',''],['wooden-cart','Wooden Cart','props','🛒','#80522f','2.4 × 1.5 × 1.2 m','decor',''],['iron-anvil','Iron Anvil','props','⚒️','#4b5960','0.9 × 0.8 × 0.45 m','interact',''],['street-sign','Weathered Signpost','props','🪧','#795238','1.2 × 2.4 × 0.5 m','talk',''],
 ['plasma-sword','Plasma Sword','weapons','⚔️','#63eaff','0.25 × 1.4 × 0.12 m','pickup','pulse'],['battle-axe','Battle Axe','weapons','🪓','#a9b2b6','0.8 × 1.5 × 0.16 m','pickup',''],['arc-bow','Arc Bow','weapons','🏹','#b98246','0.9 × 1.3 × 0.12 m','pickup','pulse'],['crystal-staff','Crystal Staff','weapons','🪄','#a78bfa','0.3 × 1.8 × 0.3 m','pickup','float'],
 ['forest-ranger','Forest Ranger','characters','🧝','#4ca477','1.8 m tall','quest','idle'],['desert-merchant','Desert Merchant','characters','🧙','#d79a52','1.75 m tall','talk','idle'],['clockwork-knight','Clockwork Knight','characters','🤺','#a58b62','1.9 m tall','patrol','walk'],['spectral-ghost','Spectral Ghost','characters','👻','#b9efff','1.7 m tall','quest','float'],
 ['emerald-slime','Emerald Slime','creatures','🟢','#75d83d','0.8 m tall','hostile','bounce'],['moss-golem','Moss Golem','creatures','🗿','#68805d','2.6 m tall','patrol','walk'],['cave-spider','Cave Spider','creatures','🕷️','#493c55','1.8 m span','hostile','crawl'],['sky-ray','Sky Ray','creatures','🪽','#56a8c7','3.2 m span','patrol','float'],
 ['lever-switch','Lever Switch','interactive','🎚️','#d5b34c','0.8 × 1.1 × 0.5 m','door','toggle'],['treasure-chest','Treasure Chest','interactive','🧰','#a66a2b','1.2 × 0.8 × 0.7 m','pickup','open'],['teleport-pad','Teleport Pad','interactive','🌀','#a78bfa','2.2 × 0.2 × 2.2 m','door','spin'],['windmill','Working Windmill','interactive','🌬️','#d8c49d','4 × 6 × 2.5 m','interact','spin']
].map(([id,name,category,icon,color,scale,behavior,animation])=>({id,name,type:['characters'].includes(category)?'avatar':['creatures'].includes(category)?'enemy':category==='interactive'?'interactive':category==='buildings'?'landscape':category==='plants'||category==='terrain'?'landscape':'interior',category,size:74,icon,color,scale,behavior,animation,procedural:true,assetKind:'premade'}));

// The resident factory also exists outside the editor's original starter lists.
// Make its reusable character model available without copying live residents.
export const RUNTIME_BUILDER_ITEMS=[{id:'world-resident',name:'World Resident',description:'A reusable resident character with configurable dialogue for your map.',type:'avatar',category:'characters',behavior:'talk',animation:'idle',targetHeight:1.8,dimensions:[.7,1.9,.5],procedural:true,assetKind:'premade',function_data:{prompt:'Talk to resident'}}];
const authored=new Map([...BUILTIN_BUILDER_ITEMS,...GAMEPLAY_BUILDER_ITEMS,...EXPANDED_BUILDER_ITEMS,...RUNTIME_BUILDER_ITEMS].map(item=>[item.id,item]));
const definitions=[];
for(const id of new Set([...Object.keys(BUILDER_MODEL_INFO),...authored.keys()])){
 const [name,description,dimensions]=BUILDER_MODEL_INFO[id]||[],device=INTERACTIVE_DEVICES[id],building=ENTERABLE_BUILDINGS[id],source=authored.get(id)||{};
 const native=nativeItemGameplay(id),road=ROAD_VEHICLES[id];
 const base={id,buildAssetId:id,name:name||source.name,description:description||source.description||'',dimensions,type:'props',category:building?'buildings':device?'interactive':'props',size:72,procedural:true,assetKind:'premade',behavior:device?'interact':'decor',image:building?.thumbnailUrl||(device?'/public/images/interactive-devices/'+id+'.svg':undefined),function_data:device?{device:id,prompt:'Use '+(name||source.name)}:undefined,...source,...native};
 if(!source.category&&!native.category)base.category=({avatar:'characters',enemy:'creatures',vehicle:'vehicles',interactive:'interactive',landscape:'landscape',interior:'interior',wearable:'wearables'})[base.type]||base.category;
 if(LAYOUT_SCENES[id])base.category='scene-layouts';
 if(road){base.type='vehicle';base.category='vehicles';base.behavior='vehicle';base.action=road.siteOnly?'construction':'drive';base.vehicleSettings={mode:'drive',speed:road.speed,turnSpeed:road.turn,seat:road.seat};}
 const behavior=base.behavior||base.function_data?.behavior||'decor';
 if(behavior==='vehicle'&&!base.vehicleSettings)base.vehicleSettings={mode:base.action==='fly'?'fly':'drive',speed:base.action==='fly'?18:9,turnSpeed:base.action==='fly'?1.15:1.75};
 base.function_data={behavior,action:base.action||'none',interactionKey:behavior==='vehicle'?'f':'e',interactionDistance:behavior==='vehicle'?4:3,...(behavior==='seat'?{seatOffset:[0,.65,0]}:{}),...base.function_data};
 if(base.animation)base.animationState={enabled:true,clip:base.animation,idleClip:base.animation,speed:1,loop:true,autoplay:true};
 if(['hostile','patrol'].includes(behavior))base.aiSettings={type:behavior,detectionRange:9};
 if(behavior==='quest')base.questSettings={id:'quest-'+id,title:base.name,reward:0,...base.function_data.quest};
 if(['talk','quest'].includes(behavior))base.dialogueSettings={text:base.name+' is ready to talk.'};
 definitions.push(base);
}
for(const item of BUILDING_MATERIALS){
 const id='material:'+item.id;
 definitions.push({id,buildAssetId:id,name:item.name||item.id,description:item.description||'',keywords:item.keywords||[],type:'props',category:'terrain',dimensions:buildingDimensions(item.id),materialId:item.id,procedural:true,assetKind:'premade',behavior:'decor',function_data:{behavior:'decor',action:'none'}});
}
export const NATIVE_BUILDER_ITEMS=Object.freeze(Object.fromEntries(definitions.map(item=>[item.id,Object.freeze(item)])));
export function nativeBuilderItem(id){return NATIVE_BUILDER_ITEMS[id]||null;}
