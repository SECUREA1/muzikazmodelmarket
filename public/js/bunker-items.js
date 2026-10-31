// Renderer-free native identities shared by the market, Backpack and Builder.
const definitions=[
 ['bunker-floor','Vaultline Reinforced Floor','A four metre reinforced floor tile with recessed cable channels and inset tread plates.',[4,.2,4],'decor',120],
 ['bunker-wall','Vaultline Armoured Wall','A four metre concrete and steel wall with exposed conduit and cyan emergency wayfinding.',[4,4,.35],'decor',150],
 ['bunker-ceiling','Vaultline Utility Ceiling','A four metre overhead panel with recessed strip lighting and protected service ducts.',[4,.25,4],'decor',120],
 ['bunker-blast-door','Vaultline Blast Door','A reinforced access door with locking dogs, hazard trim and a sealed inset control.',[3.8,3.8,.7],'door',280],
 ['bunker-terminal','Ghostline Hacker Terminal','A triple display command console with physical keys, patch ports and mission guidance.',[2.2,1.8,1.1],'talk',320],
 ['bunker-server-rack','Ghostline Server Rack','A ventilated data cabinet with removable compute trays, patch leads and live status lamps.',[1.3,2.5,1.05],'talk',260],
 ['bunker-power-core','Vaultline Power Core','A shielded turbine core with segmented coils, pressure gauges and a shared power switch.',[2.8,3.1,2.8],'switch',420],
 ['bunker-signal-relay','Ghostline Signal Relay','A secure communications pedestal with concentric aerial loops and a working switch.',[1.5,2.8,1.3],'switch',240],
 ['bunker-med-station','Vaultline Recovery Station','A wall recovery unit with oxygen cylinders, diagnostic display and reusable healing supplies.',[1.6,1.9,.65],'heal',200],
 ['bunker-supply-cache','Vaultline Supply Cache','A portable armoured supply case with a sealed manifest and reinforced carry handles.',[1.3,.9,.9],'pickup',160],
 ['bunker-bunk','Vaultline Crew Bunk','A twin-level steel sleeping pod with woven bedding, storage drawers and a seated rest point.',[2.2,2.2,1],'seat',180],
 ['bunker-workbench','Ghostline Fabrication Bench','An electronics workbench with component bins, soldering tools and blueprint guidance.',[2.4,1.7,1.1],'talk',240],
 ['bunker-hydroponics','Vaultline Hydroponic Garden','A self-contained underground food rack with grow trays, irrigation pipes and amber grow lamps.',[2.4,1.8,1.1],'talk',220],
 ['bunker-vent','Vaultline Air Scrubber','A filtered ventilation unit with a rotating guarded impeller and air-quality indicator.',[2,1.1,1.1],'talk',160],
 ['bunker-hacker','Cipher · Bunker Hacker','A reusable hooded bunker specialist with a luminous visor, field terminal and configurable dialogue.',[.78,1.85,.58],'talk',300],
 ['bunker-engineer','Patch · Bunker Engineer','A reusable underground engineer with respirator, utility vest, tools and configurable dialogue.',[.78,1.85,.58],'talk',300],
 ['bunker-access-stairs','Vaultline Protected Descent','A thirty-two metre protected descent with a continuous walkable ramp, tread markings, reinforced sidewalls and overhead service ribs. It descends twelve metres from its upper entrance.',[6.6,16.3,33.4],'decor',850],
 ['bunker-alert-console','Ghostline Emergency Command Console','An emergency command desk with a tactical threat screen, crew-response controls, physical acknowledgement keys and live alert lamps.',[2.7,2.12,1.35],'talk',480],
 ['bunker-alarm-beacon','Vaultline Civil Defence Alarm','A wall-independent alarm column with twin siren horns, protected signal dome and status lamps that follow the active bunker alert.',[1.67,3.3,.8],'decor',260],
 ['bunker-filtration-unit','Vaultline Sealed Air Filtration Unit','A powered life-support cabinet with twin filter canisters, guarded impeller, pressure display and a shared on/off control.',[2.61,2.8,1.57],'switch',450],
 ['bunker-blast-shutter','Vaultline Heavy Blast Shutter','A six metre reinforced entrance shutter with sealing dogs, pressure gasket and visible closure indicators.',[6.6,4.2,1.05],'door',650],
 ['bunker-radiation-monitor','Ghostline Fallout Monitor','A fixed contamination-monitoring pedestal with live alert indicators, sensor head and an accessible crew briefing display.',[1.5,2.2,.9],'talk',280],
 ['bunker-emergency-locker','Vaultline Emergency Equipment Locker','A reinforced response locker with medical packs, respirators, water canisters, marked inventory shelves and crew inspection guidance.',[2.1,2.6,.9],'talk',340],
 ['bunker-water-reserve','Vaultline Drinking Water Reserve','A sealed twin-tank water supply with isolation valves, pressure gauges and a protected crew ration manifold.',[2.5,2.6,1.4],'talk',300]
];
const systemRoles=Object.freeze({'bunker-alert-console':'alerts','bunker-alarm-beacon':'alarm','bunker-filtration-unit':'filtration','bunker-blast-shutter':'blast-door','bunker-radiation-monitor':'radiation','bunker-emergency-locker':'supplies','bunker-water-reserve':'water'});
const guidance={
 'bunker-alert-console':'Emergency command: read the active airstrike or nuclear warning, check the shelter status and follow the response assignments. Crew members move to their emergency stations when alarms sound.',
 'bunker-radiation-monitor':'Fallout monitor: review the active warning and remain below ground during impacts. Powered filtration and a closed entrance shutter support the sealed shelter. Follow the active recovery objective before returning to the surface.',
 'bunker-emergency-locker':'Emergency inventory: inspect medical packs, respirators and sealed supplies. Follow your active response assignment; crew work does not claim your quest rewards.',
 'bunker-water-reserve':'Crew water reserve: inspect the sealed tanks, isolation valves and ration manifold during the emergency continuity round.',
 'bunker-terminal':'Ghostline console: inspect the campaign board, then restore power, reconnect the relay and check the archive.',
 'bunker-server-rack':'Archive integrity is stable. Check the numbered compute trays and follow the campaign objectives before reporting to Cipher.',
 'bunker-workbench':'Inspect the component trays and repair briefing. Purchased native items are placed from your Backpack; world fixtures stay in the bunker.',
 'bunker-hydroponics':'The bunker survives on closed-loop water, fresh greens and careful maintenance. Inspect the irrigation manifold and air scrubber on your service round.',
 'bunker-vent':'Air scrubber inspection: the guarded impeller circulates filtered air through the crew quarters. Keep its access lane clear.',
 'bunker-hacker':'Cipher: Welcome below the city. Take a campaign assignment from the quest board and follow its marked objectives. We keep the archive, the crew and the signal alive.',
 'bunker-engineer':'Patch: Power, air, water, then data. Use the marked equipment during your assignment and come back to the crew hub when the round is complete.'
};
export const BUNKER_MODEL_INFO=Object.freeze(Object.fromEntries(definitions.map(([id,name,description,dimensions])=>[id,[name,description,dimensions]])));
export function bunkerItemSettings(id){
 const definition=definitions.find(item=>item[0]===id);if(!definition)return null;
 const behavior=definition[4];
 return {behavior,...(systemRoles[id]?{bunkerSystem:systemRoles[id]}:{}),action:'none',damage:0,destructible:false,interactionDistance:3.5,cooldown:behavior==='heal'?20:0,
  prompt:behavior==='door'?'Open / close blast door':behavior==='heal'?'Use recovery supplies':behavior==='switch'?'Toggle '+definition[1]:behavior==='pickup'?'Carry supply cache':behavior==='seat'?'Rest on crew bunk':'Inspect '+definition[1],
  ...(behavior==='heal'?{value:35}:{}),...(behavior==='seat'?{seatOffset:[0,.58,-.1],exitOffset:[0,0,-1.3]}:{}),
  ...(guidance[id]?{dialogue:{text:guidance[id]}}:{})};
}
export const BUNKER_ITEMS=Object.freeze(definitions.map(([id,name,description,dimensions,behavior,priceMzk])=>Object.freeze({
 id,buildAssetId:id,name,description,dimensions,behavior,priceMzk,type:['bunker-hacker','bunker-engineer'].includes(id)?'avatar':['bunker-floor','bunker-wall','bunker-ceiling','bunker-access-stairs'].includes(id)?'landscape':'interior',category:['bunker-hacker','bunker-engineer'].includes(id)?'characters':'bunker',color: id==='bunker-engineer'?'#f5b84a':'#60e5ca',procedural:true,assetKind:'premade',size:84,animation:'bunker-idle',image:'/public/images/bunker/'+id+'.svg',thumbnailUrl:'/public/images/bunker/'+id+'.svg',function_data:bunkerItemSettings(id),...(guidance[id]?{dialogueSettings:{text:guidance[id]}}:{}),
 ...(id==='bunker-hacker'||id==='bunker-engineer'?{targetHeight:1.85}:{}),
})));
