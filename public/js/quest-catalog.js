import {localMapLocations} from './local-map-locations.js';
export function questCatalog(environment){
 const offers=[];const add=(id,title,kind,mode,description,reward=650)=>offers.push({id,title,kind,mode,description,reward,winBonus:kind==='race'?200:0,timeLimit:600});
 if(environment?.builderScene?.layoutMeta?.harbor){
  add('patrol-raid','Smuggler interdiction','attack','gunboat','Pilot Sentinel 07, disable two armed drug-running launches, secure their cargo and return to dispatch.',1200);
  add('patrol-defense','Relief convoy defense','defense','gunboat','Protect a relief launch from armed smugglers. Request an AI wingmate or share the operation with players.',1400);
  add('patrol-recovery','Patrol rescue operation','recovery','gunboat','Recover a stranded crew from the shipping channel and deliver them safely to the marina.',1000);
  add('patrol-race','Sentinel patrol cup','race','gunboat','Race an AI patrol boat through the ordered channel gates. Shared results record your time.',1100);
  add('dock-delivery','Dock supply delivery','delivery','boat','Stop to pick up cargo, carry it across the channel, then unload at the destination.');
  add('sea-recovery','Mayday recovery','recovery','boat','Find a stranded AI crew, recover their passengers and bring them home.',800);
  add('harbor-escort','Convoy escort','escort','boat','Stay near a moving AI supply launch until its passage is complete.',750);
  add('harbor-defense','Defend the supply convoy','defense','boat','Protect an AI launch. Approach raiders and use Interdict before they damage the convoy.',1000);
  add('harbor-intercept','Coastguard interception','attack','boat','Chase two rogue launches, interdict them at close range, and secure their cargo.',900);
  add('harbor-race','Harbor circuit challenge','race','boat','Reach the start, then race a live AI launch through ordered gates. Compare times with other players.',900);
 }
 if(environment?.airport?.enabled){
  add('air-delivery','Airport cargo shuttle','delivery','aircraft','Collect cargo while parked, fly the departure and destination beacons, land and unload.',750);
  add('air-recovery','Search and recovery flight','recovery','aircraft','Search two airborne beacons to locate a missing crew, then land to transfer rescue coordinates.',850);
  add('air-escort','Civilian escort flight','escort','aircraft','Keep station near an AI civilian aircraft for a full protected passage.',800);
  add('air-defense','Defend the relief flight','defense','armed','Protect a relief aircraft from two armed AI interceptors. Fly a Corsair and use its cannons.',1200);
  add('air-intercept','Interceptor patrol','attack','armed','Intercept two armed AI aircraft using the Corsair cannons, then return safely.',1100);
  add('air-dogfight','AI dogfight competition','dogfight','armed','Fly an airborne Corsair duel against a maneuvering AI pilot that returns fire. Scores are shared.',1400);
  add('air-race','Air gates championship','race','aircraft','Reach the airborne start gate and race an AI aircraft’s rolling lap through the circuit. Shared standings rank finish times.',1000);
 }
 if(environment?.game==='ski')add('ski-finish','Pixel Peaks race contract','ski','foot','During a live ski race, finish a run with at least 500 race points.',550);
 if(environment?.game==='basketball'||environment?.id==='basketball-arena'||environment?.basketball===true||environment?.basketballCourt===true||['basketball-arena','basketball-stadium'].includes(environment?.builderScene?.layout))add('court-six','Court scoring contract','basketball','foot','Join a live court game and score six new basketball points.',450);
 if(/firing|range/.test(environment?.game||'')||environment?.firingRange||['firing-range','force-training-range'].includes(environment?.id)||environment?.builderScene?.layout==='firing-range')add('range-marksman','Range marksman contract','marksman','foot','Join a firing lane, then land five new server-confirmed target hits.',450);
 const locations=localMapLocations(environment).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
 if(locations.length>=2){
  add('land-delivery','Local supply run','delivery','foot','Collect supplies at one activity space and deliver them on foot to another.',350);
  add('land-recovery','Recover lost equipment','recovery','foot','Search an activity space, recover a marked equipment crate and return it to dispatch.',400);
  add('land-explore','Activity spaces discovery','explore','foot','Visit the main activity spaces and check in at each marked objective.',300);
 }
 return offers;
}
export function questPoint(mission,actors={}){const point=mission?.checkpoints?.[mission.index];if(!point)return null;const actor=point.actorId&&actors[point.actorId];return actor?{...point,...actor.position}:point;}
export function questMapTags(live,selfId){
 const mission=live?.players?.[selfId]?.vehicleMission;if(mission?.status!=='active')return [];
 const tags=[],markedActors=new Set();for(const [index,point]of (mission.checkpoints||[]).entries()){if(index<mission.index)continue;const actor=point.actorId&&live.actors?.[point.actorId],position=actor?.position||point;if(actor)markedActors.add(actor.id);tags.push({id:'mission:'+index,name:(index+1)+'. '+point.name,kind:'mission',icon:'◎',color:actor?.questRole==='hostile'?'#ff7c85':actor?.questRole==='protected'?'#72ecbb':'#ffdc82',...position,description:(index===mission.index?'Current objective':'Upcoming objective')+' · '+(point.action||'Reach beacon')+(point.dwell?' · Hold '+point.dwell+' seconds':'')+(actor?(actor.questRole==='cargo'?' · Supplies ready':' · '+Math.ceil(actor.health)+' hull'):'')});}
 if(mission.contactId&&live.actors?.[mission.contactId]){const contact=live.actors[mission.contactId];tags.push({id:'quest-contact:'+contact.id,name:contact.name,kind:'mission',icon:'☏',color:'#92e8cd',...contact.position,description:'Quest contact · approach and use Talk, or speak through the quest conversation panel'});}
 for(const id of mission.npcIds||[]){const actor=live.actors?.[id];if(!actor||actor.active===false||markedActors.has(id))continue;tags.push({id:'quest-npc:'+id,name:actor.name+(actor.questSecured?' · secured':''),kind:'mission',icon:actor.questSecured?'✓':actor.questRole==='hostile'?'⊕':'◆',color:actor.questSecured?'#bced8b':actor.questRole==='hostile'?'#ff7c85':'#72ecbb',...actor.position,description:actor.questSecured?'Cargo secured · engines stopped':actor.questRole==='hostile'?'Quest opponent · '+Math.ceil(actor.health)+' hull':actor.questRole==='racer'?'AI competitor · Gate '+((actor.questGate||0)+1):'Quest crew · '+Math.ceil(actor.health)+' hull'});}
 return tags;
}
