// The permanent site uses the same editable parts as the Environment Builder.
// Crane loads, erection progress and earthworks live in the shared room state.
export function constructionWorld(){
 const construction={enabled:true,tower:{x:5,z:-10,width:18,depth:18,baseY:0,floorHeight:4,maxFloors:16},supply:{x:-8,y:.8,z:15},excavation:{x:25,z:17,radius:12,depth:0},stockpile:{x:30,z:39}};
 const objects=[],locations=[];
 const add=(id,modelId,x,y,z,extra={})=>{const item={id:'construction-'+id,modelId,name:id.replaceAll('-',' '),placementAnchor:'collider-base',position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:false},...extra};objects.push(item);return item;};
 const box=(id,x,y,z,width,height,depth,color,material='cube')=>add(id,'material:'+material,x,y,z,{scale:{x:width/1.2,y:height/1.2,z:depth/1.2},materialSettings:{useAccent:true,accent:color}});
 const slab=(id,x,y,z,width,depth,color,height=.12)=>add(id,'material:baseplate',x,y,z,{scale:{x:width/4.8,y:height/.2,z:depth/4.8},materialSettings:{useAccent:true,accent:color}});
 const sign=(id,name,x,z,text)=>add(id,'street-sign',x,0,z,{name,functionalSettings:{behavior:'talk',interactionDistance:5,prompt:'Read '+name,destructible:false},dialogueSettings:{text}});
 const machine=(id,modelId,name,x,z)=>add(id,modelId,x,0,z,{name,functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:modelId==='tower-crane'?6:5,prompt:'Operate '+name+' · E / Use',destructible:false,health:1000}});
 // Keep the four working machines first, including in lightweight map previews.
 machine('crane','tower-crane','Atlas TC-78 Tower Crane',-18,-4);
 machine('truck','site-dumptruck','HT-40 Articulated Dump Truck',21,30);
 machine('dozer','site-bulldozer','D9 Crawler Bulldozer',32,30);
 machine('excavator','site-excavator','EX-300 Hydraulic Excavator',25,17);
 slab('tower-raft',5,-.24,-10,22,22,'#b7b8b1',.24);
 slab('crane-raft',-18,-.16,-4,7,7,'#aaa69a',.16);
 // A service core and an external hoist give the unbuilt tower its skyline.
 // The four perimeter beams on each new floor are placed with the crane.
 box('service-core',5,0,-10,3.6,46,3.6,'#7f8a8d');
 for(let floor=0;floor<12;floor++){
  const y=floor*4;
  for(const z of [-19,-1])box('starter-post-'+floor+'-'+z,-4,y,z,.36,4,.36,'#647b88');
  for(const z of [-19,-1])box('starter-east-post-'+floor+'-'+z,14,y,z,.36,4,.36,'#647b88');
  add('hoist-frame-'+floor,'material:metal-truss',-7,y,-10,{scale:{x:1,y:4/2.4,z:1},materialSettings:{useAccent:true,accent:'#c88732'}});
  slab('hoist-landing-'+floor,-5.4,y,-10,2,2,'#b68a4f',.12);
 }
 for(const side of [-1,1]){
  box('raft-stripe-x-'+side,5+side*10.7,.015,-10,.12,.02,22,'#f4ba3c');
  box('raft-stripe-z-'+side,5,.015,-10+side*10.7,22,.02,.12,'#f4ba3c');
 }
 slab('steel-delivery-pad',-8,-.02,15,14,10,'#827a64',.05);
 for(const side of [-1,1])box('steel-pad-stripe-'+side,-8+side*7,.04,15,.1,.02,10,'#f3ca5a');
 for(let i=0;i<5;i++)box('delivery-sleeper-'+i,-13+i*2.5,.04,18,1.6,.15,.25,'#755635');
 // The working cut stays clear for tracked vehicles; live depth is drawn from
 // server earthworks rather than baked into the editable ground plane.
 slab('excavation-work-area',25,-.02,17,25,25,'#75523b',.03);
 for(const x of [13,37])for(let z=5;z<=29;z+=6)box('survey-'+x+'-'+z,x,0,z,.12,.75,.12,'#e5b64c');
 for(const z of [5,29])for(let x=19;x<=31;x+=6)box('survey-'+x+'-'+z,x,0,z,.12,.75,.12,'#e5b64c');
 slab('spoil-pad',30,-.02,39,14,8,'#8b6944',.03);
 slab('haul-road',30,-.06,48,15,28,'#8e7c63',.08);
 // Site office, covered workshop, freight containers and service facilities.
 box('site-office',-34,0,24,12,3.6,7,'#47616d');
 box('site-office-roof',-34,3.6,24,12.5,.22,7.5,'#aab7b5');
 for(let i=0;i<3;i++)box('office-window-'+i,-38+i*4,1.4,27.54,2.4,1.1,.08,'#80bfd0');
 box('office-door',-34,0,27.58,1.2,2.3,.12,'#d9b74c');
 add('office-desk','studio-desk',-34,0,31);
 add('office-bench','material:bench',-39,0,31);
 for(let i=0;i<3;i++){
  const x=-39+i*8;
  box('container-'+i,x,0,-32,6,2.6,3.2,['#ac6943','#4b7882','#717d47'][i]);
  for(let rib=0;rib<6;rib++)box('container-rib-'+i+'-'+rib,x-2.5+rib,.1,-30.37,.12,2.4,.08,'#bec1b4');
 }
 for(const x of [-36,-24])for(const z of [-19,-11])box('workshop-post-'+x+'-'+z,x,0,z,.22,4,.22,'#8e9c9c');
 slab('workshop-roof',-30,4,-15,14,10,'#6c848a',.2);
 for(let i=0;i<4;i++)add('equipment-crate-'+i,'supply-crate',-34+i*2.4,0,-15);
 for(const x of [-44,44])for(const z of [-40,40]){
  box('light-pole-'+x+'-'+z,x,0,z,.18,8,.18,'#a4a59d');
  box('floodlight-'+x+'-'+z,x,7.5,z,1.2,.5,.4,'#fff0b8');
 }
 // Fenced site with a pedestrian entrance and a wide haulage gate to the south.
 for(const z of [-49,49])for(let x=-48;x<=48;x+=4){
  if(z===49&&(x>=20&&x<=40||x>=-24&&x<=-16))continue;
  add('fence-'+x+'-'+z,'material:crowd-barrier',x,0,z,{scale:{x:4/2.4,y:1.5,z:1}});
 }
 for(const x of [-50,50])for(let z=-45;z<=45;z+=4)add('fence-'+x+'-'+z,'material:crowd-barrier',x,0,z,{rotation:{x:0,y:Math.PI/2,z:0},scale:{x:4/2.4,y:1.5,z:1}});
 // Broad city streets surround the excavation without crossing working loads.
 const streets=[{id:'construction-west-avenue',name:'Foundry Avenue',from:{x:-60,z:-120},to:{x:-60,z:120},width:10},{id:'construction-east-avenue',name:'Civic Avenue',from:{x:60,z:-120},to:{x:60,z:120},width:10},{id:'construction-north-street',name:'Skyline Street',from:{x:-120,z:-60},to:{x:120,z:-60},width:10},{id:'construction-south-street',name:'Builders Boulevard',from:{x:-120,z:60},to:{x:120,z:60},width:10}];
 for(const side of [-1,1]){slab('sidewalk-x-'+side,side*52,-.02,0,3,106,'#a4a69e',.12);slab('sidewalk-z-'+side,0,-.02,side*52,106,3,'#a4a69e',.12);}
 const skyline=[[-86,-88,23,62,20],[-48,-91,22,90,18],[-9,-91,25,74,22],[32,-92,22,105,20],[83,-90,25,80,24],[-91,-36,22,48,24],[91,-33,24,72,25],[-90,28,23,82,20],[92,27,25,56,22],[-87,91,24,70,22],[-43,95,26,42,24],[8,94,24,88,21],[51,96,22,68,22],[91,90,23,95,23]];
 skyline.forEach(([x,z,width,height,depth],i)=>{
  const color=['#3a5765','#566c77','#374b5a','#6b7577'][i%4];
  box('city-tower-'+i,x,0,z,width,height,depth,color);
  slab('city-roof-'+i,x,height,z,width+1,depth+1,'#8f9d9c',.3);
  box('city-plant-'+i,x,height+.3,z,width*.32,3,depth*.25,'#4d6066');
  for(let row=5;row<height-2;row+=8){
   box('city-window-n-'+i+'-'+row,x,row,z-depth/2-.02,width*.9,2,.06,'#79aeb8');
   box('city-window-s-'+i+'-'+row,x,row,z+depth/2+.02,width*.9,2,.06,'#79aeb8');
   box('city-window-e-'+i+'-'+row,x+width/2+.02,row,z,.06,2,depth*.9,'#527e8e');
  }
  locations.push({id:'city-tower-'+i,name:'City Tower '+(i+1),x,z,width,depth,description:'Surrounding city skyline. All building pieces can be edited in a copied Builder map.'});
 });
 sign('welcome','Skyscraper Construction Site',-20,28,'Build the city skyline together. Enter the crane with E / Use. Slew the jib, run the trolley and raise or lower the hook; attach a steel beam, lift it to the highlighted tower target, then release to secure it. Four beams raise each new floor. Use the working excavator, bulldozer and dump truck for earthworks. Each machine has its own joystick dashboard.');
 sign('crane-guide','TC-78 Lift Plan',-23,2,'Crane controls: left joystick slews and runs the trolley; right joystick hoists. Lower the hook to the steel supply, attach a load, raise it, slew to the tower and lower onto the highlighted target. The server shares each movement and placed beam with everyone on site.');
 sign('earthworks-guide','Earthworks Plan',39,17,'Excavate the marked cut with the hydraulic boom and bucket, grade with the bulldozer blade, and use the dump truck to carry spoil to the stockpile. Stop before leaving a machine. Hide the dashboard with its collapse button to clear your view.');
 locations.push({id:'tower',name:'Skyline Tower · 16-floor steel frame',x:5,z:-10,width:22,depth:22,description:'Use the crane to erect four structural beams per floor and raise the skyscraper to 64 metres.'},{id:'crane',name:'TC-78 Tower Crane',x:-18,z:-4,width:7,depth:7,description:'Enter from the base. Independent slew, trolley and hoist controls with a live load dashboard.'},{id:'steel-supply',name:'Steel Delivery Yard',x:-8,z:15,width:14,depth:10,description:'Steel I-beams ready for the crane hook.'},{id:'excavation',name:'Foundation Excavation',x:25,z:17,width:25,depth:25,description:'Hydraulic excavation and tracked earthmoving field.'},{id:'plant-parking',name:'Heavy Plant Parking & Spoil',x:28,z:35,width:24,depth:17,description:'Articulated dump truck, crawler bulldozer and a spoil stockpile.'},{id:'site-office',name:'Site Office & Lift Plans',x:-34,z:24,width:12,depth:7,description:'Site information and construction controls.'});
 return {id:'skyscraper-construction',name:'Skyline Construction · Crane & Earthworks',label:'Build a city skyscraper',description:'An animated city construction site: operate a 78-metre tower crane, lift and stack steel beams into a 16-floor skyscraper, excavate foundations, grade earth with a crawler bulldozer and haul spoil with an articulated dump truck. Realistic joystick functions, live machinery dashboards and synchronized multiplayer building.',category:'Construction & machinery',game:'construction',worldId:'skyline-deck',construction,permanent:true,publicDestination:true,proceduralLand:true,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false,ownerId:'muzikaz',ownerName:'MUZIKAZ',scale:1,spaceScale:1,playableSize:320,thumbnailUrl:'/public/images/construction/skyscraper-construction.svg',spawn:{x:-20,y:.02,z:23,rotationY:0},streets,builderScene:{version:3,layout:'grand-floor',mapSize:320,objects,layoutMeta:{color:0x88745b,construction,locations},gameplay:{multiplayer:true,friendlyFire:false,construction:{enabled:true}}},playUrl:'model-explorer.html?environment=skyscraper-construction&autoplay=1&mode=multiplayer'};
}
