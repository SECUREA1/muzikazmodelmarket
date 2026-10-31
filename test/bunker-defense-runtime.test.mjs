import test from 'node:test';
import assert from 'node:assert/strict';
import {BUNKER_DEFENSE_TIMING as T,bunkerDefenseConfig,bunkerDefenseSystems,bunkerProtection,isInsideBunkerProtection} from '../public/js/bunker-defense-rules.js';
import {ensureBunkerDefense,stepBunkerDefense,bunkerDefenseView,bunkerDefenseCommand} from '../server-bunker-defense.mjs';

function fixture(){
 const environment={id:'defense-fixture',game:'bunker',spawn:{x:0,y:0,z:70},bunkerDefense:{enabled:true,undergroundBounds:{minX:-27,maxX:27,minY:-12.6,maxY:-8,minZ:-31,maxZ:31},sealDoorIds:['shutter'],stations:{power:'power',filtration:'filter',relay:'relay',shutter:'shutter',alert:'console',monitor:'monitor',alarm:'alarm'},initialSystems:{power:true,filtration:true,relay:true}},doomsday:{objectives:[{id:'shelter',position:{x:0,y:-11.98,z:26}},{id:'supplies',position:{x:-16,y:-11.98,z:26}},{id:'recovery',position:{x:-12,y:-11.98,z:-18}}]}};
 const actors=Object.fromEntries(['power','filter','relay','shutter','console','monitor','alarm'].map(id=>[id,{id,active:true,switched:false,open:false,position:{x:0,y:-12,z:0}}]));
 const player=(id,position)=>({actorId:id,position,health:100,lastSeen:1000000,input:{forward:1}});
 const sim={actors,events:[],time:1000000,players:{inside:player('inside',{x:0,y:-11.98,z:0}),outside:player('outside',{x:0,y:.02,z:70})},doomsday:{id:null,phase:'idle',objectives:[],detonationAt:null,falloutAt:null}};
 const at=now=>{for(const player of Object.values(sim.players))player.lastSeen=now;return stepBunkerDefense(sim,environment,now);};
 return {sim,environment,at};
}

test('protection is grounded in the underground envelope and physical control states',()=>{
 const f=fixture();ensureBunkerDefense(f.sim,f.environment);
 let systems=bunkerDefenseSystems(f.sim.actors,f.environment);
 assert.equal(systems.ready,true);assert.equal(bunkerProtection(f.sim.players.inside.position,f.environment,systems).falloutProtected,true);
 assert.equal(isInsideBunkerProtection({x:0,y:0,z:0},f.environment),false,'same map and XY footprint at surface grants no protection');
 assert.equal(isInsideBunkerProtection({x:50,y:-12,z:0},f.environment),false,'depth alone does not grant protection outside authored shelter');
 f.sim.actors.shutter.open=true;systems=bunkerDefenseSystems(f.sim.actors,f.environment);assert.equal(systems.sealed,false);assert.equal(bunkerProtection(f.sim.players.inside.position,f.environment,systems).blastProtected,false);
 f.sim.actors.shutter.open=false;f.sim.actors.filter.switched=false;systems=bunkerDefenseSystems(f.sim.actors,f.environment);const protection=bunkerProtection(f.sim.players.inside.position,f.environment,systems);assert.equal(protection.blastProtected,true);assert.equal(protection.falloutProtected,false);
 delete f.sim.actors.shutter;assert.equal(bunkerDefenseSystems(f.sim.actors,f.environment).sealed,false,'deleting a required component removes its protection');
});

test('airstrikes warn before impact, protect sealed occupants and apply surface damage once across reloads',()=>{
 const f=fixture(),arrival=f.sim.time;let state=f.at(arrival);assert.equal(state.airstrike.nextEventAt,arrival+T.firstAirstrikeMs);
 f.sim.actors['extra-siren']={id:'extra-siren',modelId:'bunker-alarm-beacon',active:true,position:{x:1,y:-12,z:0}};
 state=f.at(state.airstrike.nextEventAt);assert.equal(f.sim.actors['extra-siren'].bunkerAlertState.level,'warning');assert.equal(state.airstrike.phase,'warning');assert.equal(state.alarm.kind,'airstrike');assert.equal(state.alarm.level,'warning');assert.equal(f.sim.players.outside.health,100);
 state=f.at(state.airstrike.impactAt);assert.equal(state.airstrike.phase,'impact');assert.equal(f.sim.players.inside.health,100);assert.equal(f.sim.players.outside.health,55);assert.equal(state.impacts.length,1);assert.equal(state.impacts[0].protectedCount,1);
 f.at(state.airstrike.impactAt);f.sim.bunkerDefense=structuredClone(f.sim.bunkerDefense);f.at(state.airstrike.impactAt+1);assert.equal(f.sim.players.outside.health,55,'snapshot and process reload cannot replay an impact');
 state=f.at(state.airstrike.clearAt);assert.equal(state.airstrike.phase,'all-clear');assert.equal(state.alarm.active,false);assert.equal(state.airstrike.nextEventAt,state.airstrike.clearAt+T.repeatAirstrikeMs);
 assert.equal(f.sim.actors.alarm.bunkerAlertState.level,'all-clear');assert.ok(f.sim.transportRadio.some(call=>call.bunkerAlert&&call.phase==='warning'));
});

test('nuclear blast and fallout use separate seal and powered filtration checks, preserving exposure receipts',()=>{
 const f=fixture();f.at(f.sim.time);f.sim.doomsday={...f.sim.doomsday,id:'nuclear-1',phase:'warning',detonationAt:1002000,falloutAt:1009000};
 let state=f.at(1001000);assert.equal(state.alarm.kind,'nuclear');assert.equal(f.sim.players.outside.health,100);
 f.sim.doomsday.phase='detonation';state=f.at(1002000);assert.equal(f.sim.players.inside.health,100);assert.equal(f.sim.players.outside.health,30);assert.equal(state.protection.inside.blastProtected,true);
 f.at(1002001);assert.equal(f.sim.players.outside.health,30);
 f.sim.doomsday.phase='fallout';f.at(1009000);assert.equal(f.sim.players.inside.health,100);assert.equal(f.sim.players.outside.health,23);
 f.sim.players.outside.replacedByRoom=true;f.at(1009001);delete f.sim.players.outside.replacedByRoom;f.at(1009002);assert.equal(f.sim.players.outside.health,23,'travel or reconnect during the same pulse cannot claim or incur it twice');
 f.sim.actors.filter.switched=false;state=f.at(1019000);assert.equal(f.sim.players.inside.health,98);assert.equal(state.protection.inside.falloutProtected,false);
 f.sim.actors.shutter.open=true;f.at(1029000);assert.equal(f.sim.players.inside.health,94,'an unsealed shelter admits more fallout');
 assert.equal(f.sim.players.outside.health,9);
});

test('automatic schedules reset empty-room arrivals and preserve AI response task progress',()=>{
 const f=fixture();let state=f.at(f.sim.time);const task={id:'rook-filter',status:'active',stage:'walking'};f.sim.bunkerDefense.responseTasks.push(task);
 for(const player of Object.values(f.sim.players))player.replacedByRoom=true;
 state=stepBunkerDefense(f.sim,f.environment,f.sim.time+100);assert.equal(state.airstrike.nextEventAt,null);assert.deepEqual(state.responseTasks,[task]);
 for(const player of Object.values(f.sim.players))delete player.replacedByRoom;
 state=f.at(f.sim.time+200);assert.equal(state.airstrike.nextEventAt,f.sim.time+200+T.firstAirstrikeMs);
 const view=bunkerDefenseView(f.sim);assert.equal(view.impactReceipts,undefined);assert.equal(view.falloutReceipts,undefined);view.responseTasks[0].status='complete';assert.equal(f.sim.bunkerDefense.responseTasks[0].status,'active');
});

test('acknowledgement requires the real alert console, retains alarms and never accepts manual threat advancement',()=>{
 const f=fixture();let state=f.at(f.sim.time);state=f.at(state.airstrike.nextEventAt);
 assert.throws(()=>bunkerDefenseCommand(f.sim,f.sim.players.outside,f.environment,{operation:'acknowledge'},state.serverTime),/Move within reach/);
 const result=bunkerDefenseCommand(f.sim,f.sim.players.inside,f.environment,{operation:'acknowledge'},state.serverTime);assert.equal(result.bunkerDefense.alarm.acknowledgedBy,'inside');assert.equal(result.bunkerDefense.alarm.active,true);
 f.at(state.airstrike.impactAt);assert.equal(f.sim.bunkerDefense.alarm.acknowledgedBy,'inside','the acknowledgement follows the same warning through impact');
 assert.throws(()=>bunkerDefenseCommand(f.sim,f.sim.players.inside,f.environment,{operation:'advance'},state.serverTime),/marked shelter equipment/);
 assert.equal(stepBunkerDefense({}, {id:'other'},0),null,'other worlds do not inherit hazards or protection');
 f.environment.bunkerDefense.enabled=false;assert.equal(stepBunkerDefense(f.sim,f.environment,state.serverTime+1),null);assert.equal(bunkerDefenseView(f.sim),null,'removing the authored controller removes stale protection claims');
});

test('a suspended room never replays historical blast damage against a returning visitor',()=>{const f=fixture();let state=f.at(f.sim.time);state=f.at(state.airstrike.nextEventAt);const impactAt=state.airstrike.impactAt;state=f.at(impactAt+60000);assert.equal(f.sim.players.outside.health,100);assert.equal(state.impacts[0].missed,true);assert.equal(state.impacts[0].at,impactAt);f.sim.doomsday={...f.sim.doomsday,id:'missed-nuclear',phase:'recovery',detonationAt:impactAt,falloutAt:impactAt+7000};f.at(impactAt+70000);assert.equal(f.sim.players.outside.health,100);assert.equal(f.sim.bunkerDefense.impacts.at(-1).missed,true);});

test('nuclear clearing keeps the alert active until the actual all-clear phase',()=>{const f=fixture();f.sim.doomsday={...f.sim.doomsday,id:'nuclear-clearing',phase:'clearing',detonationAt:999000,falloutAt:999500};let view=f.at(1000000);assert.equal(view.alarm.active,true);assert.equal(view.alarm.level,'recovery');assert.equal(f.sim.actors.alarm.bunkerAlertState.level,'recovery');f.sim.doomsday.phase='all-clear';view=f.at(1000001);assert.equal(view.alarm.active,false);assert.equal(view.alarm.level,'all-clear');});

test('copied map timing cannot create zero-duration exposure loops or invalid deadlines',()=>{const f=fixture();f.environment.bunkerDefense.timing={firstAirstrikeMs:NaN,airstrikeWarningMs:-1,falloutPulseMs:0,repeatAirstrikeMs:Infinity};const timing=bunkerDefenseConfig(f.environment).timing;assert.equal(timing.firstAirstrikeMs,T.firstAirstrikeMs);assert.equal(timing.airstrikeWarningMs,8000);assert.equal(timing.falloutPulseMs,5000);assert.equal(timing.repeatAirstrikeMs,T.repeatAirstrikeMs);});
