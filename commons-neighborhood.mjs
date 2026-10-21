export const COMMONS_NEIGHBORHOOD_VERSION=2;
// Authored from the same material and prop IDs available in the Builder catalog.
export function commonsNeighborhood(){
 const objects=[],locations=[];
 function add(id,modelId,x,y,z,extra={}){
  const item={id:'public-experience-commons-'+id,modelId,placementAnchor:'collider-base',name:extra.name||id.replaceAll('-',' '),position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},...extra,functionalSettings:{behavior:'decor',destructible:true,health:100,...extra.functionalSettings}};objects.push(item);return item;
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
 // Continuous paving meets each landing edge-to-edge; no duplicate end tiles.
 for(const side of [-1,1])for(const row of [-1,1]){
  const z=row*18+7.2;
  for(let i=0;i<11;i++)piece('walk-'+side+'-'+row+'-'+i,'paving-tile',side*(3.6+i*2.4),0,z,[2,1,2]);
  for(let i=0;i<2;i++)piece('entry-walk-'+side+'-'+row+'-'+i,'paving-tile',side*(30+i*2.4),0,z,[2,1,2]);
  piece('entry-walk-'+side+'-'+row+'-2','paving-tile',side*34.2,0,z,[1,1,2]);
  piece('entry-landing-'+side+'-'+row,'paving-tile',side*36,0,z,[2,1,2]);
 }
 locations.push({id:'stage',name:'Open-air Performance Garden',x:-84,z:12,width:16,depth:16});
 for(let i=0;i<3;i++)piece('stage-deck-'+i,'stage-platform',-88.8+i*4.8,0,12);
 piece('stage-steps','stage-steps',-84,.2,14.1,[1,.25,1],Math.PI);
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
 // Finish the original buildings with separate cornice bricks, stone piers,
 // window sills and porch roofs. The open entrances retain their full width.
 const paint=(item,color)=>{item.materialSettings={useAccent:true,accent:color};return item;};
 const chair=(id,x,y,z,rotation=0)=>add(id,'material:bench',x,y,z,{rotation:{x:0,y:rotation,z:0},functionalSettings:{behavior:'seat',interactionDistance:3}});
 function finishBuilding(id,x,z,accent){
  for(const item of objects)if(item.id.startsWith('public-experience-commons-'+id+'-roof-'))paint(item,'#46545e');
  for(const ix of [-1,1])for(const iz of [-1,1])paint(piece(id+'-stone-pier-'+ix+'-'+iz,'limestone',x+ix*3.65,.2,z+iz*3.65,[.22,6,.44]),'#ded1b4');
  for(let span=-1;span<=1;span++)for(const side of [-1,1]){
   paint(piece(id+'-cornice-front-'+side+'-'+span,'slate',x+span*2.4,2.8,z+side*3.6,[2,.5,.5]),accent);
   paint(piece(id+'-cornice-side-'+side+'-'+span,'slate',x+side*3.6,2.8,z+span*2.4,[2,.5,.5],Math.PI/2),accent);
  }
  for(const side of [-1,1])piece(id+'-window-sill-'+side,'limestone',x+side*3.75,.9,z,[2,.25,.5],Math.PI/2);
  paint(piece(id+'-porch-roof','floor',x,2.3,z+4.25,[1.5,.5,.75]),accent);
  add(id+'-front-flowers','flower-bed',x-2.8,0,z+5.25);
  piece(id+'-entry-planter','planter',x+2.8,0,z+5.25);
  chair(id+'-porch-bench',x+5,0,z+2,Math.PI/2);
 }
 finishBuilding('workshop',-36,-18,'#9c684d');
 finishBuilding('cafe',36,-18,'#8c5a38');
 finishBuilding('library',-36,18,'#576c6c');
 finishBuilding('hall',36,18,'#865e49');
 for(const dx of [-1.8,0,1.8])add('library-bookcase-'+dx,'bookshelf',-36+dx,.2,15.1);
 piece('workshop-tool-cabinet','cabinet',-38.8,.2,-17.8,[1,1,1],Math.PI/2);
 piece('workshop-parts-shelf','shelf',-34.1,.2,-20.9);
 piece('cafe-service-counter','counter',38.5,.2,-19.8,[1,1,1],Math.PI/2);
 add('hall-gallery','art-wall',36,.2,14.9);
 add('hall-circle-chair','armchair',38,.2,19,{functionalSettings:{behavior:'seat',interactionDistance:3}});

 // A tiled lane is built from catalog paving pieces, never a hidden support box.
 function lane(id,x1,x2,z,width=2.4){
  const length=Math.abs(x2-x1),count=Math.ceil(length/2.4),step=(x2-x1)/count;
  for(let i=0;i<count;i++)piece(id+'-'+i,'paving-tile',x1+step*(i+.5),0,z,[Math.abs(step)/1.2,1,width/1.2]);
 }
 // Open booths have individual posts, counters and roofs rather than solid huts.
 for(let i=0;i<3;i++){
  const x=78+i*6,stall=objects.find(item=>item.id==='public-experience-commons-yard-stall-'+i);stall.modelId='material:counter';stall.position.z=12.6;
  for(const side of [-1,1])for(const end of [-1,1])piece('yard-post-'+i+'-'+side+'-'+end,'round-column',x+side*1.05,0,12+end*.9,[.3,1,.3]);
  paint(piece('yard-canopy-'+i,'floor',x,2.4,12,[1.2,1,1]),['#a66c43','#59766a','#657a8d'][i]);
  chair('yard-seat-'+i,x,.2,21.6);
 }
 lane('exchange-approach',66.5,75.6,21.6);
 for(let i=0;i<3;i++)piece('exchange-terrace-'+i,'baseplate',78+i*4.8,0,21.6);
 // Stage stairs rise from the 20cm promenade in four 5cm treads to the 40cm deck.
 for(const x of [-88.8,-84,-79.2])for(const z of [19.2,24])piece('audience-paving-'+x+'-'+z,'baseplate',x,0,z);
 for(const item of objects)if(item.modelId==='material:bench'&&item.id.startsWith('public-experience-commons-audience-'))item.position.y=.2;
 for(let i=0;i<3;i++)piece('stage-shade-'+i,'stage-canopy',-88.8+i*4.8,.4,12);
 lane('performance-approach',-66.5,-85.2,16.2);
 const stage=locations.find(item=>item.id==='stage');Object.assign(stage,{z:18,width:18,depth:22});

 // Gardens occupy the clear bands between portal rows; roads and gateway
 // approaches at z34/62/90 and x0/+64/-64 remain open.
 locations.push({id:'woodland',name:'Woodland Reading Garden',x:-84,z:48,width:24,depth:16});
 lane('woodland-approach',-66.5,-80.4,48);
 for(const dx of [-2.4,0,2.4])for(const dz of [-2.4,0,2.4])piece('woodland-square-'+dx+'-'+dz,'paving-tile',-84+dx,0,48+dz,[2,1,2]);
 for(const dx of [-2.4,2.4])for(const dz of [-2.4,2.4])chair('woodland-seat-'+dx+'-'+dz,-84+dx,.2,48+dz,dz<0?Math.PI:0);
 for(const [i,[dx,dz]]of [[-8,-5],[-3,-6],[5,-5],[-8,5],[0,6],[7,5]].entries())add('woodland-tree-'+i,i%3===0?'pine-tree':'canopy-tree',-84+dx,0,48+dz,{scale:{x:.85+i%2*.15,y:.9+i%3*.1,z:.85+i%2*.15}});
 add('woodland-rocks','garden-rocks',-91,0,48);
 piece('woodland-planter-a','planter',-89,.2,44);
 piece('woodland-planter-b','planter',-79,.2,52);
 add('woodland-lamp','lamp-post',-78,0,44);
 sign('woodland-guide','Woodland Reading Garden',-75,44,'A quiet reading clearing. Sit under the trees, follow the paving back to the promenade, or rebuild with the same Builder materials.');

 locations.push({id:'water-garden',name:'Commons Water Garden',x:84,z:48,width:24,depth:16});
 add('water-garden-pond','pond',84,0,48,{scale:{x:2,y:1,z:2}});
 lane('water-garden-approach',66.5,80.4,48);
 for(let i=0;i<3;i++){
  const x=81.6+i*2.4;
  paint(piece('water-garden-bridge-'+i,'wood',x,.2,48,[2,.5,4]), '#b68b5b');
  for(const side of [-1,1])piece('water-garden-rail-'+i+'-'+side,'railing',x,.4,48+side*1.2);
 }
 for(const x of [79.2,81.6,84,86.4,88.8])for(const z of [43.2,52.8])piece('water-garden-rim-'+x+'-'+z,'paving-tile',x,0,z,[2,1,2]);
 for(const x of [79.2,88.8])for(const z of [45.6,48,50.4])if(x!==79.2||z!==48)piece('water-garden-side-'+x+'-'+z,'paving-tile',x,0,z,[2,1,2]);
 for(const [i,[x,z]]of [[76,42],[94,42],[76,54],[94,54]].entries())add('water-garden-tree-'+i,'canopy-tree',x,0,z);
 chair('water-garden-seat-a',84,.2,43.2,Math.PI);
 chair('water-garden-seat-b',84,.2,52.8);
 add('water-garden-stone-a','garden-rocks',90.5,0,45);
 add('water-garden-stone-b','garden-rocks',77,0,51);
 add('water-garden-lamp','lamp-post',91,0,52.8);
 sign('water-garden-guide','Commons Water Garden',74,44,'Blue water, a solid timber bridge and a paved garden loop. The rails, deck and garden furniture are separate Builder items.');

 locations.push({id:'terrace',name:'Makers Picnic Terrace',x:-84,z:-48,width:24,depth:16});
 lane('terrace-approach',-66.5,-79.2,-48);
 for(const x of [-86.4,-81.6])for(const z of [-50.4,-45.6])piece('picnic-paving-'+x+'-'+z,'baseplate',x,0,z);
 for(const [i,x]of [-86.4,-81.6].entries()){
  piece('picnic-table-'+i,'table',x,.2,-48);
  for(const side of [-1,1])chair('picnic-bench-'+i+'-'+side,x,.2,-48+side*1.35,side<0?Math.PI:0);
  piece('picnic-canopy-'+i,'canopy',x,.2,-48,[1.8,1,1.8]);
 }
 for(const [i,x]of [-93,-76].entries())add('terrace-tree-'+i,'canopy-tree',x,0,-53);
 piece('terrace-planter-a','planter',-90,0,-43);
 piece('terrace-planter-b','planter',-78,0,-53);
 add('terrace-lamp','lamp-post',-92,0,-44);
 sign('terrace-guide','Makers Picnic Terrace',-74,-44,'Meet at the shaded picnic tables. Each table, canopy, bench and paving slab can also be selected from Building Materials.');
 // Physical landscape props sit beyond the paths, safely inside the map edge.
 for(const side of [-1,1])for(const [i,z]of [-49,-43,49].entries()){
  add('outer-hill-'+side+'-'+i,'hill',side*115,0,z,{scale:{x:1.5,y:.65+i*.1,z:1.5}});
  add('outer-rock-'+side+'-'+i,'garden-rocks',side*111,0,z+2);
 }
 return {objects,locations};

}
