// Authored from the same material and prop IDs available in the Builder catalog.
export function commonsNeighborhood(){
 const objects=[],locations=[];
 function add(id,modelId,x,y,z,extra={}){
  const item={id:'public-experience-commons-'+id,modelId,placementAnchor:'collider-base',name:extra.name||id.replaceAll('-',' '),position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:true,health:100},...extra};objects.push(item);return item;
 }
 const piece=(id,material,x,y,z,scale=[1,1,1],rotation=0)=>add(id,'material:'+material,x,y,z,{scale:{x:scale[0],y:scale[1],z:scale[2]},rotation:{x:0,y:rotation,z:0}});
 function sign(id,name,x,z,text){add(id,'street-sign',x,0,z,{name,functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read '+name},dialogueSettings:{text}});}
 function building(id,name,x,z,material,props){
  locations.push({id,name,x,z,width:8,depth:8});
  // Foundation and roof are separate walkable slabs; the front entrance is 2.4m wide.
  for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++){
   piece(id+'-floor-'+ix+'-'+iz,'floor',x+ix*2.4,0,z+iz*2.4);
   piece(id+'-roof-'+ix+'-'+iz,'floor',x+ix*2.4,2.6,z+iz*2.4);
  }
  for(let row=0;row<6;row++)for(let span=-1;span<=1;span++){
   const y=.2+row*.4;
   piece(id+'-back-'+row+'-'+span,material,x+span*2.4,y,z-3.6,[2,1,1]);
   if(span!==0||row===5)piece(id+'-front-'+row+'-'+span,material,x+span*2.4,y,z+3.6,[2,1,1]);
   for(const side of [-1,1])if(span!==0||row<2||row>4)piece(id+'-side-'+side+'-'+row+'-'+span,material,x+side*3.6,y,z+span*2.4,[2,1,1],Math.PI/2);
  }
  for(const side of [-1,1])piece(id+'-window-'+side,'glass-wall',x+side*3.6,1,z,[1,.5,1],Math.PI/2);
  piece(id+'-entry-step','floor',x,0,z+4.8);
  sign(id+'-sign',name,x-5,z+5.4,name+'. Walk through the open doorway. Walls, floors and roof are individual Builder pieces and can be destroyed.');
  for(const [index,[modelId,dx,dz,behavior='decor']]of props.entries())add(id+'-furniture-'+index,modelId,x+dx,.2,z+dz,{functionalSettings:{behavior,destructible:true,health:100,interactionDistance:3}});
 }
 building('workshop','Makers Workshop',-36,-18,'brick',[['studio-desk',0,-1],['supply-crate',-2,-2],['armchair',2,1,'seat']]);
 building('cafe','Commons Cafe',36,-18,'wood',[['dining-set',0,0],['sofa',-2,-2,'seat'],['floor-lamp',2,-2]]);
 building('library','Discovery Library',-36,18,'cement',[['studio-desk',0,-1],['armchair',-2,1,'seat'],['armchair',2,1,'seat']]);
 building('hall','Community Hall',36,18,'brick',[['sofa',0,-2,'seat'],['coffee-table',0,0],['armchair',-2,1,'seat']]);
 // Paths connect each open doorway to the central north/south promenade without blocking streets.
 for(const side of [-1,1])for(const row of [-1,1]){
  const z=row*18+7.2;
  for(let i=0;i<11;i++)piece('walk-'+side+'-'+row+'-'+i,'paving-tile',side*(4.8+i*2.4),0,z,[2,1,2]);
  for(let i=0;i<3;i++)piece('entry-walk-'+side+'-'+row+'-'+i,'paving-tile',side*(28.8+i*2.4),0,z,[2,1,2]);
 }
 locations.push({id:'stage',name:'Open-air Performance Garden',x:-84,z:12,width:16,depth:16});
 for(let i=0;i<3;i++)piece('stage-deck-'+i,'stage-platform',-88.8+i*4.8,0,12);
 piece('stage-steps','stage-steps',-84,0,14.4);
 for(const x of [-89,-79])for(const z of [20,24])add('audience-'+x+'-'+z,'material:bench',x,0,z,{functionalSettings:{behavior:'seat',destructible:true,health:100,interactionDistance:3}});
 sign('performance-guide','Performance Garden',-92,17,'A brick-built stage with walkable steps and audience seating. Meet friends, perform, or rebuild the stage.');
 locations.push({id:'market',name:'Builder Exchange Yard',x:84,z:12,width:18,depth:18});
 for(let i=0;i<3;i++){
  add('yard-stall-'+i,'market-stall',78+i*6,0,12);
  piece('yard-display-'+i,'display-plinth',78+i*6,0,18);
  piece('yard-sample-'+i,['cube','wedge','round-column'][i],78+i*6,.6,18);
 }
 sign('exchange-guide','Builder Exchange',76,24,'Try the material displays. Open the Marketplace from your Tools pouch to unlock items, then build with your own materials.');
 for(const x of [-48,48,-96,96])for(const z of [-20,24]){
  add('lamp-'+x+'-'+z,'lamp-post',x,0,z);
  add('garden-'+x+'-'+z,'flower-bed',x+3,0,z);
 }
 return {objects,locations};
}
