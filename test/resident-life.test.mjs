import test from 'node:test';
import assert from 'node:assert/strict';
import {residentContext,residentPersonality,residentGoalUtilities} from '../public/js/resident-personalities.js';
import {ensureResidentIntelligence,stepResidentLife,residentLifeView,residentIntelligence,observeResidentInteraction,archiveResidentIntelligence,residentActivityRestricted} from '../server-resident-life.mjs';
import {constructionWorld} from '../construction-world.mjs';
import {createEarthworks} from '../public/js/construction-earthworks.js';

const collision={groundAt:(_environment,point)=>({...point,y:point.y||0}),hasBodyClearance:()=>true,resolve:(_environment,_previous,next)=>({...next})};
const environment=(id='garden-map',extra={})=>({id,name:'Garden Community',source:'repository',spawn:{x:0,y:0,z:0},builderScene:{mapSize:100,layout:'grand-floor',objects:[],layoutMeta:{locations:[{id:'gathering',name:'Community garden',x:0,z:0,width:10,depth:10}]}},...extra});
const actor=(id='world-resident-0-0',x=0,z=0)=>({id,name:'Amira Vale · Local explorer',active:true,position:{x,y:0,z},rotation:{x:0,y:0,z:0},resident:{name:id.endsWith('0')?'Amira Vale':'Leo Reed',role:'Local explorer',home:{x,y:0,z},placeName:'Community garden',locationIndex:0,index:id.endsWith('0')?0:1,phase:'working',speech:'',speechUntil:0},definition:{name:'Resident',gameplay:{behavior:'talk'}}});
function setup(env=environment(),collider=collision){const a=actor(),b=actor('world-resident-0-1',3,0),sim={actors:{[a.id]:a,[b.id]:b},players:{},events:[]};stepResidentLife(sim,env,100000,0,{collision:collider});return {sim,a,b,env,collider};}
function advance(fixture,from,steps){for(let i=1;i<=steps;i++)stepResidentLife(fixture.sim,fixture.env,from+i*250,.25,{collision:fixture.collider});return from+steps*250;}

test('profiles are stable within a map and location and adapt roles, practice and appearance across map types',()=>{
 const samples=[['arcade',{game:'arcade'},'arcadeGames'],['basketball',{game:'basketball'},'basketball'],['hockey',{game:'hockey'},'iceHockey'],['skiing',{game:'ski'},'skiing'],['harbor',{builderScene:{layoutMeta:{harbor:{extent:256}}}},'seamanship'],['airport',{airport:{enabled:true}},'aviation'],['music',{name:'Live music rehearsal stage'},'music'],['construction',{game:'construction'},'construction'],['range',{layout:'firing-range'},'rangeSafety'],['park',{name:'Botanical garden'},'natureObservation'],['custom',{source:'custom-builder',name:'Saved maker room'},'craftsmanship']];
 for(const [kind,extra,skill]of samples){const env={id:'map-'+kind,name:kind,...extra},place={id:'local-zone',name:'Public preparation area'},profile=residentPersonality(env,place,'world-resident-0-0','Amira');assert.equal(profile.context.kind,kind);assert.equal(profile.context.primarySkill,skill);assert.ok(profile.skills[skill]>0);assert.ok(profile.practiceSteps.length===3);assert.ok(profile.backstory.startsWith('I '));assert.ok(profile.appearance.hairstyle);assert.notEqual(profile.duty,'dealer');assert.notEqual(profile.duty,'guard');assert.deepEqual(profile,residentPersonality(env,place,'world-resident-0-0','Amira'));}
 const base=residentPersonality({id:'first',name:'Park'},{id:'place',name:'Garden'},'same-npc'),other=residentPersonality({id:'second',name:'Park'},{id:'place',name:'Garden'},'same-npc'),zone=residentPersonality({id:'first',name:'Park'},{id:'other-place',name:'Garden'},'same-npc');assert.notEqual(base.id,other.id);assert.notEqual(base.id,zone.id);assert.notDeepEqual(base.appearance,other.appearance);
});

test('migration keeps NPC identity and learned progress while needs select purposeful activities',()=>{
 const f=setup(),info=f.a.resident,identity=f.a.id;info.skills.natureObservation=82;info.memory.push({kind:'old-memory',subjectId:'friend',text:'A useful earlier visit.',at:90000});delete info.intelligenceVersion;ensureResidentIntelligence(f.sim,f.a,f.env,100250);assert.equal(f.a.id,identity);assert.equal(info.skills.natureObservation,82);assert.ok(info.memory.some(item=>item.kind==='old-memory'));assert.ok(residentIntelligence(info).backstory);
 const choice=needs=>residentGoalUtilities({...info,needs})[0].kind;assert.equal(choice({energy:5,social:90,purpose:90,curiosity:90}),'rest');assert.equal(choice({energy:95,social:0,purpose:95,curiosity:95}),'social');assert.equal(choice({energy:95,social:95,purpose:0,curiosity:95}),'work');assert.equal(choice({energy:95,social:95,purpose:95,curiosity:0}),'practice');
});

test('editing a saved map refreshes its resident context while preserving learned identity and memories',()=>{
 const f=setup(),info=f.a.resident,id=info.personalityId;info.skills.natureObservation=84;info.skills.music=61;info.skills.craftsmanship=52;info.memory.push({kind:'conversation',subjectId:'alice',text:'Alice asked about the old garden.',at:100000});info.practice={phase:'trying',skill:'natureObservation'};
 const airport={...f.env,airport:{enabled:true}};ensureResidentIntelligence(f.sim,f.a,airport,100250);assert.equal(info.personalityId,id);assert.equal(info.context.kind,'airport');assert.equal(info.uniform,'aviation');assert.ok(info.skills.aviation>0);assert.equal(info.skills.natureObservation,84);assert.ok(Object.keys(info.skills).length<=6);assert.ok(info.memory.some(item=>item.subjectId==='alice'));assert.match(info.practiceSteps.join(' '),/preflight/);assert.equal(info.practice,undefined);
 const renamed={...airport,name:'Renamed Community Airport'};ensureResidentIntelligence(f.sim,f.a,renamed,100500);assert.equal(info.context.worldName,renamed.name);
});

test('residents finish contextual practice and work, learn skills and reproduce their saved continuation without mutating games or wallets',()=>{
 const f=setup(),before={...f.a.resident.skills};f.sim.players.alice={actorId:'alice',username:'Alice',health:100,lastSeen:0,position:{x:0,y:0,z:50},tokens:{MZK:123},score:7};f.sim.basketball={homeScore:10,awayScore:8};const protectedState=JSON.stringify({players:f.sim.players,basketball:f.sim.basketball});advance(f,100000,240);const resumed={...f,sim:JSON.parse(JSON.stringify(f.sim))};advance(f,160000,240);advance(resumed,160000,240);assert.deepEqual(JSON.parse(JSON.stringify(resumed.sim)),JSON.parse(JSON.stringify(f.sim)));assert.ok(f.sim.residentLife.stats.practices>=1);assert.ok(f.sim.residentLife.stats.work>=1);assert.ok(f.a.resident.skills.natureObservation>before.natureObservation||f.a.resident.skills.hospitality>before.hospitality);assert.equal(JSON.stringify({players:f.sim.players,basketball:f.sim.basketball}),protectedState);
 assert.ok(Object.values(f.sim.actors).some(npc=>npc.resident.practice?.practiceOnly&&npc.resident.practice.result));const saved=JSON.stringify(f.sim);for(let i=0;i<10;i++)stepResidentLife(f.sim,f.env,220000,.25,{collision});assert.equal(JSON.stringify(f.sim),saved,'same simulation timestamp does not repeat learning');
});

test('nearby NPCs exchange alternating contextual turns and remember conversations rather than speaking simultaneously',()=>{
 const f=setup();advance(f,100000,180);const conversations=f.sim.residentLife.conversations.filter(c=>c.lines.length>=2);assert.ok(conversations.length);for(const c of conversations){assert.ok(new Set(c.lines.map(line=>line.speakerId)).size>=2);for(let i=1;i<c.lines.length;i++){assert.notEqual(c.lines[i-1].speakerId,c.lines[i].speakerId);assert.ok(c.lines[i].at-c.lines[i-1].at>=3100);}}
 assert.ok(f.a.resident.memory.some(item=>item.kind==='conversation'));assert.ok(f.a.resident.relationships.some(item=>item.id===f.b.id));assert.ok(f.sim.residentLife.stats.conversations>=1);assert.ok(conversations.some(c=>/plants|garden|paths|practice|observation/i.test(c.lines.map(line=>line.text).join(' '))));
});

test('stacked floors keep separate conversations and local practice paths',()=>{
 const f=setup();f.b.position={...f.a.position,y:5};f.b.resident.home={...f.b.position};f.b.resident.goal=null;advance(f,100000,200);assert.equal(f.sim.residentLife.stats.conversations,0);assert.equal(f.a.position.y,0);assert.equal(f.b.position.y,5);assert.ok(f.a.resident.practicesCompleted+f.a.resident.workCompleted>0);assert.ok(f.b.resident.practicesCompleted+f.b.resident.workCompleted>0);assert.equal(f.a.resident.relationships.some(item=>item.id===f.b.id),false);
});

test('culled residents restore scoped memory and skills from a bounded archive, and archival does not interrupt ordinary active exchanges',()=>{
 const f=setup();f.a.resident.skills.natureObservation=77;observeResidentInteraction(f.sim,f.a.id,{actorId:'alice',kind:'conversation',text:'Alice asked about the garden',requestId:'remember-visit'},101000);archiveResidentIntelligence(f.sim,f.a,f.env,101100);delete f.sim.actors[f.a.id];const recreated=actor(f.a.id);f.sim.actors[recreated.id]=recreated;ensureResidentIntelligence(f.sim,recreated,f.env,102000);assert.equal(recreated.resident.skills.natureObservation,77);assert.ok(recreated.resident.memory.some(item=>item.text.includes('Alice')));assert.ok(recreated.resident.relationships.some(item=>item.id==='alice'));
 f.sim.residentLife.conversations=[{id:'paused',participants:[recreated.id,f.b.id],topic:'gardens',turn:0,status:'active',startedAt:102000,nextAt:103000,lines:[]}];recreated.resident.conversationId=f.b.resident.conversationId='paused';archiveResidentIntelligence(f.sim,recreated,f.env,102100,{despawn:false});assert.equal(f.sim.residentLife.conversations[0].status,'active');archiveResidentIntelligence(f.sim,recreated,f.env,102200);assert.equal(f.sim.residentLife.conversations[0].status,'interrupted');assert.equal(f.b.resident.conversationId,undefined);
 const otherEnv=environment('different-world');ensureResidentIntelligence(f.sim,recreated,otherEnv,103000);assert.ok(!recreated.resident.memory.some(item=>item.text.includes('Alice')),'a different map gets its own persona and memories');
 for(let i=0;i<80;i++){const a=actor('archived-'+i);ensureResidentIntelligence(f.sim,a,otherEnv,104000+i);archiveResidentIntelligence(f.sim,a,otherEnv,104000+i);}assert.ok(Object.keys(f.sim.residentLife.archive).length<=64);
});

test('observations deduplicate skill learning and bound public memory, relationships, archives and chatter',()=>{
 const f=setup(),observation={actorId:'alice',kind:'task-complete',text:'Alice completed a public path check',skill:'hospitality',requestId:'favor-once'},before=f.a.resident.skills.hospitality;observeResidentInteraction(f.sim,f.a.id,observation,101000);const after=f.a.resident.skills.hospitality;assert.ok(after>before);observeResidentInteraction(f.sim,f.a.id,observation,101500);assert.equal(f.a.resident.skills.hospitality,after);
 for(let i=0;i<100;i++)observeResidentInteraction(f.sim,f.a.id,{actorId:'visitor-'+i,kind:'conversation',text:'A visitor asked about the local activity',requestId:'talk-'+i},102000+i*1000);assert.ok(f.a.resident.memory.length<=8);assert.ok(f.a.resident.relationships.length<=8);assert.ok(f.a.resident.observedIds.length<=16);const view=residentLifeView(f.sim);assert.equal(view.archive,undefined);assert.equal(view.players,undefined);assert.ok(view.events.length<=12);assert.equal(residentLifeView({}),null);assert.ok(JSON.stringify(view).length<12000);
});

test('ambient goals and safe rescue stay outside courts, runways, firing lanes, excavation and water',()=>{
 const cases=[environment('basketball',{game:'basketball'}),environment('hockey',{game:'hockey'}),environment('airport',{airport:{enabled:true,runways:[{x:0,z:0,width:12,length:80}]}}),environment('range',{layout:'firing-range',builderScene:{layout:'firing-range',mapSize:80,objects:[],layoutMeta:{locations:[{id:'briefing',name:'Range preparation area',x:0,z:17}]}}}),environment('site',{game:'construction',construction:{enabled:true,tower:{x:0,z:0,width:10,depth:10},excavation:{x:20,z:20,radius:8}}})];
 for(const env of cases){const f=setup(env);advance(f,100000,160);for(const npc of Object.values(f.sim.actors)){assert.equal(residentActivityRestricted(env,npc.position,f.sim),false,env.id+' resident stays on a public approach');assert.ok(Math.abs(npc.position.y)<.01);assert.ok(distance(npc.position,npc.resident.home)<=4.2);}}
 const harbor=environment('harbor',{builderScene:{layoutMeta:{harbor:{extent:256}}}});assert.equal(residentActivityRestricted(harbor,{x:150,y:0,z:0}),true);assert.equal(residentActivityRestricted(harbor,{x:20,y:0,z:20}),false);
 const fake=environment('fake-sports',{name:'General community',builderScene:{mapSize:100,layoutMeta:{locations:[{name:'Basketball court',x:0,z:20}]}}});assert.equal(residentActivityRestricted(fake,{x:0,y:0,z:0}),false,'a name alone does not impose native sports geometry');
 const arcade=environment('neon-junction',{game:'arcade'});assert.equal(residentActivityRestricted(arcade,{x:24,y:0,z:0}),true,'the perimeter train path stays clear');assert.equal(residentActivityRestricted(arcade,{x:19,y:0,z:9}),true,'the coaster route stays clear');assert.equal(residentActivityRestricted(arcade,{x:0,y:0,z:0}),false,'a public central approach remains available');
});

test('collision discontinuities and blocked routes cannot move residents through walls or raise them onto roofs',()=>{
 const guarded={...collision,groundAt:(_env,point)=>({...point,y:point.x>1?3:0}),resolve:(_env,previous,next)=>next.x>.5?{...previous}:{...next}};const f=setup(environment(),guarded);advance(f,100000,220);for(const npc of Object.values(f.sim.actors)){assert.ok(npc.position.x<=3,'no unbounded move beyond home');assert.equal(npc.position.y,0);assert.ok((npc.resident.navigation?.attempts||0)<=3);}
});

test('expanded construction terrain and active crew machinery keep generic residents on public approaches',()=>{
 const env=constructionWorld(),sim={time:100000,actors:{},players:{},construction:{earthworks:createEarthworks(env.construction)}};
 for(const patch of sim.construction.earthworks.patches){const center={x:patch.origin.x+patch.columns*patch.cellSize/2,y:0,z:patch.origin.z+patch.rows*patch.cellSize/2};assert.equal(residentActivityRestricted(env,center,sim),true,patch.id);assert.equal(residentActivityRestricted(env,{...center,x:patch.origin.x-.5},sim),true,'clearance outside '+patch.id);}
 assert.equal(residentActivityRestricted(env,{x:-58,y:0,z:35},sim),false,'crew muster remains public');assert.equal(residentActivityRestricted(env,{x:-58,y:0,z:52},sim),false,'pedestrian walkway remains public');
 const truck={id:'crew-truck',modelId:'site-dumptruck',active:true,position:{x:-62,y:0,z:78},construction:{crewOperator:{workerId:'haul-worker',expiresAt:102000}}};sim.actors[truck.id]=truck;assert.equal(residentActivityRestricted(env,{x:-57,y:0,z:78},sim),true,'active truck approach');sim.time=103000;assert.equal(residentActivityRestricted(env,{x:-57,y:0,z:78},sim),false,'expired operator does not reserve parking');
 const crane={id:'crew-crane',modelId:'tower-crane',active:true,position:{x:-18,y:0,z:-4},construction:{working:true,trolley:42}};sim.actors[crane.id]=crane;assert.equal(residentActivityRestricted(env,{x:-58,y:0,z:0},sim),true,'loaded lift swing envelope');crane.construction.working=false;assert.equal(residentActivityRestricted(env,{x:-58,y:0,z:0},sim),false,'paused crane releases public ground');
 const a=actor('world-resident-0-0',76,12),f={sim:{actors:{[a.id]:a},players:{}},a,env,collider:collision};stepResidentLife(f.sim,env,100000,0,{collision});advance(f,100000,160);assert.equal(residentActivityRestricted(env,a.position,f.sim),false);assert.ok(a.resident.safetyRelocated);assert.ok(distance(a.position,a.resident.home)<=4.2);
});

test('residents recover when saved geometry disappears or a wall covers their old position without jumping to roofs',()=>{
 for(const blockedBy of ['missing-floor','new-wall']){
  const edited={...collision,groundAt:(_env,point)=>point.x<2?(blockedBy==='missing-floor'?null:{...point,y:0}):({...point,y:point.x>8?4:0}),hasBodyClearance:(_env,point)=>blockedBy!=='new-wall'||point.x>=2};
  const f=setup(environment(),edited);advance(f,100000,80);assert.ok(f.a.resident.safetyRelocated,blockedBy);assert.ok(f.a.position.x>=2,blockedBy);assert.equal(f.a.position.y,0);assert.equal(f.a.resident.activitySuspended,false);
 }
});

test('only live players reserve active mission and race paths',()=>{
 const env=environment(),point={x:0,y:0,z:0},sim={time:100000,players:{visitor:{health:100,lastSeen:100000,position:{...point},skiRace:{status:'racing'}}}};
 assert.equal(residentActivityRestricted(env,point,sim),true);sim.players.visitor.lastSeen=80000;assert.equal(residentActivityRestricted(env,point,sim),false);sim.players.visitor.lastSeen=100000;sim.players.visitor.replacedByRoom='another-map';assert.equal(residentActivityRestricted(env,point,sim),false);
 delete sim.players.visitor.replacedByRoom;sim.players.visitor.skiRace=null;sim.players.visitor.vehicleMission={status:'active'};assert.equal(residentActivityRestricted(env,point,sim),true);sim.time=116000;assert.equal(residentActivityRestricted(env,point,sim),false);
 const moved=environment('neon-junction',{game:'arcade',arcade:{enabled:['train'],parts:{train:{x:10,z:20,rotation:90,scale:1.5}}}});assert.equal(residentActivityRestricted(moved,{x:10,y:0,z:-16}),true,'a rotated and scaled saved train route is protected');
});

test('specialized casino residents and simulation remain untouched by the general life module',()=>{
 const casino={id:'muzikaz-casino',game:'casino'},npc={...actor('casino-person'),resident:{casino:true,name:'Casino dealer',skills:{poker:88}}},sim={actors:{[npc.id]:npc},casinoLife:{stats:{rounds:10}}},before=JSON.stringify(sim);ensureResidentIntelligence(sim,npc,casino,100000);stepResidentLife(sim,casino,100000,.25,{collision});assert.equal(JSON.stringify(sim),before);
});

function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
