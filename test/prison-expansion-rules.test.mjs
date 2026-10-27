import test from 'node:test';
import assert from 'node:assert/strict';
import {prisonInitialState,prisonAction,prisonView} from '../public/js/prison-game.js';
import {prisonContractView} from '../public/js/prison-contracts.js';
import {PRISON_STATIONS} from '../public/js/prison-config.js';

const station=id=>PRISON_STATIONS.find(value=>value.id===id);
function fixture(){
 let now=100000;const playerId='expansion-player',state=prisonInitialState(now);
 const send=(operation,stationId='intake',fields={},position=station(stationId)?.position)=>{
  now+=500;
  return prisonAction(state,'prison-action',{operation,stationId,...fields},{playerId,position,now});
 };
 send('status');
 const contract=()=>prisonContractView(state.players[playerId],{day:state.day});
 const progress=event=>contract().active?.goals.find(goal=>goal.event===event)?.progress||0;
 return {state,send,contract,progress,playerId,get player(){return state.players[playerId];},get now(){return now;},advance(ms){now+=ms;}};
}
function finishRound(f,game){
 const stationId=game==='boxing'?'gym':'arcade';
 assert.equal(f.send(game+'-start',stationId).ok,true);
 for(const input of [...f.player.round.inputs])assert.equal(f.send(game+'-input',stationId,{input}).ok,true);
}

test('intake contracts count completed rounds, rather than starts, partial moves or wrong answers',()=>{
 const f=fixture();
 assert.equal(f.send('contract-accept','intake',{contractId:'recreation-circuit'}).ok,true);
 assert.equal(f.player.tokens,0);
 for(const game of ['arcade','boxing']){
  const place=game==='boxing'?'gym':'arcade';
  assert.equal(f.send(game+'-start',place).ok,true);assert.equal(f.progress(game),0);
  assert.equal(f.send(game+'-input',place,{input:f.player.round.inputs[0]}).ok,true);assert.equal(f.progress(game),0);
  assert.equal(f.send(game+'-input',place,{input:'wrong'}).ok,true);assert.equal(f.player.round,null);assert.equal(f.progress(game),0);
  finishRound(f,game);assert.equal(f.progress(game),1);
 }
 const earnedBefore=f.player.tokens;
 assert.equal(f.send('radio','radio',{input:94.6}).ok,false);assert.equal(f.progress('radio'),0);
 assert.equal(f.send('radio','radio',{input:94.7}).ok,true);assert.equal(f.progress('radio'),1);
 const final=f.send('tv','tv');assert.equal(final.ok,true);assert.match(final.message,/Contract complete/);
 assert.equal(f.contract().active,null);assert.deepEqual(f.contract().completed,['recreation-circuit']);
 assert.equal(f.player.tokens,earnedBefore+5+5+22);
 const tokens=f.player.tokens;
 assert.equal(f.send('contract-accept','intake',{contractId:'recreation-circuit'}).ok,false);
 assert.equal(f.send('tv','tv').ok,true);assert.equal(f.player.tokens,tokens);
});

test('remote and invalid activities cannot progress work or meal contracts, and bunk rest requires an interior',()=>{
 const f=fixture();f.send('contract-accept','intake',{contractId:'settled-in'});
 const intake=station('intake').position;
 assert.equal(f.send('work','work',{input:'orange'},intake).ok,false);assert.equal(f.progress('work'),0);
 assert.equal(f.send('work','work',{input:'wrong'}).ok,false);assert.equal(f.progress('work'),0);
 assert.equal(f.send('meal','meal',{},intake).ok,false);assert.equal(f.progress('meal'),0);
 assert.equal(f.send('meal','meal').ok,true);assert.equal(f.progress('meal'),1);
 for(const input of ['orange','white','blue']){f.advance(4000);assert.equal(f.send('work','work',{input}).ok,true);}
 assert.equal(f.progress('work'),3);
 const own=PRISON_STATIONS.find(value=>value.cellId===f.player.cellId);
 assert.equal(f.send('rest',own.id).ok,false);assert.equal(f.progress('rest'),0);
 const cell=f.state.cells[f.player.cellId];assert.ok(cell);
 const interior={...own.position,z:own.position.z-2.5};
 // The first assigned cell faces the northern row, so the interior is north of
 // its door. Stay within the station reach while stepping across the threshold.
 assert.equal(f.send('rest',own.id,{},interior).ok,true);
 assert.equal(f.contract().active,null);assert.deepEqual(f.contract().completed,['settled-in']);
});

test('guard inspections require distinct authoritative cells and prisoner operations cannot count toward the guard contract',()=>{
 const f=fixture();f.send('role-guard');f.send('contract-accept','intake',{contractId:'inspection-round'});
 const cells=PRISON_STATIONS.filter(value=>value.kind==='cell').slice(0,3);
 assert.equal(f.send('cell-lock',cells[0].id).ok,true);assert.equal(f.progress('cell-check'),1);
 assert.equal(f.send('cell-unlock',cells[0].id).ok,true);assert.equal(f.progress('cell-check'),1);
 f.send('role-prisoner');
 assert.equal(f.send('cell-lock',cells[1].id).ok,false);
 const own=PRISON_STATIONS.find(value=>value.cellId===f.player.cellId);
 assert.equal(f.send('cell-unlock',own.id).ok,true);
 f.send('role-guard');assert.equal(f.progress('cell-check'),1);
 for(const cell of cells.slice(1))assert.equal(f.send('cell-lock',cell.id).ok,true);
 assert.equal(f.progress('cell-check'),3);
 assert.equal(f.send('radio','radio',{input:94.7}).ok,true);assert.equal(f.send('meal','meal').ok,true);
 assert.deepEqual(f.contract().completed,['inspection-round']);assert.equal(f.contract().lifetime.tokens,18);
});

test('peacekeeping progress requires an active disturbance and cannot be claimed by repeating calm commands',()=>{
 const f=fixture();f.send('role-guard');f.send('contract-accept','intake',{contractId:'keep-the-peace'});
 assert.equal(f.send('deescalate','gym').ok,true);assert.equal(f.progress('deescalate'),0);
 assert.equal(f.send('patrol','security').ok,true);assert.equal(f.progress('deescalate'),0);
 assert.equal(f.send('fight','gym').ok,true);assert.equal(f.send('deescalate','gym').ok,true);assert.equal(f.progress('deescalate'),1);
 assert.equal(f.send('deescalate','gym').ok,true);assert.equal(f.progress('deescalate'),1);
});

test('supply packets sell only at a nearby intake or cafeteria and debit canonical recreation-token prices',()=>{
 const f=fixture();f.player.tokens=30;
 assert.equal(f.send('packet-buy','tv',{packetId:'canteen'}).ok,false);assert.equal(f.player.tokens,30);
 assert.equal(f.send('packet-buy','intake',{packetId:'canteen'},station('tv').position).ok,false);assert.equal(f.player.tokens,30);
 const forged=f.send('packet-buy','intake',{packetId:'forged',cost:0,items:{pass:1}});
 assert.equal(forged.ok,false);assert.equal(f.player.tokens,30);
 const result=f.send('packet-buy','intake',{packetId:'canteen',cost:0,tokens:999,items:{keycard:1}});
 assert.equal(result.ok,true);assert.equal(f.player.tokens,26);assert.equal(f.player.supplies.snack,1);assert.equal(f.player.supplies.water,1);assert.deepEqual(f.player.inventory,[]);
 assert.equal(f.send('packet-buy','meal',{packetId:'canteen'}).ok,true);assert.equal(f.player.tokens,22);assert.equal(f.player.supplies.snack,2);assert.equal(f.player.supplies.water,2);
});

test('owned supplies can be used away from shops, but unknown stations/items cannot enable remote restocking',()=>{
 const f=fixture();f.player.tokens=8;f.send('packet-buy','intake',{packetId:'canteen'});f.player.energy=20;f.player.morale=50;
 const position={x:-35,y:0,z:-80},tokens=f.player.tokens;
 assert.equal(f.send('supply-use','tv',{itemId:'snack',effects:{energy:999}},position).ok,true);
 assert.equal(f.player.energy,38);assert.equal(f.player.morale,54);assert.equal(f.player.supplies.snack,0);assert.equal(f.player.tokens,tokens);
 const water=f.player.supplies.water;
 assert.equal(f.send('supply-use','forged',{itemId:'water'},position).ok,false);assert.equal(f.player.supplies.water,water);
 assert.equal(f.send('supply-use','tv',{itemId:'keycard'},position).ok,false);assert.deepEqual(f.player.inventory,[]);
 assert.equal(f.send('packet-buy','intake',{packetId:'canteen'},position).ok,false);assert.equal(f.player.tokens,tokens);
 f.advance(10000);assert.equal(f.send('supply-use','tv',{itemId:'water'},position).ok,true);assert.equal(f.player.supplies.water,0);
});

test('contract abandonment requires intake and keeps earned scores while removing unfinished progress',()=>{
 const f=fixture();f.send('contract-accept','intake',{contractId:'recreation-circuit'});f.send('tv','tv');
 const tokens=f.player.tokens;
 assert.equal(f.send('contract-abandon','intake',{},station('tv').position).ok,false);assert.equal(f.contract().active.id,'recreation-circuit');
 assert.equal(f.send('contract-abandon','intake').ok,true);assert.equal(f.contract().active,null);assert.equal(f.player.tokens,tokens);
 assert.equal(f.send('contract-accept','intake',{contractId:'settled-in'}).ok,true);assert.equal(f.contract().active.id,'settled-in');
 const publicState=prisonView(f.state,f.playerId);publicState.self.contracts.active.goals[0].progress=999;
 assert.equal(f.progress('meal'),0);
});


test('expired disturbance labels cannot advance a peacekeeping contract',()=>{
 const f=fixture();f.send('role-guard');f.send('contract-accept','intake',{contractId:'keep-the-peace'});
 const npc=Object.values(f.state.npcs).find(person=>person.role==='prisoner');npc.state='Disturbance';npc.disturbedUntil=f.now-1;
 assert.equal(f.send('deescalate','gym').ok,true);assert.equal(f.progress('deescalate'),0);
});
