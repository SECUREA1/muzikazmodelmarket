export function airportWorld(){
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
  add('flight-'+(i+1),'corsair-aircraft',x,.4,62,{placementAnchor:'aircraft-origin',name:'MUZIKAZ Flight '+(i+1),functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:5,prompt:'Enter aircraft · E / Use',destructible:true,health:400}});
  sign('stand-'+i,'Flight '+(i+1)+' stand',x+5,68,'Board with E / Use. Request Tower takeoff clearance from the radio SVG. W / left stick taxis and accelerates, A/D steer, Space or Climb rises, Shift or Descend lowers. Brake with S. Exit only after landing.');
 }
 locations.push({id:'runway',name:'Runway 18 / 36',x:40,z:0,width:16,depth:202,description:'Shared runway. Use the tower radio to request takeoff or landing clearance. Taxi to the runway before departure.'},{id:'apron',name:'Aircraft Stands',x:-4,z:62,width:44,depth:26,description:'Three public aircraft, ready to enter and fly. Ground service repairs and refuels parked aircraft.'});
 sign('welcome','Airport Arrivals',-60,74,'Welcome to MUZIKAZ International Airport. Explore the passenger terminal, hangar and control tower. Open the radio SVG for tower audio, runway clearance and ground services. The local map shows airport facilities and district connections.');
 sign('tower-guide','Tower Frequency',-72,-14,'Tower radio is available through the radio SVG. Captions always work; enable voice for spoken controller calls. One pilot at a time receives runway clearance. Airspace ceiling: 80 metres.');
 for(const x of [-96,96])for(let z=-100;z<=100;z+=20)part('fence-'+x+'-'+z,'crowd-barrier',x,0,z,[1,1,4]);
 return {id:'muzikaz-airport',name:'MUZIKAZ International Airport',label:'Public flight and airport experience',category:'Flight & transport',game:'airport',worldId:'skyline-deck',airport:{enabled:true,runway:{x:40,z:0,width:16,length:202},ceiling:80},permanent:true,publicDestination:true,proceduralLand:true,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false,ownerId:'muzikaz',ownerName:'MUZIKAZ',scale:1,spaceScale:1,spawn:{x:-60,y:.02,z:74,rotationY:0},description:'A brick-built public airport with three flyable aircraft, shared runway 18/36, taxiways, terminal, hangar, control tower, radio captions and optional spoken ATC, mobile flight controls and ground services.',streets:[{id:'airport-access',name:'Terminal Access Road',from:{x:-88,z:-105},to:{x:-88,z:105},width:5}],builderScene:{version:3,layout:'grand-floor',mapSize:256,objects,layoutMeta:{color:0x42624c,locations},gameplay:{multiplayer:true,airport:{enabled:true},friendlyFire:false}},playUrl:'model-explorer.html?environment=muzikaz-airport&autoplay=1&mode=multiplayer'};
}
