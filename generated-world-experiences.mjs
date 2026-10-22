import {neonMarina} from './neon-marina.mjs';
import {districtNeighborhood} from './district-neighborhoods.mjs';
import {commonsNeighborhood} from './commons-neighborhood.mjs';
import {furnishBuildings} from './public/js/building-furnishing.js';
// Shared scene data uses the same models and interaction rules as authored maps.
export const GENERATED_EXPERIENCE_VERSION=9;
const themes={
 'studio-ridge':{name:'Creator courtyard',landmark:'recording-booth',guide:'forest-ranger',prop:'studio-desk',color:'#af8cff'},
 'volt-city':{name:'Neon makers plaza',landmark:'sci-fi-bunker',guide:'clockwork-knight',prop:'lever-switch',color:'#ffd45c'},
 'skyline-deck':{name:'Skyline lounge',landmark:'art-wall',guide:'spectral-ghost',prop:'planter',color:'#68dbff'},
 'echo-gardens':{name:'Listening garden',landmark:'ancient-oak',guide:'forest-ranger',prop:'giant-mushrooms',color:'#7bea99'},
 'crew-plaza':{name:'Crew social club',landmark:'market-stall',guide:'desert-merchant',prop:'dining-set',color:'#ff8dbb'},
 'neon-docks':{name:'Dockside trading yard',landmark:'wooden-cart',guide:'desert-merchant',prop:'supply-crate',color:'#52e0da'},
 'bassline-badlands':{name:'Desert discovery camp',landmark:'windmill',guide:'desert-merchant',prop:'desert-cactus',color:'#ff9e64'},
 'pixel-peaks':{name:'Summit rest stop',landmark:'stone-tower',guide:'forest-ranger',prop:'garden-rocks',color:'#acb7ff'}
};
export function generatedExperience(environment){
 const theme=themes[environment.atlasDistrict?.id]||{name:'Commons welcome park',landmark:'art-wall',guide:'forest-ranger',prop:'planter',color:'#caff69'};
 const objects=[];
 const add=(id,modelId,x,z,behavior='decor',extra={})=>{const item={id:'public-experience-'+id,modelId,name:extra.name||id.replaceAll('-',' '),position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},materialSettings:{useAccent:true,accent:theme.color},functionalSettings:{behavior,interactionDistance:3,cooldown:.5,...extra.functionalSettings},...extra};objects.push(item);return item;};
 const text=`Welcome to ${environment.name}. Sit in the lounge, try the studio, collect a discovery crystal, or use the garden pads. The surrounding portal buildings open districts and saved creator worlds.`;
 add('welcome','street-sign',-4,8,'talk',{dialogueSettings:{text},functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Read the park guide'}});
 add('host',theme.guide,10,10,'talk',{dialogueSettings:{text:`${theme.name}: ${text}`},functionalSettings:{behavior:'talk',interactionDistance:4,prompt:'Talk to your local guide'}});
 add('lounge-sofa','sofa',-14,22,'seat');add('lounge-chair-a','armchair',-18,19,'seat');add('lounge-chair-b','armchair',-10,19,'seat');add('lounge-table','coffee-table',-14,19);
 add('studio','studio-desk',14,22,'talk',{dialogueSettings:{text:'The creator corner is a meeting space. Open the Environment Builder to make and publish your own playable map.'}});
 add('studio-seat','pillow-ring',14,24,'seat');add('gallery','art-wall',14,27);add('studio-light','floor-lamp',17,25);
 for(const [id,x,z]of [['market-atm',-20,10],['shared-video-player',-14,28],['media-boombox',-20,22],['arcade-slot-machine',22,22],['video-poker-table',22,28]])add(id,id,x,z,'interact',{functionalSettings:{behavior:'interact',device:id,interactionDistance:5,prompt:'Use '+id.replaceAll('-',' ')}});
 // Dedicated walk-in service and game rooms keep interactive devices accessible.
 add('market-hall','general-store',-18,72);
 add('arcade-hall','neighborhood-center',18,72);
 objects.push(...furnishBuildings({objects}));
 add('landmark',theme.landmark,-12,48);add('theme-prop',theme.prop,-20,48);
 add('discovery-crystal','treasure-crystal',15,48,'pickup');add('restoration','healing-potion',20,48,'heal',{functionalSettings:{behavior:'heal',interactionDistance:3,cooldown:10,value:25,prompt:'Restore health'}});
 add('exploration-journal','quest-scroll',-10,10,'quest',{questSettings:{id:environment.id+'-discovery',name:'Discover '+theme.name},dialogueSettings:{text:'Start your discovery journal. Explore the gathering area, garden and district portals; return here to mark your visit complete.'}});
 add('garden-switch','lever-switch',12,48,'switch',{functionalSettings:{behavior:'switch',interactionDistance:3,cooldown:.5,prompt:'Toggle the garden beacon'}});
 for(const [id,x,z,target]of [['garden-pad',8,14,'return-pad'],['return-pad',8,48,'garden-pad']])add(id,'teleport-pad',x,z,'interact',{functionalSettings:{behavior:'interact',action:'teleport',interactionDistance:3,cooldown:1,prompt:id==='garden-pad'?'Visit the discovery garden':'Return to the welcome plaza',portal:{enabled:true,destinationType:'object',targetObjectId:'public-experience-'+target}}});
 for(let i=0;i<6;i++)add('garden-path-'+i,'path-tile',8,20+i*4);
 add('garden-bed-a','flower-bed',3,46);add('garden-bed-b','flower-bed',25,46);
 const neighborhood=environment.id==='public-commons'?commonsNeighborhood():districtNeighborhood(environment);if(neighborhood)objects.push(...neighborhood.objects);
 const marina=environment.atlasDistrict?.id==='neon-docks'&&!environment.atlasDistrict.page?neonMarina():null;if(marina){objects.push(...marina.objects);neighborhood.locations.push(...marina.locations);}
 const accent=parseInt(theme.color.slice(1),16),color=(((accent>>16&255)*.18+30)|0)<<16|(((accent>>8&255)*.18+48)|0)<<8|(((accent&255)*.18+32)|0);
 return {objects,layoutMeta:{color,sky:0x17252d,...(marina?{harbor:marina.harbor}:{}),...(neighborhood?{locations:neighborhood.locations,...(environment.id==='public-commons'?{commonsLocations:neighborhood.locations,color:0x637e4d,cleanGround:true}:{})}:{})},name:theme.name,description:`${theme.name} · lounge seating, a creator corner, a local guide, discovery items, health restoration, shared media, shopping, arcade games and linked garden pads.${environment.id==='public-commons'?' Explore the brick-built Makers Workshop, Commons Cafe, Discovery Library, Community Hall, Performance Garden and Builder Exchange, then follow paved paths to the Woodland Reading Garden, Water Garden and shaded Makers Picnic Terrace.':neighborhood?' Explore '+neighborhood.title+' and its live district deed directory.':''}`};
}
