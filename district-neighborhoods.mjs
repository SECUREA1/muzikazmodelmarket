export const DISTRICT_DESIGNS=Object.freeze({
 'studio-ridge':{title:'Studio Ridge Arts Quarter',material:'wood',floor:'paving-tile',places:['Recording Courtyard','Sculpture Walk','Creators Registry'],props:['recording-booth','art-wall','studio-desk'],garden:'planter'},
 'volt-city':{title:'Volt City Powerworks',material:'metal',floor:'floor',places:['Powerworks Gantry','Neon Fabrication Yard','City Registry'],props:['sci-fi-bunker','lever-switch','studio-desk'],garden:'lamp-post'},
 'skyline-deck':{title:'Skyline Observatory Terraces',material:'glass',floor:'floor',places:['Skyline Lookout','Cloud Garden','Terrace Registry'],props:['stone-tower','art-wall','studio-desk'],garden:'planter'},
 'echo-gardens':{title:'Echo Gardens Conservatory',material:'wood',floor:'paving-tile',places:['Listening Pergola','Botanical Walk','Garden Registry'],props:['ancient-oak','giant-mushrooms','bookshelf'],garden:'flower-bed'},
 'crew-plaza':{title:'Crew Plaza Festival Grounds',material:'neon',floor:'dance-floor',places:['Festival Stage','Crew Social Garden','Festival Registry'],props:['stage-platform','media-boombox','community-noticeboard'],garden:'planter'},
 'neon-docks':{title:'Neon Docks Working Harbor',material:'metal',floor:'floor',places:['Cargo Quay','Freight Warehouse','Harbor Deed Registry'],props:['wooden-cart','supply-crate','market-atm'],garden:'lamp-post'},
 'bassline-badlands':{title:'Bassline Frontier Trading Post',material:'brick',floor:'paving-tile',places:['Windmill Depot','Frontier Camp','Land Claims Registry'],props:['windmill','camp-tent','studio-desk'],garden:'desert-cactus'},
 'pixel-peaks':{title:'Pixel Peaks Trailhead',material:'rock',floor:'floor',places:['Summit Shelter','Crystal Grove','Trail and Deed Registry'],props:['camp-cabin','giant-mushrooms','bookshelf'],garden:'garden-rocks'}
});
export function districtNeighborhood(environment){
 const region=environment.atlasDistrict?.id,design=DISTRICT_DESIGNS[region];if(!design)return null;
 const objects=[],locations=[],page=environment.atlasDistrict.page||0;
 const add=(id,modelId,x,y,z,extra={})=>{const item={id:'public-experience-district-'+region+'-'+id,modelId,placementAnchor:'collider-base',name:extra.name||id.replaceAll('-',' '),position:{x,y,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor',destructible:true,health:100},...extra};objects.push(item);return item;};
 const material=(id,type,x,y,z,scale=[1,1,1],yaw=0)=>add(id,'material:'+type,x,y,z,{scale:{x:scale[0],y:scale[1],z:scale[2]},rotation:{x:0,y:yaw,z:0}});
 const prop=(id,type,x,y,z,behavior='decor',extra={})=>add(id,type==='stage-platform'?'material:stage-platform':type,x,y,z,{functionalSettings:{behavior,destructible:true,health:100,interactionDistance:4,...extra}});
 function guide(id,title,x,z,text){add(id,'street-sign',x,0,z,{name:title,functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read '+title},dialogueSettings:{text}});}
 const sites=page?[[36,18,2]]:[[-42,-16,0],[42,-16,1],[-42,18,2]];
 for(const [x,z,index]of sites){
  const title=design.places[index]+(page?' · Block '+(page+1):'');locations.push({id:region+'-'+index,name:title,x,z,width:10,depth:10,description:index===2?'Open the district map for current deed owners and routes.':'Builder-built '+design.title+' landmark. Walk in, explore, and rebuild its destructible components.'});
  for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++)material('site-'+index+'-deck-'+ix+'-'+iz,design.floor,x+ix*2.4,0,z+iz*2.4,design.floor==='paving-tile'?[2,1,2]:[1,1,1]);
  for(const dx of [-3.6,3.6])for(const dz of [-3.6,3.6])material('site-'+index+'-post-'+dx+'-'+dz,'round-column',x+dx,.2,z+dz);
  // Open front and sides preserve clear walking routes and readable entrances.
  for(let span=-1;span<=1;span++){
   material('site-'+index+'-rear-'+span,design.material,x+span*2.4,.2,z-3.6,[2,6,1]);
   if(!['stone-tower','ancient-oak','windmill','camp-cabin','sci-fi-bunker','giant-mushrooms'].includes(design.props[index]))material('site-'+index+'-roof-'+span,'floor',x+span*2.4,2.6,z,[1,1,3]);
  }
  prop('site-'+index+'-feature',design.props[index],x,.2,z-1);
  if(index===2)prop('registry-terminal','market-atm',x+2,.2,z,'interact',{device:'market-atm',prompt:'Open market services'});
  for(const dx of [-2.4,2.4])prop('site-'+index+'-seat-'+dx,'material:bench',x+dx,.2,z+2,'seat');
  guide('site-'+index+'-guide',title,x-5.5,z+5,'Welcome to '+title+'. '+(index===2?'Use the map SVG at the top left for this district’s recorded deeds, owners, destinations and routes.':'Follow the path to the registry and the surrounding district portals.'));
  for(let n=0;n<12;n++)material('path-'+index+'-'+n,'paving-tile',Math.sign(x)*(4.8+n*2.4),0,z+7.2,[2,1,2]);
  for(const dx of [-7,7])prop('site-'+index+'-garden-'+dx,design.garden,x+dx,0,z+2);
 }
 if(region==='neon-docks'&&!page){
  locations.push({id:'harbor-crane',name:'Cargo Crane and Switchyard',x:80,z:16,width:18,depth:18,description:'A truss-built loading gantry, cargo display and working signal switch.'});
  // Dry wharf construction stays on the solid land mesh; no artificial water collider.
  for(let lane=0;lane<3;lane++)for(let tile=0;tile<9;tile++)material('quay-'+lane+'-'+tile,'floor',72+lane*2.4,0,4+tile*2.4);
  for(const x of [72,79.2])for(let tier=0;tier<3;tier++)material('crane-'+x+'-'+tier,'metal-truss',x,tier*2.4,16);
  for(let i=0;i<3;i++)material('crane-crossbeam-'+i,'support-beam',72+i*3.6,7.2,16);
  for(let x=0;x<3;x++)for(let z=0;z<2;z++)prop('cargo-'+x+'-'+z,'supply-crate',83+x*2.4,0,10+z*3);
  prop('crane-signal','lever-switch',70,0,22,'switch',{prompt:'Toggle loading signal',cooldown:.5});
  // A genuinely enterable warehouse gate follows the existing shared door mechanic.
  for(const side of [-1,1])for(let span=-1;span<=1;span++)material('warehouse-side-'+side+'-'+span,'metal',42+side*3.6,.2,-16+span*2.4,[2,6,1],Math.PI/2);
  for(const side of [-1,1])material('warehouse-front-'+side,'metal',42+side*2.4,.2,-12.4,[2,6,1]);
  prop('warehouse-gate','material:door',42,.2,-12.4,'door',{prompt:'Open / close warehouse gate'});
  guide('harbor-guide','Harbor Operations',70,26,'Cargo arrives at the quay, is sorted in the crane yard and stored in the freight warehouse. Use the loading signal, open the warehouse gate, or visit the Harbor Deed Registry. Each structural piece can be damaged separately.');
 }
 if(region==='crew-plaza'&&!page){for(let i=0;i<4;i++)material('audience-'+i,'tiered-seating',38+(i%2)*4,0,4+Math.floor(i/2)*4);}
 if(region==='echo-gardens'&&!page){for(let i=0;i<12;i++)prop('botanical-bed-'+i,'flower-bed',76+Math.cos(i*Math.PI/6)*8,0,16+Math.sin(i*Math.PI/6)*8);}
 if(region==='bassline-badlands'&&!page){for(let i=0;i<5;i++)prop('frontier-supplies-'+i,'supply-crate',72+i*3,0,16);}
 return {objects,locations,title:design.title};
}
