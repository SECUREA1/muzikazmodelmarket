export function neonMarina(){
 const harbor={extent:256,islands:[{id:'beacon-island',name:'Beacon Island',x:185,z:24,width:48,depth:48},{id:'palm-key',name:'Palm Key',x:-185,z:-45,width:52,depth:52},{id:'north-haven',name:'North Haven',x:20,z:185,width:56,depth:48}]};
 const objects=[],locations=[];
 const add=(id,modelId,x,y,z,extra={})=>{const item={id:'public-experience-marina-'+id,modelId,placementAnchor:'collider-base',name:extra.name||id.replaceAll('-',' '),position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:true,health:100},...extra};objects.push(item);return item;};
 const tile=(id,x,z,scale=[1,1,1],y=0)=>add(id,'material:floor',x,y,z,{scale:{x:scale[0],y:scale[1],z:scale[2]}});
 const guide=(id,title,x,z,text)=>add(id,'street-sign',x,0,z,{name:title,functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read '+title},dialogueSettings:{text}});
 locations.push({id:'marina',name:'Neon Marina',x:132,z:30,width:28,depth:48,description:'Board a launch or sailboat with E / Use. Steer with movement controls. Use E again to leave the boat; landing piers and steps let you reach each island.'});
 // Main jetty connects the mainland edge to a spine and three finger slips.
 for(let i=0;i<10;i++)tile('main-jetty-'+i,124+i*2.4,30);
 for(let i=0;i<17;i++)tile('marina-spine-'+i,138,10.8+i*2.4);
 for(let slip=0;slip<3;slip++){
  const z=16.8+slip*12;
  for(let i=0;i<5;i++)tile('finger-'+slip+'-'+i,138+i*2.4,z);
  const boat=add('boat-'+slip,slip===1?'harbor-sailboat':'harbor-skiff',144,0,z+3.8,{placementAnchor:'waterline',name:['Neon Launch','Sea Glass Sailboat','Island Shuttle'][slip],functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:5,prompt:'Board boat · E / Use',destructible:true,health:200}});
  boat.rotation.y=Math.PI/2;
 }
 add('mainland-water-steps','material:stage-steps',130.8,-.65,28.2);
 guide('departure-guide','Marina Departures',122,26,'Three boats are docked in the slips. E / Use boards or leaves a boat. Steer with WASD, arrows or the left stick. Sail east to Beacon Island, west around the coast to Palm Key, or north to North Haven. Stay clear of docks and the shoreline.');
 for(const island of harbor.islands){
  locations.push({...island,description:'A real land destination with a landing pier, return boat, seating and a local landmark.'});
  const edge=island.x-island.width/2;
  for(let i=0;i<6;i++)tile(island.id+'-landing-'+i,edge-10.8+i*2.4,island.z);
  add(island.id+'-steps','material:stage-steps',edge-7.2,-.65,island.z-1.8);
  add(island.id+'-boat','harbor-skiff',edge-3,0,island.z-4,{placementAnchor:'waterline',functionalSettings:{behavior:'vehicle',interactionKey:'e',interactionDistance:5,prompt:'Board return boat',destructible:true,health:200}});
  add(island.id+'-landmark',island.id==='beacon-island'?'stone-tower':island.id==='palm-key'?'camp-cabin':'market-stall',island.x,0,island.z);
  for(const side of [-1,1])add(island.id+'-seat-'+side,'material:bench',island.x+side*7,0,island.z+7,{functionalSettings:{behavior:'seat',interactionDistance:3,destructible:true,health:100}});
  for(let i=0;i<5;i++)add(island.id+'-tree-'+i,island.id==='palm-key'?'palm-cluster':'canopy-tree',island.x-14+i*7,0,island.z-15);
  guide(island.id+'-guide',island.name,island.x-4,island.z+9,'Welcome to '+island.name+'. The landing pier and return launch are west of this landmark. Neon Marina is on the east coast of the main island. Open the local map to find the other islands and deed portals.');
 }
 return {harbor,objects,locations};
}
