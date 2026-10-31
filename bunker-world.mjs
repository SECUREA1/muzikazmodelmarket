import {BUNKER_ID,BUNKER_LAYOUT,BUNKER_BOUNDS,BUNKER_LOCATIONS,BUNKER_CREW,BUNKER_FLOOR_Y,BUNKER_SURFACE_ENTRY} from './public/js/bunker-config.js';
import {bunkerItemSettings} from './public/js/bunker-items.js';

function placed(id,modelId,name,x,z,{y=BUNKER_FLOOR_Y,rotation=0,scale={x:1,y:1,z:1},settings={}}={}){
 return {id,modelId,name,asset:{buildAssetId:modelId},position:{x,y,z},rotation:{x:0,y:rotation,z:0},scale,placementAnchor:'collider-base',functionalSettings:{...bunkerItemSettings(modelId),destructible:false,damage:0,...settings}};
}
export function bunkerWorld(){
 const objects=[];
 // Every physical component is an editable native item. The backdrop does not
 // hide a second, uneditable copy of the rooms or their collision surfaces.
 for(let x=-24;x<=24;x+=8)for(let z=-28;z<=28;z+=8){
  objects.push(placed('bunker-floor-'+x+'-'+z,'bunker-floor','Reinforced bunker floor',x,z,{y:BUNKER_FLOOR_Y-.2,scale:{x:2,y:1,z:2}}));
  objects.push(placed('bunker-ceiling-'+x+'-'+z,'bunker-ceiling','Underground service ceiling',x,z,{y:BUNKER_FLOOR_Y+4,scale:{x:2,y:1,z:2}}));
 }
 const wall=(id,x,z,length,rotation=0)=>objects.push(placed('bunker-wall-'+id,'bunker-wall','Reinforced bunker bulkhead',x,z,{rotation,scale:{x:length/4,y:1,z:1}}));
 wall('south-west',-16,32,24);wall('south-east',16,32,24);wall('north',0,-32,56);wall('west',-28,0,64,Math.PI/2);wall('east',28,0,64,Math.PI/2);
 // Six side rooms share a continuous eight-metre central circulation route.
 // Four-metre openings leave space for the animated blast-door frame.
 for(const x of [-4,4]){
  for(const [i,[from,to]]of [[-32,-24],[-20,-2],[2,20],[24,32]].entries())wall('spine-'+x+'-'+i,x,(from+to)/2,to-from,Math.PI/2);
  for(const z of [-22,0,22])objects.push(placed('bunker-door-'+(x<0?'west':'east')+'-'+z,'bunker-blast-door',(x<0?'West':'East')+' room blast door',x,z,{rotation:Math.PI/2,settings:{prompt:'Open / close bunker blast door · E',interactionDistance:4}}));
 }
 for(const x of [-16,16])for(const z of [-12,12])wall('room-'+x+'-'+z,x,z,24);
 const station=(id,modelId,name,x,z,text,extra={})=>objects.push(placed(id,modelId,name,x,z,{rotation:Math.PI,settings:{prompt:name+' · E / Use',interactionDistance:4,dialogue:{text},...extra}}));
 station('bunker-checkin-terminal','bunker-terminal','Descent check-in & campaign briefing',-2.5,18,'NULL SECTOR // CREW CHECK-IN. Open Quests for six operations: power, archive, safe passage, shelter sealing, reserves and secure communications. Open People & favors to meet Nyx, Rook, Patch and Echo. Blast doors open with E / Use.');
 station('bunker-ops-terminal','bunker-terminal','Operations briefing terminal',16,0,'NULL SECTOR // OPERATIONS. Six independent operations cover power, archive recovery, safe passage, shelter sealing, reserves and secure communications. Visit the marked physical equipment in order. Finish each operation to earn world score and record your best time.');
 station('bunker-power-core','bunker-power-core','Contained bunker power core',-17,-25,'POWER // CONTAINED CORE. Toggle the core using E / Use, then continue the recovery operation.',{behavior:'switch'});
 station('bunker-power-relay','bunker-signal-relay','Emergency signal relay',-12,-21,'SIGNAL // RELAY HANDOVER. Toggle the local relay and check the active mission marker.',{behavior:'switch'});
 station('bunker-archive-terminal','bunker-terminal','Server archive integrity terminal',16,-22,'ARCHIVE // INTEGRITY REVIEW. Inspect the rack aisles, read the archive record and continue to the extraction uplink when your quest requests it.');
 station('bunker-fabrication-bench','bunker-workbench','Salvage fabrication workbench',-16,22,'WORKSHOP // SALVAGE REVIEW. This workbench is a mission inspection point. Manufacture catalog items through the connected World Item Factory and the existing MZK supply system.');
 station('bunker-med-station','bunker-med-station','Crew recovery med station',20,24,'MEDICAL // CREW RECOVERY. Use this station to recover health, then continue the active operation.',{behavior:'heal',value:30,cooldown:15});
 station('bunker-extraction-terminal','bunker-terminal','Extraction manifest & uplink',0,-28,'UPLINK // EXTRACTION MANIFEST. Confirm the crew readiness record here when marked by your active quest. The Commons gateway remains available throughout the campaign.');
 for(const x of [10,16,22])for(const z of [-29,-25])objects.push(placed('bunker-rack-'+x+'-'+z,'bunker-server-rack','Encrypted server archive rack',x,z));
 for(const z of [-5,0,5])objects.push(placed('bunker-grow-bed-'+z,'bunker-hydroponics','Life-support hydroponic grow bed',-21,z));
 for(const z of [18,23,28])objects.push(placed('bunker-bunk-'+z,'bunker-bunk','Underground crew bunk',25,z,{rotation:Math.PI/2}));
 for(const [index,[x,z]]of [[-24,27],[-23,19],[-24,-28],[24,15],[-21,7]].entries())objects.push(placed('bunker-salvage-cache-'+index,'bunker-supply-cache','Bunker reserve supply cache',x,z));
 for(const [index,[x,z]]of [[-25,0],[25,0],[-25,-20],[25,20]].entries())objects.push(placed('bunker-vent-'+index,'bunker-vent','Filtered bunker ventilation unit',x,z,{y:BUNKER_FLOOR_Y+2.6,settings:{behavior:'decor'}}));
 const portal=(id,name,x,z,target)=>objects.push(placed(id,'portal-door',name,x,z,{settings:{behavior:'interact',action:'teleport',interactionDistance:5,prompt:name+' · E / Use',portal:{enabled:true,destinationType:'map',targetMapId:target}}}));
 portal('bunker-factory-gate','World Item Factory · production connection',-24,15,'world-item-factory');
 portal('bunker-commons-gate','Return to World Commons',2.5,28.5,'public-commons');
 for(const person of BUNKER_CREW)objects.push(placed(person.id,person.modelId,person.name+' · '+person.role,person.home.x,person.home.z,{rotation:person.heading||0,settings:{behavior:'talk',prompt:'Talk to '+person.name+' · E / Use',dialogue:{text:person.greeting}}}));
 // An exposed surface apron leads into a physical, twelve-metre descent.
 for(const x of [0])for(const z of [68,76])objects.push(placed('bunker-surface-apron-'+x+'-'+z,'bunker-floor','Surface arrival apron',x,z,{y:-.2,scale:{x:4,y:1,z:2}}));
 objects.push(placed('bunker-access-descent','bunker-access-stairs','Armoured underground access descent',0,48,{y:-12.2}));
 objects.push(placed('bunker-ingress-shutter','bunker-blast-shutter','Perimeter blast shutter & airlock',0,31,{scale:{x:8/6.6,y:4/4.2,z:1},settings:{behavior:'door',interactionDistance:4,prompt:'Open / close perimeter blast shutter · E'}}));
 station('bunker-alert-console','bunker-alert-console','Civil-defense alert console',-2.5,26,'NULL SECTOR // ALERT CONTROL. Read the live threat board, acknowledge the alert and follow the marked response operation. Stay below ground during impacts and fallout.');
 station('bunker-filtration-unit','bunker-filtration-unit','Sealed-air filtration bank',-22,-16,'AIR // SEALED FILTRATION. Keep this switch and the power core on, and close the perimeter blast shutter, to maintain filtered shelter air.',{behavior:'switch'});
 station('bunker-radiation-monitor','bunker-radiation-monitor','Radiation and pressure monitor',2.5,23,'EXPOSURE // SHELTER STATUS. The live threat board reports underground cover, blast shutter seal, backup power and filtration. Surface occupants remain exposed during strikes.');
 station('bunker-water-reserve','bunker-water-reserve','Protected potable water reserve',-17,7,'WATER // SEALED RESERVE. Check the protected water storage and distribution valves during crew readiness operations.');
 station('bunker-emergency-locker','bunker-emergency-locker','Sealed emergency response locker',-10,28,'SUPPLIES // RESPONSE STORES. Verify medical and water reserves here during an active response operation.');
 objects.push(placed('bunker-surface-warning-beacon','bunker-alarm-beacon','Surface airstrike & nuclear warning beacon',6,68,{y:0,settings:{behavior:'decor'}}));
 for(const [index,[x,z]]of [[-2.7,28],[2.7,-25],[-18,-18],[18,4],[-16,4],[18,26]].entries())objects.push(placed('bunker-alarm-beacon-'+index,'bunker-alarm-beacon','Underground response alarm beacon',x,z,{y:BUNKER_FLOOR_Y+2.5,settings:{behavior:'decor'}}));
 const shelterPoint={x:0,y:BUNKER_FLOOR_Y+.02,z:26};
 const stations={alert:'bunker-alert-console',filtration:'bunker-filtration-unit',shutter:'bunker-ingress-shutter',monitor:'bunker-radiation-monitor',locker:'bunker-emergency-locker',power:'bunker-power-core',relay:'bunker-power-relay'};
 const bunkerDefense={enabled:true,version:1,structuralVersion:2,undergroundLevel:BUNKER_FLOOR_Y,undergroundBounds:{minX:-27.5,maxX:27.5,minY:-12.6,maxY:-8,minZ:-31.5,maxZ:31.5},surfaceEntry:{...BUNKER_SURFACE_ENTRY},shelter:shelterPoint,stations,sealDoorIds:['bunker-ingress-shutter'],initialSystems:{power:true,filtration:true,relay:true}};
 const defense={...bunkerDefense.undergroundBounds,floorY:BUNKER_FLOOR_Y,ceilingY:-8,surfaceY:0,sealDoorIds:[...bunkerDefense.sealDoorIds],powerId:stations.power,filtrationId:stations.filtration,relayId:stations.relay,alarmConsoleId:stations.alert,medicalId:'bunker-med-station',shelterPoint,archiveId:'bunker-archive-terminal',monitorId:stations.monitor,lockerId:stations.locker};
 const bunker={enabled:true,version:2,crew:BUNKER_CREW,operationIds:['power','archive','evacuation','shelter','reserves','continuity'],defense};
 const doomsday={enabled:true,objectives:[
  {id:'shelter',name:'Null Sector underground shelter',description:'Descend below ground and stay inside the sealed bunker during the warning and impacts.',position:{...shelterPoint},arrivalArea:{minX:-27.5,maxX:27.5,minZ:-31.5,maxZ:31.5}},
  {id:'supplies',name:'Sealed bunker relief supplies',description:'Verify the medical and water reserves in the underground emergency locker.',position:{x:-10,y:BUNKER_FLOOR_Y+.02,z:24}},
  {id:'recovery',name:'Underground emergency relay',description:'Restore communications from the protected engineering room.',position:{x:-8,y:BUNKER_FLOOR_Y+.02,z:-18}}
 ]};
 return {id:BUNKER_ID,name:'Null Sector · Underground Bunker',label:'Twelve metres underground · airstrike & fallout protection · active AI response',description:'Arrive at an exposed surface warning station and descend twelve metres through an armoured access tunnel into Null Sector. Six connected underground rooms, sealed blast shutters, backup power and filtered air support protection from in-game airstrikes, nuclear impacts and fallout. Nyx, Rook, Patch and Echo respond to live alerts and active campaign operations. Inspect hacker consoles, server archives, hydroponics, medical supplies and emergency equipment; follow ordered objectives for world score. Every structural piece and prop uses a reusable native market item with MZK, Builder and Backpack support. The workshop connects to World Item Factory.',category:'Underground campaign & exploration',game:'bunker',mapTheme:'industrial',mapColor:'#69e6cc',indoor:true,outdoor:true,worldId:'volt-city',source:'repository',visibility:'public',permanent:true,publicDestination:true,proceduralLand:true,playable:true,multiplayer:true,sharedWorld:true,canDelete:false,canEdit:false,ownerId:'muzikaz',ownerName:'MUZIKAZ',contentUpdatedAt:'2026-10-31T14:00:00.000Z',scale:1,spaceScale:1,thumbnailUrl:'/public/images/bunker/underground-bunker.svg',spawn:{...BUNKER_SURFACE_ENTRY,rotationY:0},streets:[],bunker,bunkerDefense,doomsday,builderScene:{version:3,layout:BUNKER_LAYOUT,mapSize:BUNKER_BOUNDS.mapSize,objects,streets:[],layoutMeta:{color:0x152b31,bunker,bunkerDefense,doomsday,locations:BUNKER_LOCATIONS,residents:BUNKER_CREW},gameplay:{multiplayer:true,friendlyFire:false,radTox:false,bunker:{enabled:true}}},playUrl:'model-explorer.html?environment='+BUNKER_ID+'&house='+BUNKER_ID+'&mode=multiplayer&autoplay=1'};
}
