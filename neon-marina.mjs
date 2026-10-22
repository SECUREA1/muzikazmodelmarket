export function neonMarina(){
 const harbor={extent:384,islands:[{id:'beacon-island',name:'Beacon Island',x:185,z:24,width:48,depth:48},{id:'palm-key',name:'Palm Key',x:-185,z:-45,width:52,depth:52},{id:'north-haven',name:'North Haven',x:20,z:185,width:56,depth:48}]};
 const objects=[],locations=[];
 const add=(id,modelId,x,y,z,extra={})=>{const item={id:'public-experience-marina-'+id,modelId,placementAnchor:'collider-base',name:extra.name||id.replaceAll('-',' '),position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:true,health:100},...extra};objects.push(item);return item;};
 const tile=(id,x,z,scale=[1,1,1],y=0)=>add(id,'material:floor',x,y,z,{scale:{x:scale[0],y:scale[1],z:scale[2]}});
 const guide=(id,title,x,z,text)=>add(id,'street-sign',x,0,z,{name:title,functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read '+title},dialogueSettings:{text}});
 locations.push({id:'marina',name:'Neon Marina',x:151,z:64,width:66,depth:120,description:'Board a launch or sailboat with E / Use. Steer with movement controls. Use E again to leave the boat; landing piers and steps let you reach each island.'});
 // Main jetty connects the mainland edge to a spine and three finger slips.
 for(let i=0;i<10;i++)tile('main-jetty-'+i,124+i*2.4,30);
 for(let i=0;i<17;i++)tile('marina-spine-'+i,138,10.8+i*2.4);
 for(let slip=0;slip<3;slip++){
  const z=16.8+slip*12;
  for(let i=0;i<5;i++)tile('finger-'+slip+'-'+i,138+i*2.4,z);
  const boat=add('boat-'+slip,slip===1?'harbor-sailboat':'harbor-skiff',144,0,z+3.8,{placementAnchor:'waterline',name:['Neon Launch','Sea Glass Sailboat','Island Shuttle'][slip],functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:5,prompt:'Board boat · E / Use',destructible:true,health:200}});
  boat.rotation.y=-Math.PI/2;
 }
 // Separate superyacht pier leaves a full turning basin south of the island channel.
 for(let i=0;i<10;i++)tile('superyacht-pier-'+i,124+i*2.4,116);
 add('superyacht','harbor-yacht',141,0,99,{placementAnchor:'waterline',name:'Tideglass Superyacht',functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:24,prompt:'Take superyacht helm · E / Use',destructible:true,health:2000}});
 locations.push({id:'superyacht-berth',name:'Superyacht Berth',x:141,z:116,width:28,depth:6,description:'Tideglass: bedroom, lounge, aft sitting area, billiards table and live pole performance. Board with E / Use and steer into the enlarged harbour.'});
 guide('superyacht-guide','Tideglass Superyacht',127,113,'The superyacht is berthed alongside this pier. Walk up the stern gangway to explore the bedroom, lounge and billiards room. The port stairs lead to the flybridge helm: E / Use to drive. Stop or anchor, then E / Use returns you to the aft deck. At the billiards table choose Play billiards; aim, set power and shoot.');
 add('mainland-water-steps','material:stage-steps',130.8,-.65,28.2);
 guide('departure-guide','Marina Departures',122,26,'Three boats are docked in the slips. E / Use boards or leaves a boat. Steer with WASD, arrows or the left stick. Sail east to Beacon Island, west around the coast to Palm Key, or north to North Haven. Stay clear of docks and the shoreline.');
 for(const island of harbor.islands){
  locations.push({...island,description:'A real land destination with a landing pier, return boat, seating and a local landmark.'});
  const edge=island.x-island.width/2;
  for(let i=0;i<6;i++)tile(island.id+'-landing-'+i,edge-10.8+i*2.4,island.z);
  add(island.id+'-steps','material:stage-steps',edge-7.2,-.65,island.z-1.8);
  add(island.id+'-boat','harbor-skiff',edge-3,0,island.z-4,{placementAnchor:'waterline',name:island.name+' return launch',rotation:{x:0,y:Math.PI/2,z:0},functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:5,prompt:'Board return boat',destructible:true,health:200}});
  for(const side of [-1,1])add(island.id+'-seat-'+side,'material:bench',island.x+side*7,0,island.z+7,{functionalSettings:{behavior:'seat',interactionDistance:3,destructible:true,health:100}});
  for(let i=0;i<5;i++)add(island.id+'-tree-'+i,island.id==='palm-key'?'palm-cluster':'canopy-tree',island.x-14+i*7,0,island.z-15);
  guide(island.id+'-guide',island.name,island.x-4,island.z+9,'Welcome to '+island.name+'. The landing pier and return launch are west of this landmark. Neon Marina is on the east coast of the main island. Open the local map to find the other islands and deed portals.');
 }
 // Walk-in properties use individual Builder pieces throughout their structure.
 const part=(id,material,x,y,z,scale=[1,1,1],rotation=0)=>add(id,'material:'+material,x,y,z,{scale:{x:scale[0],y:scale[1],z:scale[2]},rotation:{x:0,y:rotation,z:0}});
 function property(id,name,x,z,{width=14.4,depth=9.6,height=3,accent='#d8e7df',furnishing='lounge'}={}){
  const front=x+width/2,base=.2;
  locations.push({id,name,x,z,width,depth,arrival:{x:front+2,y:0,z},description:'Walk-in '+name+'. A furnished interior and sheltered terrace, built from individually destructible Builder pieces.'});
  for(let i=0;i<width/4.8;i++)for(let j=0;j<depth/4.8;j++){
   const px=x-width/2+2.4+i*4.8,pz=z-depth/2+2.4+j*4.8;
   part(id+'-floor-'+i+'-'+j,'baseplate',px,0,pz);
   part(id+'-roof-'+i+'-'+j,'baseplate',px,height+base,pz,[1.06,1,1.06]);
  }
  for(const side of [-1,1])for(let i=0;i<width/4.8;i++)part(id+'-side-'+side+'-'+i,i===1?'glass-wall':'wall',x-width/2+2.4+i*4.8,base,z+side*depth/2,[2,height/2.4,1]);
  for(let i=0;i<depth/4.8;i++)part(id+'-rear-'+i,'wall',x-width/2,base,z-depth/2+2.4+i*4.8,[2,height/2.4,1],Math.PI/2);
  // Keep a 2.4 m open entrance facing the water, with glazed facade wings.
  for(const side of [-1,1]){
   part(id+'-front-glass-'+side,'glass-wall',front,base,z+side*(depth/4+.6),[(depth/2-1.2)/2.4,height/2.4,1],Math.PI/2);
   part(id+'-portal-post-'+side,'round-column',front+.12,base,z+side*1.32,[.36,height/2.4,.36]);
   part(id+'-porch-'+side,'floor',front+1.2,0,z+side*depth/4,[2,1,depth/4.8]);
   part(id+'-porch-column-'+side,'round-column',front+2.6,base,z+side*(depth/2-.4),[.65,height/2.4,.65]);
  }
  part(id+'-entry-lintel','wood',front,2.65,z,[.25,1.35,4.4]);
  part(id+'-porch-roof','baseplate',front+1.8,height+base,z,[.85,1,depth/4.8]);
  for(const side of [-1,1])part(id+'-fascia-'+side,'wood',x,height+base+.2,z+side*(depth/2+.17),[width/1.2,.4,.3]);
  const seat=(sid,px,pz)=>add(id+'-'+sid,'material:bench',px,base,pz,{functionalSettings:{behavior:'seat',interactionDistance:3,destructible:true,health:100}});
  if(furnishing==='cafe'){
   part(id+'-service-counter','counter',x-3,base,z-2,[1.25,1,1]);add(id+'-cafe-table','dining-set',x+1,base,z+1);seat('terrace-bench',front+1.2,z+3.4);
  }else if(furnishing==='workshop'){
   part(id+'-workbench','counter',x-3,base,z-2,[1.5,1,1]);part(id+'-parts-shelf','shelf',x-width/2+.8,base,z+2,[1,1,1],Math.PI/2);
   for(let i=0;i<2;i++)part(id+'-tools-crate-'+i,'crate',x-2+i*1.4,base,z+2.5);seat('service-bench',x+2,z-2.8);
  }else{
   add(id+'-sofa','sofa',x-2.8,base,z-2.4,{functionalSettings:{behavior:'seat',interactionDistance:3,destructible:true,health:120}});add(id+'-coffee-table','coffee-table',x-2.8,base,z-.7);seat('reading-bench',x-2.8,z+2.6);
  }
  add(id+'-interior-light','floor-lamp',x-width/2+1,base,z-depth/2+1);add(id+'-terrace-planter','material:planter',front+2.2,base,z-depth/2+.4);
  guide(id+'-sign',name,front+1.8,z+depth/2+1.2,'Welcome to '+name+'. Explore the room and covered terrace. The local map connects every waterfront property and available boat.');
  for(const object of objects.filter(object=>object.id.startsWith('public-experience-marina-'+id+'-')))if(object.modelId==='material:baseplate')object.materialSettings={useAccent:true,accent};
 }
 // The coastal promenade connects each mainland property to the launch slips.
 for(let i=0;i<31;i++)part('promenade-'+i,'baseplate',124,0,-74.4+i*4.8);
 for(let i=0;i<8;i++){const z=-66+i*19.2;add('promenade-lamp-'+i,'lamp-post',120,0,z);if(i!==5)part('promenade-seat-'+i,'bench',121,0,z+4);}
 property('yacht-club','Neon Yacht Club',109,65,{accent:'#c7d9db'});
 property('harbormaster','Harbormaster and Repair Yard',109,-13,{furnishing:'workshop',accent:'#6f9ba4'});
 property('waterfront-cafe','Tideglass Waterfront Cafe',109,-63,{furnishing:'cafe',accent:'#e5d6b8'});
 property('beacon-lodge','Beacon Island Lodge',185,24,{width:9.6,depth:9.6,accent:'#e0e5df'});
 property('palm-retreat','Palm Key Retreat',-185,-45,{width:9.6,depth:9.6,accent:'#ccdfbc'});
 property('north-haven-house','North Haven Boathouse',20,185,{width:9.6,depth:9.6,furnishing:'workshop',accent:'#7dabad'});
 // A modular navigation light stands inland of the landing and return launch.
 for(let i=0;i<4;i++)part('beacon-tower-ring-'+i,'round-column',197,i*2.4,34,[4,1,4]);
 part('beacon-lantern-deck','baseplate',197,9.6,34,[.8,1,.8]);
 for(const x of [-1,1])for(const z of [-1,1])part('beacon-lantern-post-'+x+'-'+z,'pillar',197+x*1.5,9.8,34+z*1.5,[.5,.7,.5]);
 part('beacon-lantern','neon',197,10,34,[1.2,2,1.2]);part('beacon-cap','roof',197,11.6,34,[1.6,.8,1.6]);
 locations.push({id:'beacon-light',name:'Beacon Navigation Light',x:197,z:34,width:5,depth:5,arrival:{x:194,y:0,z:34},description:'A modular coastal navigation light marks the eastern approach.'});
 return {harbor,objects,locations};
}
