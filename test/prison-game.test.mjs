import test from 'node:test';
import assert from 'node:assert/strict';
import {prisonInitialState,prisonAction,stepPrisonSimulation,prisonView,PRISON_DAY_SECONDS} from '../public/js/prison-game.js';
import {PRISON_STATIONS,PRISON_CELLS} from '../public/js/prison-config.js';

const station=id=>PRISON_STATIONS.find(row=>row.id===id);
function fixture(){
 let now=100000,playerId='prison-test';
 const state=prisonInitialState(now);
 const send=(operation,stationId='intake',input,position=station(stationId).position)=>{
  now+=500;
  return prisonAction(state,'prison-action',{operation,stationId,input},{playerId,position,now});
 };
 send('status');
 return {state,send,get player(){return state.players[playerId];},get now(){return now;},advance(ms){now+=ms;},playerId};
}
function clearGuards(state){for(const npc of Object.values(state.npcs))if(npc.role==='guard')npc.position={x:100,y:0,z:-100};}

test('prison activities reject remote and mismatched operations before changing progress',()=>{
 const f=fixture(),before=structuredClone(f.state);
 const remote=f.send('meal','meal',undefined,{x:0,y:0,z:83});
 assert.equal(remote.ok,false);assert.match(remote.message,/closer/);assert.deepEqual(f.state,before);
 assert.equal(f.send('theft','tv').ok,false);assert.deepEqual(f.state,before);
 assert.equal(prisonAction(f.state,'prison-action',{operation:'meal',stationId:'forged'},{playerId:f.playerId,position:{x:0,z:0},now:f.now}).ok,false);
 assert.deepEqual(f.state,before);
});

test('meals restore bounded stats and enforce server cooldown without duplicate challenge rewards',()=>{
 const f=fixture();f.player.energy=20;f.player.health=50;
 assert.equal(f.send('meal','meal').ok,true);assert.equal(f.player.energy,50);assert.equal(f.player.health,65);assert.equal(f.player.tokens,5);
 const stats={energy:f.player.energy,health:f.player.health,tokens:f.player.tokens};
 assert.equal(f.send('meal','meal').ok,false);assert.deepEqual({energy:f.player.energy,health:f.player.health,tokens:f.player.tokens},stats);
 f.advance(20000);assert.equal(f.send('meal','meal').ok,true);assert.equal(f.player.tokens,5);
 assert.deepEqual(f.player.completed,['meal']);
});

test('cell ownership and guard authority control the actual shared door state',()=>{
 const f=fixture(),own=PRISON_STATIONS.find(s=>s.cellId===f.player.cellId),other=PRISON_STATIONS.find(s=>s.kind==='cell'&&s.cellId!==f.player.cellId);
 assert.equal(f.send('cell-lock',other.id).ok,false);assert.equal(f.state.cells[other.cellId].locked,false);
 assert.equal(f.send('cell-lock',own.id).ok,true);assert.equal(f.state.cells[own.cellId].locked,true);
 assert.equal(f.send('cell-unlock',own.id).ok,true);assert.equal(f.state.cells[own.cellId].locked,false);
 f.send('role-guard');assert.equal(f.send('cell-lock',other.id).ok,true);assert.equal(f.state.cells[other.cellId].locked,true);
 assert.equal(f.send('lockdown','security').ok,true);assert.ok(Object.values(f.state.cells).every(cell=>cell.locked));
 assert.equal(f.send('all-unlock','security').ok,true);assert.ok(Object.values(f.state.cells).every(cell=>!cell.locked));
});

test('non-graphic fights spend health and energy, trigger security, and calm after de-escalation',()=>{
 const f=fixture(),health=f.player.health,energy=f.player.energy;
 assert.equal(f.send('fight','gym').ok,true);assert.equal(f.player.health,health-18);assert.equal(f.player.energy,energy-15);assert.equal(f.player.heat,38);assert.ok(f.state.alarmUntil>f.now);
 assert.ok(Object.values(f.state.npcs).some(npc=>npc.state==='Disturbance'));
 assert.equal(f.send('fight','gym').ok,false);assert.equal(f.player.health,health-18);
 assert.equal(f.send('deescalate','gym').ok,true);assert.equal(f.player.heat,18);assert.equal(f.state.alarmUntil,0);assert.ok(!Object.values(f.state.npcs).some(npc=>npc.state==='Disturbance'));
});

test('theft produces contraband once and guards confiscate it on capture with a timed physical cell lock',()=>{
 const f=fixture();assert.equal(f.send('theft','stash').ok,true);assert.deepEqual(f.player.inventory,['wire','map']);assert.equal(f.player.heat,24);
 const earned=f.player.tokens;assert.equal(f.send('theft','stash').ok,false);assert.equal(f.player.tokens,earned);assert.deepEqual(f.player.inventory,['wire','map']);
 f.player.heat=80;f.player.health=20;
 const body={position:{x:0,y:0,z:0}},guard=Object.values(f.state.npcs).find(npc=>npc.role==='guard');guard.position={...body.position};
 const captured=stepPrisonSimulation(f.state,.1,{now:f.now,players:{[f.playerId]:body}});
 assert.equal(captured.length,1);assert.equal(captured[0].playerId,f.playerId);assert.deepEqual(captured[0].position,PRISON_CELLS.find(cell=>cell.id===f.player.cellId).position);
 assert.deepEqual(f.player.inventory,[]);assert.ok(f.player.health>=40);assert.equal(f.player.caughtUntil,f.now+15000);assert.equal(f.state.cells[f.player.cellId].locked,true);
 assert.equal(f.send('meal','meal').ok,false);
 f.advance(15000);stepPrisonSimulation(f.state,.1,{now:f.now,players:{[f.playerId]:{position:captured[0].position}}});
 assert.equal(f.player.caughtUntil,0);assert.equal(f.state.cells[f.player.cellId].locked,false);
});

test('escape requires physical checkpoints, security clues and an open unexpired gate',()=>{
 const f=fixture();clearGuards(f.state);
 assert.equal(f.send('escape','escape').ok,false);assert.equal(f.send('vent','vent').ok,false);assert.equal(f.send('keycard','security','314').ok,false);
 assert.equal(f.send('theft','stash').ok,true);assert.equal(f.send('keycard','security','999').ok,false);assert.equal(f.player.inventory.includes('keycard'),false);
 assert.equal(f.send('keycard','security','314').ok,true);assert.equal(f.send('vent','vent').ok,true);assert.ok(f.player.inventory.includes('pass'));
 assert.equal(f.send('escape','escape').ok,false);
 f.state.alarmUntil=f.now+5000;assert.equal(f.send('escape','gate').ok,false);f.advance(5000);
 assert.equal(f.send('escape','gate').ok,true);f.advance(15000);assert.equal(f.send('escape','escape').ok,false);assert.equal(f.player.escaped,false);
 assert.equal(f.send('escape','gate').ok,true);assert.equal(f.send('escape','escape').ok,true);assert.equal(f.player.escaped,true);assert.ok(f.player.completed.includes('escape'));
 const tokens=f.player.tokens;assert.equal(f.send('escape','escape').ok,false);assert.equal(f.player.tokens,tokens);
});

test('arcade and boxing rewards require the complete accepted input sequence',()=>{
 for(const [kind,start,hit]of [['arcade','arcade-start','arcade-input'],['gym','boxing-start','boxing-input']]){
  const f=fixture();assert.equal(f.send(start,kind).ok,true);assert.equal(f.player.tokens,0);
  assert.equal(f.send(hit,kind,'forged').ok,true);assert.equal(f.player.round,null);assert.equal(f.player.tokens,0);
  f.send(start,kind);const inputs=[...f.player.round.inputs];
  for(const [index,input]of inputs.entries()){
   assert.equal(f.send(hit,kind,input).ok,true);
   if(index<inputs.length-1)assert.equal(f.player.tokens,0);
  }
  assert.equal(f.player.round,null);assert.equal(f.player.tokens,11);assert.ok(f.player.completed.includes(kind==='gym'?'boxing':'arcade'));
  const earned=f.player.tokens;assert.equal(f.send(hit,kind,inputs.at(-1)).ok,false);assert.equal(f.player.tokens,earned);
 }
});

test('routine locks follow the day clock, heat decays, and public snapshots cannot mutate authoritative state',()=>{
 const f=fixture();f.player.heat=20;f.state.elapsed=PRISON_DAY_SECONDS-1;
 stepPrisonSimulation(f.state,.1,{now:f.now,players:{[f.playerId]:{position:station('intake').position}}});
 assert.equal(f.state.phase,'lockdown');assert.ok(Object.values(f.state.cells).every(cell=>cell.locked));assert.ok(f.player.heat<20);
 f.state.elapsed=PRISON_DAY_SECONDS;stepPrisonSimulation(f.state,.1,{now:f.now+100,players:{[f.playerId]:{position:station('intake').position}}});
 assert.equal(f.state.phase,'breakfast');assert.equal(f.state.day,2);assert.ok(Object.values(f.state.cells).every(cell=>!cell.locked));
 const view=prisonView(f.state,f.playerId);assert.equal(view.self.lastActions,undefined);view.self.tokens=999;view.cells[f.player.cellId].locked=true;
 assert.notEqual(f.player.tokens,999);assert.equal(f.state.cells[f.player.cellId].locked,false);
});
