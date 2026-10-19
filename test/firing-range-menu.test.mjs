import test from 'node:test';
import assert from 'node:assert/strict';
import {firingRangeMenu} from '../public/js/firing-range-menu.js';
import {FIRING_RANGE_MODES,FIRING_RANGE_WEAPONS} from '../public/js/firing-range.js';
import {ensureFiringRange,joinFiringRange,configureFiringRange,startFiringRange,startFiringRangePractice,stopFiringRange,watchFiringRange} from '../server-firing-range.mjs';

function fixture(){
 const now=100000,player={actorId:'host',username:'Host',lastSeen:now,health:100,position:{x:0,y:.02,z:16.2}},sim={players:{host:player},actors:{}};
 ensureFiringRange(sim,{id:'firing-range'},now);joinFiringRange(sim,player,now);
 const calls=[],loans=[];
 const onAction=(name,fields={})=>{
  calls.push({name,fields});
  return ({'range-settings':()=>configureFiringRange(sim,player,fields.settings,now),'range-start':()=>startFiringRange(sim,player,now),'range-practice':()=>startFiringRangePractice(sim,player,now,fields),'range-stop':()=>stopFiringRange(sim,player,now),'range-join':()=>joinFiringRange(sim,player,now,fields),'range-watch':()=>watchFiringRange(sim,player,now,fields)})[name]();
 };
 const menu=()=>firingRangeMenu({range:sim.firingRange,actorId:'host',tool:'laser',onAction,onWeapon:weapon=>loans.push(weapon),onPanel:section=>calls.push({section}),onMarket:options=>calls.push({market:options}),onBackpack:()=>calls.push({backpack:true}),onExit:()=>calls.push({exit:true})});
 return {sim,player,calls,loans,menu,now};
}

test('the headset menu configures all advanced modes and weapons through real authoritative settings',()=>{
 const f=fixture(),menu=f.menu();
 const modes=menu.filter(item=>item.label.includes('Event: '));assert.equal(modes.length,FIRING_RANGE_MODES.length);
 for(const item of modes)item.run();assert.deepEqual(f.calls.map(call=>call.fields.settings.mode),FIRING_RANGE_MODES);
 const loans=menu.filter(item=>item.label.includes('Range loan: '));assert.equal(loans.length,9);
 for(const item of loans)item.run();assert.deepEqual(f.loans,FIRING_RANGE_WEAPONS);
 const tournamentWeapons=menu.filter(item=>item.label.startsWith('Tournament weapon: '));assert.equal(tournamentWeapons.length,9);for(const item of tournamentWeapons)item.run();
 for(const label of ['Round seconds:','Rounds:','Shots per round:','Target speed:','Countdown seconds:','Competition:'])assert.doesNotThrow(()=>menu.find(item=>item.label.startsWith(label)).run());
});

test('practice, tournament, stop, locations and spectator paths use the actual shared engine',()=>{
 const f=fixture();f.menu().find(item=>item.label==='Start open practice').run();assert.equal(f.sim.firingRange.state,'live');assert.equal(f.sim.firingRange.settings.mode,'freeplay');
 f.menu().find(item=>item.label.includes('Lane 3')).run();assert.equal(f.sim.firingRange.participants.host.lane,2);
 f.menu().find(item=>item.label==='End open practice').run();assert.equal(f.sim.firingRange.state,'finished');
 f.menu().find(item=>item.label==='Event: Moving targets').run();f.menu().find(item=>item.label.startsWith('Start tournament')).run();assert.equal(f.sim.firingRange.settings.mode,'moving');
 const live=f.menu();assert.equal(live.filter(item=>item.label.includes('Range loan:')).length,0);assert.equal(live.filter(item=>item.label.startsWith('Tournament weapon:')).length,1);assert.equal(live.some(item=>item.label.includes('Lane ')),false);
 live.find(item=>item.label==='Spectate from the safe lobby').run();assert.equal(f.sim.firingRange.participants.host.role,'spectator');
 const watch=f.menu();assert.equal(watch.some(item=>item.label.startsWith('End tournament')),false);assert.equal(watch.some(item=>item.label.startsWith('Tournament weapon:')),false);
});

test('market, Backpack, operations and exit menu choices route to their real presentation callbacks',()=>{
 const f=fixture(),menu=f.menu();for(const label of ['Armory & optics','Marketplace · permanent upgrades','Your Backpack','Tournament setup & results','Exit VR'])menu.find(item=>item.label===label).run();
 assert.deepEqual(f.calls,[{section:'armory'},{market:{category:'weapons',intent:'browse'}},{backpack:true},{section:'tournament'},{exit:true}]);
 assert.deepEqual(firingRangeMenu({range:null}),[]);
});
