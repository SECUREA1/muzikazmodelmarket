// The permanent site uses the same editable parts as the Environment Builder.
// Crane loads, erection progress and earthworks live in the shared room state.
export function constructionWorld(){
 const construction={enabled:true,tower:{x:5,z:-10,width:18,depth:18,baseY:0,floorHeight:4,maxFloors:16},supply:{x:-8,y:.8,z:15},excavation:{x:25,z:17,radius:12,depth:0},stockpile:{x:30,z:39,width:28,depth:16},yard:{minX:-94,maxX:154,minZ:-70,maxZ:146},earthworks:{cellSize:2,patches:[
  {id:'dirt-bay',kind:'excavation',x:76,z:12,width:40,depth:40,maxDepth:8,material:'soil'},
  {id:'gravel-bay',kind:'stockpile',x:122,z:12,width:36,depth:36,maxDepth:0,height:2.8,material:'gravel'},
  {id:'fill-zone',kind:'fill',x:80,z:92,width:48,depth:38,maxDepth:0,material:'soil'},
  {id:'soil-stockpile',kind:'stockpile',x:42,z:106,width:20,depth:20,maxDepth:0,height:2.2,material:'soil'},
  {id:'gravel-stockpile',kind:'stockpile',x:124,z:88,width:26,depth:26,maxDepth:0,height:1.6,material:'gravel'}
 ]},crew:{autoStart:true,muster:{x:-58,y:0,z:35},jobBoard:{x:-58,y:0,z:31},walkWaypoints:[{x:-58,z:52},{x:-16,z:52},{x:8,z:52}],haulWaypoints:[{x:38,z:52},{x:70,z:52},{x:145,z:52},{x:145,z:125},{x:26,z:125},{x:26,z:65}],approachWaypoints:[{x:38,z:52},{x:49,z:52},{x:49,z:44},{x:30,z:44},{x:30,z:17}],dumpApproachWaypoints:[{x:145,z:108},{x:107,z:108},{x:80,z:108},{x:80,z:92}],staging:{x:-62,y:0,z:78},loading:{x:30,y:0,z:17,rotationY:0},dump:{x:80,y:0,z:92},grade:{x:80,y:0,z:92}}};
 const objects=[],locations=[];
 const add=(id,modelId,x,y,z,extra={})=>{const item={id:'construction-'+id,modelId,name:id.replaceAll('-',' '),placementAnchor:'collider-base',position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:false},...extra};objects.push(item);return item;};
 const box=(id,x,y,z,width,height,depth,color,material='cube')=>add(id,'material:'+material,x,y,z,{scale:{x:width/1.2,y:height/1.2,z:depth/1.2},materialSettings:{useAccent:true,accent:color}});
 const slab=(id,x,y,z,width,depth,color,height=.12)=>add(id,'material:baseplate',x,y,z,{scale:{x:width/4.8,y:height/.2,z:depth/4.8},materialSettings:{useAccent:true,accent:color}});
 const sign=(id,name,x,z,text)=>add(id,'street-sign',x,0,z,{name,functionalSettings:{behavior:'talk',interactionDistance:5,prompt:'Read '+name,destructible:false},dialogueSettings:{text}});
 const machine=(id,modelId,name,x,z)=>add(id,modelId,x,0,z,{name,functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:modelId==='tower-crane'?6:5,prompt:'Operate '+name+' · E / Use',destructible:false,health:1000}});
 // Keep the four working machines first, including in lightweight map previews.
 machine('crane','tower-crane','Atlas TC-78 Tower Crane',-18,-4);
 machine('truck','site-dumptruck','HT-40 Articulated Dump Truck',21,30);
 machine('dozer','site-bulldozer','D9 Crawler Bulldozer',45,58).rotation.y=Math.PI/2;
 machine('excavator','site-excavator','EX-300 Hydraulic Excavator',25,17);
 slab('tower-raft',5,-.24,-10,22,22,'#b7b8b1',.24);
 slab('crane-raft',-18,-.16,-4,7,7,'#aaa69a',.16);
 // Keep the starter structure low and open: each new crane-placed floor
 // becomes visible above it instead of disappearing inside a finished shell.
 box('service-core',5,0,-10,3.6,10,3.6,'#7f8a8d');
 for(let floor=0;floor<2;floor++){
  const y=floor*4;
  for(const z of [-19,-1])box('starter-post-'+floor+'-'+z,-4,y,z,.36,4,.36,'#647b88');
  for(const z of [-19,-1])box('starter-east-post-'+floor+'-'+z,14,y,z,.36,4,.36,'#647b88');
 }
 for(let floor=0;floor<4;floor++){const y=floor*4;add('hoist-frame-'+floor,'material:metal-truss',-7,y,-10,{scale:{x:1,y:4/2.4,z:1},materialSettings:{useAccent:true,accent:'#c88732'}});slab('hoist-landing-'+floor,-5.4,y,-10,2,2,'#b68a4f',.12);}
 for(const side of [-1,1]){
  box('raft-stripe-x-'+side,5+side*10.7,.003,-10,.12,.006,22,'#f4ba3c');
  box('raft-stripe-z-'+side,5,.003,-10+side*10.7,22,.006,.12,'#f4ba3c');
 }
 slab('steel-delivery-pad',-8,-.02,15,14,10,'#827a64',.022);
 for(const side of [-1,1])box('steel-pad-stripe-'+side,-8+side*7,.003,15,.1,.006,10,'#f3ca5a');
 for(let i=0;i<5;i++)box('delivery-sleeper-'+i,-13+i*2.5,.04,18,1.6,.15,.25,'#755635');
 // Working soil and gravel are actual server terrain. Pads and survey markers
 // stop outside each patch so they cannot hide a dig or support a false floor.
 const workBays=[{id:'starter-cut',name:'01 · Starter foundation cut',x:25,z:17,width:24,depth:24,color:'#eeac43'},{id:'starter-spoil',name:'02 · Truck spoil receiving bay',x:30,z:39,width:28,depth:16,color:'#d5a66e'},...construction.earthworks.patches.map((patch,index)=>({...patch,name:['03 · Deep soil excavation','04 · Live gravel extraction','05 · Graded fill platform','06 · Soil pushing stockpile','07 · Gravel pushing stockpile'][index],color:patch.material==='gravel'?'#c3d1d4':'#e4b968'}))];
 for(const bay of workBays){
  const halfW=bay.width/2,halfD=bay.depth/2;
  for(const side of [-1,1]){box(bay.id+'-edge-x-'+side,bay.x+side*(halfW+.45),.003,bay.z,.1,.006,bay.depth+.8,bay.color);box(bay.id+'-edge-z-'+side,bay.x,.003,bay.z+side*(halfD+.45),bay.width+.8,.006,.1,bay.color);}
  for(const dx of [-halfW-.5,halfW+.5])for(const dz of [-halfD-.5,halfD+.5])box(bay.id+'-survey-'+dx+'-'+dz,bay.x+dx,0,bay.z+dz,.1,.75,.1,bay.color);
  sign(bay.id+'-board',bay.name,bay.x-halfW-2,bay.z-halfD-3,bay.kind==='fill'?'Deliver soil or gravel, lower the bulldozer blade and spread a level lift across this platform. Terrain changes and delivered material are shared with everyone.':bay.material==='gravel'?'This gravel is loose material. Dig it with the excavator, load the truck, then haul or push it into the fill platform. The visible pile changes as you work.':'Work the marked soil with the excavator and bulldozer. Scoop, carry, dump and spread real material; each pass changes the ground.');
  locations.push({id:bay.id,name:bay.name,x:bay.x,z:bay.z,width:bay.width,depth:bay.depth,description:'Interactive '+(bay.material==='gravel'?'gravel':'soil')+' earthworks. Excavation, loose material and grading synchronize with the room.'});
 }
 // Wide, connected haul lanes keep trucks clear of the crane swing envelope.
 for(const [id,x,z,width,depth]of [['east-haul',85,56,132,10],['outer-haul',145,89,14,86],['south-haul',42,125,220,14],['parking-approach',-62,90,14,70],['return-haul',26,90,10,70],['south-gate-haul',36,138,14,26]])slab(id,x,-.07,z,width,depth,'#9b927d',.072);
 for(let x=26;x<=138;x+=14)box('haul-center-'+x,x,.003,56,5,.006,.15,'#f5d077');
 for(let z=62;z<=118;z+=14)box('outer-haul-center-'+z,145,.003,z,.15,.006,5,'#f5d077');
 for(let x=-58;x<=138;x+=14)box('south-haul-center-'+x,x,.003,125,5,.006,.15,'#f5d077');
 // Truck loading can approach the excavator from the east without crossing
 // the steel store, crane base, crew muster or a parked bulldozer.
 slab('truck-loading-approach',49,-.07,30,8,32,'#a89573',.072);
 for(const x of [28,33])box('truck-loading-guide-'+x,x,.003,19,.1,.006,9,'#f3d57c');
 // Site office, covered workshop, freight containers and service facilities.
 box('site-office',-34,0,24,12,3.6,7,'#47616d');
 box('site-office-roof',-34,3.6,24,12.5,.22,7.5,'#aab7b5');
 for(let i=0;i<3;i++)box('office-window-'+i,-38+i*4,1.4,27.54,2.4,1.1,.08,'#80bfd0');
 box('office-door',-34,0,27.58,1.2,2.3,.12,'#d9b74c');
 add('office-desk','studio-desk',-34,0,31);
 add('office-bench','material:bench',-39,0,31);
 // The crew has its own pedestrian apron and muster, away from truck turns.
 slab('crew-muster-pad',-58,-.08,35,28,20,'#84918b',.082);
 slab('crew-walk-west',-58,-.05,50,4,10,'#a9b39c',.052);
 slab('crew-walk-east',-25,-.05,52,70,4,'#a9b39c',.052);
 for(const x of [-69,-47])box('crew-apron-edge-'+x,x,.003,35,.12,.006,18,'#d9eac8');
 for(const x of [-67,-51])add('crew-bench-'+x,'material:bench',x,0,40);
 add('crew-water-station','supply-crate',-69,0,29);
 sign('crew-job-board','CREW & JOBS · Site dispatch',-58,31,'Open Crew & jobs to assign a worker to digging, loading, hauling, tipping, grading or steel erection. Workers move through this yard and use the shared machines. Take manual control to operate any available machine yourself.');
 sign('crew-muster','CREW MUSTER · Pedestrians',-73,43,'Worker muster and rest area. Follow the pale pedestrian path to the site office and workstations; keep clear of the haul loop and the marked crane lifting envelope.');
 // Six empty plant bays and a maintenance apron leave room for future rigs.
 slab('plant-parking-pad',-62,-.1,90,42,60,'#657575',.1);
 for(let row=0;row<3;row++)for(const side of [-1,1]){
  const x=-62+side*14,z=70+row*18;
  for(const dz of [-6,6])box('parking-line-'+row+'-'+side+'-'+dz,x,.003,z+dz,11,.006,.12,'#e6d19b');
  box('parking-wheel-stop-'+row+'-'+side,-62+side*19,.025,z,.22,.16,3,'#d5a950');
 }
 sign('plant-parking','PLANT PARKING · Six machine bays',-84,62,'Park with the implement raised for travel, stop the engine controls and leave a clear route through the central maintenance lane. Six full-size bays are ready for trucks and tracked machines.');
 slab('maintenance-apron',-62,-.08,-8,40,26,'#7f8a85',.1);
 for(const x of [-78,-48])box('maintenance-post-'+x,x,0,-17,.25,4,.25,'#9cacab');
 slab('maintenance-canopy',-63,4,-17,33,7,'#7b9097',.2);
 for(let i=0;i<3;i++){
  const x=-39+i*8;
  box('container-'+i,x,0,-32,6,2.6,3.2,['#ac6943','#4b7882','#717d47'][i]);
  for(let rib=0;rib<6;rib++)box('container-rib-'+i+'-'+rib,x-2.5+rib,.1,-30.37,.12,2.4,.08,'#bec1b4');
 }
 for(const x of [-36,-24])for(const z of [-19,-11])box('workshop-post-'+x+'-'+z,x,0,z,.22,4,.22,'#8e9c9c');
 slab('workshop-roof',-30,4,-15,14,10,'#6c848a',.2);
 for(let i=0;i<4;i++)add('equipment-crate-'+i,'supply-crate',-34+i*2.4,0,-15);
 for(const [x,z]of [[-82,-56],[142,-56],[-82,132],[142,132]]){
  box('light-pole-'+x+'-'+z,x,0,z,.18,8,.18,'#a4a59d');
  box('floodlight-'+x+'-'+z,x,7.5,z,1.2,.5,.4,'#fff0b8');
 }
 // Expanded 248 × 216 m working yard; long fence runs keep draw calls modest.
 for(const z of [-70,146])for(let x=-90;x<=150;x+=8){
  if(z===146&&(x>=22&&x<=46||x>=-70&&x<=-54))continue;
  add('fence-'+x+'-'+z,'material:crowd-barrier',x,0,z,{scale:{x:8/2.4,y:1.5,z:1}});
 }
 for(const x of [-94,154])for(let z=-66;z<=142;z+=8)add('fence-'+x+'-'+z,'material:crowd-barrier',x,0,z,{rotation:{x:0,y:Math.PI/2,z:0},scale:{x:8/2.4,y:1.5,z:1}});
 sign('haul-gate','HEAVY PLANT · Haul entrance',48,140,'Keep the 14 metre haul loop clear. Follow the marked clockwise route to the excavation bays, gravel processing, fill platform and plant parking. Lower the dump body before moving.');
 sign('yard-wayfinding','YARD DIRECTORY · Earthworks east',-7,44,'North: tower crane and steel assembly. East: starter dig, deep soil cut and gravel extraction. South-east: soil and gravel stockpiles with a graded fill platform. West: crew jobs, workshop and plant parking.');
 sign('dirt-work','SOIL WORKS · Dig, push and spread',48,65,'The soil cut and soil stockpile contain real material. Dig or push a load, haul it to the fill platform, then grade thin lifts with the blade. Choose a shared job from Crew & jobs or operate the machinery manually.');
 sign('gravel-work','GRAVEL WORKS · Loose aggregate',110,47,'Gravel starts in the marked live piles. Scoop and load it, tip it on the fill platform or push it with the bulldozer. The pile surface and volume change as material moves.');
 // Broad city streets surround the excavation without crossing working loads.
 const streets=[{id:'construction-west-avenue',name:'Foundry Avenue',from:{x:-108,z:-200},to:{x:-108,z:220},width:12},{id:'construction-east-avenue',name:'Civic Avenue',from:{x:168,z:-200},to:{x:168,z:220},width:12},{id:'construction-north-street',name:'Skyline Street',from:{x:-200,z:-84},to:{x:224,z:-84},width:12},{id:'construction-south-street',name:'Builders Boulevard',from:{x:-200,z:160},to:{x:224,z:160},width:12}];
 for(const x of [-98,158])slab('city-sidewalk-x-'+x,x,-.02,38,3,224,'#a4a69e',.12);
 for(const z of [-74,150])slab('city-sidewalk-z-'+z,30,-.02,z,260,3,'#a4a69e',.12);
 const skyline=[[-142,-121,23,62,20],[-76,-123,22,90,18],[-9,-124,25,74,22],[62,-125,22,105,20],[194,-121,25,80,24],[-142,-36,22,48,24],[198,-33,24,72,25],[-142,70,23,82,20],[198,78,25,56,22],[-142,194,24,70,22],[-75,198,26,42,24],[-4,196,24,88,21],[72,199,22,68,22],[196,194,23,95,23]];
 skyline.forEach(([x,z,width,height,depth],i)=>{
  const color=['#3a5765','#566c77','#374b5a','#6b7577'][i%4];
  box('city-tower-'+i,x,0,z,width,height,depth,color);
  slab('city-roof-'+i,x,height,z,width+1,depth+1,'#8f9d9c',.3);
  box('city-plant-'+i,x,height+.3,z,width*.32,3,depth*.25,'#4d6066');
  for(let row=5;row<height-2;row+=12){
   box('city-window-n-'+i+'-'+row,x,row,z-depth/2-.02,width*.9,2,.06,'#79aeb8');
   box('city-window-s-'+i+'-'+row,x,row,z+depth/2+.02,width*.9,2,.06,'#79aeb8');
   box('city-window-e-'+i+'-'+row,x+width/2+.02,row,z,.06,2,depth*.9,'#527e8e');
  }
  locations.push({id:'city-tower-'+i,name:'City Tower '+(i+1),x,z,width,depth,description:'Surrounding city skyline. All building pieces can be edited in a copied Builder map.'});
 });
 sign('welcome','Skyline Works · Crane, Earth & Crew',-20,28,'Build the city skyline in a 248 by 216 metre working yard. Enter the crane with E / Use, choose steel assistance or control the joysticks, and secure beams on the highlighted frame. Earthworks extend east and south: deep soil, loose gravel, stockpiles, a fill platform and full-size haul lanes. Crew & jobs lets workers use the shared machinery while you supervise or take control.');
 sign('crane-guide','TC-78 Lift Plan',-23,2,'Crane controls: left joystick slews and runs the trolley; right joystick hoists. Lower the hook to the steel supply, attach a load, raise it, slew to the tower and lower onto the highlighted target. The server shares each movement and placed beam with everyone on site.');
 sign('earthworks-guide','Earthworks Plan · Starter Cut',44,3,'Park the excavator for its dig cycle, then position the truck five metres east of it to receive material. Drive loaded trucks along the haul loop to a spoil bay or the fill platform. Lower the bulldozer blade to push real soil and gravel. Stop before exiting; use Hide controls to clear the view.');
 locations.push({id:'tower',name:'Skyline Tower · 16-floor steel frame',x:5,z:-10,width:22,depth:22,description:'Open starter steelwork keeps the actual building visible as crane-placed floors rise to 64 metres.'},{id:'crane',name:'TC-78 Tower Crane',x:-18,z:-4,width:7,depth:7,description:'Enter from the base. Steel assistance and independent slew, trolley and hoist controls.'},{id:'steel-supply',name:'Steel Delivery Yard',x:-8,z:15,width:14,depth:10,description:'Steel I-beams ready for the crane hook; every connection lies within the jib envelope.'},{id:'excavation',name:'Foundation Excavation',x:25,z:17,width:24,depth:24,description:'Starter hydraulic excavation with a truck loading approach to the east.'},{id:'plant-parking',name:'Plant Parking · Six full-size bays',x:-62,z:90,width:42,depth:60,description:'Truck and tracked-machine parking with a central maintenance lane and room to turn.'},{id:'crew-muster',name:'Crew Muster & Jobs',x:-58,z:35,width:28,depth:20,description:'Assign workers to the shared dig, load, haul, tip, grade and steel jobs. A separate pedestrian path links the site.'},{id:'haul-loop',name:'Heavy Haul Loop',x:85,z:88,width:132,depth:88,description:'Connected haul lanes, wide turns and signed approaches link all earthworks and the fill platform.'},{id:'site-office',name:'Site Office & Lift Plans',x:-34,z:24,width:12,depth:7,description:'Site information and construction controls.'});
 return {id:'skyscraper-construction',name:'Skyline Construction · Crane & Earthworks',label:'Build, dig and run the crew',description:'A 248 × 216 metre construction yard in a city skyline. Erect a 16-floor skyscraper with a 78-metre tower crane, dig deep foundation bays, push real dirt and gravel, load an articulated truck, haul material and grade a new fill platform. A worker crew, shared jobs, large stockpiles, six plant bays, clear lift guides and live machinery dashboards support synchronized multiplayer building.',category:'Construction & machinery',game:'construction',worldId:'skyline-deck',construction,permanent:true,publicDestination:true,proceduralLand:true,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false,ownerId:'muzikaz',ownerName:'MUZIKAZ',contentUpdatedAt:'2026-10-23T01:00:00.000Z',scale:1,spaceScale:1,playableSize:512,thumbnailUrl:'/public/images/construction/skyscraper-construction.svg',spawn:{x:-20,y:.02,z:23,rotationY:0},streets,builderScene:{version:3,layout:'grand-floor',mapSize:512,objects,layoutMeta:{color:0x88745b,construction,locations},gameplay:{multiplayer:true,friendlyFire:false,construction:{enabled:true}}},playUrl:'model-explorer.html?environment=skyscraper-construction&autoplay=1&mode=multiplayer'};
}
