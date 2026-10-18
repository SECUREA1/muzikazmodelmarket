// One catalog powers individual drops, additive scene stacks and complete maps.
const rows=[
 ['camp-tent','Ridge Tent','An open-ended canvas tent with a walkable floor and timber ridge.',[4,3.3,4.6],'buildings'],
 ['camp-cabin','Pine Lodge Cabin','An enterable timber cabin with a wide doorway, porch and removable roof.',[6.5,4,7.4],'buildings'],
 ['camp-picnic-table','Camp Picnic Table','A timber picnic table with benches for a camp dining area.',[2.6,1,2.2],'interior'],
 ['camp-log-bench','Camp Log Bench','A usable camp seat with a clear stand-up space.',[2.5,.55,.8],'seating','seat'],
 ['camp-lantern','Trail Lantern','A warm, emissive lantern on a timber post.',[.6,2.3,.6],'landscape'],
 ['camp-trail-sign','Trail Signpost','A colorful timber trail marker for paths and camp entrances.',[2.1,2.5,.45],'landscape'],
 ['camp-canoe-rack','Canoe & Paddle Rack','Stored canoes and paddles for scenic waterfront dressing.',[4.8,2.2,1.7],'landscape'],
 ['camp-dock','Lakeside Dock','A low, walkable timber platform with an open approach.',[3.2,1.2,6],'terrain'],
 ['camp-target','Archery Target Prop','A decorative bullseye target on a timber stand.',[1.6,2.3,1],'props'],
 ['camp-activity-board','Camp Quest Board','Accept a trail quest, find the supply pack and badge, then return for room score.',[2.8,2.6,.65],'interactive','quest'],
 ['camp-flag','Camp Pennant','A bright camp pennant and tall flagpole for gathering spots.',[1.6,3.8,.5],'landscape'],
 ['camp-supply-pack','Camp Supply Pack','A collectable trail backpack used by the camp quest.',[.6,.8,.45],'interactive','pickup'],
 ['camp-trail-badge','Trail Explorer Badge','A collectable compass badge used by the camp quest.',[.55,.85,.3],'interactive','pickup'],
 ['camp-climbing-steps','Trail Climbing Steps','A low timber obstacle with gradual, solid steps on both sides.',[2.8,1.2,4.8],'terrain'],
 ['camp-lake','Scenic Camp Lake','A shallow scenic water surface; the surrounding ground remains walkable.',[18,.18,12],'landscape']
];
export const CAMP_ITEMS=Object.freeze(Object.fromEntries(rows.map(([id,name,description,dimensions,category,behavior='decor'])=>[id,{id,name,description,dimensions,category,behavior,pack:'summer-camp',image:'/public/images/summer-camp/'+id+'.svg',function_data:behavior==='quest'?{prompt:'Camp trail quest',quest:{id:'camp-trail',title:'Camp trail explorer',requiredItems:['camp-supply-pack','camp-trail-badge'],rewardScore:35}}:behavior==='seat'?{prompt:'Sit by the campfire',seatOffset:[0,.55,0],exitOffset:[0,0,1.4]}:behavior==='pickup'?{prompt:'Collect '+name}:undefined}])));
export const CAMP_MODEL_INFO=Object.freeze(Object.fromEntries(Object.values(CAMP_ITEMS).map(item=>[item.id,[item.name,item.description,item.dimensions]])));
export const CAMP_LAYOUTS=Object.freeze({
 'camp-lakeside':{name:'Summer Camp · Lakeside',icon:'≈',description:'A lakeside retreat with cabins, tents, a dock, picnic space and a trail quest.',color:0x66804c,sky:0x86b9cb},
 'camp-woodland':{name:'Summer Camp · Woodland',icon:'♠',description:'A pine clearing with lodge cabins, a campfire circle and collectable trail supplies.',color:0x4c7045,sky:0x94b7be},
 'camp-adventure':{name:'Summer Camp · Adventure',icon:'⚑',description:'A camp activity field with climbing steps, target props, tents and a badge quest.',color:0x7d8b4c,sky:0x9ac5d6}
});
export const CAMP_SCENES=Object.freeze({
 'campfire-circle':{name:'Campfire circle',description:'Campfire, four usable benches and two lanterns.'},
 'cabin-retreat':{name:'Cabin retreat',description:'Enterable cabin, picnic table, lantern and a collectable supply pack.'},
 'adventure-trail':{name:'Adventure trail',description:'Quest board, trail collectibles, climbing steps and a target prop.'}
});
function sceneBuilder(prefix){
 const objects=[];
 const add=(modelId,x,z,extra={})=>{
  const item=CAMP_ITEMS[modelId],{y=0,yaw=0,functionalSettings={},...rest}=extra;
  objects.push({id:prefix+'-'+objects.length,modelId,name:item?.name,asset:{buildAssetId:modelId},position:{x,y,z},rotation:{x:0,y:yaw,z:0},scale:{x:1,y:1,z:1},groundOffset:y,functionalSettings:{behavior:item?.behavior||'decor',...structuredClone(item?.function_data||{}),...functionalSettings},...rest});
 };return{objects,add};
}
export function createCampScene(id,prefix=id){
 if(!CAMP_SCENES[id])throw Error('Choose a summer camp scene.');
 const {objects,add}=sceneBuilder(prefix);
 if(id==='campfire-circle'){
  add('campfire',0,0,{functionalSettings:{behavior:'talk',value:'Welcome to camp! Meet friends around the fire.'}});
  [[0,-3.5,0],[0,3.5,Math.PI],[-3.5,0,Math.PI/2],[3.5,0,-Math.PI/2]].forEach(([x,z,yaw])=>add('camp-log-bench',x,z,{yaw}));
  add('camp-lantern',-5,-3);add('camp-lantern',5,3);
 }else if(id==='cabin-retreat'){
  add('camp-cabin',0,0);add('camp-picnic-table',6,0);add('camp-lantern',-4,-4);add('camp-supply-pack',-1.8,1,{y:.16});
 }else{
  add('camp-activity-board',-5,-3,{functionalSettings:{quest:{...CAMP_ITEMS['camp-activity-board'].function_data.quest,id:prefix+'-quest'}}});
  add('camp-climbing-steps',3,0);add('camp-supply-pack',-5,3);add('camp-trail-badge',3,0,{y:1.2});add('camp-target',7,3);add('camp-trail-sign',0,-5);
 }return objects;
}
export function createSummerCamp(layout,mapSize=80){
 const preset=CAMP_LAYOUTS[layout];if(!preset)throw Error('Choose a summer camp map.');
 const requested=Math.max(80,Math.min(320,Number(mapSize)||80)),size=[80,120,160,240,320].find(value=>value>=requested),spread=size/80;
 const {objects,add}=sceneBuilder(layout);
 const stamp=(id,x,z)=>createCampScene(id,layout+'-'+id).forEach(object=>{object.position.x+=x;object.position.z+=z;objects.push(object);});
 stamp('campfire-circle',0,0);stamp('cabin-retreat',-20*spread,-12*spread);stamp('adventure-trail',20*spread,-10*spread);
 // A wide, unobstructed arrival lane leads directly to the quest board.
 add('hero-spawn',0,-30*spread,{functionalSettings:{behavior:'talk',isPlayerSpawn:true},dialogueSettings:{text:'Welcome to summer camp. Find the quest board, collect trail supplies and explore with friends.'}});
 add('camp-trail-sign',-4,-26*spread);add('camp-flag',5,-25*spread);
 for(const [x,z]of [[-23,18],[-12,23],[0,24]])add('camp-tent',x*spread,z*spread);
 add('camp-picnic-table',-14*spread,8*spread);add('camp-lantern',-10*spread,10*spread);
 add('healing-potion',-20*spread-1.8,-12*spread-1,{y:.16,functionalSettings:{behavior:'heal',value:25,cooldown:15,prompt:'Use the camp first-aid kit'}});
 add('retro-snake-cabinet',-20*spread+2,-12*spread+1,{y:.16,functionalSettings:{behavior:'interact',device:'commons-arcade',interactionDistance:4,prompt:'Play the camp arcade'}});
 if(layout==='camp-lakeside'){
  add('camp-lake',23*spread,20*spread);add('camp-dock',23*spread,13*spread);add('camp-canoe-rack',14*spread,11*spread);
 }else if(layout==='camp-woodland'){
  add('camp-cabin',22*spread,18*spread);add('camp-picnic-table',22*spread,11*spread);add('camp-flag',14*spread,22*spread);
 }else{
  add('camp-climbing-steps',20*spread,18*spread);add('camp-target',14*spread,25*spread);add('camp-target',24*spread,25*spread);add('camp-flag',27*spread,15*spread);
 }
 for(let i=0;i<24;i++){
  const angle=i*Math.PI/12,radius=size*.45;
  // Leave the southern entrance clear, including at the smallest map size.
  if(Math.sin(angle)<-.86&&Math.abs(Math.cos(angle))<.55)continue;
  add(i%3?'pine-tree':'canopy-tree',Math.cos(angle)*radius,Math.sin(angle)*radius);
 }
 return {name:preset.name,layout,layoutMeta:{...preset},mapSize:size,weather:'clear',objects,gameplay:{multiplayer:true,summerCamp:true}};
}
