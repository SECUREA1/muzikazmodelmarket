// The permanent site uses the same editable parts as the Environment Builder.
// Crane loads, erection progress and earthworks live in the shared room state.
export function constructionWorld(){
 const construction={enabled:true,facility:{name:'Site facility',x:-41,z:5,width:18,depth:18,baseY:0,floorHeight:4,maxFloors:3,frameOnly:true},tower:{x:5,z:-10,width:18,depth:18,baseY:0,floorHeight:4,maxFloors:16},supply:{x:-8,y:.8,z:15},excavation:{x:25,z:17,radius:12,depth:0},stockpile:{x:30,z:39,width:28,depth:16},yard:{minX:-94,maxX:242,minZ:-70,maxZ:234},earthworks:{cellSize:2,patches:[
  {id:'dirt-bay',kind:'excavation',x:76,z:12,width:40,depth:40,maxDepth:8,material:'soil'},
  {id:'gravel-bay',kind:'stockpile',x:122,z:12,width:36,depth:36,maxDepth:0,height:2.8,material:'gravel'},
  {id:'fill-zone',kind:'fill',x:80,z:92,width:48,depth:38,maxDepth:0,material:'soil'},
  {id:'soil-stockpile',kind:'stockpile',x:42,z:106,width:20,depth:20,maxDepth:0,height:2.2,material:'soil'},
  {id:'gravel-stockpile',kind:'stockpile',x:124,z:88,width:26,depth:26,maxDepth:0,height:1.6,material:'gravel'},
  {id:'pavement-reclamation',name:'08 · Pavement reclamation',kind:'excavation',x:198,z:12,width:60,depth:18,maxDepth:1,surface:'asphalt',surfaceThickness:.24,material:'gravel'},
  {id:'new-road',name:'09 · Build a gravel road',kind:'fill',x:198,z:92,width:60,depth:18,maxDepth:0,material:'gravel'},
  {id:'utility-trench',name:'10 · Utility trench',kind:'excavation',x:126,z:-44,width:64,depth:8,maxDepth:3,material:'soil'},
  {id:'basement-cut',name:'11 · Basement excavation',kind:'excavation',x:76,z:-40,width:32,depth:28,maxDepth:6,material:'soil'},
  {id:'recycled-aggregate',name:'12 · Recycled aggregate receiving',kind:'stockpile',x:198,z:166,width:28,depth:28,maxDepth:0,material:'gravel'},
  {id:'earth-platform',name:'13 · Earth platform and leveling',kind:'fill',x:94,z:192,width:80,depth:28,maxDepth:0,material:'soil'}
 ]},crew:{autoStart:true,muster:{x:-58,y:0,z:35},jobBoard:{x:-58,y:0,z:31},walkWaypoints:[{x:-58,z:52},{x:-16,z:52},{x:8,z:52}],haulWaypoints:[{x:38,z:52},{x:70,z:52},{x:145,z:52},{x:145,z:125},{x:26,z:125},{x:26,z:65}],approachWaypoints:[{x:38,z:52},{x:49,z:52},{x:49,z:44},{x:30,z:44},{x:30,z:17}],dumpApproachWaypoints:[{x:145,z:108},{x:107,z:108},{x:80,z:108},{x:80,z:92}],staging:{x:-62,y:0,z:78},loading:{x:30,y:0,z:17,rotationY:0},dump:{x:80,y:0,z:92},grade:{x:80,y:0,z:92}}};
 const objects=[],locations=[];
 const add=(id,modelId,x,y,z,extra={})=>{const item={id:'construction-'+id,modelId,name:id.replaceAll('-',' '),placementAnchor:'collider-base',position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:false},...extra};objects.push(item);return item;};
 const box=(id,x,y,z,width,height,depth,color,material='cube')=>add(id,'material:'+material,x,y,z,{scale:{x:width/1.2,y:height/1.2,z:depth/1.2},materialSettings:{useAccent:true,accent:color}});
 const slab=(id,x,y,z,width,depth,color,height=.12)=>add(id,'material:baseplate',x,y,z,{scale:{x:width/4.8,y:height/.2,z:depth/4.8},materialSettings:{useAccent:true,accent:color}});
 const sign=(id,name,x,z,text)=>add(id,'street-sign',x,0,z,{name,functionalSettings:{behavior:'talk',interactionDistance:5,prompt:'Read '+name,destructible:false},dialogueSettings:{text}});
 const machine=(id,modelId,name,x,z)=>add(id,modelId,x,0,z,{name,asset:{buildAssetId:modelId,name,type:'vehicle'},functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:modelId==='tower-crane'?6:5,prompt:'Operate '+name+' · E / Use',destructible:false,health:1000}});
 // Keep the four working machines first, including in lightweight map previews.
 machine('crane','tower-crane','Titan 78 Tower Crane',-18,-4);
 machine('truck','site-dumptruck','Terra 40 Articulated Dump Truck',21,30);
 machine('dozer','site-bulldozer','D9 Crawler Bulldozer',45,58).rotation.y=Math.PI/2;
 machine('excavator','site-excavator','HX350 Hydraulic Excavator',25,17);
 slab('tower-raft',5,-.24,-10,22,22,'#b7b8b1',.24);
 slab('facility-raft',-41,-.24,5,20,20,'#a1aaa5',.24);
 for(const x of [-50,-32])for(const z of [-4,14])box('facility-starter-'+x+'-'+z,x,0,z,.36,4,.36,'#879eac');
 sign('facility-plan','FACILITY STEEL · Three-floor frame',-53,14,'Use the tower crane to build this separate three-floor facility frame. Select Facility steel frame in the crane functions or assign the steel crew to it. Each placed beam is checked and shared with all players.');
 locations.push({id:'facility',name:'Facility steel frame',x:-41,z:5,width:20,depth:20,description:'A separate three-floor open steel facility built using the working crane and shared crew.'});
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
 const workBays=[{id:'starter-cut',name:'01 · Starter foundation cut',x:25,z:17,width:24,depth:24,color:'#eeac43'},{id:'starter-spoil',name:'02 · Truck spoil receiving bay',x:30,z:39,width:28,depth:16,color:'#d5a66e'},...construction.earthworks.patches.map((patch,index)=>({...patch,name:patch.name||['03 · Deep soil excavation','04 · Live gravel extraction','05 · Graded fill platform','06 · Soil pushing stockpile','07 · Gravel pushing stockpile'][index],color:patch.material==='gravel'?'#c3d1d4':'#e4b968'}))];
 for(const bay of workBays){
  const halfW=bay.width/2,halfD=bay.depth/2;
  for(const side of [-1,1]){box(bay.id+'-edge-x-'+side,bay.x+side*(halfW+.45),.003,bay.z,.1,.006,bay.depth+.8,bay.color);box(bay.id+'-edge-z-'+side,bay.x,.003,bay.z+side*(halfD+.45),bay.width+.8,.006,.1,bay.color);}
  for(const dx of [-halfW-.5,halfW+.5])for(const dz of [-halfD-.5,halfD+.5])box(bay.id+'-survey-'+dx+'-'+dz,bay.x+dx,0,bay.z+dz,.1,.75,.1,bay.color);
  sign(bay.id+'-board',bay.name,bay.x-halfW-2,bay.z-halfD-3,bay.id==='pavement-reclamation'?'Rip the dark 24 cm pavement with the bucket or blade. Reclaimed pavement enters the gravel cargo stream: load, haul and reuse it on the new road. Beneath it is a one metre subgrade that can also be excavated.':bay.id==='utility-trench'?'Excavate a continuous utility trench up to three metres deep. Keep machines on the shoulders; scoop from the side and haul spoil to a stockpile.':bay.id==='basement-cut'?'Excavate this six metre basement in reachable lifts. Keep plant back from the edge, lower into the cut only on supported ground and haul spoil to the receiving bays.':bay.kind==='fill'?'Deliver soil or gravel, lower the bulldozer blade and spread a level lift across this platform. Terrain changes and delivered material are shared with everyone.':bay.material==='gravel'?'This gravel is loose material. Dig it with the excavator, load the truck, then haul or push it into the fill platform. The visible pile changes as you work.':'Work the marked soil with the excavator and bulldozer. Scoop, carry, dump and spread real material; each pass changes the ground.');
  locations.push({id:bay.id,name:bay.name,x:bay.x,z:bay.z,width:bay.width,depth:bay.depth,description:'Interactive '+(bay.material==='gravel'?'gravel':'soil')+' earthworks. Excavation, loose material and grading synchronize with the room.'});
 }
 // Wide, connected haul lanes keep trucks clear of the crane swing envelope.
 for(const [id,x,z,width,depth]of [['east-haul',85,56,132,10],['outer-haul',145,89,14,86],['south-haul',42,125,220,14],['parking-approach',-62,90,14,70],['return-haul',26,90,10,70],['south-gate-haul',36,138,14,26]])slab(id,x,-.07,z,width,depth,'#9b927d',.072);
 for(let x=26;x<=138;x+=14)box('haul-center-'+x,x,.003,56,5,.006,.15,'#f5d077');
 for(let z=62;z<=118;z+=14)box('outer-haul-center-'+z,145,.003,z,.15,.006,5,'#f5d077');
 for(let x=-58;x<=138;x+=14)box('south-haul-center-'+x,x,.003,125,5,.006,.15,'#f5d077');
 // New works connect to the existing loop through clear 14 metre lanes.
 for(const [id,x,z,width,depth]of [['works-crosshaul',190,56,90,14],['works-east',235,80,10,212],['works-north',164,-21,128,10],['works-access',156,17.5,12,77],['works-south',190,214,90,14],['works-south-link',145,170,14,102],['works-return',40,170,12,102],['platform-access',96,214,112,12],['south-yard-gate',36,234,14,40]])slab(id,x,-.07,z,width,depth,'#9b927d',.072);
 sign('roadworks-dispatch','ROADWORKS · Reclaim, haul, rebuild',158,48,'North-east: rip the old pavement and load its reclaimed aggregate. South-east: tip gravel onto the new road, then lower the blade to spread a 20 cm base course. Far south: recycling stockpile and earth platform. Open Crew / jobs for the site operations plan and live progress.');
 sign('trench-dispatch','EXCAVATION · Utilities & basement',100,-17,'Work the utility trench from its shoulders. Excavate the basement in lifts and haul the spoil out. Raise and curl the bucket before driving. Existing soil, gravel and steel jobs remain available to the crew.');
 // Truck loading can approach the excavator from the east without crossing
 // the steel store, crane base, crew muster or a parked bulldozer.
 slab('truck-loading-approach',49,-.07,30,8,32,'#a89573',.072);
 for(const x of [28,33])box('truck-loading-guide-'+x,x,.003,19,.1,.006,9,'#f3d57c');
 // Site office, covered workshop, freight containers and service facilities.
 add('site-office','construction-site-office',-34,0,24,{name:'Modular Site Office · Lift Plans'});
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
 add('maintenance-canopy','construction-service-canopy',-63,0,-17,{name:'Steel Service Canopy'});
 for(let i=0;i<3;i++){
  const x=-39+i*8;
  add('container-'+i,'shipping-container-box',x,0,-32,{name:'Corrugated Service Container '+(i+1),rotation:{x:0,y:Math.PI/2,z:0},scale:{x:3.2/2.4,y:1,z:1}});
 }
 for(const x of [-36,-24])for(const z of [-19,-11])box('workshop-post-'+x+'-'+z,x,0,z,.22,4,.22,'#8e9c9c');
 slab('workshop-roof',-30,4,-15,14,10,'#6c848a',.2);
 for(let i=0;i<4;i++)add('equipment-crate-'+i,'supply-crate',-34+i*2.4,0,-15);
 for(const [x,z]of [[-82,-56],[142,-56],[-82,132],[142,132]]){
  add('floodlight-'+x+'-'+z,'construction-floodlight',x,0,z,{name:'Four-head Site Floodlight'});
 }
 // Expanded 336 × 304 m working yard; long fence runs keep draw calls modest.
 for(const z of [-70,234])for(let x=-90;x<=238;x+=8){
  if(z===234&&(x>=22&&x<=46||x>=-70&&x<=-54))continue;
  add('fence-'+x+'-'+z,'material:crowd-barrier',x,0,z,{scale:{x:8/2.4,y:1.5,z:1}});
 }
 for(const x of [-94,242])for(let z=-66;z<=230;z+=8)add('fence-'+x+'-'+z,'material:crowd-barrier',x,0,z,{rotation:{x:0,y:Math.PI/2,z:0},scale:{x:8/2.4,y:1.5,z:1}});
 sign('haul-gate','HEAVY PLANT · Haul entrance',48,228,'Keep the 14 metre haul loop clear. Follow the marked clockwise route to the excavation bays, gravel processing, fill platform and plant parking. Lower the dump body before moving.');
 sign('yard-wayfinding','YARD DIRECTORY · Earthworks east',-7,44,'North: tower crane and steel assembly. East: starter dig, deep soil cut and gravel extraction. South-east: soil and gravel stockpiles with a graded fill platform. West: crew jobs, workshop and plant parking.');
 sign('dirt-work','SOIL WORKS · Dig, push and spread',48,65,'The soil cut and soil stockpile contain real material. Dig or push a load, haul it to the fill platform, then grade thin lifts with the blade. Choose a shared job from Crew & jobs or operate the machinery manually.');
 sign('gravel-work','GRAVEL WORKS · Loose aggregate',110,47,'Gravel starts in the marked live piles. Scoop and load it, tip it on the fill platform or push it with the bulldozer. The pile surface and volume change as material moves.');
 // Broad city streets surround the excavation without crossing working loads.
 const streets=[{id:'construction-west-avenue',name:'Foundry Avenue',from:{x:-108,z:-200},to:{x:-108,z:308},width:12},{id:'construction-east-avenue',name:'Civic Avenue',from:{x:256,z:-200},to:{x:256,z:308},width:12},{id:'construction-north-street',name:'Skyline Street',from:{x:-200,z:-84},to:{x:312,z:-84},width:12},{id:'construction-south-street',name:'Builders Boulevard',from:{x:-200,z:248},to:{x:312,z:248},width:12}];
 for(const x of [-98,246])slab('city-sidewalk-x-'+x,x,-.02,82,3,312,'#a4a69e',.12);
 for(const z of [-74,238])slab('city-sidewalk-z-'+z,74,-.02,z,348,3,'#a4a69e',.12);
 const skyline=[[-142,-121,23,62,20],[-76,-123,22,90,18],[-9,-124,25,74,22],[62,-125,22,105,20],[194,-121,25,80,24],[-142,-36,22,48,24],[198,-33,24,72,25],[-142,70,23,82,20],[198,78,25,56,22],[-142,194,24,70,22],[-75,198,26,42,24],[-4,196,24,88,21],[72,199,22,68,22],[196,194,23,95,23]];
 skyline.forEach(([x,z,width,height,depth],i)=>{
  if(x>168)x+=88;if(z>160)z+=88;
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
 sign('welcome','Skyline Works · Crane, Earth & Crew',-20,28,'Build the city skyline in a 336 by 304 metre working yard. Enter the crane with E / Use, choose steel assistance or control the joysticks, and secure beams on the highlighted frame. Earthworks extend east and south: deep soil, loose gravel, stockpiles, a fill platform and full-size haul lanes. Crew & jobs lets workers use the shared machinery while you supervise or take control.');
 sign('crane-guide','Titan 78 Lift Plan',-23,2,'Crane controls: left joystick slews and runs the trolley; right joystick hoists. Lower the hook to the steel supply, attach a load, raise it, slew to the tower and lower onto the highlighted target. The server shares each movement and placed beam with everyone on site.');
 sign('earthworks-guide','Earthworks Plan · Starter Cut',44,3,'Park the excavator for its dig cycle, then position the truck five metres east of it to receive material. Drive loaded trucks along the haul loop to a spoil bay or the fill platform. Lower the bulldozer blade to push real soil and gravel. Stop before exiting; use Hide controls to clear the view.');
 locations.push({id:'tower',name:'Skyline Tower · 16-floor steel frame',x:5,z:-10,width:22,depth:22,description:'Open starter steelwork keeps the actual building visible as crane-placed floors rise to 64 metres.'},{id:'crane',name:'Titan 78 Tower Crane',x:-18,z:-4,width:7,depth:7,description:'Enter from the base. Steel assistance and independent slew, trolley and hoist controls.'},{id:'steel-supply',name:'Steel Delivery Yard',x:-8,z:15,width:14,depth:10,description:'Steel I-beams ready for the crane hook; every connection lies within the jib envelope.'},{id:'excavation',name:'Foundation Excavation',x:25,z:17,width:24,depth:24,description:'Starter hydraulic excavation with a truck loading approach to the east.'},{id:'plant-parking',name:'Plant Parking · Six full-size bays',x:-62,z:90,width:42,depth:60,description:'Truck and tracked-machine parking with a central maintenance lane and room to turn.'},{id:'crew-muster',name:'Crew Muster & Jobs',x:-58,z:35,width:28,depth:20,description:'Assign workers to the shared dig, load, haul, tip, grade and steel jobs. A separate pedestrian path links the site.'},{id:'haul-loop',name:'Heavy Haul Loop',x:85,z:88,width:132,depth:88,description:'Connected haul lanes, wide turns and signed approaches link all earthworks and the fill platform.'},{id:'site-office',name:'Site Office & Lift Plans',x:-34,z:24,width:12,depth:7,description:'Site information and construction controls.'});
 return {id:'skyscraper-construction',name:'Skyline Construction · Crane & Earthworks',label:'Build, dig and run the crew',description:'A 336 × 304 metre construction yard in a city skyline. Erect a 16-floor skyscraper with a 78-metre tower crane, dig deep foundation bays, push real dirt and gravel, load an articulated truck, haul material and grade a new fill platform. Rip and recycle pavement, create a gravel road, excavate utility trenches and a basement, and level a large earth platform. A worker crew, shared jobs, large stockpiles, six plant bays, clear lift guides and live machinery dashboards support synchronized multiplayer building.',category:'Construction & machinery',game:'construction',worldId:'skyline-deck',construction,permanent:true,publicDestination:true,proceduralLand:true,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false,ownerId:'muzikaz',ownerName:'MUZIKAZ',contentUpdatedAt:'2026-10-27T22:40:21.000Z',scale:1,spaceScale:1,playableSize:768,thumbnailUrl:'/public/images/construction/skyscraper-construction.svg',spawn:{x:-20,y:.02,z:23,rotationY:0},streets,builderScene:{version:3,layout:'grand-floor',mapSize:768,objects,layoutMeta:{color:0x88745b,construction,locations},gameplay:{multiplayer:true,friendlyFire:false,construction:{enabled:true}}},playUrl:'model-explorer.html?environment=skyscraper-construction&autoplay=1&mode=multiplayer'};
}
