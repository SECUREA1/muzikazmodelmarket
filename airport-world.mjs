import {resortProductPlacement} from './public/js/resort-products.js';
import {addMountainFlyIn} from './airport-mountain.mjs';
export function airportWorld(){
 const runways=[{id:'runway',name:'International Runway 18 / 36',x:40,z:0,width:16,length:202},{id:'north-runway',name:'North Ridge Airfield',x:-280,z:-250,width:20,length:240},{id:'coastal-runway',name:'Coastal Landing Strip',x:280,z:210,width:20,length:240},{id:'mountain-runway',name:'Alpine Ridge Mountain Airfield',x:620,z:-500,width:20,length:240,surface:'paved',description:'Mountain valley fly-in with a paved runway, lodge, ranger station, camping and trail quests.'}];
 const objects=[],locations=[];
 const add=(id,modelId,x,y,z,extra={})=>{const item={id:'airport-'+id,modelId,placementAnchor:'collider-base',name:extra.name||id.replaceAll('-',' '),position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:true,health:160},...extra};objects.push(item);return item;};
 const part=(id,material,x,y,z,scale=[1,1,1])=>add(id,'material:'+material,x,y,z,{scale:{x:scale[0],y:scale[1],z:scale[2]}});
 const sign=(id,name,x,z,text)=>add(id,'street-sign',x,0,z,{name,functionalSettings:{behavior:'talk',interactionDistance:5,prompt:'Read '+name},dialogueSettings:{text}});
 for(let i=0;i<21;i++)part('runway-'+i,'rubber-tile',40,0,-96+i*9.6,[12,1,8]);
 for(let z=-90;z<=90;z+=12){part('centerline-'+z,'smooth-plastic',40,.11,z,[.2,.08,6]);for(const side of [-1,1])part('runway-light-'+side+'-'+z,'neon',40+side*8,.05,z,[.2,.5,.4]);}
 for(const z of [-88,88])for(let x=0;x<6;x++)part('threshold-'+z+'-'+x,'smooth-plastic',34+x*2.4,.11,z,[.6,.08,9]);
 for(let i=0;i<12;i++)part('taxiway-'+i,'paving-tile',16,0,-70+i*12,[8,.7,10]);
 for(let i=0;i<5;i++)part('taxi-link-'+i,'paving-tile',16+i*4.8,0,72,[4,.7,8]);
 for(let x=-1;x<=1;x++)for(let z=0;z<3;z++)part('apron-'+x+'-'+z,'baseplate',-8+x*9.6,.0,50+z*9.6,[2,1,2]);
 function building(id,name,x,z,width=14.4,depth=9.6,height=3){
  locations.push({id,name,x,z,width,depth,description:'Walk-in '+name+'. Structural pieces use the Builder catalog.'});
  for(let i=0;i<width/4.8;i++)for(let j=0;j<depth/4.8;j++){part(id+'-floor-'+i+'-'+j,'baseplate',x-width/2+2.4+i*4.8,0,z-depth/2+2.4+j*4.8);part(id+'-roof-'+i+'-'+j,'baseplate',x-width/2+2.4+i*4.8,height,z-depth/2+2.4+j*4.8);}
  for(const side of [-1,1])part(id+'-side-'+side,'wall',x+side*width/2,.2,z,[depth/2.4,height/2.4,1]).rotation.y=Math.PI/2;
  for(let i=0;i<width/2.4;i++)part(id+'-back-'+i,'glass-wall',x-width/2+1.2+i*2.4,.2,z-depth/2,[1,height/2.4,1]);
  for(const dx of [-width/2,width/2])part(id+'-front-post-'+dx,'round-column',x+dx,.2,z+depth/2,[1,height/2.4,1]);
 }
 building('terminal','Passenger Terminal',-58,58,19.2,9.6,3);
 add('terminal-counter','studio-desk',-58,.2,56);add('terminal-seat-a','sofa',-64,.2,60,{functionalSettings:{behavior:'seat',interactionDistance:3}});add('terminal-seat-b','sofa',-52,.2,60,{functionalSettings:{behavior:'seat',interactionDistance:3}});
 add('terminal-vending','item-vending-machine',-65,.2,55,{functionalSettings:{behavior:'interact',device:'item-vending-machine',interactionDistance:4}});
 building('hangar','Open Aircraft Hangar',-14,86,24,14.4,5);
 building('operations','Ground Services',-60,12,14.4,9.6,3);
 add('operations-tools','studio-desk',-60,.2,10);add('operations-crates','supply-crate',-64,.2,12);
 building('tower','Control Tower',-72,-22,9.6,9.6,10);
 for(let i=0;i<6;i++)part('tower-stair-'+i,'steps',-72,i*1.2,-10-i*2.4).rotation.y=Math.PI;
 for(let i=0;i<4;i++)part('tower-observation-'+i,'floor',-75.6+i*2.4,7.2,-24.4);
 add('tower-flight-console','studio-desk',-72,7.4,-25);
 add('tower-console','studio-desk',-72,.2,-24);
 for(let i=0;i<3;i++){
  const x=-18+i*14;
  add('flight-'+(i+1),['corsair-aircraft','diamond-da40','piper-cub'][i%3],x,.4,62,{placementAnchor:'aircraft-origin',name:['Blackwing Corsair','Diamond DA40','Piper Cub'][i%3]+' · Flight '+(i+1),functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:5,prompt:'Enter aircraft · E / Use',destructible:true,health:400}});
  sign('stand-'+i,'Flight '+(i+1)+' stand',x+5,68,'Board with E / Use. Request Tower takeoff clearance from the radio SVG. W / left stick taxis and accelerates, A/D steer, Space or Climb rises, Shift or Descend lowers. Brake with S. Exit only after landing.');
 }
 for(const strip of runways.slice(1)){
  for(let i=0;i<25;i++)part(strip.id+'-surface-'+i,'rubber-tile',strip.x,0,strip.z-115.2+i*9.6,[16.7,1,8]);
  for(let z=-108;z<=108;z+=12){part(strip.id+'-center-'+z,'smooth-plastic',strip.x,.11,strip.z+z,[.2,.08,6]);for(const side of [-1,1])part(strip.id+'-light-'+side+'-'+z,'neon',strip.x+side*10,.05,strip.z+z,[.2,.5,.4]);}
  if(strip.id==='mountain-runway')for(let i=0;i<15;i++)part('mountain-parking-apron-'+i,'rubber-tile',strip.x-24,0,strip.z-67.2+i*9.6,[20,1,8]);
  else for(let i=0;i<8;i++)part(strip.id+'-apron-'+i,'baseplate',strip.x-26+(i%2)*4.8,0,strip.z-7.2+Math.floor(i/2)*4.8);
  for(let i=0;i<5;i++)part(strip.id+'-taxi-'+i,'paving-tile',strip.x-20+i*4.8,0,strip.z,[4,.7,6]);
  for(const z of [-104,104])for(let i=0;i<6;i++)part(strip.id+'-threshold-'+z+'-'+i,'smooth-plastic',strip.x-7.2+i*2.88,.11,strip.z+z,[.8,.08,8]);
  if(strip.id!=='mountain-runway')building(strip.id+'-lodge',strip.name+' Lodge',strip.x-48,strip.z,14.4,9.6,3);
  sign(strip.id+'-guide',strip.name,strip.x-32,strip.z+12,'Select this landing strip on the local map while piloting. Auto takes off, flies the route, lands and parks beside this apron. Ground service repairs and refuels the aircraft.');
  locations.push({id:strip.id,name:strip.name,x:strip.x,z:strip.z,width:strip.width,depth:strip.length,description:strip.description||'A full landing strip with approach lights, taxiway, parking apron and lodge. Choose Fly to on the map.'});
 }
 addMountainFlyIn({add,part,sign,building,locations});
 locations.push({id:'runway',name:'Runway 18 / 36',x:40,z:0,width:16,depth:202,description:'Shared runway. Use the tower radio to request takeoff or landing clearance. Taxi to the runway before departure.'},{id:'apron',name:'Aircraft Stands',x:-4,z:62,width:44,depth:26,description:'Three public aircraft, ready to enter and fly. Ground service repairs and refuels parked aircraft.'});
 sign('welcome','Airport Arrivals',-60,74,'Welcome to MUZIKAZ International Airport. Explore the passenger terminal, hangar and control tower. Open the radio SVG for tower audio, runway clearance and ground services. Fly to Alpine Ridge Mountain Airfield from the local map for a paved mountain runway, lodge, ranger station, camping and trail quests. Accept mountain supply and evacuation flights in Quests.');
 sign('tower-guide','Tower Frequency',-72,-14,'Tower radio is available through the radio SVG. Captions always work; enable voice for spoken controller calls. One pilot at a time receives runway clearance. Airspace ceiling: 140 metres.');
 for(const x of [-96,96])for(let z=-100;z<=100;z+=20)part('fence-'+x+'-'+z,'crowd-barrier',x,0,z,[1,1,4]);
 building('executive-club','Aerie Executive Club',-114,62,19.2,14.4,4);
 for(const piece of objects.filter(o=>o.id.startsWith('airport-executive-club-'))){if(piece.id.includes('-floor-'))piece.position.y=-.2;else if(!piece.id.includes('-roof-'))piece.position.y=0;}
 for(let i=0;i<10;i++)part('club-walk-'+i,'paving-tile',-112+i*4.8,-.14,74,[4,.7,4]);
 for(const [id,model,x,z]of [['west-sofa','aerie-vip-sofa',-119,64],['east-sofa','aerie-vip-sofa',-109,64],['onyx-table','aerie-coffee-table',-114,63],['club-screen','aerie-executive-screen',-114,56],['flight-notices','aerie-flight-board',-109,56],['club-radio','aerie-club-radio',-119,56],['equipment-concierge','aerie-boarding-kiosk',-120,60]])objects.push(resortProductPlacement('airport-luxury-'+id,model,x,0,z));
 locations.push({id:'aerie-club',name:'Aerie Executive Club',x:-114,y:0,z:68,width:19.2,depth:14.4,description:'Walk-in public lounge with executive seating, shared video, club radio, flight meetup notices and an equipment marketplace. Connects to the terminal by the paved promenade.'});
 return {id:'muzikaz-airport',name:'MUZIKAZ International Airport',label:'Public airport and mountain fly-in experience',category:'Flight & transport',game:'airport',worldId:'skyline-deck',airport:{enabled:true,runway:{x:40,z:0,width:16,length:202},runways,ceiling:140},contentUpdatedAt:'2026-10-23T00:00:00.000Z',permanent:true,publicDestination:true,proceduralLand:true,source:'repository',visibility:'public',playable:true,playableSize:2000,multiplayer:true,canDelete:false,canEdit:false,ownerId:'muzikaz',ownerName:'MUZIKAZ',scale:1,spaceScale:1,spawn:{x:-60,y:.02,z:74,rotationY:0},description:'An expanded 2 km airport world with three flyable aircraft and four connected airfields. Fly to Alpine Ridge for a paved mountain runway, taxiway, parking apron, walk-in lodge, ranger station, supply store, forest campground, lake and lookout trails. Automatic flights, ground services, mountain supply and camper evacuation missions, and on-foot collection quests connect the full experience.',streets:[{id:'airport-access',name:'Terminal Access Road',from:{x:-88,z:-105},to:{x:-88,z:105},width:5}],builderScene:{version:3,layout:'grand-floor',mapSize:2000,objects,layoutMeta:{color:0x42624c,locations},gameplay:{multiplayer:true,airport:{enabled:true},friendlyFire:false}},playUrl:'model-explorer.html?environment=muzikaz-airport&autoplay=1&mode=multiplayer'};
}
