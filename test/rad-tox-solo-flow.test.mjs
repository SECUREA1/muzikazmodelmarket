import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RAD_TOX_WAVE_PAUSE_MS,RAD_TOX_RESULTS_PAUSE_MS} from '../public/js/rad-tox-rules.js';

// Exercise the actual solo transition method without creating a WebGL renderer.
const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const method=source.match(/    completeLevelIfReady\(\)\{([^\n]+)\}\n/)[1];
function fixture(){
 const timers=[],spawns=[];
 const complete=new Function('window','RAD_TOX_STATES','RAD_TOX_WAVE_PAUSE_MS','RAD_TOX_RESULTS_PAUSE_MS',`return function(){${method}}`)({setTimeout:(fn,ms)=>timers.push({fn,ms})},{ACTIVE:'active',CLEARED:'cleared'},RAD_TOX_WAVE_PAUSE_MS,RAD_TOX_RESULTS_PAUSE_MS);
 const game={state:'active',bubbles:[],environmentGeneration:1,enemyRepopulations:0,enemyRepopulationLimit:2,waveTransitionPending:false,spawnInitial:count=>spawns.push(count),setState(state){this.state=state;},bossConfigForLevel:()=>null,tone(){},advanceLevel(){this.advanced=true;},complete};
 return {game,timers,spawns};
}
test('solo runs three regular waves without multiplying targets and schedules each transition once',()=>{
 const {game,timers,spawns}=fixture();
 for(let wave=0;wave<2;wave++){
  game.complete();game.complete();assert.equal(timers.length,wave+1);
  assert.equal(timers[wave].ms,RAD_TOX_WAVE_PAUSE_MS);timers[wave].fn();
 }
 assert.deepEqual(spawns,[1,1]);game.complete();game.complete();assert.equal(game.state,'cleared');
 assert.equal(timers.length,3);assert.equal(timers[2].ms,RAD_TOX_RESULTS_PAUSE_MS);timers[2].fn();assert.equal(game.advanced,true);
});
test('changing maps cancels pending solo wave and level transitions',()=>{
 for(const finished of [false,true]){
  const {game,timers,spawns}=fixture();if(finished)game.enemyRepopulations=2;
  game.complete();game.environmentGeneration++;timers[0].fn();
  assert.deepEqual(spawns,[]);assert.equal(game.advanced,undefined);
 }
});

test('resetting a defeated solo encounter resumes simulation and cancels old transitions',()=>{
 const body=source.match(/resetRun\(\)\{([^\n]+?)\}dispose\(\)/)[1];
 const reset=new Function('stage','TOXIC_BUBBLE_CONFIG','RAD_TOX_STATES',`return function(){${body}}`)({classList:{remove(){}}},{initialCount:8,maxHealth:100,maxAmmo:Infinity},{ACTIVE:'active',STANDBY:'standby'});
 const spawns=[];
 const game={active:false,state:'cleared',health:0,environmentGeneration:2,waveTransitionPending:true,levelCompletionScheduled:true,
  clearCombatEffects(){},utilityKit:{reset(){}},clearUtilityEffects(){},buildEditor:{cancel(){}},flameSystem:{clear(){},refill(){}},
  clearPickups(){},validEnvironment:()=>true,setState(state){this.state=state;},
  spawnInitial:()=>spawns.push('enemies'),spawnBatPickup:()=>spawns.push('bat'),spawnFloorGas:()=>spawns.push('gas')};
 reset.call(game);
 assert.equal(game.active,true,'the render loop advances the restarted encounter');
 assert.equal(game.state,'active');assert.equal(game.health,100);
 assert.equal(game.environmentGeneration,3);assert.equal(game.waveTransitionPending,false);assert.equal(game.levelCompletionScheduled,false);
 assert.deepEqual(spawns,['enemies','bat','gas']);
 game.validEnvironment=()=>false;
 reset.call(game);
 assert.equal(game.active,false,'a missing map cannot run an encounter');assert.equal(game.state,'standby');
 assert.deepEqual(spawns,['enemies','bat','gas']);
});
