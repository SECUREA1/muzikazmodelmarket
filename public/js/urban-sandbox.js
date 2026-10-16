import {INTERACTIVE_DEVICES} from './interactive-devices.js';
export const URBAN_LAYOUTS={
 'urban-media-lounge':{name:'Media & Arcade Commons',icon:'♫',description:'A public media lounge with fifteen interactive terminals, shared video, music, shopping and arcade games.',color:0x283747,sky:0x11152d},
 'urban-downtown':{name:'Downtown Sandbox',icon:'▥',description:'An urban driving grid with courier checkpoints, a garage, safehouse and public square.',color:0x343c42,sky:0x151d2e},
 'urban-docklands':{name:'Docklands Run',icon:'▰',description:'Industrial streets, cargo depots and a timed delivery circuit.',color:0x3c4446,sky:0x13262c},
 'urban-nightlife':{name:'Neon Night District',icon:'✦',description:'A nightlife avenue with social venues, creator studios and a street driving challenge.',color:0x303044,sky:0x120e25}
};
export function createUrbanScene(layout,mapSize=80){
 if(!URBAN_LAYOUTS[layout])throw Error('Choose an urban sandbox template.');
 const size=[80,120].includes(Number(mapSize))?Number(mapSize):80,r=size*.3,objects=[];
 const add=(id,modelId,x,z,behavior='decor',extra={})=>objects.push({id:'urban-'+id,modelId,name:id.replaceAll('-',' '),position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{behavior,interactionDistance:4,...extra.functionalSettings},...extra});
 if(layout==='urban-media-lounge'){for(const [index,[id,item]]of Object.entries(INTERACTIVE_DEVICES).entries()){add('device-'+index,id,-14+(index%5)*7,-14+Math.floor(index/5)*9,'interact',{functionalSettings:{behavior:'interact',device:id,interactionDistance:5,prompt:'Use '+item.name}});}add('spawn','hero-spawn',0,15,'talk',{functionalSettings:{behavior:'talk',isPlayerSpawn:true,interactionDistance:3}});return {name:URBAN_LAYOUTS[layout].name,layout,mapSize:size,weather:'clear',streets:[],objects,gameplay:{multiplayer:true,interactiveLounge:true}};}
 const checkpoints=[{x:-r,z:-r,radius:5},{x:r,z:-r,radius:5},{x:r,z:r,radius:5},{x:-r,z:r,radius:5}].map((point,index)=>({...point,objectId:'urban-checkpoint-'+index}));
 const streets=[-r,0,r].flatMap((offset,index)=>[{id:'urban-street-h-'+index,name:['Harbor Road','Creator Avenue','Skyline Drive'][index],from:{x:-size*.45,z:offset},to:{x:size*.45,z:offset},width:7},{id:'urban-street-v-'+index,name:['Market Street','Central Boulevard','Garage Lane'][index],from:{x:offset,z:-size*.45},to:{x:offset,z:size*.45},width:7}]);
 add('spawn','hero-spawn',0,3,'talk',{functionalSettings:{behavior:'talk',isPlayerSpawn:true,interactionDistance:3}});
 add('dispatcher','desert-merchant',5,5,'quest',{functionalSettings:{behavior:'quest',interactionDistance:4,cooldown:1,prompt:'Start the courier driving circuit',urbanMission:{id:layout+'-courier',name:'City courier circuit',checkpoints,timeLimit:120,rewardScore:50,requiresVehicle:true}}});
 add('garage-quad','dune-quad',r-7,5,'vehicle',{vehicleSettings:{mode:'drive',speed:12,turnSpeed:1.75}});
 add('garage','drive-in-garage',r-11,14);add('garage-sign','street-sign',r-6,10,'talk',{dialogueSettings:{text:'Press F near the quad to drive. Start the circuit at the dispatcher, then drive through the four numbered pads in order. Press E to leave the vehicle.'}});
 add('safehouse','estate-house',-r+11,14);add('safehouse-seat','sofa',-r+9,12,'seat');add('safehouse-medkit','healing-potion',-r+6,8,'heal',{functionalSettings:{behavior:'heal',interactionDistance:3,cooldown:15,value:25,prompt:'Use the safehouse recovery kit'}});
 add('safehouse-door','glass-door',-r+9,8,'door');add('garage-switch','lever-switch',r-7,11,'switch');
 for(const [index,point] of checkpoints.entries())add('checkpoint-'+index,'teleport-pad',point.x,point.z,'talk',{dialogueSettings:{text:'Courier checkpoint '+(index+1)+'. Drive through while your circuit is active.'},metadata:{urbanCheckpoint:index+1}});
 add('office','open-office',-r+11,-r+11);
 add('yard','estate-yard',r-12,-r+13);
 add('neighborhood-job','scout-avatar',-7,5,'quest',{functionalSettings:{behavior:'quest',interactionDistance:4,cooldown:1,prompt:'Neighborhood supply job',quest:{id:layout+'-supplies',title:'Neighborhood supplies',requiredItems:['supply-crate','treasure-crystal'],rewardScore:35}}});
 add('job-crystal','treasure-crystal',r-11,-r+13,'pickup');
 for(let x=-1;x<=1;x+=2)for(let z=-1;z<=1;z+=2){add('lamp-'+x+'-'+z,'lamp-post',x*(r-5),z*(r-5));}
 add('plaza-table','coffee-table',8,-10);add('plaza-seat-a','pillow-ring',5,-10,'seat');add('plaza-seat-b','pillow-ring',11,-10,'seat');
 add('venue',layout==='urban-nightlife'?'studio-desk':'market-stall',-8,-10,'talk',{dialogueSettings:{text:'Welcome to '+URBAN_LAYOUTS[layout].name+'. Explore the blocks, use the garage and safehouse, or start a timed courier run.'}});
 add('venue-art','art-wall',-8,-13);add('supply','supply-crate',-12,-10,'pickup');
 return {name:URBAN_LAYOUTS[layout].name,layout,mapSize:size,weather:layout==='urban-nightlife'?'rain':'clear',streets,objects,gameplay:{multiplayer:true,urbanSandbox:true}};
}
