import test from 'node:test';
import assert from 'node:assert/strict';
import {PRISON_CONTRACTS,prisonContractState,acceptPrisonContract,abandonPrisonContract,recordPrisonContractEvent,prisonContractView} from '../public/js/prison-contracts.js';

function fixture(role='prisoner'){
 let day=1,now=100000,sequence=0;
 const player={role,tokens:0,inventory:[]};
 const context=()=>({day,now:now+=1000});
 prisonContractState(player,context());
 return {player,accept:id=>acceptPrisonContract(player,id,context()),abandon:()=>abandonPrisonContract(player,context()),
  record:(event,eventId)=>recordPrisonContractEvent(player,event,{...context(),eventId:eventId??'contract-event-'+ ++sequence}),
  view:()=>prisonContractView(player,context()),nextDay(){day++;},setDay(value){day=value;},get day(){return day;}};
}
const recipes=role=>PRISON_CONTRACTS.filter(contract=>contract.role===role);
const completed=(view,id)=>view.completed.some(contract=>(typeof contract==='string'?contract:contract.id)===id);
function complete(f,contract){
 let result;
 for(const goal of contract.goals)for(let index=0;index<goal.count;index++)result=f.record({type:goal.event,targetId:goal.distinct?'cell-'+index:undefined});
 return result;
}

test('contract catalogue supplies immutable multi-step prisoner and guard shifts',()=>{
 assert.equal(PRISON_CONTRACTS.length,6);
 assert.ok(Object.isFrozen(PRISON_CONTRACTS));
 for(const role of ['prisoner','guard'])assert.equal(recipes(role).length,3);
 for(const contract of PRISON_CONTRACTS){
  assert.ok(Object.isFrozen(contract));assert.ok(Object.isFrozen(contract.goals));
  assert.ok(contract.goals.length>=2);assert.ok(contract.rewardTokens>0);
  assert.equal(new Set(contract.goals.map(goal=>goal.event)).size,contract.goals.length);
  for(const goal of contract.goals){assert.ok(goal.count>0);assert.ok(goal.label);}
 }
});

test('starting and switching offers cannot grant rewards or equip escape items',()=>{
 const f=fixture(),offers=f.view().offers;
 assert.deepEqual(offers.map(offer=>offer.id).sort(),recipes('prisoner').map(contract=>contract.id).sort());
 assert.equal(f.accept('not-a-contract').ok,false);
 assert.equal(f.accept(recipes('guard')[0].id).ok,false);
 const contract=recipes('prisoner')[0];assert.equal(f.accept(contract.id).ok,true);
 assert.equal(f.player.tokens,0);assert.deepEqual(f.player.inventory,[]);
 assert.equal(f.accept(contract.id).ok,true,'reopening the same accepted contract preserves it');
 assert.equal(f.view().active.id,contract.id);
 assert.equal(f.accept(recipes('prisoner')[1].id).ok,false,'one contract owns this shift until finished or abandoned');
 assert.equal(f.player.tokens,0);assert.equal(f.view().active.id,contract.id);
});

test('only the accepted contract goals advance and its reward pays exactly once',()=>{
 for(const role of ['prisoner','guard']){
  const f=fixture(role),contract=recipes(role)[0];f.accept(contract.id);
  const ignored=f.record({type:'client-granted-reward',tokens:9999,completed:true});
  assert.equal(ignored.advanced,false);assert.equal(f.player.tokens,0);
  let hits=0;const required=contract.goals.reduce((sum,goal)=>sum+goal.count,0);
  for(const goal of contract.goals)for(let index=0;index<goal.count;index++){
   const result=f.record({type:goal.event,targetId:goal.distinct?'cell-'+index:undefined});hits++;
   assert.equal(result.advanced,true);
   if(hits<required){assert.equal(result.completed,false);assert.equal(f.player.tokens,0);}
   else {assert.equal(result.completed,true);assert.equal(result.rewardTokens,contract.rewardTokens);}
  }
  assert.equal(f.player.tokens,contract.rewardTokens);assert.ok(completed(f.view(),contract.id));
  assert.equal(f.view().active,null);assert.deepEqual(f.player.inventory,[]);
  assert.equal(f.accept(contract.id).ok,false,'completed contracts stay paid for this day and role');
  complete(f,contract);assert.equal(f.player.tokens,contract.rewardTokens);
 }
});

test('replayed event IDs and repeated cell targets cannot manufacture contract progress',()=>{
 const contract=PRISON_CONTRACTS.find(row=>row.goals.some(goal=>goal.distinct));
 assert.ok(contract,'guard inspections include distinct targets');
 const f=fixture(contract.role),goal=contract.goals.find(row=>row.distinct);f.accept(contract.id);
 const first=f.record({type:goal.event,targetId:'cell-a'},'first-inspection');assert.equal(first.advanced,true);
 assert.equal(f.record({type:goal.event,targetId:'cell-b'},'first-inspection').advanced,false,'replayed request cannot point at another target');
 assert.equal(f.record({type:goal.event,targetId:'cell-a'},'second-request').advanced,false,'same physical cell counts once');
 assert.equal(f.record({type:goal.event},'missing-target').advanced,false);
 assert.equal(f.view().active.goals.find(row=>row.event===goal.event).progress,1);
 assert.equal(f.player.tokens,0);
});

test('role switches preserve each active contract and cannot repeat a completed payout',()=>{
 const f=fixture(),prisoner=recipes('prisoner')[0],guard=recipes('guard')[0];f.accept(prisoner.id);
 const goal=prisoner.goals[0];f.record({type:goal.event,targetId:goal.distinct?'cell-a':undefined});
 const before=structuredClone(f.view().active);
 f.player.role='guard';assert.equal(f.view().active,null);assert.equal(f.accept(prisoner.id).ok,false);f.accept(guard.id);
 f.player.role='prisoner';assert.deepEqual(f.view().active,before,'returning to a role restores its accepted work');
 complete(f,prisoner);const earned=f.player.tokens;
 f.player.role='guard';assert.equal(f.view().active.id,guard.id);
 f.player.role='prisoner';assert.equal(f.accept(prisoner.id).ok,false);assert.equal(f.player.tokens,earned);
});

test('new prison days offer replay while saved JSON preserves unfinished progress and lifetime rank',()=>{
 const f=fixture(),contract=recipes('prisoner')[0];f.accept(contract.id);
 const goal=contract.goals[0];f.record({type:goal.event,targetId:goal.distinct?'cell-a':undefined});
 const saved=JSON.parse(JSON.stringify(f.player)),snapshot=f.view();
 assert.deepEqual(prisonContractView(saved,{day:1,now:200000}),snapshot);
 complete(f,contract);assert.equal(f.player.tokens,contract.rewardTokens);
 f.nextDay();assert.equal(f.view().active,null);assert.equal(f.accept(contract.id).ok,true);complete(f,contract);
 assert.equal(f.player.tokens,contract.rewardTokens*2);assert.ok(f.view().lifetime.completed>=2);assert.ok(f.view().rank);
});

test('abandoning a partial contract pays nothing and permits another offer',()=>{
 const f=fixture(),first=recipes('prisoner')[0],second=recipes('prisoner')[1];f.accept(first.id);
 const goal=first.goals[0];f.record({type:goal.event,targetId:goal.distinct?'cell-a':undefined});
 assert.equal(f.abandon().ok,true);assert.equal(f.view().active,null);assert.equal(f.player.tokens,0);
 assert.equal(f.accept(second.id).ok,true);assert.equal(f.view().active.id,second.id);
 assert.equal(f.abandon().ok,true);assert.equal(f.abandon().ok,false);
});

test('public contract views are detached from saved progress and rewards',()=>{
 const f=fixture(),contract=recipes('prisoner')[0];f.accept(contract.id);
 const original=f.view(),edited=f.view();edited.active.goals[0].progress=999;edited.offers[0].rewardTokens=999;edited.lifetime.completed=999;
 assert.deepEqual(f.view(),original);assert.equal(f.player.tokens,0);
});

test('pruned daily records cannot be replayed by rewinding the prison day',()=>{
 const f=fixture(),contract=recipes('prisoner')[0];
 for(let day=1;day<=10;day++){f.setDay(day);assert.equal(f.accept(contract.id).ok,true);complete(f,contract);}
 assert.equal(f.player.tokens,contract.rewardTokens*10);
 const earned=f.player.tokens;f.setDay(1);assert.equal(f.accept(contract.id).ok,false);
 complete(f,contract);assert.equal(f.player.tokens,earned);
 assert.ok(Object.keys(f.player.contracts.days).length<=7,'saved daily history is bounded');
});
